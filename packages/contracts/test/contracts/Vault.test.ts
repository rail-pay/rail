import { ethers as hardhatEthers } from "hardhat"
import { expect, assert } from "chai"

import type { Wallet, BigNumberish } from "ethers"

import Debug from "debug"
const log = Debug("Streamr:du:test:Vault")
// const log = console.log  // for debugging?

import type { Vault, TestToken, DefaultFeeOracle } from "../../typechain"
import type { EthereumAddress } from "../../../client/src"

const {
    BigNumber,
    getSigners,
    getContractFactory,
    utils: { parseEther, hexZeroPad, arrayify },
} = hardhatEthers

/**
 * Member can sign off to "donate" all earnings to another address such that someone else
 *   can submit the transaction (and pay for the gas)
 *
 * In Solidity, the message is created by abi.encodePacked(), which represents addresses unpadded as 20bytes.
 * web3.eth.encodeParameters() encodes addresses padded as 32bytes, so it can't be used
 * encodePacked() method from library would be preferable, but this works
 *
 * @param {EthereumAddress} signer who authorizes withdraw
 * @param {EthereumAddress} to who gets the tokens
 * @param {number} amountTokenWei tokens multiplied by 10^18, or zero for unlimited (withdrawAllToSigned)
 * @param {Vault} vault contract object
 * @param {number} previouslyWithdrawn (optional) amount of token-wei withdrawn at the moment this signature is used
 */
async function getWithdrawSignature(
    signer: Wallet,
    to: Wallet,
    amountTokenWei: BigNumberish,
    vault: Vault
) {
    const previouslyWithdrawn = await vault.getWithdrawn(signer.address)
    const message = to.address
        + hexZeroPad(BigNumber.from(amountTokenWei).toHexString(), 32).slice(2)
        + vault.address.slice(2)
        + hexZeroPad(previouslyWithdrawn.toHexString(), 32).slice(2)
    return signer.signMessage(arrayify(message))
}

