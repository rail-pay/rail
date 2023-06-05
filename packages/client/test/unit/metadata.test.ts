import type { Wallet } from '@ethersproject/wallet'

import { RailClient } from '../../src/RailClient'
import type { RailClientConfig } from '../../src/Config'

import { deployContracts, getWallets } from './setup'

describe('DataUnion metadata', () => {

    let dao: Wallet
    let admin: Wallet
    let member: Wallet
    let clientOptions: Partial<RailClientConfig>
    beforeAll(async () => {
        [
            dao,
            admin,
            member,
        ] = getWallets()
        const {
            token,
            vaultFactory,
            vault,
            ethereumUrl
        } = await deployContracts(dao)

        clientOptions = {
            auth: { privateKey: member.privateKey },
            tokenAddress: token.address,
            dataUnion: {
                factoryAddress: vaultFactory.address,
                templateAddress: vault.address,
            },
            network: { rpcs: [{ url: ethereumUrl, timeout: 30 * 1000 }] }
        }
    })

    async function deployVault() {
        const adminClient = new RailClient({ ...clientOptions, auth: { privateKey: admin.privateKey } })
        const adminDataUnion = await adminClient.deployVault()
        await adminDataUnion.addMembers([member.address])
        const client = new RailClient(clientOptions)
        const dataUnion = await client.getVault(adminDataUnion.getAddress())
        return { adminDataUnion, dataUnion }
    }

    it('can be set by admin only', async () => {
        const { adminDataUnion, dataUnion } = await deployVault()
        const metadataBefore = await dataUnion.getMetadata()
        await expect(dataUnion.setMetadata({ testing: 123 })).rejects.toThrow(/not the DataUnion admin/)
        const metadataBefore2 = await dataUnion.getMetadata()
        await adminDataUnion.setMetadata({ testing: 123 })
        const metadataAfter = await dataUnion.getMetadata()
        expect(metadataBefore).toEqual({})
        expect(metadataBefore2).toEqual({})
        expect(metadataAfter).toEqual({ testing: 123 })
    })
})
