// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Ownable.sol";
import "./LeaveConditionCode.sol";
import "./IFeeOracle.sol";
import "./IERC677.sol";
import "./IERC677Receiver.sol";
import "./modules/IWithdrawModule.sol";
import "./modules/IJoinListener.sol";
import "./modules/IPartListener.sol";
import "./IPurchaseListener.sol";

/**
 * Template contract that is instantiated (proxy clone) by VaultFactory
 * Do NOT expect to find anything interesting in this contract address' state/storage!
 **/
contract Vault is Ownable, IERC677Receiver, IPurchaseListener {
    // Used to describe both beneficiaries and join part agents
    enum ActiveStatus {NONE, ACTIVE, INACTIVE}

    // Members
    event MemberJoined(address indexed beneficiary);
    event MemberParted(address indexed beneficiary, LeaveConditionCode indexed leaveConditionCode);
    event JoinPartAgentAdded(address indexed agent);
    event JoinPartAgentRemoved(address indexed agent);
    event NewMemberEthSent(uint amountWei);
    event MemberWeightChanged(address indexed beneficiary, uint oldWeight, uint newWeight);

    // Revenue handling: earnings = revenue - operator fee - du fee
    event RevenueReceived(uint256 amount);
    event FeesCharged(uint256 operatorFee, uint256 protocolFee);
    event NewEarnings(uint256 earningsPerMember, uint256 activeMemberCount);
    event NewWeightedEarnings(uint256 earningsPerUnitWeight, uint256 totalWeightWei, uint256 activeMemberCount);

    // Withdrawals
    event EarningsWithdrawn(address indexed beneficiary, uint256 amount);

    // Modules and hooks
    event WithdrawModuleChanged(IWithdrawModule indexed withdrawModule);
    event JoinListenerAdded(IJoinListener indexed listener);
    event JoinListenerRemoved(IJoinListener indexed listener);
    event PartListenerAdded(IPartListener indexed listener);
    event PartListenerRemoved(IPartListener indexed listener);

    // In-contract transfers
    event TransferWithinContract(address indexed from, address indexed to, uint amount);
    event TransferToAddressInContract(address indexed from, address indexed to, uint amount);

    // Variable properties change events
    event NewMemberEthChanged(uint newMemberStipendWei, uint oldMemberStipendWei);
    event AdminFeeChanged(uint newAdminFee, uint oldAdminFee);
    event MetadataChanged(string newMetadata); // string could be long, so don't log the old one

    struct MemberInfo {
        ActiveStatus status;
        uint256 earningsBeforeLastJoin;
        uint256 lmeAtJoin; // Lifetime Member Earnings (sum of earnings per _totalWeight_, scaled up by 1e18) at join, used to calculate beneficiary's own earnings
        uint256 withdrawnEarnings;
    }

    // Constant properties (only set in initialize)
    IERC677 public token;
    IFeeOracle public protocolFeeOracle;

    // Modules
    IWithdrawModule public withdrawModule;
    address[] public joinListeners;
    address[] public partListeners;
    bool public modulesLocked;

    // Variable properties
    uint256 public newMemberEth;
    uint256 public operatorFeeFraction;
    string public metadataJsonString;

    // Useful stats
    uint256 public totalRevenue;
    uint256 public totalEarnings;
    uint256 public totalAdminFees;
    uint256 public totalProtocolFees;
    uint256 public totalWithdrawn;
    uint256 public activeMemberCount;
    uint256 public inactiveMemberCount;
    uint256 public lifetimeMemberEarnings; // sum of earnings per totalWeight, scaled up by 1e18; NOT PER MEMBER anymore!
    uint256 public joinPartAgentCount;
    uint256 public totalWeight; // default will be 1e18, or "1 ether"

    mapping(address => MemberInfo) public beneficiaryData;
    mapping(address => ActiveStatus) public joinPartAgents;
    mapping(address => uint) public beneficiaryWeight;

    function version() public pure returns (uint256) { return 400; } // Vault = 1, 2, 3

    // owner will be set by initialize()
    constructor() Ownable(address(0)) {}

    receive() external payable {}

    function initialize(
        address initialOwner,
        address tokenAddress,
        address[] memory initialJoinPartAgents,
        uint256 defaultNewMemberEth,
        uint256 initialAdminFeeFraction,
        address protocolFeeOracleAddress,
        string calldata initialMetadataJsonString
    ) public {
        require(!isInitialized(), "error_alreadyInitialized");
        protocolFeeOracle = IFeeOracle(protocolFeeOracleAddress);
        owner = msg.sender; // set real owner at the end. During initialize, addJoinPartAgents can be called by owner only
        token = IERC677(tokenAddress);
        addJoinPartAgents(initialJoinPartAgents);
        setAdminFee(initialAdminFeeFraction);
        setNewMemberEth(defaultNewMemberEth);
        setMetadata(initialMetadataJsonString);
        owner = initialOwner;
    }

    function isInitialized() public view returns (bool){
        return address(token) != address(0);
    }

    /**
     * Atomic getter to get all Vault state variables in one call
     * This alleviates the fact that JSON RPC batch requests aren't available in ethers.js
     */
    function getStats() public view returns (uint256[9] memory) {
        uint256 cleanedInactiveMemberCount = inactiveMemberCount;
        address protocolBeneficiary = protocolFeeOracle.beneficiary();
        if (beneficiaryData[owner].status == ActiveStatus.INACTIVE) { cleanedInactiveMemberCount -= 1; }
        if (beneficiaryData[protocolBeneficiary].status == ActiveStatus.INACTIVE) { cleanedInactiveMemberCount -= 1; }
        return [
            totalRevenue,
            totalEarnings,
            totalAdminFees,
            totalProtocolFees,
            totalWithdrawn,
            activeMemberCount,
            cleanedInactiveMemberCount,
            lifetimeMemberEarnings,
            joinPartAgentCount
        ];
    }

    /**
     * Admin fee as a fraction of revenue,
     *   using fixed-point decimal in the same way as ether: 50% === 0.5 ether === "500000000000000000"
     * @param newAdminFee fee that goes to the Vault owner
     */
    function setAdminFee(uint256 newAdminFee) public onlyOwner {
        uint protocolFeeFraction = protocolFeeOracle.protocolFeeFor(address(this));
        require(newAdminFee + protocolFeeFraction <= 1 ether, "error_operatorFee");
        uint oldAdminFee = operatorFeeFraction;
        operatorFeeFraction = newAdminFee;
        emit AdminFeeChanged(newAdminFee, oldAdminFee);
    }

    function setNewMemberEth(uint newMemberStipendWei) public onlyOwner {
        uint oldMemberStipendWei = newMemberEth;
        newMemberEth = newMemberStipendWei;
        emit NewMemberEthChanged(newMemberStipendWei, oldMemberStipendWei);
    }

    function setMetadata(string calldata newMetadata) public onlyOwner {
        metadataJsonString = newMetadata;
        emit MetadataChanged(newMetadata);
    }

    //------------------------------------------------------------
    // REVENUE HANDLING FUNCTIONS
    //------------------------------------------------------------

    /**
     * Process unaccounted tokens that have been sent previously
     * After calling this function, getters will show correct earnings for the beneficiaries
     * TODO: getters should call this function, too!
     */
    function refreshRevenue() public returns (uint256) {
        uint256 balance = token.balanceOf(address(this));
        uint256 newTokens = balance - totalWithdrawable(); // since 0.8.0 version of solidity, a - b errors if b > a
        if (newTokens == 0 || activeMemberCount == 0) { return 0; }
        totalRevenue += newTokens;
        emit RevenueReceived(newTokens);

        // fractions are expressed as multiples of 10^18 just like tokens, so must divide away the extra 10^18 factor
        //   overflow in multiplication is not an issue: 256bits ~= 10^77
        uint protocolFeeFraction = protocolFeeOracle.protocolFeeFor(address(this));
        address protocolBeneficiary = protocolFeeOracle.beneficiary();

        // sanity check: adjust oversize operator fee (prevent over 100% fees)
        if (operatorFeeFraction + protocolFeeFraction > 1 ether) {
            operatorFeeFraction = 1 ether - protocolFeeFraction;
        }

        uint operatorFeeWei = (newTokens * operatorFeeFraction) / (1 ether);
        uint protocolFeeWei = (newTokens * protocolFeeFraction) / (1 ether);
        uint newEarnings = newTokens - operatorFeeWei - protocolFeeWei;

        _increaseBalance(owner, operatorFeeWei);
        _increaseBalance(protocolBeneficiary, protocolFeeWei);
        totalAdminFees += operatorFeeWei;
        totalProtocolFees += protocolFeeWei;
        emit FeesCharged(operatorFeeWei, protocolFeeWei);

        // newEarnings and totalWeight are ether-scale (10^18), so need to scale earnings to "per unit weight" to avoid division going below 1
        uint earningsPerUnitWeightScaled = newEarnings * 1 ether / totalWeight;
        lifetimeMemberEarnings += earningsPerUnitWeightScaled; // this variable was repurposed to total "per unit weight" earnings during Vault's existence
        totalEarnings += newEarnings;

        emit NewEarnings(newTokens / activeMemberCount, activeMemberCount);
        emit NewWeightedEarnings(earningsPerUnitWeightScaled, totalWeight, activeMemberCount);

        assert (token.balanceOf(address(this)) == totalWithdrawable()); // calling this function immediately again should just return 0 and do nothing
        return newEarnings;
    }

    /**
     * ERC677 callback function, see https://github.com/ethereum/EIPs/issues/677
     * Receives the tokens arriving through bridge
     * Only the token contract is authorized to call this function
     * @param data if given an address, then these tokens are allocated to that beneficiary's address; otherwise they are added as Vault revenue
     */
    function onTokenTransfer(address, uint256 amount, bytes calldata data) override external {
        require(msg.sender == address(token), "error_onlyTokenContract");

        if (data.length == 20) {
            // shift 20 bytes (= 160 bits) to end of uint256 to make it an address => shift by 256 - 160 = 96
            // (this is what abi.encodePacked would produce)
            address recipient;
            assembly { // solhint-disable-line no-inline-assembly
                recipient := shr(96, calldataload(data.offset))
            }
            _increaseBalance(recipient, amount);
            totalRevenue += amount;
            emit TransferToAddressInContract(msg.sender, recipient, amount);
        } else if (data.length == 32) {
            // assume the address was encoded by converting address -> uint -> bytes32 -> bytes (already in the least significant bytes)
            // (this is what abi.encode would produce)
            address recipient;
            assembly { // solhint-disable-line no-inline-assembly
                recipient := calldataload(data.offset)
            }
            _increaseBalance(recipient, amount);
            totalRevenue += amount;
            emit TransferToAddressInContract(msg.sender, recipient, amount);
        }

        refreshRevenue();
    }

    function onPurchase(bytes32, address, uint256, uint256, uint256) external override returns (bool) {
        refreshRevenue();
        return true;
    }

    //------------------------------------------------------------
    // EARNINGS VIEW FUNCTIONS
    //------------------------------------------------------------

    function getEarnings(address beneficiary) public view returns (uint256) {
        MemberInfo storage info = beneficiaryData[beneficiary];
        require(info.status != ActiveStatus.NONE, "error_notMember");
        if (info.status == ActiveStatus.ACTIVE) {
            // lifetimeMemberEarnings is scaled up by 1e18, remove that scaling in the end to get token amounts
            uint newEarnings = (lifetimeMemberEarnings - info.lmeAtJoin) * beneficiaryWeight[beneficiary] / (1 ether);
            return info.earningsBeforeLastJoin + newEarnings;
        }
        return info.earningsBeforeLastJoin;
    }

    function getWithdrawn(address beneficiary) public view returns (uint256) {
        MemberInfo storage info = beneficiaryData[beneficiary];
        require(info.status != ActiveStatus.NONE, "error_notMember");
        return info.withdrawnEarnings;
    }

    function getWithdrawableEarnings(address beneficiary) public view returns (uint256) {
        uint maxWithdraw = getEarnings(beneficiary) - getWithdrawn(beneficiary);
        if (address(withdrawModule) != address(0)) {
            uint moduleLimit = withdrawModule.getWithdrawLimit(beneficiary, maxWithdraw);
            if (moduleLimit < maxWithdraw) { maxWithdraw = moduleLimit; }
        }
        return maxWithdraw;
    }

    // this includes the fees paid to operators and the Vault beneficiary
    function totalWithdrawable() public view returns (uint256) {
        return totalRevenue - totalWithdrawn;
    }

    //------------------------------------------------------------
    // MEMBER MANAGEMENT / VIEW FUNCTIONS
    //------------------------------------------------------------

    function isMember(address beneficiary) public view returns (bool) {
        return beneficiaryData[beneficiary].status == ActiveStatus.ACTIVE;
    }

    function isJoinPartAgent(address agent) public view returns (bool) {
        return joinPartAgents[agent] == ActiveStatus.ACTIVE;
    }

    modifier onlyJoinPartAgent() {
        require(isJoinPartAgent(msg.sender), "error_onlyJoinPartAgent");
        _;
    }

    function addJoinPartAgents(address[] memory agents) public onlyOwner {
        for (uint256 i = 0; i < agents.length; i++) {
            addJoinPartAgent(agents[i]);
        }
    }

    function addJoinPartAgent(address agent) public onlyOwner {
        require(joinPartAgents[agent] != ActiveStatus.ACTIVE, "error_alreadyActiveAgent");
        joinPartAgents[agent] = ActiveStatus.ACTIVE;
        emit JoinPartAgentAdded(agent);
        joinPartAgentCount += 1;
    }

    function removeJoinPartAgent(address agent) public onlyOwner {
        require(joinPartAgents[agent] == ActiveStatus.ACTIVE, "error_notActiveAgent");
        joinPartAgents[agent] = ActiveStatus.INACTIVE;
        emit JoinPartAgentRemoved(agent);
        joinPartAgentCount -= 1;
    }

    function addMember(address payable newMember) public onlyJoinPartAgent {
        addMemberWithWeight(newMember, 1 ether);
    }

    function addMemberWithWeight(address payable newMember, uint initialWeight) public onlyJoinPartAgent {
        MemberInfo storage info = beneficiaryData[newMember];
        require(initialWeight > 0, "error_zeroWeight");
        require(!isMember(newMember), "error_alreadyMember");
        if (info.status == ActiveStatus.INACTIVE) {
            inactiveMemberCount -= 1;
        }
        bool sendEth = info.status == ActiveStatus.NONE && newMemberEth > 0 && address(this).balance >= newMemberEth;
        info.status = ActiveStatus.ACTIVE;
        activeMemberCount += 1;
        emit MemberJoined(newMember);
        _setMemberWeight(newMember, initialWeight); // also updates lmeAtJoin

        // listeners get a chance to reject the new beneficiary by reverting
        for (uint i = 0; i < joinListeners.length; i++) {
            address listener = joinListeners[i];
            IJoinListener(listener).onJoin(newMember); // may revert
        }

        // give new beneficiaries ETH. continue even if transfer fails
        if (sendEth) {
            if (newMember.send(newMemberEth)) {
                emit NewMemberEthSent(newMemberEth);
            }
        }
        refreshRevenue();
    }

    function removeMember(address beneficiary, LeaveConditionCode leaveConditionCode) public {
        require(msg.sender == beneficiary || joinPartAgents[msg.sender] == ActiveStatus.ACTIVE, "error_notPermitted");
        require(isMember(beneficiary), "error_notActiveMember");

        _setMemberWeight(beneficiary, 0); // also updates earningsBeforeLastJoin
        beneficiaryData[beneficiary].status = ActiveStatus.INACTIVE;
        activeMemberCount -= 1;
        inactiveMemberCount += 1;
        emit MemberParted(beneficiary, leaveConditionCode);

        // listeners do NOT get a chance to prevent parting by reverting
        for (uint i = 0; i < partListeners.length; i++) {
            address listener = partListeners[i];
            try IPartListener(listener).onPart(beneficiary, leaveConditionCode) { } catch { }
        }

        refreshRevenue();
    }

    // access checked in removeMember
    function partMember(address beneficiary) public {
        removeMember(beneficiary, msg.sender == beneficiary ? LeaveConditionCode.SELF : LeaveConditionCode.AGENT);
    }

    // access checked in addMember
    function addMembers(address payable[] calldata beneficiaries) external {
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            addMember(beneficiaries[i]);
        }
    }

    // access checked in removeMember
    function partMembers(address[] calldata beneficiaries) external {
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            partMember(beneficiaries[i]);
        }
    }

    function addMembersWithWeights(address payable[] calldata beneficiaries, uint[] calldata weights) external onlyJoinPartAgent {
        require(beneficiaries.length == weights.length, "error_lengthMismatch");
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            addMemberWithWeight(beneficiaries[i], weights[i]);
        }
    }

    /**
     * @param beneficiary address to set
     * @param newWeight will be used when allocating future incoming revenues
     */
    function setMemberWeight(address beneficiary, uint newWeight) public onlyJoinPartAgent {
        require(isMember(beneficiary), "error_notMember");
        require(newWeight > 0, "error_zeroWeight");
        refreshRevenue();
        _setMemberWeight(beneficiary, newWeight);
    }

    /**
     * @dev When beneficiary weight is set, the lmeAtJoin/earningsBeforeLastJoin reference points must be reset
     * @dev It will seem as if the beneficiary was parted then joined with a new weight
     **/
    function _setMemberWeight(address beneficiary, uint newWeight) internal {
        MemberInfo storage info = beneficiaryData[beneficiary];
        info.earningsBeforeLastJoin = getEarnings(beneficiary);
        info.lmeAtJoin = lifetimeMemberEarnings;

        uint oldWeight = beneficiaryWeight[beneficiary];
        beneficiaryWeight[beneficiary] = newWeight;
        totalWeight = (totalWeight + newWeight) - oldWeight;
        emit MemberWeightChanged(beneficiary, oldWeight, newWeight);
    }

    /**
     * Add/remove beneficiaries and set their weights in a single transaction
     * Setting weight to zero removes the beneficiary
     * Setting a non-beneficiary's weight to non-zero adds the beneficiary
     */
    function setMemberWeights(address[] calldata beneficiaries, uint[] calldata newWeights) external onlyJoinPartAgent {
        require(beneficiaries.length == newWeights.length, "error_lengthMismatch");
        for (uint i = 0; i < beneficiaries.length; i++) {
            address beneficiary = beneficiaries[i];
            uint weight = newWeights[i];
            bool alreadyMember = isMember(beneficiary);
            if (alreadyMember && weight == 0) {
                partMember(beneficiary);
            } else if (!alreadyMember && weight > 0) {
                addMemberWithWeight(payable(beneficiary), weight);
            } else if (alreadyMember && weight > 0) {
                setMemberWeight(beneficiaries[i], weight);
            }
        }
    }

    //------------------------------------------------------------
    // IN-CONTRACT TRANSFER FUNCTIONS
    //------------------------------------------------------------

    /**
     * Transfer tokens from outside contract, add to a recipient's in-contract balance. Skip operator and Vault fees etc.
     */
    function transferToMemberInContract(address recipient, uint amount) public {
        // this is done first, so that in case token implementation calls the onTokenTransfer in its transferFrom (which by ERC677 it should NOT),
        //   transferred tokens will still not count as earnings (distributed to all) but a simple earnings increase to this particular beneficiary
        _increaseBalance(recipient, amount);
        totalRevenue += amount;
        emit TransferToAddressInContract(msg.sender, recipient, amount);

        uint balanceBefore = token.balanceOf(address(this));
        require(token.transferFrom(msg.sender, address(this), amount), "error_transfer");
        uint balanceAfter = token.balanceOf(address(this));
        require((balanceAfter - balanceBefore) >= amount, "error_transfer");

        refreshRevenue();
    }

    /**
     * Transfer tokens from sender's in-contract balance to recipient's in-contract balance
     * This is done by "withdrawing" sender's earnings and crediting them to recipient's unwithdrawn earnings,
     *   so withdrawnEarnings never decreases for anyone (within this function)
     * @param recipient whose withdrawable earnings will increase
     * @param amount how much withdrawable earnings is transferred
     */
    function transferWithinContract(address recipient, uint amount) public {
        require(getWithdrawableEarnings(msg.sender) >= amount, "error_insufficientBalance");    // reverts with "error_notMember" msg.sender not beneficiary
        MemberInfo storage info = beneficiaryData[msg.sender];
        info.withdrawnEarnings = info.withdrawnEarnings + amount;
        _increaseBalance(recipient, amount);
        emit TransferWithinContract(msg.sender, recipient, amount);
        refreshRevenue();
    }

    /**
     * Hack to add to single beneficiary's balance without affecting lmeAtJoin
     */
    function _increaseBalance(address beneficiary, uint amount) internal {
        MemberInfo storage info = beneficiaryData[beneficiary];
        info.earningsBeforeLastJoin = info.earningsBeforeLastJoin + amount;

        // allow seeing and withdrawing earnings
        if (info.status == ActiveStatus.NONE) {
            info.status = ActiveStatus.INACTIVE;
            inactiveMemberCount += 1;
        }
    }

    //------------------------------------------------------------
    // WITHDRAW FUNCTIONS
    //------------------------------------------------------------

    /**
     * @param sendToMainnet Deprecated
     */
    function withdrawMembers(address[] calldata beneficiaries, bool sendToMainnet)
        external
        returns (uint256)
    {
        uint256 withdrawn = 0;
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            withdrawn = withdrawn + (withdrawAll(beneficiaries[i], sendToMainnet));
        }
        return withdrawn;
    }

    /**
     * @param sendToMainnet Deprecated
     */
    function withdrawAll(address beneficiary, bool sendToMainnet)
        public
        returns (uint256)
    {
        refreshRevenue();
        return withdraw(beneficiary, getWithdrawableEarnings(beneficiary), sendToMainnet);
    }

    /**
     * @param sendToMainnet Deprecated
     */
    function withdraw(address beneficiary, uint amount, bool sendToMainnet)
        public
        returns (uint256)
    {
        require(msg.sender == beneficiary || msg.sender == owner, "error_notPermitted");
        return _withdraw(beneficiary, beneficiary, amount, sendToMainnet);
    }

    /**
     * @param sendToMainnet Deprecated
     */
    function withdrawAllTo(address to, bool sendToMainnet)
        external
        returns (uint256)
    {
        refreshRevenue();
        return withdrawTo(to, getWithdrawableEarnings(msg.sender), sendToMainnet);
    }

    /**
     * @param sendToMainnet Deprecated
     */
    function withdrawTo(address to, uint amount, bool sendToMainnet)
        public
        returns (uint256)
    {
        return _withdraw(msg.sender, to, amount, sendToMainnet);
    }

    /**
     * Check signature from a beneficiary authorizing withdrawing its earnings to another account.
     * Throws if the signature is badly formatted or doesn't match the given signer and amount.
     * Signature has parts the act as replay protection:
     * 1) `address(this)`: signature can't be used for other contracts;
     * 2) `withdrawn[signer]`: signature only works once (for unspecified amount), and can be "cancelled" by sending a withdraw tx.
     * Generated in Javascript with: `web3.eth.accounts.sign(recipientAddress + amount.toString(16, 64) + contractAddress.slice(2) + withdrawnTokens.toString(16, 64), signerPrivateKey)`,
     * or for unlimited amount: `web3.eth.accounts.sign(recipientAddress + "0".repeat(64) + contractAddress.slice(2) + withdrawnTokens.toString(16, 64), signerPrivateKey)`.
     * @param signer whose earnings are being withdrawn
     * @param recipient of the tokens
     * @param amount how much is authorized for withdraw, or zero for unlimited (withdrawAll)
     * @param signature byte array from `web3.eth.accounts.sign`
     * @return isValid true iff signer of the authorization (beneficiary whose earnings are going to be withdrawn) matches the signature
     */
    function signatureIsValid(
        address signer,
        address recipient,
        uint amount,
        bytes memory signature
    )
        public view
        returns (bool isValid)
    {
        require(signature.length == 65, "error_badSignatureLength");

        bytes32 r; bytes32 s; uint8 v;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "error_badSignatureVersion");

        // When changing the message, rebeneficiary to double-check that message length is correct!
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n104", recipient, amount, address(this), getWithdrawn(signer)));
        address calculatedSigner = ecrecover(messageHash, v, r, s);

        return calculatedSigner == signer;
    }

    /**
     * Do an "unlimited donate withdraw" on behalf of someone else, to an address they've specified.
     * Sponsored withdraw is paid by operator, but target account could be whatever the beneficiary specifies.
     * The signature gives a "blank cheque" for operator to withdraw all tokens to `recipient` in the future,
     *   and it's valid until next withdraw (and so can be nullified by withdrawing any amount).
     * A new signature needs to be obtained for each subsequent future withdraw.
     * @param fromSigner whose earnings are being withdrawn
     * @param to the address the tokens will be sent to (instead of `msg.sender`)
     * @param sendToMainnet Deprecated
     * @param signature from the beneficiary, see `signatureIsValid` how signature generated for unlimited amount
     */
    function withdrawAllToSigned(
        address fromSigner,
        address to,
        bool sendToMainnet,
        bytes calldata signature
    )
        external
        returns (uint withdrawn)
    {
        require(signatureIsValid(fromSigner, to, 0, signature), "error_badSignature");
        refreshRevenue();
        return _withdraw(fromSigner, to, getWithdrawableEarnings(fromSigner), sendToMainnet);
    }

    /**
     * Do a "donate withdraw" on behalf of someone else, to an address they've specified.
     * Sponsored withdraw is paid by operator, but target account could be whatever the beneficiary specifies.
     * The signature is valid only for given amount of tokens that may be different from maximum withdrawable tokens.
     * @param fromSigner whose earnings are being withdrawn
     * @param to the address the tokens will be sent to (instead of `msg.sender`)
     * @param amount of tokens to withdraw
     * @param sendToMainnet Deprecated
     * @param signature from the beneficiary, see `signatureIsValid` how signature generated for unlimited amount
     */
    function withdrawToSigned(
        address fromSigner,
        address to,
        uint amount,
        bool sendToMainnet,
        bytes calldata signature
    )
        external
        returns (uint withdrawn)
    {
        require(signatureIsValid(fromSigner, to, amount, signature), "error_badSignature");
        return _withdraw(fromSigner, to, amount, sendToMainnet);
    }

    /**
     * Internal function common to all withdraw methods.
     * Does NOT check proper access, so all callers must do that first.
     */
    function _withdraw(address from, address to, uint amount, bool sendToMainnet)
        internal
        returns (uint256)
    {
        if (amount == 0) { return 0; }
        refreshRevenue();
        require(amount <= getWithdrawableEarnings(from), "error_insufficientBalance");
        MemberInfo storage info = beneficiaryData[from];
        info.withdrawnEarnings += amount;
        totalWithdrawn += amount;

        if (address(withdrawModule) != address(0)) {
            require(token.transfer(address(withdrawModule), amount), "error_transfer");
            withdrawModule.onWithdraw(from, to, token, amount);
        } else {
            _defaultWithdraw(from, to, amount, sendToMainnet);
        }

        emit EarningsWithdrawn(from, amount);
        return amount;
    }

    /**
     * Default Vault 2.1 withdraw functionality, can be overridden with a withdrawModule.
     * @param sendToMainnet Deprecated
     */
    function _defaultWithdraw(address from, address to, uint amount, bool sendToMainnet)
        internal
    {
        require(!sendToMainnet, "error_sendToMainnetDeprecated");
        // transferAndCall also enables transfers over another token bridge
        //   in this case to=another bridge's tokenMediator, and from=recipient on the other chain
        // this follows the tokenMediator API: data will contain the recipient address, which is the same as sender but on the other chain
        // in case transferAndCall recipient is not a tokenMediator, the data can be ignored (it contains the Vault beneficiary's address)
        require(token.transferAndCall(to, amount, abi.encodePacked(from)), "error_transfer");
    }

    //------------------------------------------------------------
    // MODULE MANAGEMENT
    //------------------------------------------------------------

    /**
     * @param newWithdrawModule set to zero to return to the default withdraw functionality
     */
    function setWithdrawModule(IWithdrawModule newWithdrawModule) external onlyOwner {
        require(!modulesLocked, "error_modulesLocked");
        withdrawModule = newWithdrawModule;
        emit WithdrawModuleChanged(newWithdrawModule);
    }

    function addJoinListener(IJoinListener newListener) external onlyOwner {
        require(!modulesLocked, "error_modulesLocked");
        joinListeners.push(address(newListener));
        emit JoinListenerAdded(newListener);
    }

    function addPartListener(IPartListener newListener) external onlyOwner {
        require(!modulesLocked, "error_modulesLocked");
        partListeners.push(address(newListener));
        emit PartListenerAdded(newListener);
    }

    function removeJoinListener(IJoinListener listener) external onlyOwner {
        require(!modulesLocked, "error_modulesLocked");
        require(removeFromAddressArray(joinListeners, address(listener)), "error_joinListenerNotFound");
        emit JoinListenerRemoved(listener);
    }

    function removePartListener(IPartListener listener) external onlyOwner {
        require(!modulesLocked, "error_modulesLocked");
        require(removeFromAddressArray(partListeners, address(listener)), "error_partListenerNotFound");
        emit PartListenerRemoved(listener);
    }

    /**
     * Remove the listener from array by copying the last element into its place so that the arrays stay compact
     */
    function removeFromAddressArray(address[] storage array, address element) internal returns (bool success) {
        uint i = 0;
        while (i < array.length && array[i] != element) { i += 1; }
        if (i == array.length) return false;

        if (i < array.length - 1) {
            array[i] = array[array.length - 1];
        }
        array.pop();
        return true;
    }

    function lockModules() public onlyOwner {
        modulesLocked = true;
    }
}
