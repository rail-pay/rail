import { parseEther, formatEther } from '@ethersproject/units'
import type { Wallet } from '@ethersproject/wallet'
import type { BigNumberish } from '@ethersproject/bignumber'

import { RailClient } from '../../src/RailClient'

import { deployContracts, getWallets } from './setup'

import type { RailClientConfig } from '../../src/Config'
import type { DATAv2 } from '@streamr/data-v2'

import debug from 'debug'
const log = debug('RailClient:unit-tests:adminFee')

describe('Vault fees', () => {

    let dao: Wallet
    let user: Wallet
    let clientOptions: Partial<RailClientConfig>
    let token: DATAv2
    beforeAll(async () => {
        [ dao, user ] = getWallets()
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
            vault: {
                factoryAddress: vaultFactory.address,
                templateAddress: vault.address,
            },
            network: { rpcs: [{ url: ethereumUrl, timeout: 30 * 1000 }] }
        }
    })

    async function fundVault(vaultAddress: string, amountWei: BigNumberish) {
        await (await token.mint(await token.signer.getAddress(), amountWei)).wait()
        await (await token.transferAndCall(vaultAddress, amountWei, '0x')).wait()
    }

    it('admin can set admin fee', async () => {
        const client = new RailClient(clientOptions)
        const vault = await client.deployVault()
        const oldFee = await vault.getAdminFee()
        log(`Vault admin: ${await vault.getAdminAddress()}`)
        log(`Sending tx from ${await client.getAddress()}`)
        const tr = await vault.setAdminFee(0.1)
        log(`Transaction events: ${JSON.stringify(tr.events!.map((e) => e.event))}`)
        const newFee = await vault.getAdminFee()
        expect(oldFee).toEqual(0)
        expect(newFee).toEqual(0.1)
    })

    it('admin receives admin fees', async () => {
        const client = new RailClient(clientOptions)
        const vault = await client.deployVault()
        await vault.addMembers(["0x0000000000000000000000000000000000000001"])
        await vault.setAdminFee(0.1)
        await fundVault(vault.getAddress(), parseEther('1'))
        expect(formatEther(await vault.getWithdrawableEarnings(user.address))).toEqual('0.1')
    })

    // it('admin can set Vault fee', async () => {
    //     const client = new RailClient(clientOptions)
    //     const vault = await client.deployVault()
    //     const oldFee = await vault.getAdminFee()
    //     log(`Vault admin: ${await vault.getAdminAddress()}`)
    //     log(`Sending tx from ${await client.getAddress()}`)
    //     const tr = await vault.setAdminFee(0.1)
    //     log(`Transaction events: ${JSON.stringify(tr.events!.map((e) => e.event))}`)
    //     const newFee = await vault.getAdminFee()
    //     expect(oldFee).toEqual(0)
    //     expect(newFee).toEqual(0.1)
    // })

    it('Vault DAO receives Vault fees', async () => {
        const client = new RailClient(clientOptions)
        const vault = await client.deployVault()
        await vault.addMembers(["0x0000000000000000000000000000000000000001"])
        await fundVault(vault.getAddress(), parseEther('1'))
        expect(formatEther(await vault.getWithdrawableEarnings(dao.address))).toEqual('0.01')
    })
})