describe("Vault", () => {
    let dao: Wallet
    let admin: Wallet
    let a1: Wallet
    let a2: Wallet
    let a3: Wallet
    let m1: Wallet
    let m2: Wallet
    let m3: Wallet
    let otherWallets: Wallet[]
    let agents: EthereumAddress[]
    let members: EthereumAddress[]
    let others: EthereumAddress[]

    let testToken: TestToken
    let feeOracle: DefaultFeeOracle
    let vault: Vault
    let vaultFromAgent: Vault
    let vaultFromMember0: Vault

    before(async () => {
        [dao, admin, a1, a2, a3, m1, m2, m3, ...otherWallets] = await getSigners() as unknown as Wallet[]
        agents = [a1, a2, a3].map(a => a.address)
        members = [m1, m2, m3].map(m => m.address)
        others = otherWallets.map(o => o.address)

        testToken = await (await getContractFactory("TestToken", { signer: dao })).deploy("name", "symbol") as TestToken
        await testToken.deployed()
        await testToken.mint(dao.address, parseEther("100000"))

        feeOracle = await (await getContractFactory("DefaultFeeOracle", { signer: dao })).deploy() as DefaultFeeOracle
        await feeOracle.deployed()
        await feeOracle.initialize(parseEther("0.01"), dao.address)

        log("List of relevant addresses:")
        log("  testToken: %s", testToken.address)
        log("  dao: %s", dao.address)
        log("  admin: %s", admin.address)
        log("  agents: %o", agents)
        log("  members: %o", members)
        log("  outsider addresses used in tests: %o", others)
    })

    beforeEach(async () => {
        vault = await (await getContractFactory("Vault", { signer: admin })).deploy() as Vault
        await vault.deployed()

        vaultFromAgent = vault.connect(a2)
        vaultFromMember0 = vault.connect(m1)

        // function initialize(
        //     address initialOwner,
        //     address tokenAddress,
        //     address[] memory initialJoinPartAgents,
        //     uint256 defaultNewMemberEth,
        //     uint256 initialAdminFeeFraction,
        //     address protocolFeeOracleAddress,
        //     string calldata metadataJsonString
        // )
        await vault.initialize(
            admin.address,
            testToken.address,
            agents,
            "1",
            parseEther("0.09"), // total fees are 1% + 9% = 10%
            feeOracle.address,
            "{}"
        )
        await vaultFromAgent.addMembers(members)

        log(`Vault initialized at ${vault.address}`)
    })

    it("distributes earnings correctly", async () => {
        const randomOutsider = otherWallets[1]
        const newMember = otherWallets[0]

        // send and distribute a batch of revenue to members
        await expect(testToken.transfer(vault.address, "3000")).to.emit(testToken, "Transfer(address,address,uint256)")
        await expect(vault.connect(randomOutsider).refreshRevenue()).to.emit(vault, "RevenueReceived")

        // repeating it should do nothing (also not throw)
        await vault.connect(randomOutsider).refreshRevenue()

        expect(await vault.totalEarnings()).to.equal(2700)
        expect(await vault.totalAdminFees()).to.equal(270)
        expect(await vault.getEarnings(admin.address)).to.equal(270)
        expect(await vault.totalProtocolFees()).to.equal(30)
        expect(await vault.getEarnings(dao.address)).to.equal(30)
        expect(await vault.getEarnings(m1.address)).to.equal(900)
        expect(await vault.getEarnings(m2.address)).to.equal(900)
        expect(await vault.getEarnings(m3.address)).to.equal(900)

        // drop a member, send more tokens, check accounting
        await expect(vaultFromAgent.partMember(m1.address)).to.emit(vault, "MemberParted")
        expect(await vault.getEarnings(m1.address)).to.equal(900)
        await testToken.transfer(vault.address, "2000")
        await vault.connect(randomOutsider).refreshRevenue()
        expect(await vault.totalEarnings()).to.equal(4500)
        expect(await vault.totalAdminFees()).to.equal(450)
        expect(await vault.getEarnings(admin.address)).to.equal(450)
        expect(await vault.totalProtocolFees()).to.equal(50)
        expect(await vault.getEarnings(dao.address)).to.equal(50)
        expect(await vault.getEarnings(m1.address)).to.equal(900)
        expect(await vault.getEarnings(m2.address)).to.equal(1800)
        expect(await vault.getEarnings(m3.address)).to.equal(1800)
        await expect(vaultFromAgent.addMember(m1.address)).to.emit(vault, "MemberJoined")

        // add a member, send tokens, check accounting
        await expect(vaultFromAgent.addMember(newMember.address)).to.emit(vault, "MemberJoined")
        await testToken.transfer(vault.address, "4000")
        await vault.connect(randomOutsider).refreshRevenue()
        expect(await vault.totalEarnings()).to.equal(8100)
        expect(await vault.totalAdminFees()).to.equal(810)
        expect(await vault.getEarnings(admin.address)).to.equal(810)
        expect(await vault.totalProtocolFees()).to.equal(90)
        expect(await vault.getEarnings(dao.address)).to.equal(90)
        expect(await vault.getEarnings(newMember.address)).to.equal(900)
        expect(await vault.getEarnings(m1.address)).to.equal(1800)
        expect(await vault.getEarnings(m2.address)).to.equal(2700)
        expect(await vault.getEarnings(m3.address)).to.equal(2700)
        await expect(vaultFromAgent.partMember(newMember.address)).to.emit(vault, "MemberParted")
    })

    it("addMembers partMembers", async function () {
        this.timeout(1000000)
        const memberCountBeforeBN = await vault.activeMemberCount()
        expect(memberCountBeforeBN).to.equal(members.length)

        // add all "others" to vault
        await expect(vault.addMembers(others)).to.be.revertedWith("error_onlyJoinPartAgent")
        await expect(vaultFromAgent.addMembers(others)).to.emit(vault, "MemberJoined")
        await expect(vaultFromAgent.addMembers(others)).to.be.revertedWith("error_alreadyMember")
        const memberCountAfterJoinBN = await vault.activeMemberCount()
        expect(+memberCountBeforeBN + others.length).to.equal(memberCountAfterJoinBN)
        expect(await vault.inactiveMemberCount()).to.equal(0)

        // part all "others" from vault
        await expect(vault.partMembers(others)).to.be.revertedWith("error_notPermitted")
        await expect(vault.connect(otherWallets[0]).partMember(others[0])).to.emit(vault, "MemberParted")
        await expect(vaultFromAgent.partMembers(others)).to.be.revertedWith("error_notActiveMember") // even one non-existing makes the whole tx fail
        await expect(vaultFromAgent.partMembers(others.slice(1))).to.emit(vault, "MemberParted")
        const memberCountAfterPartBN = await vault.activeMemberCount()
        expect(memberCountBeforeBN).to.equal(memberCountAfterPartBN)
        expect(await vault.inactiveMemberCount()).to.equal(others.length)

        //re-add and check that inactiveMemberCount decreased
        await expect(vaultFromAgent.addMembers(others)).to.emit(vault, "MemberJoined")
        expect(await vault.inactiveMemberCount()).to.equal(0)
    })

    it("addJoinPartAgent removeJoinPartAgent", async () => {
        const newAgent = otherWallets[0]
        const newMember = otherWallets[1]
        const agentCountBeforeBN = await vault.joinPartAgentCount()
        expect(agentCountBeforeBN).to.equal(agents.length)

        // add new agent
        await expect(vault.connect(newAgent).addMember(newMember.address)).to.be.revertedWith("error_onlyJoinPartAgent")
        await expect(vault.addJoinPartAgent(newAgent.address)).to.emit(vault, "JoinPartAgentAdded")
        await expect(vault.addJoinPartAgent(newAgent.address)).to.be.revertedWith("error_alreadyActiveAgent")
        const agentCountAfterAddBN = await vault.joinPartAgentCount()
        expect(agentCountAfterAddBN).to.equal(agents.length + 1)
        await expect(vaultFromAgent.addMember(newMember.address)).to.emit(vault, "MemberJoined")
        await expect(vaultFromAgent.partMember(newMember.address)).to.emit(vault, "MemberParted")

        // remove the new agent
        await expect(vault.removeJoinPartAgent(newAgent.address)).to.emit(vault, "JoinPartAgentRemoved")
        await expect(vault.removeJoinPartAgent(newAgent.address)).to.be.revertedWith("error_notActiveAgent")
        const agentCountAfterRemoveBN = await vault.joinPartAgentCount()
        expect(agentCountAfterRemoveBN).to.equal(agents.length)
        await expect(vault.connect(newAgent).addMember(newMember.address)).to.be.revertedWith("error_onlyJoinPartAgent")
    })

    it("getEarnings", async () => {
        await expect(vault.getEarnings(others[0])).to.be.revertedWith("error_notMember")
        await expect(vault.getEarnings(a1.address)).to.be.revertedWith("error_notMember")
        await expect(vault.getEarnings(admin.address)).to.be.revertedWith("error_notMember")
        expect(await vault.getEarnings(m1.address)).to.equal(0)

        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()

        expect(await vault.getEarnings(m1.address)).to.equal(900)
        expect(await vault.getEarnings(m2.address)).to.equal(900)
        expect(await vault.getEarnings(m3.address)).to.equal(900)
        expect(await vault.getEarnings(admin.address)).to.equal(270)
        expect(await vault.getEarnings(dao.address)).to.equal(30)
    })

    async function getBalances(addresses: EthereumAddress[]) {
        return Promise.all(addresses.map(a => testToken.balanceOf(a)))
    }
    async function getBalanceIncrements(addresses: EthereumAddress[], originalBalances: BigNumberish[]) {
        return Promise.all(addresses.map(async (a, i) => {
            const newBalance = await testToken.balanceOf(a)
            return newBalance.sub(originalBalances[i]).toNumber()
        }))
    }

    it("withdrawMembers: batch withdraw many members", async () => {
        const balances = await getBalances(members)
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()
        await expect(vault.withdrawMembers(members, false)).to.emit(vault, "EarningsWithdrawn")
        expect(await getBalanceIncrements(members, balances)).to.deep.equal([ 900, 900, 900 ])
    })

    it("withdrawAll", async () => {
        const balances = await getBalances(members)
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()
        await expect(vault.connect(otherWallets[0]).withdrawAll(m1.address, false)).to.be.revertedWith("error_notPermitted")
        await expect(vaultFromMember0.withdrawAll(m1.address, false)).to.emit(vault, "EarningsWithdrawn")
        await expect(vault.withdrawAll(m2.address, false)).to.emit(vault, "EarningsWithdrawn")
        await vault.withdrawAll(m2.address, false)    // this should do nothing, also not revert
        expect(await getBalanceIncrements(members, balances)).to.deep.equal([ 900, 900, 0 ])
    })

    it("withdrawAllTo", async () => {
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()

        const before = await testToken.balanceOf(others[0])
        await expect(vaultFromMember0.withdrawAllTo(others[0], false)).to.emit(vault, "EarningsWithdrawn")
        const after = await testToken.balanceOf(others[0])

        const diff = after.sub(before)
        expect(diff).to.equal(900)
    })

    it("withdrawToSigned", async () => {
        const recipient = otherWallets[2]
        const vaultFromRecipient = await vault.connect(recipient)
        const r = recipient.address
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()

        // function signatureIsValid(address signer, address recipient, uint amount, bytes memory signature)
        const signature = await getWithdrawSignature(m2, recipient, "100", vault)
        assert(await vault.signatureIsValid(m2.address, r, "100", signature), "Contract says: bad signature")

        await expect(vaultFromRecipient.withdrawToSigned(m2.address, others[1], "100", false, signature)).to.be.revertedWith("error_badSignature")
        await expect(vaultFromRecipient.withdrawToSigned(m2.address, r, "1000", false, signature)).to.be.revertedWith("error_badSignature")
        await expect(vaultFromRecipient.withdrawToSigned(m1.address, r, "100", false, signature)).to.be.revertedWith("error_badSignature")
        await expect(vaultFromRecipient.withdrawToSigned(m2.address, r, "100", false, signature)).to.emit(vault, "EarningsWithdrawn")

        expect(await testToken.balanceOf(r)).to.equal(100)
    })

    it("withdrawAllToSigned", async () => {
        const recipient = otherWallets[3]
        const vaultFromRecipient = await vault.connect(recipient)
        const r = recipient.address
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()

        const signature = await getWithdrawSignature(m2, recipient, "0", vault)
        // function signatureIsValid(address signer, address recipient, uint amount, bytes memory signature)
        assert(await vault.signatureIsValid(m2.address, r, "0", signature), "Contract says: bad signature")

        await expect(vaultFromRecipient.withdrawAllToSigned(m2.address, others[1], false, signature)).to.be.revertedWith("error_badSignature")
        await expect(vaultFromRecipient.withdrawAllToSigned(m1.address, r, false, signature)).to.be.revertedWith("error_badSignature")
        await expect(vaultFromRecipient.withdrawAllToSigned(m2.address, r, false, signature)).to.emit(vault, "EarningsWithdrawn")

        expect(await testToken.balanceOf(r)).to.equal(900)
    })

    it("transferToMemberInContract", async () => {
        await testToken.approve(vault.address, "2000")
        await vault.connect(dao).transferToMemberInContract(others[0], "1000")
        await vault.connect(dao).transferToMemberInContract(m1.address, "1000")
        expect(await vault.getWithdrawableEarnings(others[0])).to.equal(1000)
        expect(await vault.getWithdrawableEarnings(m1.address)).to.equal(1000)

        // TestToken blocks transfers with this magic amount
        await expect(vault.transferToMemberInContract(m1.address, "666")).to.be.revertedWith("error_transfer")

        // TestToken sabotages transfers with this magic amount
        await expect(vault.transferToMemberInContract(m1.address, "777")).to.be.revertedWith("error_transfer")
    })

    it("transferToMemberInContract using ERC677", async () => {
        await testToken.transferAndCall(vault.address, "1000", others[0])
        await testToken.transferAndCall(vault.address, "1000", m1.address)
        expect(await vault.getWithdrawableEarnings(others[0])).to.equal(1000)
        expect(await vault.getWithdrawableEarnings(m1.address)).to.equal(1000)
    })

    it("refreshes revenue when IPurchaseListener activates", async () => {
        const totalRevenueBefore = await vault.totalRevenue()
        await testToken.transfer(vault.address, "3000")
        const totalRevenueBefore2 = await vault.totalRevenue()
        // function onPurchase(bytes32, address, uint256, uint256, uint256) returns (bool)
        await vault.onPurchase("0x1234567812345678123456781234567812345678123456781234567812345678", others[0], "1670000000", "1000", "100")
        const totalRevenueAfter = await vault.totalRevenue()

        expect(totalRevenueBefore).to.equal(totalRevenueBefore2)
        expect(totalRevenueAfter).to.equal(totalRevenueBefore2.add("3000"))
    })

    it("transferWithinContract", async () => {
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()
        await expect(vault.connect(otherWallets[0]).transferWithinContract(m2.address, "100")).to.be.revertedWith("error_notMember")
        // change after sidechain fees / ETH-141: admin receives fees and so becomes an INACTIVE member by _increaseBalance
        // await expect(vaultSidechain.transferWithinContract(m2.address, "100")).to.be.revertedWith("error_notMember")
        await expect(vaultFromMember0.transferWithinContract(m2.address, "100")).to.emit(vault, "TransferWithinContract")
        await expect(vaultFromMember0.transferWithinContract(others[1], "100")).to.emit(vault, "TransferWithinContract")
        expect(await vault.getWithdrawableEarnings(m1.address)).to.equal(700)  // = 900 - 100 - 100
        expect(await vault.getWithdrawableEarnings(m2.address)).to.equal(1000) // = 900 + 100
        expect(await vault.getWithdrawableEarnings(m3.address)).to.equal(900)  // no changes
        expect(await vault.getWithdrawableEarnings(others[1])).to.equal(100)
        // those who received some in-contract balance but aren't members should be marked inactive by _increaseBalance
        expect(await vault.inactiveMemberCount()).to.equal(3)
        expect((await vault.memberData(others[1])).status).to.equal(2)
        expect((await vault.memberData(dao.address)).status).to.equal(2)
        expect((await vault.memberData(admin.address)).status).to.equal(2)
    })

    it.skip("getStats", async () => {
        // test send with transferAndCall. refreshRevenue not needed in this case
        await testToken.transferAndCall(vault.address, "3000", "0x")

        await vaultFromMember0.withdraw(m1.address, "500", false)
        const [
            totalRevenue,
            totalEarnings,
            totalAdminFees,
            totalProtocolFees,
            totalEarningsWithdrawn,
            activeMemberCount,
            inactiveMemberCount,
            lifetimeMemberEarnings,
            joinPartAgentCount
        ] = await vault.getStats()
        expect(totalRevenue).to.equal(3000)
        expect(totalEarnings).to.equal(2700)
        expect(totalAdminFees).to.equal(270)
        expect(totalProtocolFees).to.equal(30)
        expect(totalEarningsWithdrawn).to.equal(500)
        expect(activeMemberCount).to.equal(3)
        expect(inactiveMemberCount).to.equal(0) // admin and dao are cleaned out of this number though they show up in the "inactiveMemberCount"
        expect(lifetimeMemberEarnings).to.equal(900)
        expect(joinPartAgentCount).to.equal(2)
    })

    // withdraw to mainnet is deprecated
    it("fails calls to withdraw to mainnet", async () => {
        await testToken.transfer(vault.address, "3000")

        // TestToken blocks transfers with this magic amount
        await expect(vaultFromMember0.withdraw(m1.address, "100", true)).to.be.revertedWith("error_sendToMainnetDeprecated")
    })

    it("fails to withdraw more than earnings", async () => {
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()
        await expect(vaultFromMember0.withdraw(m1.address, "4000", false)).to.be.revertedWith("error_insufficientBalance")

        // TestToken blocks transfers with this magic amount
        await expect(vaultFromMember0.withdraw(m1.address, "666", false)).to.be.revertedWith("error_transfer")
    })

    it("fails to initialize twice", async () => {
        await expect(vault.initialize(
            admin.address,
            testToken.address,
            agents,
            "1",
            parseEther("0.1"),
            feeOracle.address,
            "{}"
        )).to.be.revertedWith("error_alreadyInitialized")
    })

    it("fails for badly formed signatures", async () => {
        const recipient = otherWallets[2]
        const r = others[2]
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()

        const signature = await getWithdrawSignature(m2, recipient, "100", vault)
        const truncatedSig = signature.slice(0, -10)
        const badVersionSig = signature.slice(0, -2) + "30"

        await expect(vault.withdrawToSigned(m2.address, r, "100", false, truncatedSig)).to.be.revertedWith("error_badSignatureLength")
        await expect(vault.withdrawToSigned(m2.address, r, "100", false, badVersionSig)).to.be.revertedWith("error_badSignatureVersion")
        await expect(vault.withdrawToSigned(m2.address, r, "200", false, signature)).to.be.revertedWith("error_badSignature")

        await expect(vault.signatureIsValid(m2.address, r, "100", truncatedSig)).to.be.revertedWith("error_badSignatureLength")
        await expect(vault.signatureIsValid(m2.address, r, "100", badVersionSig)).to.be.revertedWith("error_badSignatureVersion")
        assert(!await vault.signatureIsValid(m2.address, r, "200", signature), "Bad signature was accepted as valid :(")
    })

    it("can transfer ownership", async () => {
        await expect(vault.connect(otherWallets[0]).transferOwnership(others[0])).to.be.revertedWith("error_onlyOwner")
        await expect(vault.connect(otherWallets[0]).claimOwnership()).to.be.revertedWith("error_onlyPendingOwner")

        await vault.transferOwnership(others[0])
        await expect(vault.connect(otherWallets[0]).claimOwnership()).to.emit(vault, "OwnershipTransferred")
        expect(await vault.owner()).to.equal(others[0])

        await expect(vault.transferOwnership(others[0])).to.be.revertedWith("error_onlyOwner")
        await vault.connect(otherWallets[0]).transferOwnership(admin.address)
        await expect(vault.claimOwnership()).to.emit(vault, "OwnershipTransferred")
        expect(await vault.owner()).to.equal(admin.address)
    })

    it("rejects unexpected ERC677 tokens", async () => {
        const randomToken = await (await getContractFactory("TestToken", { signer: admin })).deploy("random", "RND") as TestToken
        await randomToken.deployed()
        await randomToken.mint(admin.address, parseEther("10000"))
        await expect(randomToken.transferAndCall(vault.address, "1000", "0x")).to.be.revertedWith("error_onlyTokenContract")
    })

    it("rejects admin fee that would cause total fees sum above 1.0", async () => {
        await expect(vault.setAdminFee(parseEther("0.995"))).to.be.revertedWith("error_adminFee")
    })

    it.skip("adjusts an admin fee that would cause total fees sum above 1.0", async () => {
        await expect(vault.setAdminFee(parseEther("0.9"))).to.emit(vault, "AdminFeeChanged")
        expect(await vault.adminFeeFraction()).to.equal(parseEther("0.9"))
        await feeOracle.setFee(parseEther("0.2"))
        expect(testToken.transfer(vault.address, "3000")).to.emit(testToken, "Transfer")
        await vault.refreshRevenue()
        expect(await vault.adminFeeFraction()).to.equal(parseEther("0.8"))
        await feeOracle.setFee(parseEther("0.01"))
    })

    it.skip("lets only admin change the metadata", async () => {
        await expect(vault.connect(members[0]).setMetadata("foo")).to.be.revertedWith("error_onlyOwner")
        expect(await vault.metadataJsonString()).to.equal("{}")
        await expect(vault.connect(admin).setMetadata("foo")).to.emit(vault, "MetadataChanged")
        expect(await vault.metadataJsonString()).to.equal("foo")
    })

    it.skip("lets only admin change the admin fee", async () => {
        await expect(vault.connect(members[0]).setAdminFee(parseEther("0.5"))).to.be.revertedWith("error_onlyOwner")
        expect(await vault.adminFeeFraction()).to.equal(parseEther("0.09"))
        await expect(vault.connect(admin).setAdminFee(parseEther("0.5"))).to.emit(vault, "AdminFeeChanged")
        expect(await vault.adminFeeFraction()).to.equal(parseEther("0.5"))
    })

    it("cannot swap modules after locking", async () => {
        const dummyAddress = "0x1234567890123456789012345678901234567890"
        await expect(vault.setWithdrawModule(dummyAddress)).to.emit(vault, "WithdrawModuleChanged")
        await expect(vault.addJoinListener(dummyAddress)).to.emit(vault, "JoinListenerAdded")
        await expect(vault.addPartListener(dummyAddress)).to.emit(vault, "PartListenerAdded")
        await expect(vault.removeJoinListener(dummyAddress)).to.emit(vault, "JoinListenerRemoved")
        await expect(vault.removePartListener(dummyAddress)).to.emit(vault, "PartListenerRemoved")
        await vault.lockModules()
        await expect(vault.setWithdrawModule(dummyAddress)).to.be.revertedWith("error_modulesLocked")
        await expect(vault.addJoinListener(dummyAddress)).to.be.revertedWith("error_modulesLocked")
        await expect(vault.addPartListener(dummyAddress)).to.be.revertedWith("error_modulesLocked")
        await expect(vault.removeJoinListener(dummyAddress)).to.be.revertedWith("error_modulesLocked")
        await expect(vault.removePartListener(dummyAddress)).to.be.revertedWith("error_modulesLocked")
    })

    it("lets only joinPartAgent set weights", async () => {
        await expect(vault.setMemberWeight(m1.address, parseEther("1"))).to.be.revertedWith("error_onlyJoinPartAgent")
        await expect(vault.setMemberWeights(members, ["1", "2", "3"])).to.be.revertedWith("error_onlyJoinPartAgent")
        await expect(vaultFromMember0.setMemberWeight(m1.address, parseEther("1"))).to.be.revertedWith("error_onlyJoinPartAgent")
        await expect(vaultFromMember0.setMemberWeights(members, ["1", "2", "3"])).to.be.revertedWith("error_onlyJoinPartAgent")
        await expect(vaultFromAgent.setMemberWeight(m1.address, parseEther("2"))).to.emit(vault, "MemberWeightChanged")
        await expect(vaultFromAgent.setMemberWeights(members, ["1", "2", "3"])).to.emit(vault, "MemberWeightChanged")
    })

    it.skip("calculates revenue correctly after weights are changed", async () => {
        expect(await vault.totalWeight()).to.equal(parseEther("3"))
        await testToken.transferAndCall(vault.address, parseEther("10"), "0x")
        expect(await vault.totalEarnings()).to.equal(parseEther("9")) // 10 - 1 (=10% fees)
        expect(await vault.getEarnings(m1.address)).to.equal(parseEther("3"))
        expect(await vault.getEarnings(m2.address)).to.equal(parseEther("3"))
        expect(await vault.getEarnings(m3.address)).to.equal(parseEther("3"))

        // ...even when the weights are scaled in a funny way (not using parseEther)
        await expect(vaultFromAgent.setMemberWeights(members, ["1", "2", "3"])).to.emit(vault, "MemberWeightChanged")
        expect(await vault.totalWeight()).to.equal("6")
        await testToken.transferAndCall(vault.address, parseEther("20"), "0x")
        expect(await vault.totalEarnings()).to.equal(parseEther("27")) // 9 + 20 - 2 (=10% fees)
        expect(await vault.getEarnings(m1.address)).to.equal(parseEther("6"))  // 3 + 3 (=1/6 of 18)
        expect(await vault.getEarnings(m2.address)).to.equal(parseEther("9"))  // 3 + 6 (=2/6 of 18)
        expect(await vault.getEarnings(m3.address)).to.equal(parseEther("12")) // 3 + 9 (=3/6 of 18)

        // scale more "normally" using parseEther
        await expect(vaultFromAgent.setMemberWeights(members, [parseEther("3"), parseEther("2"), parseEther("1")])).to.emit(vault, "MemberWeightChanged")
        expect(await vault.totalWeight()).to.equal(parseEther("6"))
        await testToken.transferAndCall(vault.address, parseEther("20"), "0x")
        expect(await vault.totalEarnings()).to.equal(parseEther("45")) // 27 + 20 - 2 (=10% fees)
        expect(await vault.getEarnings(m1.address)).to.equal(parseEther("15")) // 6 + 12 (=3/6 of 18)
        expect(await vault.getEarnings(m2.address)).to.equal(parseEther("15")) // 9 + 9  (=2/6 of 18)
        expect(await vault.getEarnings(m3.address)).to.equal(parseEther("15")) // 12 + 6 (=1/6 of 18)
    })

    it("addMemberWithWeight", async () => {
        const newMember = otherWallets[0].address
        await expect(vaultFromAgent.addMemberWithWeight(m1.address, parseEther("1"))).to.be.revertedWith("error_alreadyMember")
        await expect(vaultFromAgent.addMemberWithWeight(newMember, parseEther("0"))).to.be.revertedWith("error_zeroWeight")

        expect(await vault.memberWeight(newMember)).to.equal(0)
        await expect(vaultFromAgent.addMemberWithWeight(newMember, parseEther("3"))).to.emit(vault, "MemberJoined")
        expect(await vault.memberWeight(newMember)).to.equal(parseEther("3"))

        await expect(vaultFromAgent.addMemberWithWeight(newMember, parseEther("1"))).to.be.revertedWith("error_alreadyMember")

        await expect(vaultFromAgent.partMember(newMember)).to.emit(vault, "MemberParted")
        expect(await vault.memberWeight(newMember)).to.equal(0)
    })

    it("addMembersWithWeights", async function () {
        this.timeout(1000000)
        await expect(vaultFromAgent.addMembersWithWeights(members, ["1", "2", "3"])).to.be.revertedWith("error_alreadyMember")
        await expect(vaultFromAgent.addMembersWithWeights(others.slice(0, 3), [parseEther("0"), parseEther("4"), parseEther("5")]))
            .to.be.revertedWith("error_zeroWeight")

        expect(await vault.memberWeight(others[0])).to.equal(0)
        await expect(vaultFromAgent.addMembersWithWeights(others.slice(0, 3), [parseEther("3"), parseEther("4"), parseEther("5")]))
            .to.emit(vault, "MemberJoined")
        expect(await vault.memberWeight(others[0])).to.equal(parseEther("3"))

        await expect(vaultFromAgent.addMembersWithWeights(others.slice(0, 1), [parseEther("1")])).to.be.revertedWith("error_alreadyMember")

        await expect(vaultFromAgent.partMembers(others.slice(0, 3))).to.emit(vault, "MemberParted")
        expect(await vault.memberWeight(others[0])).to.equal(0)
    })

    it("can add and remove members with setMemberWeights", async () => {
        await expect(vaultFromAgent.setMemberWeights([m1.address, m2.address, others[0]], [parseEther("0"), parseEther("2"), parseEther("2")]))
            .to.emit(vault, "MemberJoined")
            .and.to.emit(vault, "MemberWeightChanged")
            .and.to.emit(vault, "MemberParted")
        expect(await vault.isMember(m1.address)).to.equal(false)
        expect(await vault.isMember(m2.address)).to.equal(true)
        expect(await vault.isMember(others[0])).to.equal(true)
        expect(await vault.isMember(others[1])).to.equal(false)
    })
})
