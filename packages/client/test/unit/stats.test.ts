import type { Wallet } from '@ethersproject/wallet'

import { RailClient } from '../../src/RailClient'
import type { RailClientConfig } from '../../src/Config'
import type { DATAv2 } from '@streamr/data-v2'
import type { Vault } from '../../src/Vault'

import { deployContracts, getWallets } from './setup'

describe('Vault stats getters', () => {

    let dao: Wallet
    let admin: Wallet
    let beneficiary: Wallet
    let otherMember: Wallet
    let removedMember: Wallet
    let outsider: Wallet
    let vault: Vault
    let token: DATAv2
    let clientOptions: Partial<RailClientConfig>
    beforeAll(async () => {
        [
            dao,
            admin,
            beneficiary,
            otherMember,
            removedMember,
            outsider,
        ] = getWallets()
        const {
            token: tokenContract,
            vaultFactory,
            vaultTemplate,
            ethereumUrl
        } = await deployContracts(dao)
        token = tokenContract

        clientOptions = {
            auth: { privateKey: beneficiary.privateKey },
            tokenAddress: token.address,
            factoryAddress: vaultFactory.address,
            templateAddress: vaultTemplate.address,
            rpcs: [{ url: ethereumUrl, timeout: 30 * 1000 }]
        }
        const adminClient = new RailClient({ ...clientOptions, auth: { privateKey: admin.privateKey } })
        const adminVault = await adminClient.deployVault()
        await adminVault.addMembers([beneficiary.address, otherMember.address, removedMember.address])
        await adminVault.removeMembers([removedMember.address])

        const client = new RailClient(clientOptions)
        vault = await client.getVault(adminVault.getAddress())
    })

    it('Vault stats', async () => {
        const stats = await vault.getStats()
        expect(stats.activeMemberCount.toString()).toEqual("2")
        expect(stats.inactiveMemberCount.toString()).toEqual("1")
        expect(stats.joinPartAgentCount.toString()).toEqual("2")
        expect(stats.totalEarnings.toString()).toEqual("0")
        expect(stats.totalWithdrawable.toString()).toEqual("0")
        expect(stats.lifetimeMemberEarnings.toString()).toEqual("0")
    })

    it('beneficiary stats', async () => {
        const beneficiaryStats = await vault.getMemberStats(beneficiary.address)
        const beneficiaryStats2 = await vault.getMemberStats(otherMember.address)
        const beneficiaryStats3 = await vault.getMemberStats(removedMember.address)
        const beneficiaryStats4 = await vault.getMemberStats(outsider.address)

        expect(beneficiaryStats.status).toEqual('ACTIVE')
        expect(beneficiaryStats.totalEarnings.toString()).toEqual("0")
        expect(beneficiaryStats.withdrawableEarnings.toString()).toEqual("0")

        expect(beneficiaryStats2.status).toEqual('ACTIVE')
        expect(beneficiaryStats2.totalEarnings.toString()).toEqual("0")
        expect(beneficiaryStats2.withdrawableEarnings.toString()).toEqual("0")

        expect(beneficiaryStats3.status).toEqual('INACTIVE')
        expect(beneficiaryStats3.totalEarnings.toString()).toEqual("0")
        expect(beneficiaryStats3.withdrawableEarnings.toString()).toEqual("0")

        expect(beneficiaryStats4.status).toEqual('NONE')
        expect(beneficiaryStats4.totalEarnings.toString()).toEqual("0")
        expect(beneficiaryStats4.withdrawableEarnings.toString()).toEqual("0")
    })

    it('beneficiary stats: invalid address', async () => {
        expect(vault.getMemberStats('invalid-address')).rejects.toThrow(/invalid address/)
    })

    it('gives Vault admin address correctly', async () => {
        const adminAddress = await vault.getAdminAddress()
        expect(adminAddress).toEqual(admin.address)
    })
})
