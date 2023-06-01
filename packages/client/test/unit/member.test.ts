import { Wallet } from '@ethersproject/wallet'

import { DataUnionClient } from '../../src/DataUnionClient'

import { deployContracts, getWallets } from './setup'

import type { DATAv2 } from '@streamr/data-v2'
import type { DataUnion } from '../../src/DataUnion'

describe('DataUnion member', () => {

    let dao: Wallet
    let admin: Wallet
    let member: Wallet
    let otherMember: Wallet
    let token: DATAv2
    let dataUnion: DataUnion
    let adminDataUnion: DataUnion
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
            dataUnion: {
                factoryAddress: vaultFactory.address,
                templateAddress: vault.address,
            },
            network: { rpcs: [{ url: ethereumUrl, timeout: 30 * 1000 }] }
        }

        const adminClient = new DataUnionClient({ ...clientOptions, auth: { privateKey: admin.privateKey } })
        adminDataUnion = await adminClient.deployDataUnion()
        await adminDataUnion.addMembers([member.address, otherMember.address])

        const client = new DataUnionClient(clientOptions)
        dataUnion = await client.getDataUnion(adminDataUnion.getAddress())
    })

    it('cannot be just any random address', async () => {
        expect(await dataUnion.isMember(Wallet.createRandom().address)).toBe(false)
        expect(await dataUnion.isMember("0x0000000000000000000000000000000000000000")).toBe(false)
    })

    it('can part from the data union', async () => {
        const memberCountBefore = await dataUnion.getActiveMemberCount()
        const isMemberBefore = await dataUnion.isMember()
        await dataUnion.part()
        const isMemberAfter = await dataUnion.isMember()
        const memberCountAfter = await dataUnion.getActiveMemberCount()

        expect(isMemberBefore).toBe(true)
        expect(isMemberAfter).toBe(false)
        expect(memberCountAfter).toEqual(memberCountBefore - 1)
    })

    it('can be added by admin', async () => {
        const userAddress = Wallet.createRandom().address
        const memberCountBefore = await dataUnion.getActiveMemberCount()
        const isMemberBefore = await dataUnion.isMember(userAddress)
        await adminDataUnion.addMembers([userAddress])
        const isMemberAfter = await dataUnion.isMember(userAddress)
        const memberCountAfter = await dataUnion.getActiveMemberCount()

        expect(isMemberBefore).toBe(false)
        expect(isMemberAfter).toBe(true)
        expect(memberCountAfter).toEqual(memberCountBefore + 1)
    })

    it('can be removed by admin', async () => {
        await adminDataUnion.removeMembers([otherMember.address])
        const isMember = await dataUnion.isMember(otherMember.address)
        expect(isMember).toBe(false)
    })

    it('can be added with weights', async () => {
        const userAddress = Wallet.createRandom().address
        const user2Address = Wallet.createRandom().address
        const memberCountBefore = await dataUnion.getActiveMemberCount()
        const { totalWeight: totalWeightBefore } = await dataUnion.getStats()
        const isMemberBefore = await dataUnion.isMember(userAddress)

        await adminDataUnion.addMembersWithWeights([userAddress], [2])
        const isMemberAfter1 = await dataUnion.isMember(userAddress)
        const memberCountAfter1 = await dataUnion.getActiveMemberCount()
        const { totalWeight: totalWeightAfter1 } = await dataUnion.getStats()

        await adminDataUnion.setMemberWeights([userAddress, user2Address], [0, 3])
        const isMemberAfter2 = await dataUnion.isMember(userAddress)
        const memberCountAfter2 = await dataUnion.getActiveMemberCount()
        const { totalWeight: totalWeightAfter2 } = await dataUnion.getStats()

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
            expect(() => dataUnion.addMembers(['invalid-address'])).rejects.toThrow(/invalid address/),
            expect(() => dataUnion.removeMembers(['invalid-address'])).rejects.toThrow(/invalid address/),
            expect(() => dataUnion.isMember('invalid-address')).rejects.toThrow(/invalid address/),
        ])
    })
})
