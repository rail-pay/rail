import type { Wallet } from '@ethersproject/wallet'

import { RailClient } from '../../src/RailClient'
import type { RailClientConfig } from '../../src/Config'

import { deployContracts, getWallets } from './setup'

describe('Vault deploy', () => {

    let dao: Wallet
    let user: Wallet
    let clientOptions: Partial<RailClientConfig>
    beforeAll(async () => {
        [ dao, user ] = getWallets()
        const {
            token,
            vaultFactory,
            vaultTemplate,
            ethereumUrl
        } = await deployContracts(dao)
        clientOptions = {
            auth: { privateKey: user.privateKey },
            tokenAddress: token.address,
            factoryAddress: vaultFactory.address,
            templateAddress: vaultTemplate.address,
            rpcs: [{ url: ethereumUrl, timeout: 30 * 1000 }]
        }
    })

    describe('owner', () => {
        it('not specified: defaults to deployer', async () => {
            const client = new RailClient(clientOptions)
            const vault = await client.deployVault()
            expect(await vault.getAdminAddress()).toBe(await client.getAddress())
        })

        it('specified', async () => {
            const operatorAddress = "0x0000000000000000000000000000000000000123"
            const client = new RailClient(clientOptions)
            const vault = await client.deployVault({ operatorAddress })
            expect(await vault.getAdminAddress()).toBe(operatorAddress)
        })

        it('invalid', async () => {
            const client = new RailClient(clientOptions)
            await expect(client.deployVault({ operatorAddress: 'foobar' })).rejects.toThrow(/invalid address/)
        })
    })

    // TODO: tests for calculateAddress
})
