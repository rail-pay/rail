import type { Wallet } from '@ethersproject/wallet'

import { RailClient } from '../../src/RailClient'
import type { RailClientConfig } from '../../src/Config'

import { deployContracts, getWallets } from './setup'

describe('DataUnion deploy', () => {

    let dao: Wallet
    let user: Wallet
    let clientOptions: Partial<RailClientConfig>
    beforeAll(async () => {
        [ dao, user ] = getWallets()
        const {
            token,
            vaultFactory,
            vault,
            ethereumUrl
        } = await deployContracts(dao)
        clientOptions = {
            auth: { privateKey: user.privateKey },
            tokenAddress: token.address,
            dataUnion: {
                factoryAddress: vaultFactory.address,
                templateAddress: vault.address,
            },
            network: { rpcs: [{ url: ethereumUrl, timeout: 30 * 1000 }] }
        }
    })

    describe('owner', () => {
        it('not specified: defaults to deployer', async () => {
            const client = new RailClient(clientOptions)
            const dataUnion = await client.deployVault()
            expect(await dataUnion.getAdminAddress()).toBe(await client.getAddress())
        })

        it('specified', async () => {
            const adminAddress = "0x0000000000000000000000000000000000000123"
            const client = new RailClient(clientOptions)
            const dataUnion = await client.deployVault({ adminAddress })
            expect(await dataUnion.getAdminAddress()).toBe(adminAddress)
        })

        it('invalid', async () => {
            const client = new RailClient(clientOptions)
            await expect(client.deployVault({ adminAddress: 'foobar' })).rejects.toThrow(/invalid address/)
        })
    })

    // TODO: tests for calculateAddress
})
