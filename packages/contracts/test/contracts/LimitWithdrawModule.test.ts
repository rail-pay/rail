import { expect, use } from "chai"
import { waffle } from "hardhat"
import { BigNumber, utils } from "ethers"

import Debug from "debug"
const log = Debug("rail:test:LimitWithdrawModule")
// const log = console.log  // for debugging?

import LimitWithdrawModuleJson from "../../artifacts/contracts/modules/LimitWithdrawModule.sol/LimitWithdrawModule.json"
import VaultJson from "../../artifacts/contracts/Vault.sol/Vault.json"
import DefaultFeeOracleJson from "../../artifacts/contracts/DefaultFeeOracle.sol/DefaultFeeOracle.json"

import TestTokenJson from "../../artifacts/contracts/test/TestToken.sol/TestToken.json"

import type { LimitWithdrawModule, DefaultFeeOracle, Vault as Vault, TestToken } from "../../typechain"

// type EthereumAddress = string

use(waffle.solidity)
const { deployContract, provider } = waffle
const { parseEther } = utils

describe("LimitWithdrawModule", () => {
    const [creator, member0, dao, ...others] = provider.getWallets()

    let testToken: TestToken
    let vault: Vault

    let limitWithdrawModule: LimitWithdrawModule
    let limitWithdrawModuleArgs: [string, number, number, BigNumber, BigNumber]

    before(async () => {
        testToken = await deployContract(creator, TestTokenJson, ["name", "symbol"]) as TestToken
        await testToken.mint(creator.address, parseEther("10000"))

        const feeOracle = await deployContract(dao, DefaultFeeOracleJson, []) as DefaultFeeOracle
        await feeOracle.initialize(parseEther("0.01"), dao.address)

        vault = await deployContract(creator, VaultJson, []) as Vault

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

        // constructor(
        //     VaultSidechain vaultAddress,
        //     uint newRequiredMemberAgeSeconds,
        //     uint newWithdrawLimitPeriodSeconds,
        //     uint newWithdrawLimitDuringPeriod,
        //     uint newMinimumWithdrawTokenWei
        // )
        limitWithdrawModuleArgs = [
            vault.address,
            60 * 60 * 24,
            60 * 60,
            parseEther("100"),
            parseEther("1")
        ]
        limitWithdrawModule = await deployContract(creator, LimitWithdrawModuleJson, limitWithdrawModuleArgs) as LimitWithdrawModule
        await vault.setWithdrawModule(limitWithdrawModule.address)
        await vault.addJoinListener(limitWithdrawModule.address)
        await vault.addPartListener(limitWithdrawModule.address)
        log("LimitWithdrawModule %s set up successfully", limitWithdrawModule.address)

        await vault.addJoinPartAgent(creator.address)
        await vault.addMember(member0.address)
        await provider.send("evm_increaseTime", [+await limitWithdrawModule.requiredMemberAgeSeconds()])
        await provider.send("evm_mine", [])
        log("Member %s was added to data union and is now 'old' enough to withdraw", member0.address)
    })

    it("only lets members withdraw after they've been in the DU long enough", async () => {
        const newMembers = others.slice(0, 2).map(w => w.address)
        await expect(vault.addMembers(newMembers)).to.emit(vault, "MemberJoined")
        await expect(testToken.transferAndCall(vault.address, parseEther("10"), "0x")).to.emit(vault, "RevenueReceived")

        await expect(vault.withdrawAll(newMembers[0], false)).to.be.revertedWith("error_memberTooNew")
        await expect(vault.connect(others[1]).withdrawAllTo(others[2].address, false)).to.be.revertedWith("error_memberTooNew")

        await provider.send("evm_increaseTime", [+await limitWithdrawModule.requiredMemberAgeSeconds()])
        await provider.send("evm_mine", [])
        await expect(vault.withdrawAll(newMembers[0], false)).to.emit(vault, "EarningsWithdrawn")
        await expect(vault.connect(others[1]).withdrawAllTo(others[2].address, false)).to.emit(vault, "EarningsWithdrawn")

        // cleanup, TODO: not necessary after hardhat-deploy unit test fixtures are in place
        await vault.partMembers(newMembers)
    })

    it("only lets vault contract call the methods", async () => {
        await expect(limitWithdrawModule.onJoin(others[0].address)).to.be.revertedWith("error_onlyVaultContract")
        await expect(limitWithdrawModule.onPart(others[0].address, "0")).to.be.revertedWith("error_onlyVaultContract")
        await expect(limitWithdrawModule.onWithdraw(member0.address, others[0].address, testToken.address, "0")).to.be.revertedWith("error_onlyVaultContract")
    })

    it("only lets admin reset the module", async () => {
        await expect(limitWithdrawModule.connect(member0).setParameters(...limitWithdrawModuleArgs)).to.be.revertedWith("error_onlyOwner")
        await expect(limitWithdrawModule.setParameters(...limitWithdrawModuleArgs)).to.emit(limitWithdrawModule, "ModuleReset")
    })

    it("only accepts withdraws > minimumWithdrawTokenWei", async () => {
        await expect(testToken.transferAndCall(vault.address, parseEther("10"), "0x")).to.emit(vault, "RevenueReceived")
        await expect(vault.withdraw(member0.address, parseEther("0.1"), false)).to.be.revertedWith("error_withdrawAmountBelowMinimum")
        await expect(vault.connect(member0).withdraw(member0.address, parseEther("0.1"), false)).to.be.revertedWith("error_withdrawAmountBelowMinimum")
    })

    it("limits the amount of withdraws within withdrawLimitPeriodSeconds", async () => {
        await expect(testToken.transferAndCall(vault.address, parseEther("1000"), "0x")).to.emit(vault, "RevenueReceived")
        await expect(vault.withdraw(member0.address, parseEther("200"), false)).to.be.revertedWith("error_withdrawLimit")

        await expect(vault.withdraw(member0.address, parseEther("50"), false)).to.emit(vault, "EarningsWithdrawn")
        await expect(vault.connect(member0).withdrawTo(others[2].address, parseEther("50"), false)).to.emit(vault, "EarningsWithdrawn")
        await expect(vault.withdraw(member0.address, parseEther("1"), false)).to.be.revertedWith("error_withdrawLimit")

        // can not yet withdraw again
        await provider.send("evm_increaseTime", [60])
        await provider.send("evm_mine", [])
        await expect(vault.withdraw(member0.address, parseEther("1"), false)).to.be.revertedWith("error_withdrawLimit")

        // can withdraw again after withdrawLimitPeriodSeconds
        await provider.send("evm_increaseTime", [+await limitWithdrawModule.withdrawLimitPeriodSeconds()])
        await provider.send("evm_mine", [])
        await expect(vault.withdraw(member0.address, parseEther("100"), false)).to.emit(vault, "EarningsWithdrawn")
    })

    it("denies withdraw from those members withdraw who have been banned", async () => {
        await vault.addMember(others[3].address)
        await expect(testToken.transferAndCall(vault.address, parseEther("10"), "0x")).to.emit(vault, "RevenueReceived")
        await provider.send("evm_increaseTime", [+await limitWithdrawModule.requiredMemberAgeSeconds()])
        await provider.send("evm_mine", [])

        // 2 = LeaveConditionCode.BANNED
        await expect(vault.removeMember(others[3].address, "2")).to.emit(vault, "MemberParted")
        const balanceBefore = await testToken.balanceOf(others[3].address)
        await expect(vault.withdrawAll(others[3].address, false)).to.not.emit(vault, "EarningsWithdrawn")
        const balanceIncrease = (await testToken.balanceOf(others[3].address)).sub(balanceBefore)
        expect(+balanceIncrease).to.eq(0)
    })

    it("lets those members withdraw who have left (without getting banned)", async () => {
        await vault.addMember(others[4].address)
        await expect(testToken.transferAndCall(vault.address, parseEther("10"), "0x")).to.emit(vault, "RevenueReceived")
        await provider.send("evm_increaseTime", [+await limitWithdrawModule.requiredMemberAgeSeconds()])
        await provider.send("evm_mine", [])

        await expect(vault.partMember(others[4].address)).to.emit(vault, "MemberParted")
        await expect(vault.withdrawAll(others[4].address, false)).to.emit(vault, "EarningsWithdrawn")
    })

    it("lets those members withdraw who have been restored after getting banned", async () => {
        await vault.addMember(others[5].address)
        await expect(testToken.transferAndCall(vault.address, parseEther("10"), "0x")).to.emit(vault, "RevenueReceived")

        await expect(vault.removeMember(others[5].address, "2")).to.emit(vault, "MemberParted")

        // "restoring" means removing the ban and re-adding the member. See what BanModule does.
        await vault.addMember(others[5].address)
        await provider.send("evm_increaseTime", [+await limitWithdrawModule.requiredMemberAgeSeconds()])
        await provider.send("evm_mine", [])
        await expect(vault.withdrawAll(others[5].address, false)).to.emit(vault, "EarningsWithdrawn")
    })
})
