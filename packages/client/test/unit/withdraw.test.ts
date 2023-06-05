import { parseEther, formatEther } from '@ethersproject/units'
import type { Wallet } from '@ethersproject/wallet'

import { RailClient } from '../../src/RailClient'

import { deployContracts, getWallets } from './setup'

import type { DATAv2 } from '@streamr/data-v2'
import type { Vault } from '../../src/Vault'
import type { RailClientConfig } from '../../src/Config'

describe('Vault withdrawX functions', () => {

    let dao: Wallet
    let admin: Wallet
    let member: Wallet
    let otherMember: Wallet
    let token: DATAv2
    let vault: Vault
    let otherVault: Vault
    let outsider: Wallet
    let clientOptions: Partial<RailClientConfig>
    beforeAll(async () => {
        [
            dao,
            admin,
            member,
            otherMember,
            outsider
        ] = getWallets()
        const {
            token: tokenContract,
            vaultFactory,
            vault,
            ethereumUrl
        } = await deployContracts(dao)
        token = tokenContract

        clientOptions = {
            auth: { privateKey: member.privateKey },
            tokenAddress: token.address,
            vault: {
                factoryAddress: vaultFactory.address,
                templateAddress: vault.address,
            },
            network: { rpcs: [{ url: ethereumUrl, timeout: 30 * 1000 }] }
        }

        // deploy a DU with admin fee 9% + DU fee 1% = total 10% fees
        const adminClient = new RailClient({ ...clientOptions, auth: { privateKey: admin.privateKey } })
        const adminVault = await adminClient.deployVault({ adminFee: 0.09 })
        await adminVault.addMembers([member.address, otherMember.address])

        const client = new RailClient(clientOptions)
        vault = await client.getVault(adminVault.getAddress())

        const otherClient = new RailClient({ ...clientOptions, auth: { privateKey: otherMember.privateKey } })
        otherVault = await otherClient.getVault(vault.getAddress())
    })

    async function fundVault(tokens: number) {
        await (await token.mint(await token.signer.getAddress(), parseEther(tokens.toFixed(10)))).wait()
        await (await token.transferAndCall(vault.getAddress(), parseEther(tokens.toFixed(10)), '0x')).wait()
    }

    describe('by the member itself', () => {
        it('to itself', async () => {
            const balanceBefore = await token.balanceOf(member.address)
            await fundVault(1)
            await vault.withdrawAll()
            const balanceChange = (await token.balanceOf(member.address)).sub(balanceBefore)
            expect(formatEther(balanceChange)).toEqual("0.45") // 0.5 - 10% fees
        })

        it('to any address', async () => {
            const balanceBefore = await token.balanceOf(outsider.address)
            await fundVault(1)
            await vault.withdrawAllTo(outsider.address)
            const balanceChange = (await token.balanceOf(outsider.address)).sub(balanceBefore)
            expect(formatEther(balanceChange)).toEqual("0.45") // 0.5 - 10% fees
        })
    })

    describe('by someone else on the member\'s behalf', () => {

        // TODO: for some reason this is actually blocked in the smart contract. Why? It used to be possible.
        it.skip('to a member without signature', async () => {
            const balanceBefore = await token.balanceOf(member.address)
            await fundVault(1)
            await otherVault.withdrawAllToMember(member.address)
            const balanceChange = (await token.balanceOf(member.address)).sub(balanceBefore)

            expect(formatEther(balanceChange)).toEqual("0.45") // 0.5 - 10% fees
        })

        it("to anyone with member's signature", async () => {
            const signature = await vault.signWithdrawAllTo(outsider.address)

            const balanceBefore = await token.balanceOf(outsider.address)
            await fundVault(1)
            await otherVault.withdrawAllToSigned(member.address, outsider.address, signature)
            const balanceChange = (await token.balanceOf(outsider.address)).sub(balanceBefore)

            expect(formatEther(balanceChange)).toEqual("0.45") // 0.5 - 10% fees
        })

        it("to anyone a specific amount with member's signature", async () => {
            const withdrawAmount = parseEther("0.1")
            const signature = await vault.signWithdrawAmountTo(outsider.address, withdrawAmount)

            const balanceBefore = await token.balanceOf(outsider.address)
            await fundVault(1)
            await otherVault.withdrawAmountToSigned(member.address, outsider.address, withdrawAmount, signature)
            const balanceChange = (await token.balanceOf(outsider.address)).sub(balanceBefore)

            expect(formatEther(balanceChange)).toEqual(formatEther(withdrawAmount))
        })
    })

    it('validates input addresses', async () => {
        await fundVault(1)
        return Promise.all([
            expect(() => vault.getWithdrawableEarnings('invalid-address')).rejects.toThrow(/invalid address/),
            expect(() => vault.withdrawAllTo('invalid-address')).rejects.toThrow(/invalid address/),
            expect(() => vault.signWithdrawAllTo('invalid-address')).rejects.toThrow(/invalid address/),
            expect(() => vault.signWithdrawAmountTo('invalid-address', '123')).rejects.toThrow(/invalid address/),
            expect(() => vault.withdrawAllToMember('invalid-address')).rejects.toThrow(/invalid address/),
            expect(() => vault.withdrawAllToSigned('invalid-address', 'invalid-address', 'mock-signature')).rejects.toThrow(/invalid address/),
            expect(() => vault.withdrawAmountToSigned('addr', 'addr', parseEther('1'), 'mock-signature')).rejects.toThrow(/invalid address/),
        ])
    })
})
