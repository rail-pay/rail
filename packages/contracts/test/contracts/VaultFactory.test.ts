import { ethers as hardhatEthers } from "hardhat"
import { expect } from "chai"

import type { Wallet, BigNumber } from "ethers"

import Debug from "debug"
const log = Debug("Streamr:du:test:Vault")
//const log = console.log  // for debugging?

import type { Vault, VaultFactory, TestToken, DefaultFeeOracle } from "../../typechain"
import type { EthereumAddress } from "../../../client/src"

const {
    provider,
    getSigners,
    getContractFactory,
    utils: { parseEther },
} = hardhatEthers


describe("VaultFactory", (): void => {
    let creator: Wallet
    let a1: Wallet
    let a2: Wallet
    let a3: Wallet
    let m1: Wallet
    let m2: Wallet
    let m3: Wallet
    let o1: Wallet
    let o2: Wallet
    let protocolBeneficiary: Wallet

    let agents: EthereumAddress[]
    let members: EthereumAddress[]

    let factory: VaultFactory
    let vaultTemplate: Vault
    let testToken: TestToken

    before(async () => {
        [creator, a1, a2, a3, m1, m2, m3, o1, o2, protocolBeneficiary] = await getSigners() as unknown as Wallet[]
        agents = [a1, a2, a3].map(a => a.address)
        members = [m1, m2, m3].map(m => m.address)

        testToken = await (await getContractFactory("TestToken", { signer: creator })).deploy("name", "symbol") as TestToken
        await testToken.deployed()
        await testToken.mint(creator.address, parseEther("10000"))

        const feeOracle = await (await getContractFactory("DefaultFeeOracle", { signer: creator })).deploy() as DefaultFeeOracle
        await feeOracle.deployed()
        await feeOracle.initialize(parseEther("0.01"), protocolBeneficiary.address)

        vaultTemplate = await (await getContractFactory("Vault", { signer: creator })).deploy() as Vault
        await vaultTemplate.deployed()

        factory = await (await getContractFactory("VaultFactory", { signer: creator })).deploy() as VaultFactory
        await factory.deployed()
        await factory.initialize(vaultTemplate.address, testToken.address, feeOracle.address)
    })

    it("gives ETH to new beneficiaries", async () => {
        const ownerEth = parseEther("0.01")
        const newVaultEth = parseEther("1")
        const newMemberEth = parseEther("0.1")

        await expect(factory.connect(o1).setNewVaultInitialEth(newMemberEth)).to.be.reverted
        await expect(factory.connect(o1).setNewVaultOwnerInitialEth(newMemberEth)).to.be.reverted
        await expect(factory.connect(o1).setNewMemberInitialEth(newMemberEth)).to.be.reverted
        await expect(factory.setNewVaultInitialEth(newVaultEth)).to.emit(factory, "NewVaultInitialEthUpdated")
        await expect(factory.setNewVaultOwnerInitialEth(ownerEth)).to.emit(factory, "NewVaultOwnerInitialEthUpdated")
        await expect(factory.setNewMemberInitialEth(newMemberEth)).to.emit(factory, "DefaultNewMemberInitialEthUpdated")

        await o1.sendTransaction({
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
            agents,
            "",
        ]
        log("deployNewVaultSidechain args: %o", args)

        const tx = await factory.deployNewVault(...args)
        const tr = await tx.wait()
        const [createdEvent] = tr?.events?.filter((evt) => evt?.event === "VaultCreated") ?? []
        if (!createdEvent || !createdEvent.args || !createdEvent.args.length) {
            throw new Error("Missing VaultCreated event")
        }
        const [ newVaultAddress ] = createdEvent.args
        expect(tr?.events?.filter((evt) => evt?.event === "VaultCreated") ?? []).to.have.length(1)

        log("%s code: %s", newVaultAddress, await provider.getCode(newVaultAddress))
        expect(await provider.getCode(newVaultAddress)).not.equal("0x")

        const newVaultBalance = await provider.getBalance(newVaultAddress)
        log("newvault_address: %s, balance %s", newVaultAddress, newVaultBalance)

        const newVault = vaultTemplate.attach(newVaultAddress)

        // TODO: move asserts to the end

        // check created Vault Eth
        expect(newVaultBalance).to.equal(newVaultEth)

        // check owner eth increased (can't assert exact change because creator also pays gas fees)
        const creatorBalanceChange = (await provider.getBalance(creator.address)).sub(creatorBalanceBefore)
        expect(creatorBalanceChange).not.equal(0)

        // 1st added member should have been given newMemberEth
        const balanceBefore1 = await provider.getBalance(m1.address)
        await expect(newVault.connect(a1).addMembers(members)).to.emit(newVault.connect(a1), "MemberJoined")
        const balanceChange1 = (await provider.getBalance(m1.address)).sub(balanceBefore1)
        expect(balanceChange1).to.equal(newMemberEth)

        // change the setting from within Vault. check member Eth
        const newMemberEth2 = parseEther("0.2")
        await expect(newVault.connect(o1).setNewMemberEth(newMemberEth2)).to.be.reverted
        await expect(newVault.connect(creator).setNewMemberEth(newMemberEth2)).to.emit(newVault.connect(creator), "NewMemberEthChanged")

        // 2nd added member should have been given newMemberEth
        const balanceBefore2 = await provider.getBalance(o1.address)
        await expect(newVault.connect(a1).addMembers([o1.address, o2.address])).to.emit(newVault.connect(a1), "MemberJoined")
        const balanceChange2 = (await provider.getBalance(o1.address)).sub(balanceBefore2)
        expect(balanceChange2).to.equal(newMemberEth2)
    })
})
