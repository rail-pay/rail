describe('Vault joining using join-server', () => {
    it('', () => {})
})
/* TODO
import type { Wallet } from '@ethersproject/wallet'

import { JoinServer } from '@rail-protocol/join-server'
import type { DATAv2 } from '@streamr/data-v2'

import { until } from '../until'
import { Vault } from '../../src/Vault'
import { RailClient } from '../../src/RailClient'
import type { RailClientConfig } from '../../src/Config'

import { deployContracts, getWallets } from './setup'

/**
 * NOTE: joining with secret using default-join-server is tested in default-join-server
 *  This concerns the following functions in Vault.ts: createSecret, deleteSecret, listSecrets.
 *  They're not covered here. See data-union/packages/default-join-server/test/integration/client.test.ts
 ** /
describe('Vault joining using join-server', () => {

    let operator: Wallet
    let beneficiary: Wallet
    let joinPartAgent: Wallet
    let vaultAddress: string
    let token: DATAv2
    let clientOptions: Partial<RailClientConfig>
    let server: JoinServer
    beforeAll(async () => {
        [
            operator,
            beneficiary,
            joinPartAgent,
        ] = getWallets()
        const {
            token: tokenContract,
            vaultFactory,
            vault,
            ethereumUrl
        } = await deployContracts(operator)
        token = tokenContract

        clientOptions = {
            auth: {
                privateKey: beneficiary.privateKey
            },
            joinServerUrl: "http://localhost:5678",
            chain: "testrpc",
            tokenAddress: token.address,
            vault: {
                factoryAddress: vaultFactory.address,
                templateAddress: vault.address,
                joinPartAgentAddress: joinPartAgent.address,
            },
            network: {
                rpcs: [{
                    url: ethereumUrl,
                    timeout: 30 * 1000
                }]
            }
        }

        const client = new RailClient({ ...clientOptions, auth: { privateKey: operator.privateKey } })
        const vault = await client.deployVault()
        vaultAddress = vault.getAddress()

        server = new JoinServer({
            privateKey: joinPartAgent.privateKey,
            port: 5678,
            customJoinRequestValidator: async (_beneficiaryAddress, request) => {
                if (request.extra) {
                    throw new Error("Denied!")
                }
            },

            railClient: new RailClient({
                ...clientOptions,
                auth: {
                    privateKey: joinPartAgent.privateKey
                }
            })
        })
        await server.start()
    })

    afterAll(async () => {
        await server.stop()
    })

    it('joins using the server', async () => {
        const client = new RailClient(clientOptions)
        const vault = await client.getVault(vaultAddress)
        const response = await vault.join()
        await until(() => vault.isMember(), 30000, 1000)
        expect(response).toEqual({
            beneficiary: beneficiary.address,
            chain: "testrpc",
            vault: vault.getAddress(),
        })
    }, 40000)

    it('cannot join a non-existing vault', async () => {
        const client = new RailClient(clientOptions)
        const vault = await client.getVault(vaultAddress)
        const badContract = vault.contract.attach("0x0000000000000000000000000000000000000012")
        const badVault = new Vault(badContract, client.restPlugin, client)
        await expect(badVault.join()).rejects.toThrow("Error while retrieving vault 0x0000000000000000000000000000000000000012: " +
                                                            "0x0000000000000000000000000000000000000012 is not an Ethereum contract!")
    })

    it('cannot join if denied by the customJoinRequestValidator', async () => {
        const client = new RailClient(clientOptions)
        const vault = await client.getVault(vaultAddress)
        await expect(vault.join({ extra: "testing" })).rejects.toThrow("Join request failed validation: 'Error: Denied!'")
    })
})

*/
