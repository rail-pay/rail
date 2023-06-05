import { assert, expect, use } from "chai"
import { waffle } from "hardhat"
import { BigNumber, Wallet, Contract, utils, BigNumberish } from "ethers"

import Debug from "debug"
const log = Debug("Streamr:du:test:Vault")
//const log = console.log  // for debugging?

import VaultJson from "../../artifacts/contracts/Vault.sol/Vault.json"
import TestTokenJson from "../../artifacts/contracts/test/TestToken.sol/TestToken.json"
import FeeOracleJson from "../../artifacts/contracts/DefaultFeeOracle.sol/DefaultFeeOracle.json"

import type { Vault, TestToken, DefaultFeeOracle } from "../../typechain"

type EthereumAddress = string

use(waffle.solidity)
const { deployContract, provider } = waffle
const { hexZeroPad, parseEther, arrayify } = utils

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
 * @param {Contract} duContract Vault contract object
 * @param {number} previouslyWithdrawn (optional) amount of token-wei withdrawn at the moment this signature is used
 */
async function getWithdrawSignature(
    signer: Wallet,
    to: Wallet,
    amountTokenWei: BigNumberish,
    duContract: Contract
) {
    const previouslyWithdrawn = await duContract.getWithdrawn(signer.address) as BigNumber
    const message = to.address
        + hexZeroPad(BigNumber.from(amountTokenWei).toHexString(), 32).slice(2)
        + duContract.address.slice(2)
        + hexZeroPad(previouslyWithdrawn.toHexString(), 32).slice(2)
    return signer.signMessage(arrayify(message))
}

