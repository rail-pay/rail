import { expect } from 'chai'

import fetch from 'node-fetch'
import { Wallet, providers, utils } from 'ethers'
const { parseEther, formatEther } = utils

import { DATAv2, deployToken } from '@streamr/data-v2'
import { Vault, RailClient } from '@rail-protocol/client'

import { until } from '../../client/test/until'

import debug from 'debug'
const log = debug('vaults/subgraph:test')

import * as chainConfig from '@rail-protocol/config'

async function query(query: string) {
    log('Sending query "%s"', query)
    const res = await fetch('http://localhost:8000/subgraphs/name/streamr-dev/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    })
    const resJson = await res.json()
    log('   %s', JSON.stringify(resJson))
    return resJson.data
}

describe('Subgraph', () => {
    const provider = new providers.JsonRpcProvider(chainConfig.docker.rpcUrl)
    const tokenAdminWallet = new Wallet('0xfe1d528b7e204a5bdfb7668a1ed3adfee45b4b96960a175c9ef0ad16dd58d728', provider) // testrpc 5
    const wallet = new Wallet('0x957a8212980a9a39bf7c03dcbeea3c722d66f2b359c669feceb0e3ba8209a297', provider) // testrpc 4
    const wallet2 = new Wallet('0xd7609ae3a29375768fac8bc0f8c2f6ac81c5f2ffca2b981e6cf15460f01efe14', provider) // testrpc 6
    let vault: Vault
    let token: DATAv2
    it('detects Vault deployments (VaultCreated)', async function () {
        // this.timeout(100000)

        log('Deploying token from %s...', tokenAdminWallet.address)
        token = await deployToken(tokenAdminWallet)
        const MINTER_ROLE = await token.MINTER_ROLE()
        await (await token.grantRole(MINTER_ROLE, tokenAdminWallet.address)).wait()
        log('   token deployed at %s', token.address)

        const client = new RailClient({
            auth: { privateKey: wallet.privateKey },
            chain: 'docker',
            tokenAddress: token.address,
        })
        log('Deploying Vault from %s...', wallet.address)
        vault = await client.deployVaultUsingToken(token.address, {})
        const vaultAddress = vault.getAddress()
        log('Vault deployed at %s, waiting for thegraph confirmation...', vaultAddress)
        await until(async () => (await query(`{ vault(id: "${vaultAddress.toLowerCase()}") { id } }`)).vault != null, 10000, 2000)
    })

    it('detects beneficiary joins and parts (MemberJoined, MemberParted)', async function () {
        // this.timeout(100000)
        const vaultId = vault.getAddress().toLowerCase()
        async function getMemberCount(): Promise<number> {
            const res = await query(`{ vault(id: "${vaultId}") { beneficiaryCount } }`)
            return res.vault.beneficiaryCount
        }

        async function getMemberBuckets(): Promise<Array<any>> {
            const res = await query(`{
                vaultBuckets(where: {vault: "${vaultId}"}) {
                    beneficiaryCountAtStart
                    beneficiaryCountChange
                    type
                  }
            }`)
            return res.vaultBuckets
        }

        const beneficiaryCountAtStart = await getMemberCount()
        expect(await getMemberBuckets()).to.deep.equal([])

        await vault.addMembers(['0x1234567890123456789012345678901234567890', '0x1234567890123456789012345678901234567891'])
        await until(async () => await getMemberCount() == beneficiaryCountAtStart + 2, 10000, 2000)
        expect(await getMemberBuckets()).to.deep.equal([
            { type: 'DAY', beneficiaryCountAtStart, beneficiaryCountChange: 2 },
            { type: 'HOUR', beneficiaryCountAtStart, beneficiaryCountChange: 2 },
        ])

        await vault.removeMembers(['0x1234567890123456789012345678901234567890'])
        await until(async () => await getMemberCount() == beneficiaryCountAtStart + 1, 10000, 2000)
        expect(await getMemberBuckets()).to.deep.equal([
            { type: 'DAY', beneficiaryCountAtStart, beneficiaryCountChange: 1 },
            { type: 'HOUR', beneficiaryCountAtStart, beneficiaryCountChange: 1 },
        ])

        await vault.removeMembers(['0x1234567890123456789012345678901234567891'])
        await until(async () => await getMemberCount() == beneficiaryCountAtStart, 10000, 2000)
        expect(await getMemberBuckets()).to.deep.equal([
            { type: 'DAY', beneficiaryCountAtStart, beneficiaryCountChange: 0 },
            { type: 'HOUR', beneficiaryCountAtStart, beneficiaryCountChange: 0 },
        ])
    })

    it('detects RevenueReceived events', async function () {
        // this.timeout(100000)
        // revenue won't show up unless there are beneficiaries in the Vault
        await vault.addMembers(['0x1234567890123456789012345678901234567892', '0x1234567890123456789012345678901234567893'])

        const vaultId = vault.getAddress().toLowerCase()
        async function getRevenueEvents(): Promise<any[]> {
            const res = await query(`{ revenueEvents(where: {vault: "${vaultId}"}) { amountWei } }`)
            return res.revenueEvents
        }

        async function getRevenue(): Promise<string> {
            const res = await query(`{ vault(id: "${vaultId}") { revenueWei } }`)
            return formatEther(res.vault.revenueWei)
        }

        async function getRevenueBuckets(): Promise<Array<any>> {
            const res = await query(`{
                vaultBuckets(where: {vault: "${vaultId}", type: "DAY"}) {
                    revenueAtStartWei
                    revenueChangeWei
                }
            }`)
            return res.vaultBuckets
        }

        const revenueEventsBefore = await getRevenueEvents()
        const revenueBefore = await getRevenue()
        const revenueBucketsBefore = await getRevenueBuckets()
        await (await token.mint(vault.getAddress(), parseEther('100'))).wait()
        await vault.refreshRevenue()
        let revenueEventsAfter1
        await until(async () => (revenueEventsAfter1 = await getRevenueEvents()).length > revenueEventsBefore.length, 10000, 2000)
        const revenueAfter1 = await getRevenue()
        const revenueBucketsAfter1 = await getRevenueBuckets()
        await (await token.mint(vault.getAddress(), parseEther('200'))).wait()
        await vault.refreshRevenue()
        let revenueEventsAfter2
        await until(async () => (revenueEventsAfter2 = await getRevenueEvents()).length > revenueEventsAfter1.length, 10000, 2000)
        const revenueAfter2 = await getRevenue()
        const revenueBucketsAfter2 = await getRevenueBuckets()

        expect(revenueEventsBefore).to.deep.equal([])
        expect(revenueEventsAfter1).to.deep.equal([{ amountWei: '100000000000000000000' }])
        expect(revenueEventsAfter2).to.deep.equal([{ amountWei: '100000000000000000000' }, { amountWei: '200000000000000000000' }])
        expect(revenueBefore).to.equal('0.0')
        expect(revenueAfter1).to.equal('100.0')
        expect(revenueAfter2).to.equal('300.0')
        // revenueBucketsBefore exists because of the beneficiary joins in the previous test, in independent tests it would be []
        expect(revenueBucketsBefore).to.deep.equal([{
            revenueAtStartWei: '0',
            revenueChangeWei: '0',
        }])
        expect(revenueBucketsAfter1).to.deep.equal([{
            revenueAtStartWei: '0',
            revenueChangeWei: '100000000000000000000',
        }])
        expect(revenueBucketsAfter2).to.deep.equal([{
            revenueAtStartWei: '0',
            revenueChangeWei: '300000000000000000000',
        }])
    })

    it('detects OwnershipTransferred events', async function () {
        // this.timeout(100000)
        const vaultId = vault.getAddress().toLowerCase()
        async function getOwner(): Promise<string> {
            const res = await query(`{ vault(id: "${vaultId}") { owner } }`)
            return res.vault.owner
        }

        const ownerBefore = await getOwner()
        await (await vault.contract.transferOwnership(wallet2.address)).wait()
        await (await vault.contract.connect(wallet2).claimOwnership()).wait()
        await until(async () => await getOwner() !== wallet.address, 10000, 2000)
        const ownerAfter = await getOwner()

        expect(ownerBefore).to.equal(wallet.address.toLowerCase())
        expect(ownerAfter).to.equal(wallet2.address.toLowerCase())
    })

    it('detects MemberWeightChanged events', async function () {
        // this.timeout(100000)
        const vaultId = vault.getAddress().toLowerCase()
        async function getTotalWeight(): Promise<string> {
            const res = await query(`{ vault(id: "${vaultId}") { totalWeight } }`)
            return res.vault.totalWeight
        }

        async function getWeightBuckets(): Promise<Array<any>> {
            const res = await query(`{
                vaultBuckets(where: {vault: "${vaultId}"}) {
                    totalWeightAtStart
                    totalWeightChange
                    type
                  }
            }`)
            return res.vaultBuckets
        }

        const totalWeightBefore = await getTotalWeight()
        const totalWeightAtStart = '0' // at start of the bucketing period (i.e. before the test)
        let totalWeightChange: string  // change since before the test, i.e. including the previous cases

        await vault.addMembers(['0x1234567890123456789012345678901234560001', '0x1234567890123456789012345678901234560002'])
        totalWeightChange = (+totalWeightBefore + 2).toString()
        await until(async () => await getTotalWeight() == totalWeightChange, 10000, 2000)
        expect(await getWeightBuckets()).to.deep.equal([
            { type: 'DAY', totalWeightAtStart, totalWeightChange },
            { type: 'HOUR', totalWeightAtStart, totalWeightChange },
        ])

        await vault.addMembersWithWeights(['0x1234567890123456789012345678901234560003'], [3.5])
        totalWeightChange = (+totalWeightBefore + 5.5).toString() // eslint-disable-line require-atomic-updates
        await until(async () => await getTotalWeight() == totalWeightChange, 10000, 2000)
        expect(await getWeightBuckets()).to.deep.equal([
            { type: 'DAY', totalWeightAtStart, totalWeightChange },
            { type: 'HOUR', totalWeightAtStart, totalWeightChange },
        ])

        await vault.setMemberWeights(['0x1234567890123456789012345678901234560001'], [4.5])
        totalWeightChange = (+totalWeightBefore + 9).toString() // eslint-disable-line require-atomic-updates
        await until(async () => await getTotalWeight() == totalWeightChange, 10000, 2000)
        expect(await getWeightBuckets()).to.deep.equal([
            { type: 'DAY', totalWeightAtStart, totalWeightChange },
            { type: 'HOUR', totalWeightAtStart, totalWeightChange },
        ])
    })
})
