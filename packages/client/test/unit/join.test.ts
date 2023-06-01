describe('DataUnion joining using join-server', () => {
    it('', () => {})
})
/* TODO
import type { Wallet } from '@ethersproject/wallet'

import { JoinServer } from '@rail-protocol/join-server'
import type { DATAv2 } from '@streamr/data-v2'

import { until } from '../until'
import { DataUnion } from '../../src/DataUnion'
import { DataUnionClient } from '../../src/DataUnionClient'
import type { DataUnionClientConfig } from '../../src/Config'

import { deployContracts, getWallets } from './setup'

/**
 * NOTE: joining with secret using default-join-server is tested in default-join-server
 *  This concerns the following functions in DataUnion.ts: createSecret, deleteSecret, listSecrets.
 *  They're not covered here. See data-union/packages/default-join-server/test/integration/client.test.ts
 ** /
describe('DataUnion joining using join-server', () => {

    let admin: Wallet
    let member: Wallet
    let joinPartAgent: Wallet
    let duAddress: string
    let token: DATAv2
    let clientOptions: Partial<DataUnionClientConfig>
    let server: JoinServer
    beforeAll(async () => {
        [
            admin,
            member,
            joinPartAgent,
        ] = getWallets()
        const {
            token: tokenContract,
            vaultFactory,
            vault,
            ethereumUrl
        } = await deployContracts(admin)
        token = tokenContract

        clientOptions = {
            auth: {
                privateKey: member.privateKey
            },
            joinServerUrl: "http://localhost:5678",
            chain: "testrpc",
            tokenAddress: token.address,
            dataUnion: {
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

        const client = new DataUnionClient({ ...clientOptions, auth: { privateKey: admin.privateKey } })
        const dataUnion = await client.deployDataUnion()
        duAddress = dataUnion.getAddress()

        server = new JoinServer({
            privateKey: joinPartAgent.privateKey,
            port: 5678,
            customJoinRequestValidator: async (_memberAddress, request) => {
                if (request.extra) {
                    throw new Error("Denied!")
                }
            },

            dataUnionClient: new DataUnionClient({
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
        const client = new DataUnionClient(clientOptions)
        const dataUnion = await client.getDataUnion(duAddress)
        const response = await dataUnion.join()
        await until(() => dataUnion.isMember(), 30000, 1000)
        expect(response).toEqual({
            member: member.address,
            chain: "testrpc",
            dataUnion: dataUnion.getAddress(),
        })
    }, 40000)

    it('cannot join a non-existing data union', async () => {
        const client = new DataUnionClient(clientOptions)
        const dataUnion = await client.getDataUnion(duAddress)
        const badContract = dataUnion.contract.attach("0x0000000000000000000000000000000000000012")
        const badDataUnion = new DataUnion(badContract, client.restPlugin, client)
        await expect(badDataUnion.join()).rejects.toThrow("Error while retrieving data union 0x0000000000000000000000000000000000000012: " +
                                                            "0x0000000000000000000000000000000000000012 is not an Ethereum contract!")
    })

    it('cannot join if denied by the customJoinRequestValidator', async () => {
        const client = new DataUnionClient(clientOptions)
        const dataUnion = await client.getDataUnion(duAddress)
        await expect(dataUnion.join({ extra: "testing" })).rejects.toThrow("Join request failed validation: 'Error: Denied!'")
    })
})

*/
