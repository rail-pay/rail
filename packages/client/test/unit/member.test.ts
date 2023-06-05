import { Wallet } from '@ethersproject/wallet'

import { RailClient } from '../../src/RailClient'

import { deployContracts, getWallets } from './setup'

import type { DATAv2 } from '@streamr/data-v2'
import type { Vault } from '../../src/Vault'

describe('Vault member', () => {

    let dao: Wallet
    let admin: Wallet
    let member: Wallet
    let otherMember: Wallet
    let token: DATAv2
    let vault: Vault
    let adminVault: Vault
    beforeAll(async () => {
        [
            dao,
            admin,
            member,
            otherMember,
        ] = getWallets()
        const {
            token: tokenContract,
            vaultFactory,
            vault,
            ethereumUrl
        } = await deployContracts(dao)
        token = tokenContract

        const clientOptions = {
            auth: { privateKey: member.privateKey },
            tokenAddress: token.address,
            vault: {
                factoryAddress: vaultFactory.address,
                templateAddress: vault.address,
            },
            network: { rpcs: [{ url: ethereumUrl, timeout: 30 * 1000 }] }
        }

        const adminClient = new RailClient({ ...clientOptions, auth: { privateKey: admin.privateKey } })
        adminVault = await adminClient.deployVault()
        await adminVault.addMembers([member.address, otherMember.address])

        const client = new RailClient(clientOptions)
        vault = await client.getVault(adminVault.getAddress())
    })

    it('cannot be just any random address', async () => {
        expect(await vault.isMember(Wallet.createRandom().address)).toBe(false)
        expect(await vault.isMember("0x0000000000000000000000000000000000000000")).toBe(false)
    })

    it('can part from the data union', async () => {
        const memberCountBefore = await vault.getActiveMemberCount()
        const isMemberBefore = await vault.isMember()
        await vault.part()
        const isMemberAfter = await vault.isMember()
        const memberCountAfter = await vault.getActiveMemberCount()

        expect(isMemberBefore).toBe(true)
        expect(isMemberAfter).toBe(false)
        expect(memberCountAfter).toEqual(memberCountBefore - 1)
    })

    it('can be added by admin', async () => {
        const userAddress = Wallet.createRandom().address
        const memberCountBefore = await vault.getActiveMemberCount()
        const isMemberBefore = await vault.isMember(userAddress)
        await adminVault.addMembers([userAddress])
        const isMemberAfter = await vault.isMember(userAddress)
        const memberCountAfter = await vault.getActiveMemberCount()

        expect(isMemberBefore).toBe(false)
        expect(isMemberAfter).toBe(true)
        expect(memberCountAfter).toEqual(memberCountBefore + 1)
    })

    it('can be removed by admin', async () => {
        await adminVault.removeMembers([otherMember.address])
        const isMember = await vault.isMember(otherMember.address)
        expect(isMember).toBe(false)
    })

    it('can be added with weights', async () => {
        const userAddress = Wallet.createRandom().address
        const user2Address = Wallet.createRandom().address
        const memberCountBefore = await vault.getActiveMemberCount()
        const { totalWeight: totalWeightBefore } = await vault.getStats()
        const isMemberBefore = await vault.isMember(userAddress)

        await adminVault.addMembersWithWeights([userAddress], [2])
        const isMemberAfter1 = await vault.isMember(userAddress)
        const memberCountAfter1 = await vault.getActiveMemberCount()
        const { totalWeight: totalWeightAfter1 } = await vault.getStats()

        await adminVault.setMemberWeights([userAddress, user2Address], [0, 3])
        const isMemberAfter2 = await vault.isMember(userAddress)
        const memberCountAfter2 = await vault.getActiveMemberCount()
        const { totalWeight: totalWeightAfter2 } = await vault.getStats()

        expect(isMemberBefore).toBe(false)
        expect(isMemberAfter1).toBe(true)
        expect(isMemberAfter2).toBe(false)
        expect(memberCountAfter1).toEqual(memberCountBefore + 1)
        expect(totalWeightAfter1).toEqual(totalWeightBefore! + 2)
        expect(memberCountAfter2).toEqual(memberCountBefore + 1)
        expect(totalWeightAfter2).toEqual(totalWeightBefore! + 3)
    })

    it('functions fail for invalid address', async () => {
        return Promise.all([
            expect(() => vault.addMembers(['invalid-address'])).rejects.toThrow(/invalid address/),
            expect(() => vault.removeMembers(['invalid-address'])).rejects.toThrow(/invalid address/),
            expect(() => vault.isMember('invalid-address')).rejects.toThrow(/invalid address/),
        ])
    })
})
