import type { Wallet } from '@ethersproject/wallet'

import { RailClient } from '../../src/RailClient'
import type { RailClientConfig } from '../../src/Config'

import { deployContracts, getWallets } from './setup'

describe('Vault metadata', () => {

    let dao: Wallet
    let admin: Wallet
    let beneficiary: Wallet
    let clientOptions: Partial<RailClientConfig>
    beforeAll(async () => {
        [
            dao,
            admin,
            beneficiary,
        ] = getWallets()
        const {
            token,
            vaultFactory,
            vaultTemplate,
            ethereumUrl
        } = await deployContracts(dao)

        clientOptions = {
            auth: { privateKey: beneficiary.privateKey },
            tokenAddress: token.address,
            factoryAddress: vaultFactory.address,
            templateAddress: vaultTemplate.address,
            rpcs: [{ url: ethereumUrl, timeout: 30 * 1000 }]
        }
    })

    async function deployVault() {
        const adminClient = new RailClient({ ...clientOptions, auth: { privateKey: admin.privateKey } })
        const adminVault = await adminClient.deployVault()
        await adminVault.addMembers([beneficiary.address])
        const client = new RailClient(clientOptions)
        const vault = await client.getVault(adminVault.getAddress())
        return { adminVault, vault }
    }

    it('can be set by admin only', async () => {
        const { adminVault, vault } = await deployVault()
        const metadataBefore = await vault.getMetadata()
        await expect(vault.setMetadata({ testing: 123 })).rejects.toThrow(/not the Vault admin/)
        const metadataBefore2 = await vault.getMetadata()
        await adminVault.setMetadata({ testing: 123 })
        const metadataAfter = await vault.getMetadata()
        expect(metadataBefore).toEqual({})
        expect(metadataBefore2).toEqual({})
        expect(metadataAfter).toEqual({ testing: 123 })
    })
})
