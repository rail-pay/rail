import { ethers as hardhatEthers } from "hardhat"
import { expect } from "chai"

import type { Wallet } from "ethers"

import Debug from "debug"
const log = Debug("Streamr:du:test:BanModule")
// const log = console.log  // for debugging

import type { BanModule, DefaultFeeOracle, Vault, TestToken } from "../../typechain"

type EthereumAddress = string

const {
    getSigners,
    getContractFactory,
    provider,
    utils: { parseEther },
} = hardhatEthers

describe("BanModule", () => {
    let creator: Wallet
    let member0: Wallet
    let joinPartAgent: Wallet
    let dao: Wallet
    let others: Wallet[]

    let testToken: TestToken
    let vault: Vault

    let banModule: BanModule

    async function selectBannedMembers(members: EthereumAddress[]): Promise<EthereumAddress[]> {
        const banBits = await banModule.areBanned(members)
        return members.filter((_, i) => banBits.shr(i).and(1).eq(1))
    }

    before(async () => {
        [creator, member0, joinPartAgent, dao, ...others] = await getSigners() as unknown as Wallet[]

        testToken = await (await getContractFactory("TestToken", { signer: creator })).deploy("name", "symbol") as TestToken
        await testToken.deployed()
        await testToken.mint(creator.address, parseEther("10000"))

        const feeOracle = await (await getContractFactory("DefaultFeeOracle", { signer: dao })).deploy() as DefaultFeeOracle
        await feeOracle.deployed()
        await feeOracle.initialize(parseEther("0.01"), dao.address)

        vault = await (await getContractFactory("Vault", { signer: creator })).deploy() as Vault
        await vault.deployed()

        // function initialize(
        //     address initialOwner,
        //     address tokenAddress,
        //     address[] memory initialJoinPartAgents,
        //     uint256 defaultNewMemberEth,
        //     uint256 initialAdminFeeFraction,
        //     address protocolFeeOracleAddress,
        //     string calldata initialMetadataJsonString
        // )
        await vault.initialize(
            creator.address,
            testToken.address,
            [],
            "1",
            parseEther("0.09"),
            feeOracle.address,
            "{}",
        )
        log("Vault %s initialized", vault.address)

        banModule = await (await getContractFactory("BanModule", { signer: creator })).deploy(vault.address) as BanModule
        await banModule.deployed()
        await vault.addJoinListener(banModule.address)
        await vault.addJoinPartAgent(banModule.address)
        log("BanModule %s set up successfully", banModule.address)

        await vault.addJoinPartAgent(joinPartAgent.address)
        await vault.connect(joinPartAgent).addMember(member0.address)
        log("Member %s was added to data union", member0.address)
    })

    it("doesn't let previously banned members re-join", async () => {
        const m = others[0].address
        await expect(vault.connect(joinPartAgent).addMember(m)).to.emit(vault, "MemberJoined")
        await expect(banModule.connect(joinPartAgent).ban(m)).to.emit(banModule, "MemberBanned")
        expect(await vault.isMember(m)).to.equal(false)
        expect(await banModule.isBanned(m)).to.equal(true)
        await expect(vault.connect(joinPartAgent).addMember(m)).to.be.revertedWith("error_memberBanned")
    })

    it("allows previously banned members to be restored", async () => {
        const m = others[1].address
        await expect(banModule.connect(joinPartAgent).ban(m)).to.emit(banModule, "MemberBanned")
        expect(await banModule.isBanned(m)).to.equal(true)
        await expect(banModule.connect(joinPartAgent).restore(m)).to.emit(banModule, "BanRemoved")
        expect(await banModule.isBanned(m)).to.equal(false)
        expect(await vault.isMember(m)).to.equal(true)
    })

    it("allows previously banned members to re-join after the ban period runs out", async () => {
        const m = others[2].address
        await expect(banModule.connect(joinPartAgent).banSeconds(m, "1000")).to.emit(banModule, "MemberBanned")
        await expect(vault.connect(joinPartAgent).addMember(m)).to.be.revertedWith("error_memberBanned")
        await provider.send("evm_increaseTime", [100])
        await provider.send("evm_mine", [])
        await expect(vault.connect(joinPartAgent).addMember(m)).to.be.revertedWith("error_memberBanned")
        await provider.send("evm_increaseTime", [1000])
        await provider.send("evm_mine", [])
        await expect(vault.connect(joinPartAgent).addMember(m)).to.emit(vault, "MemberJoined")
    })

    it("can ban many members in one batch", async () => {
        const m0 = others[3].address
        const m1 = others[4].address
        await expect(banModule.connect(joinPartAgent).banMembers([m0, m1])).to.emit(banModule, "MemberBanned")
        expect(await vault.isMember(m0)).to.equal(false)
        expect(await vault.isMember(m1)).to.equal(false)
    })

    it("can ban many members in one batch for specific amounts of seconds", async () => {
        const m0 = others[5].address
        const m1 = others[6].address
        const m2 = others[7].address

        await expect(banModule.connect(joinPartAgent).banMembersSeconds([m0, m1], "1000")).to.emit(banModule, "MemberBanned")
        expect(await selectBannedMembers([m0, m1, m2])).to.deep.equal([m0, m1])
        await provider.send("evm_increaseTime", [100])
        await provider.send("evm_mine", [])
        expect(await selectBannedMembers([m0, m1, m2])).to.deep.equal([m0, m1])
        await provider.send("evm_increaseTime", [1000])
        await provider.send("evm_mine", [])
        expect(await selectBannedMembers([m0, m1, m2])).to.deep.equal([])

        await expect(banModule.connect(joinPartAgent).banMembersSpecificSeconds([m1, m2], ["1000", "100"])).to.emit(banModule, "MemberBanned")
        expect(await selectBannedMembers([m0, m1, m2])).to.deep.equal([m1, m2])
        await provider.send("evm_increaseTime", [500])
        await provider.send("evm_mine", [])
        expect(await selectBannedMembers([m0, m1, m2])).to.deep.equal([m1])
        await provider.send("evm_increaseTime", [1000])
        await provider.send("evm_mine", [])
        expect(await selectBannedMembers([m0, m1, m2])).to.deep.equal([])
    })
})