describe("Vault", () => {
    const accounts = provider.getWallets()
    const dao = accounts[0]
    const admin = accounts[1]
    const agents = accounts.slice(2, 4)
    const members = accounts.slice(4, 7)
    const others = accounts.slice(7)

    const m = members.map(member => member.address)
    const a = agents.map(agent => agent.address)
    const o = others.map(outsider => outsider.address)

    let testToken: TestToken
    let feeOracle: DefaultFeeOracle
    let vault: Vault
    let vaultFromAgent: Vault
    let vaultFromMember0: Vault

    before(async () => {
        testToken = await deployContract(dao, TestTokenJson, ["name", "symbol"]) as TestToken
        await testToken.mint(dao.address, parseEther("100000"))
        feeOracle = await deployContract(dao, FeeOracleJson) as DefaultFeeOracle
        await feeOracle.initialize(parseEther("0.01"), dao.address)

        log("List of relevant addresses:")
        log("  testToken: %s", testToken.address)
        log("  dao: %s", dao.address)
        log("  admin: %s", admin.address)
        log("  agents: %o", a)
        log("  members: %o", m)
        log("  outsider addresses used in tests: %o", o)
    })

    beforeEach(async () => {
        vault = await deployContract(admin, VaultJson, []) as Vault
        vaultFromAgent = vault.connect(agents[1])
        vaultFromMember0 = vault.connect(members[0])

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
            a,
            "1",
            parseEther("0.09"), // total fees are 1% + 9% = 10%
            feeOracle.address,
            "{}"
        )
        await vaultFromAgent.addMembers(m)

        log(`Vault initialized at ${vault.address}`)
    })

    it("distributes earnings correctly", async () => {
        const randomOutsider = others[1]
        const newMember = others[0]

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
        expect(await vault.getEarnings(m[0])).to.equal(900)
        expect(await vault.getEarnings(m[1])).to.equal(900)
        expect(await vault.getEarnings(m[2])).to.equal(900)

        // drop a member, send more tokens, check accounting
        await expect(vaultFromAgent.partMember(m[0])).to.emit(vault, "MemberParted")
        expect(await vault.getEarnings(m[0])).to.equal(900)
        await testToken.transfer(vault.address, "2000")
        await vault.connect(randomOutsider).refreshRevenue()
        expect(await vault.totalEarnings()).to.equal(4500)
        expect(await vault.totalAdminFees()).to.equal(450)
        expect(await vault.getEarnings(admin.address)).to.equal(450)
        expect(await vault.totalProtocolFees()).to.equal(50)
        expect(await vault.getEarnings(dao.address)).to.equal(50)
        expect(await vault.getEarnings(m[0])).to.equal(900)
        expect(await vault.getEarnings(m[1])).to.equal(1800)
        expect(await vault.getEarnings(m[2])).to.equal(1800)
        await expect(vaultFromAgent.addMember(m[0])).to.emit(vault, "MemberJoined")

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
        expect(await vault.getEarnings(m[0])).to.equal(1800)
        expect(await vault.getEarnings(m[1])).to.equal(2700)
        expect(await vault.getEarnings(m[2])).to.equal(2700)
        await expect(vaultFromAgent.partMember(newMember.address)).to.emit(vault, "MemberParted")
    })

    it("addMembers partMembers", async function () {
        this.timeout(1000000)
        const memberCountBeforeBN = await vault.activeMemberCount()
        expect(memberCountBeforeBN).to.equal(members.length)

        // add all "others" to data union
        await expect(vault.addMembers(o)).to.be.revertedWith("error_onlyJoinPartAgent")
        await expect(vaultFromAgent.addMembers(o)).to.emit(vault, "MemberJoined")
        await expect(vaultFromAgent.addMembers(o)).to.be.revertedWith("error_alreadyMember")
        const memberCountAfterJoinBN = await vault.activeMemberCount()
        expect(+memberCountBeforeBN + others.length).to.equal(memberCountAfterJoinBN)
        expect(await vault.inactiveMemberCount()).to.equal(0)

        // part all "others" from data union
        await expect(vault.partMembers(o)).to.be.revertedWith("error_notPermitted")
        await expect(vault.connect(others[0]).partMember(o[0])).to.emit(vault, "MemberParted")
        await expect(vaultFromAgent.partMembers(o)).to.be.revertedWith("error_notActiveMember") // even one non-existing makes the whole tx fail
        await expect(vaultFromAgent.partMembers(o.slice(1))).to.emit(vault, "MemberParted")
        const memberCountAfterPartBN = await vault.activeMemberCount()
        expect(memberCountBeforeBN).to.equal(memberCountAfterPartBN)
        expect(await vault.inactiveMemberCount()).to.equal(others.length)

        //re-add and check that inactiveMemberCount decreased
        await expect(vaultFromAgent.addMembers(o)).to.emit(vault, "MemberJoined")
        expect(await vault.inactiveMemberCount()).to.equal(0)
    })

    it("addJoinPartAgent removeJoinPartAgent", async () => {
        const newAgent = others[0]
        const newMember = others[1]
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
        await expect(vault.getEarnings(o[0])).to.be.revertedWith("error_notMember")
        await expect(vault.getEarnings(a[0])).to.be.revertedWith("error_notMember")
        await expect(vault.getEarnings(admin.address)).to.be.revertedWith("error_notMember")
        expect(await vault.getEarnings(m[0])).to.equal(0)

        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()

        expect(await vault.getEarnings(m[0])).to.equal(900)
        expect(await vault.getEarnings(m[1])).to.equal(900)
        expect(await vault.getEarnings(m[2])).to.equal(900)
        expect(await vault.getEarnings(admin.address)).to.equal(270)
        expect(await vault.getEarnings(dao.address)).to.equal(30)
    })

    async function getBalances(addresses: EthereumAddress[]) {
        return Promise.all(addresses.map(a => testToken.balanceOf(a)))
    }
    async function getBalanceIncrements(addresses: EthereumAddress[], originalBalances: BigNumber[]) {
        return Promise.all(addresses.map(async (a, i) => {
            const newBalance = await testToken.balanceOf(a)
            return newBalance.sub(originalBalances[i]).toNumber()
        }))
    }

    it("withdrawMembers: batch withdraw many members", async () => {
        const balances = await getBalances(m)
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()
        await expect(vault.withdrawMembers(m, false)).to.emit(vault, "EarningsWithdrawn")
        expect(await getBalanceIncrements(m, balances)).to.deep.equal([ 900, 900, 900 ])
    })

    it("withdrawAll", async () => {
        const balances = await getBalances(m)
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()
        await expect(vault.connect(others[0]).withdrawAll(m[0], false)).to.be.revertedWith("error_notPermitted")
        await expect(vaultFromMember0.withdrawAll(m[0], false)).to.emit(vault, "EarningsWithdrawn")
        await expect(vault.withdrawAll(m[1], false)).to.emit(vault, "EarningsWithdrawn")
        await vault.withdrawAll(m[1], false)    // this should do nothing, also not revert
        expect(await getBalanceIncrements(m, balances)).to.deep.equal([ 900, 900, 0 ])
    })

    it("withdrawAllTo", async () => {
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()

        const before = await testToken.balanceOf(o[0])
        await expect(vaultFromMember0.withdrawAllTo(o[0], false)).to.emit(vault, "EarningsWithdrawn")
        const after = await testToken.balanceOf(o[0])

        const diff = after.sub(before)
        expect(diff).to.equal(900)
    })

    it("withdrawToSigned", async () => {
        const recipient = others[2]
        const vaultFromRecipient = await vault.connect(recipient)
        const r = recipient.address
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()

        // function signatureIsValid(address signer, address recipient, uint amount, bytes memory signature)
        const signature = await getWithdrawSignature(members[1], recipient, "100", vault)
        assert(await vault.signatureIsValid(m[1], r, "100", signature), "Contract says: bad signature")

        await expect(vaultFromRecipient.withdrawToSigned(m[1], o[1], "100", false, signature)).to.be.revertedWith("error_badSignature")
        await expect(vaultFromRecipient.withdrawToSigned(m[1], r, "1000", false, signature)).to.be.revertedWith("error_badSignature")
        await expect(vaultFromRecipient.withdrawToSigned(m[0], r, "100", false, signature)).to.be.revertedWith("error_badSignature")
        await expect(vaultFromRecipient.withdrawToSigned(m[1], r, "100", false, signature)).to.emit(vault, "EarningsWithdrawn")

        expect(await testToken.balanceOf(r)).to.equal(100)
    })

    it("withdrawAllToSigned", async () => {
        const recipient = others[3]
        const vaultFromRecipient = await vault.connect(recipient)
        const r = recipient.address
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()

        const signature = await getWithdrawSignature(members[1], recipient, "0", vault)
        // function signatureIsValid(address signer, address recipient, uint amount, bytes memory signature)
        assert(await vault.signatureIsValid(m[1], r, "0", signature), "Contract says: bad signature")

        await expect(vaultFromRecipient.withdrawAllToSigned(m[1], o[1], false, signature)).to.be.revertedWith("error_badSignature")
        await expect(vaultFromRecipient.withdrawAllToSigned(m[0], r, false, signature)).to.be.revertedWith("error_badSignature")
        await expect(vaultFromRecipient.withdrawAllToSigned(m[1], r, false, signature)).to.emit(vault, "EarningsWithdrawn")

        expect(await testToken.balanceOf(r)).to.equal(900)
    })

    it("transferToMemberInContract", async () => {
        await testToken.approve(vault.address, "2000")
        await vault.connect(dao).transferToMemberInContract(o[0], "1000")
        await vault.connect(dao).transferToMemberInContract(m[0], "1000")
        expect(await vault.getWithdrawableEarnings(o[0])).to.equal(1000)
        expect(await vault.getWithdrawableEarnings(m[0])).to.equal(1000)

        // TestToken blocks transfers with this magic amount
        await expect(vault.transferToMemberInContract(m[0], "666")).to.be.revertedWith("error_transfer")

        // TestToken sabotages transfers with this magic amount
        await expect(vault.transferToMemberInContract(m[0], "777")).to.be.revertedWith("error_transfer")
    })

    it("transferToMemberInContract using ERC677", async () => {
        await testToken.transferAndCall(vault.address, "1000", o[0])
        await testToken.transferAndCall(vault.address, "1000", m[0])
        expect(await vault.getWithdrawableEarnings(o[0])).to.equal(1000)
        expect(await vault.getWithdrawableEarnings(m[0])).to.equal(1000)
    })

    it("refreshes revenue when IPurchaseListener activates", async () => {
        const totalRevenueBefore = await vault.totalRevenue()
        await testToken.transfer(vault.address, "3000")
        const totalRevenueBefore2 = await vault.totalRevenue()
        // function onPurchase(bytes32, address, uint256, uint256, uint256) returns (bool)
        await vault.onPurchase("0x1234567812345678123456781234567812345678123456781234567812345678", o[0], "1670000000", "1000", "100")
        const totalRevenueAfter = await vault.totalRevenue()

        expect(totalRevenueBefore).to.equal(totalRevenueBefore2)
        expect(totalRevenueAfter).to.equal(totalRevenueBefore2.add("3000"))
    })

    it("transferWithinContract", async () => {
        assert(await testToken.transfer(vault.address, "3000"))
        await vault.refreshRevenue()
        await expect(vault.connect(others[0]).transferWithinContract(m[1], "100")).to.be.revertedWith("error_notMember")
        // change after sidechain fees / ETH-141: admin receives fees and so becomes an INACTIVE member by _increaseBalance
        // await expect(vaultSidechain.transferWithinContract(m[1], "100")).to.be.revertedWith("error_notMember")
        await expect(vaultFromMember0.transferWithinContract(m[1], "100")).to.emit(vault, "TransferWithinContract")
        await expect(vaultFromMember0.transferWithinContract(o[1], "100")).to.emit(vault, "TransferWithinContract")
        expect(await vault.getWithdrawableEarnings(m[0])).to.equal(700)  // = 900 - 100 - 100
        expect(await vault.getWithdrawableEarnings(m[1])).to.equal(1000) // = 900 + 100
        expect(await vault.getWithdrawableEarnings(m[2])).to.equal(900)  // no changes
        expect(await vault.getWithdrawableEarnings(o[1])).to.equal(100)
        // those who received some in-contract balance but aren't members should be marked inactive by _increaseBalance
        expect(await vault.inactiveMemberCount()).to.equal(3)
        expect((await vault.memberData(o[1])).status).to.equal(2)
        expect((await vault.memberData(dao.address)).status).to.equal(2)
        expect((await vault.memberData(admin.address)).status).to.equal(2)
    })

    it("getStats", async () => {
        // test send with transferAndCall. refreshRevenue not needed in this case
        await testToken.transferAndCall(vault.address, "3000", "0x")

        await vaultFromMember0.withdraw(m[0], "500", false)
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
        await expect(vaultFromMember0.withdraw(m[0], "100", true)).to.be.revertedWith("error_sendToMainnetDeprecated")
    })

    it("fails to withdraw more than earnings", async () => {
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()
        await expect(vaultFromMember0.withdraw(m[0], "4000", false)).to.be.revertedWith("error_insufficientBalance")

        // TestToken blocks transfers with this magic amount
        await expect(vaultFromMember0.withdraw(m[0], "666", false)).to.be.revertedWith("error_transfer")
    })

    it("fails to initialize twice", async () => {
        const a = agents.map(agent => agent.address)
        await expect(vault.initialize(
            admin.address,
            testToken.address,
            a,
            "1",
            parseEther("0.1"),
            feeOracle.address,
            "{}"
        )).to.be.revertedWith("error_alreadyInitialized")
    })

    it("fails for badly formed signatures", async () => {
        const recipient = others[2]
        const r = o[2]
        await testToken.transfer(vault.address, "3000")
        await vault.refreshRevenue()

        const signature = await getWithdrawSignature(members[1], recipient, "100", vault)
        const truncatedSig = signature.slice(0, -10)
        const badVersionSig = signature.slice(0, -2) + "30"

        await expect(vault.withdrawToSigned(m[1], r, "100", false, truncatedSig)).to.be.revertedWith("error_badSignatureLength")
        await expect(vault.withdrawToSigned(m[1], r, "100", false, badVersionSig)).to.be.revertedWith("error_badSignatureVersion")
        await expect(vault.withdrawToSigned(m[1], r, "200", false, signature)).to.be.revertedWith("error_badSignature")

        await expect(vault.signatureIsValid(m[1], r, "100", truncatedSig)).to.be.revertedWith("error_badSignatureLength")
        await expect(vault.signatureIsValid(m[1], r, "100", badVersionSig)).to.be.revertedWith("error_badSignatureVersion")
        assert(!await vault.signatureIsValid(m[1], r, "200", signature), "Bad signature was accepted as valid :(")
    })

    it("can transfer ownership", async () => {
        await expect(vault.connect(others[0]).transferOwnership(o[0])).to.be.revertedWith("error_onlyOwner")
        await expect(vault.connect(others[0]).claimOwnership()).to.be.revertedWith("error_onlyPendingOwner")

        await vault.transferOwnership(o[0])
        await expect(vault.connect(others[0]).claimOwnership()).to.emit(vault, "OwnershipTransferred")
        expect(await vault.owner()).to.equal(o[0])

        await expect(vault.transferOwnership(o[0])).to.be.revertedWith("error_onlyOwner")
        await vault.connect(others[0]).transferOwnership(admin.address)
        await expect(vault.claimOwnership()).to.emit(vault, "OwnershipTransferred")
        expect(await vault.owner()).to.equal(admin.address)
    })

    it("rejects unexpected ERC677 tokens", async () => {
        const randomToken = await deployContract(admin, TestTokenJson, ["random", "RND"]) as TestToken
        await randomToken.mint(admin.address, parseEther("10000"))
        await expect(randomToken.transferAndCall(vault.address, "1000", "0x")).to.be.revertedWith("error_onlyTokenContract")
    })

    it("rejects admin fee that would cause total fees sum above 1.0", async () => {
        await expect(vault.setAdminFee(parseEther("0.995"))).to.be.revertedWith("error_adminFee")
    })

    it("adjusts an admin fee that would cause total fees sum above 1.0", async () => {
        await expect(vault.setAdminFee(parseEther("0.9"))).to.emit(vault, "AdminFeeChanged")
        expect(await vault.adminFeeFraction()).to.equal(parseEther("0.9"))
        await feeOracle.setFee(parseEther("0.2"))
        assert(await testToken.transfer(vault.address, "3000"))
        await vault.refreshRevenue()
        expect(await vault.adminFeeFraction()).to.equal(parseEther("0.8"))
        await feeOracle.setFee(parseEther("0.01"))
    })

    it("lets only admin change the metadata", async () => {
        await expect(vault.connect(members[0]).setMetadata("foo")).to.be.revertedWith("error_onlyOwner")
        expect(await vault.metadataJsonString()).to.equal("{}")
        await expect(vault.connect(admin).setMetadata("foo")).to.emit(vault, "MetadataChanged")
        expect(await vault.metadataJsonString()).to.equal("foo")
    })

    it("lets only admin change the admin fee", async () => {
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
        await expect(vault.setMemberWeight(m[0], parseEther("1"))).to.be.revertedWith("error_onlyJoinPartAgent")
        await expect(vault.setMemberWeights(m, ["1", "2", "3"])).to.be.revertedWith("error_onlyJoinPartAgent")
        await expect(vaultFromMember0.setMemberWeight(m[0], parseEther("1"))).to.be.revertedWith("error_onlyJoinPartAgent")
        await expect(vaultFromMember0.setMemberWeights(m, ["1", "2", "3"])).to.be.revertedWith("error_onlyJoinPartAgent")
        await expect(vaultFromAgent.setMemberWeight(m[0], parseEther("2"))).to.emit(vault, "MemberWeightChanged")
        await expect(vaultFromAgent.setMemberWeights(m, ["1", "2", "3"])).to.emit(vault, "MemberWeightChanged")
    })

    it("calculates revenue correctly after weights are changed", async () => {
        expect(await vault.totalWeight()).to.equal(parseEther("3"))
        await testToken.transferAndCall(vault.address, parseEther("10"), "0x")
        expect(await vault.totalEarnings()).to.equal(parseEther("9")) // 10 - 1 (=10% fees)
        expect(await vault.getEarnings(m[0])).to.equal(parseEther("3"))
        expect(await vault.getEarnings(m[1])).to.equal(parseEther("3"))
        expect(await vault.getEarnings(m[2])).to.equal(parseEther("3"))

        // ...even when the weights are scaled in a funny way (not using parseEther)
        await expect(vaultFromAgent.setMemberWeights(m, ["1", "2", "3"])).to.emit(vault, "MemberWeightChanged")
        expect(await vault.totalWeight()).to.equal("6")
        await testToken.transferAndCall(vault.address, parseEther("20"), "0x")
        expect(await vault.totalEarnings()).to.equal(parseEther("27")) // 9 + 20 - 2 (=10% fees)
        expect(await vault.getEarnings(m[0])).to.equal(parseEther("6"))  // 3 + 3 (=1/6 of 18)
        expect(await vault.getEarnings(m[1])).to.equal(parseEther("9"))  // 3 + 6 (=2/6 of 18)
        expect(await vault.getEarnings(m[2])).to.equal(parseEther("12")) // 3 + 9 (=3/6 of 18)

        // scale more "normally" using parseEther
        await expect(vaultFromAgent.setMemberWeights(m, [parseEther("3"), parseEther("2"), parseEther("1")])).to.emit(vault, "MemberWeightChanged")
        expect(await vault.totalWeight()).to.equal(parseEther("6"))
        await testToken.transferAndCall(vault.address, parseEther("20"), "0x")
        expect(await vault.totalEarnings()).to.equal(parseEther("45")) // 27 + 20 - 2 (=10% fees)
        expect(await vault.getEarnings(m[0])).to.equal(parseEther("15")) // 6 + 12 (=3/6 of 18)
        expect(await vault.getEarnings(m[1])).to.equal(parseEther("15")) // 9 + 9  (=2/6 of 18)
        expect(await vault.getEarnings(m[2])).to.equal(parseEther("15")) // 12 + 6 (=1/6 of 18)
    })

    it("addMemberWithWeight", async () => {
        const newMember = others[0].address
        await expect(vaultFromAgent.addMemberWithWeight(m[0], parseEther("1"))).to.be.revertedWith("error_alreadyMember")
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
        await expect(vaultFromAgent.addMembersWithWeights(m, ["1", "2", "3"])).to.be.revertedWith("error_alreadyMember")
        await expect(vaultFromAgent.addMembersWithWeights(o.slice(0, 3), [parseEther("0"), parseEther("4"), parseEther("5")]))
            .to.be.revertedWith("error_zeroWeight")

        expect(await vault.memberWeight(o[0])).to.equal(0)
        await expect(vaultFromAgent.addMembersWithWeights(o.slice(0, 3), [parseEther("3"), parseEther("4"), parseEther("5")]))
            .to.emit(vault, "MemberJoined")
        expect(await vault.memberWeight(o[0])).to.equal(parseEther("3"))

        await expect(vaultFromAgent.addMembersWithWeights(o.slice(0, 1), [parseEther("1")])).to.be.revertedWith("error_alreadyMember")

        await expect(vaultFromAgent.partMembers(o.slice(0, 3))).to.emit(vault, "MemberParted")
        expect(await vault.memberWeight(o[0])).to.equal(0)
    })

    it("can add and remove members with setMemberWeights", async () => {
        await expect(vaultFromAgent.setMemberWeights([m[0], m[1], o[0]], [parseEther("0"), parseEther("2"), parseEther("2")]))
            .to.emit(vault, "MemberJoined")
            .and.to.emit(vault, "MemberWeightChanged")
            .and.to.emit(vault, "MemberParted")
        expect(await vault.isMember(m[0])).to.equal(false)
        expect(await vault.isMember(m[1])).to.equal(true)
        expect(await vault.isMember(o[0])).to.equal(true)
        expect(await vault.isMember(o[1])).to.equal(false)
    })
})
