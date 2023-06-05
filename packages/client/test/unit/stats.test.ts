import type { Wallet } from '@ethersproject/wallet'

import { RailClient } from '../../src/RailClient'
import type { RailClientConfig } from '../../src/Config'
import type { DATAv2 } from '@streamr/data-v2'
import type { Vault } from '../../src/Vault'

import { deployContracts, getWallets } from './setup'

describe('Vault stats getters', () => {

    let dao: Wallet
    let admin: Wallet
    let member: Wallet
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
            member,
            otherMember,
            removedMember,
            outsider,
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
        const adminClient = new RailClient({ ...clientOptions, auth: { privateKey: admin.privateKey } })
        const adminVault = await adminClient.deployVault()
        await adminVault.addMembers([member.address, otherMember.address, removedMember.address])
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

    it('member stats', async () => {
        const memberStats = await vault.getMemberStats(member.address)
        const memberStats2 = await vault.getMemberStats(otherMember.address)
        const memberStats3 = await vault.getMemberStats(removedMember.address)
        const memberStats4 = await vault.getMemberStats(outsider.address)

        expect(memberStats.status).toEqual('ACTIVE')
        expect(memberStats.totalEarnings.toString()).toEqual("0")
        expect(memberStats.withdrawableEarnings.toString()).toEqual("0")

        expect(memberStats2.status).toEqual('ACTIVE')
        expect(memberStats2.totalEarnings.toString()).toEqual("0")
        expect(memberStats2.withdrawableEarnings.toString()).toEqual("0")

        expect(memberStats3.status).toEqual('INACTIVE')
        expect(memberStats3.totalEarnings.toString()).toEqual("0")
        expect(memberStats3.withdrawableEarnings.toString()).toEqual("0")

        expect(memberStats4.status).toEqual('NONE')
        expect(memberStats4.totalEarnings.toString()).toEqual("0")
        expect(memberStats4.withdrawableEarnings.toString()).toEqual("0")
    })

    it('member stats: invalid address', async () => {
        expect(vault.getMemberStats('invalid-address')).rejects.toThrow(/invalid address/)
    })

    it('gives DU admin address correctly', async () => {
        const adminAddress = await vault.getAdminAddress()
        expect(adminAddress).toEqual(admin.address)
    })
})
