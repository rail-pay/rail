import { parseEther, formatEther } from '@ethersproject/units'
import type { Wallet } from '@ethersproject/wallet'

import { RailClient } from '../../src/RailClient'
import type { RailClientConfig } from '../../src/Config'

import { deployContracts, getWallets } from './setup'
import type { DATAv2 } from '@streamr/data-v2'

describe('Simple DataUnion object getters', () => {

    let dao: Wallet
    let user: Wallet
    let token: DATAv2
    let clientOptions: Partial<RailClientConfig>
    beforeAll(async () => {
        [
            dao,
            user,
        ] = getWallets()
        const {
            token: tokenContract,
            vaultFactory,
            vault,
            ethereumUrl
        } = await deployContracts(dao)
        token = tokenContract
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

    it('getTokenBalance', async () => {
        const client = new RailClient(clientOptions)
        const balanceBefore = await client.getTokenBalance()
        await (await token.mint(user.address, parseEther('123'))).wait()
        const balanceAfter = await client.getTokenBalance(user.address)

        expect(formatEther(balanceBefore)).toEqual('0.0')
        expect(formatEther(balanceAfter)).toEqual('123.0')
    })

    it('getVault fails for non-DU addresses', async () => {
        const client = new RailClient(clientOptions)
        await expect(async () => client.getVault('invalid-address')).rejects.toThrow(/invalid Ethereum address/)
        await expect(client.getVault('0x2222222222222222222222222222222222222222')).rejects.toThrow(/not an Ethereum contract/)
        await expect(client.getVault(user.address)).rejects.toThrow(/not an Ethereum contract/)
        await expect(client.getVault(dao.address)).rejects.toThrow(/not an Ethereum contract/)
        await expect(client.getVault(token.address)).rejects.toThrow(/not a Data Union/)
    })
})
