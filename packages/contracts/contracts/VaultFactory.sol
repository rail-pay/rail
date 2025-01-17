// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

// upgradeable proxy imports
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "./Vault.sol";
import "./Ownable.sol";

contract VaultFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    event VaultCreated(address indexed du, address indexed owner, address template);

    event NewVaultInitialEthUpdated(uint amount);
    event NewVaultOwnerInitialEthUpdated(uint amount);
    event DefaultNewMemberInitialEthUpdated(uint amount);
    event ProtocolFeeOracleUpdated(address newFeeOracleAddress);

    event VaultInitialEthSent(uint amountWei);
    event OwnerInitialEthSent(uint amountWei);

    address public vault;
    address public defaultToken;

    // when the Vault is created, the factory sends a bit of ETH/MATIC/... to the Vault and the owner, to get them started
    uint public newVaultInitialEth;
    uint public newVaultOwnerInitialEth;
    uint public defaultNewMemberEth;
    address public protocolFeeOracle;

    /** Two phase hand-over to minimize the chance that the product ownership is lost to a non-existent address. */
    address public pendingOwner;

    function initialize(
        address _vault,
        address _defaultToken,
        address _protocolFeeOracle
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        setTemplate(_vault);
        defaultToken = _defaultToken;
        protocolFeeOracle = _protocolFeeOracle;
    }

    function setTemplate(address _vault) public onlyOwner {
        vault = _vault;
    }

    // contract is payable so it can receive and hold the new beneficiary eth stipends
    receive() external payable {}

    function setNewVaultInitialEth(uint initialEthWei) public onlyOwner {
        newVaultInitialEth = initialEthWei;
        emit NewVaultInitialEthUpdated(initialEthWei);
    }

    function setNewVaultOwnerInitialEth(uint initialEthWei) public onlyOwner {
        newVaultOwnerInitialEth = initialEthWei;
        emit NewVaultOwnerInitialEthUpdated(initialEthWei);
    }

    function setNewMemberInitialEth(uint initialEthWei) public onlyOwner {
        defaultNewMemberEth = initialEthWei;
        emit DefaultNewMemberInitialEthUpdated(initialEthWei);
    }

    function setProtocolFeeOracle(address newFeeOracleAddress) public onlyOwner {
        protocolFeeOracle = newFeeOracleAddress;
        emit ProtocolFeeOracleUpdated(newFeeOracleAddress);
    }

    function deployNewVault(
        address payable owner,
        uint256 operatorFeeFraction,
        address[] memory agents,
        string calldata metadataJsonString
    )
        public
        returns (address)
    {
        return deployNewVaultUsingToken(
            defaultToken,
            owner,
            agents,
            operatorFeeFraction,
            metadataJsonString
        );
    }

    function deployNewVaultUsingToken(
        address token,
        address payable owner,
        address[] memory agents,
        uint256 initialAdminFeeFraction,
        string calldata metadataJsonString
    ) public returns (address) {
        address payable du = payable(Clones.clone(vault));
        Vault(du).initialize(
            owner,
            token,
            agents,
            defaultNewMemberEth,
            initialAdminFeeFraction,
            protocolFeeOracle,
            metadataJsonString
        );

        emit VaultCreated(du, owner, vault);

        // continue whether or not send succeeds
        if (newVaultInitialEth != 0 && address(this).balance >= newVaultInitialEth) {
            if (du.send(newVaultInitialEth)) {
                emit VaultInitialEthSent(newVaultInitialEth);
            }
        }
        if (newVaultOwnerInitialEth != 0 && address(this).balance >= newVaultOwnerInitialEth) {
            // ignore failed sends. If they don't want the stipend, that's not a problem
            // solhint-disable-next-line multiple-sends
            if (owner.send(newVaultOwnerInitialEth)) {
                emit OwnerInitialEthSent(newVaultOwnerInitialEth);
            }
        }
        return du;
    }

    /**
     * @dev Override openzeppelin implementation
     * @dev Allows the current owner to set the pendingOwner address.
     * @param newOwner The address to transfer ownership to.
     */
    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner != address(0), "error_zeroAddress");
        pendingOwner = newOwner;
    }

    /**
     * @dev Allows the pendingOwner address to finalize the transfer.
     */
    function claimOwnership() public {
        require(msg.sender == pendingOwner, "error_onlyPendingOwner");
        _transferOwnership(pendingOwner);
        pendingOwner = address(0);
    }

    /**
     * @dev Disable openzeppelin renounce ownership functionality
     */
    function renounceOwnership() public override onlyOwner {}

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
