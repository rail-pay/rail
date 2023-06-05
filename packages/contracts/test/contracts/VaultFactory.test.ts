import { expect, use } from "chai"
import { waffle, upgrades } from "hardhat"
import { Contract, ContractFactory, utils, BigNumber } from "ethers"
const { parseEther } = utils

import VaultFactoryJson from "../../artifacts/contracts/VaultFactory.sol/VaultFactory.json"
import VaultJson from "../../artifacts/contracts/Vault.sol/Vault.json"
import FeeOracleJson from "../../artifacts/contracts/DefaultFeeOracle.sol/DefaultFeeOracle.json"

import TestTokenJson from "../../artifacts/contracts/test/TestToken.sol/TestToken.json"

import { VaultFactory, DefaultFeeOracle, TestToken } from "../../typechain"

import Debug from "debug"
const log = Debug("Streamr:du:test:BinanceAdapter")

use(waffle.solidity)
const { deployContract, provider } = waffle

type EthereumAddress = string

describe("VaultFactory", (): void => {
    const accounts = provider.getWallets()

    const creator = accounts[0]
    const agents = accounts.slice(1, 3)
    const members = accounts.slice(3, 6)
    const others = accounts.slice(6)
    const protocolBeneficiary = accounts[8]

    const m = members.map(member => member.address)
    const o = others.map(outsider => outsider.address)

    let factory: VaultFactory
    let testToken: TestToken

    before(async () => {
        testToken = await deployContract(creator, TestTokenJson, ["name", "symbol"]) as TestToken
        const vault = await deployContract(creator, VaultJson, [])
        const feeOracleFactory = new ContractFactory(FeeOracleJson.abi, FeeOracleJson.bytecode, creator)
        const feeOracle = await upgrades.deployProxy(feeOracleFactory, [
            parseEther("0.01"),
            protocolBeneficiary.address
        ], { kind: "uups" }) as DefaultFeeOracle
        const factoryFactory = new ContractFactory(VaultFactoryJson.abi, VaultFactoryJson.bytecode, creator)
        factory = await upgrades.deployProxy(factoryFactory, [
            vault.address,
            testToken.address,
            feeOracle.address,
        ], { kind: "uups" }) as VaultFactory
    })

    it("sidechain ETH flow", async () => {
        const ownerEth = parseEther("0.01")
        const newVaultEth = parseEther("1")
        const newMemberEth = parseEther("0.1")

        const factoryOutsider = factory.connect(others[0])
        await expect(factoryOutsider.setNewVaultInitialEth(newMemberEth)).to.be.reverted
        await expect(factoryOutsider.setNewVaultOwnerInitialEth(newMemberEth)).to.be.reverted
        await expect(factoryOutsider.setNewMemberInitialEth(newMemberEth)).to.be.reverted
        await expect(factory.setNewVaultInitialEth(newVaultEth)).to.emit(factory, "NewVaultInitialEthUpdated")
        await expect(factory.setNewVaultOwnerInitialEth(ownerEth)).to.emit(factory, "NewVaultOwnerInitialEthUpdated")
        await expect(factory.setNewMemberInitialEth(newMemberEth)).to.emit(factory, "DefaultNewMemberInitialEthUpdated")

        await others[0].sendTransaction({
            to: factory.address,
            value: parseEther("2"),
        })

        const creatorBalanceBefore = await provider.getBalance(creator.address)

        // function deployNewVault(
        //     address payable owner,
        //     uint256 adminFeeFraction,
        //     address[] memory agents,
        //     string calldata metadataJsonString
        // )
        const args : [EthereumAddress, BigNumber, EthereumAddress[], string] = [
            creator.address,
            parseEther("0.1"),
            agents.map(a => a.address),
            "",
        ]
        log("deployNewVaultSidechain args: %o", args)

        const tx = await factory.deployNewVault(...args)
        const tr = await tx.wait()
        const [createdEvent] = tr?.events?.filter((evt) => evt?.event === "DUCreated") ?? []
        if (!createdEvent || !createdEvent.args || !createdEvent.args.length) {
            throw new Error("Missing DUCreated event")
        }
        const [newVaultAddress] = createdEvent.args
        expect(tr?.events?.filter((evt) => evt?.event === "DUCreated") ?? []).to.have.length(1)

        log("%s code: %s", newVaultAddress, await provider.getCode(newVaultAddress))
        expect(await provider.getCode(newVaultAddress)).not.equal("0x")

        const newVaultCreator = new Contract(newVaultAddress, VaultJson.abi, creator)
        const newVaultAgent = new Contract(newVaultAddress, VaultJson.abi, agents[0])
        const newVaultOutsider = new Contract(newVaultAddress, VaultJson.abi, others[0])
        const newVaultBalance = await provider.getBalance(newVaultAddress)
        log("newvault_address: %s, balance %s", newVaultAddress, newVaultBalance)

        // TODO: move asserts to the end

        // check created DU Eth
        expect(newVaultBalance).to.equal(newVaultEth)

        // check owner eth increased (can't assert exact change because creator also pays gas fees)
        const creatorBalanceChange = (await provider.getBalance(creator.address)).sub(creatorBalanceBefore)
        expect(creatorBalanceChange).not.equal(0)

        // 1st added member should have been given newMemberEth
        const balanceBefore1 = await provider.getBalance(members[0].address)
        await expect(newVaultAgent.addMembers(m)).to.emit(newVaultAgent, "MemberJoined")
        const balanceChange1 = (await provider.getBalance(members[0].address)).sub(balanceBefore1)
        expect(balanceChange1).to.equal(newMemberEth)

        // change the setting from within DU. check member Eth
        const newMemberEth2 = parseEther("0.2")
        await expect(newVaultOutsider.setNewMemberEth(newMemberEth2)).to.be.reverted
        await expect(newVaultCreator.setNewMemberEth(newMemberEth2)).to.emit(newVaultCreator, "NewMemberEthChanged")

        // 2nd added member should have been given newMemberEth
        const balanceBefore2 = await provider.getBalance(others[0].address)
        await expect(newVaultAgent.addMembers(o.slice(0, 1))).to.emit(newVaultAgent, "MemberJoined")
        const balanceChange2 = (await provider.getBalance(others[0].address)).sub(balanceBefore2)
        expect(balanceChange2).to.equal(newMemberEth2)
    })
})
