import { Wallet } from '@ethersproject/wallet'

import { RailClient } from '../../src/RailClient'

import { deployContracts, getWallets } from './setup'

import type { DATAv2 } from '@streamr/data-v2'
import type { Vault } from '../../src/Vault'

describe('Vault beneficiary', () => {

    let dao: Wallet
    let operator: Wallet
    let beneficiary: Wallet
    let otherMember: Wallet
    let token: DATAv2
    let vault: Vault
    let operatorVault: Vault
    beforeAll(async () => {
        [
            dao,
            operator,
            beneficiary,
            otherMember,
        ] = getWallets()
        const {
            token: tokenContract,
            vaultFactory,
            vaultTemplate,
            ethereumUrl
        } = await deployContracts(dao)
        token = tokenContract

        const clientOptions = {
            auth: { privateKey: beneficiary.privateKey },
            tokenAddress: token.address,
            factoryAddress: vaultFactory.address,
            templateAddress: vaultTemplate.address,
            rpcs: [{ url: ethereumUrl, timeout: 30 * 1000 }]
        }

        const operatorClient = new RailClient({ ...clientOptions, auth: { privateKey: operator.privateKey } })
        operatorVault = await operatorClient.deployVault()
        await operatorVault.addMembers([beneficiary.address, otherMember.address])

        const client = new RailClient(clientOptions)
        vault = await client.getVault(operatorVault.getAddress())
    })

    it('cannot be just any random address', async () => {
        expect(await vault.isMember(Wallet.createRandom().address)).toBe(false)
        expect(await vault.isMember("0x0000000000000000000000000000000000000000")).toBe(false)
    })

    it('can part from the vault', async () => {
        const beneficiaryCountBefore = await vault.getActiveMemberCount()
        const isMemberBefore = await vault.isMember()
        await vault.part()
        const isMemberAfter = await vault.isMember()
        const beneficiaryCountAfter = await vault.getActiveMemberCount()

        expect(isMemberBefore).toBe(true)
        expect(isMemberAfter).toBe(false)
        expect(beneficiaryCountAfter).toEqual(beneficiaryCountBefore - 1)
    })

    it('can be added by operator', async () => {
        const userAddress = Wallet.createRandom().address
        const beneficiaryCountBefore = await vault.getActiveMemberCount()
        const isMemberBefore = await vault.isMember(userAddress)
        await operatorVault.addMembers([userAddress])
        const isMemberAfter = await vault.isMember(userAddress)
        const beneficiaryCountAfter = await vault.getActiveMemberCount()

        expect(isMemberBefore).toBe(false)
        expect(isMemberAfter).toBe(true)
        expect(beneficiaryCountAfter).toEqual(beneficiaryCountBefore + 1)
    })

    it('can be removed by operator', async () => {
        await operatorVault.removeMembers([otherMember.address])
        const isMember = await vault.isMember(otherMember.address)
        expect(isMember).toBe(false)
    })

    it('can be added with weights', async () => {
        const userAddress = Wallet.createRandom().address
        const user2Address = Wallet.createRandom().address
        const beneficiaryCountBefore = await vault.getActiveMemberCount()
        const { totalWeight: totalWeightBefore } = await vault.getStats()
        const isMemberBefore = await vault.isMember(userAddress)

        await operatorVault.addMembersWithWeights([userAddress], [2])
        const isMemberAfter1 = await vault.isMember(userAddress)
        const beneficiaryCountAfter1 = await vault.getActiveMemberCount()
        const { totalWeight: totalWeightAfter1 } = await vault.getStats()

        await operatorVault.setMemberWeights([userAddress, user2Address], [0, 3])
        const isMemberAfter2 = await vault.isMember(userAddress)
        const beneficiaryCountAfter2 = await vault.getActiveMemberCount()
        const { totalWeight: totalWeightAfter2 } = await vault.getStats()

        expect(isMemberBefore).toBe(false)
        expect(isMemberAfter1).toBe(true)
        expect(isMemberAfter2).toBe(false)
        expect(beneficiaryCountAfter1).toEqual(beneficiaryCountBefore + 1)
        expect(totalWeightAfter1).toEqual(totalWeightBefore! + 2)
        expect(beneficiaryCountAfter2).toEqual(beneficiaryCountBefore + 1)
        expect(totalWeightAfter2).toEqual(totalWeightBefore! + 3)
    })

    it('functions fail for invalid address', async () => {
        return Promise.all([
            expect(() => vault.addMembers(['invalid-address'])).rejects.toThrow(/invalid address/),
            expect(() => vault.removeMembers(['invalid-address'])).rejects.toThrow(/invalid address/),
            expect(() => vault.isMember('invalid-address')).rejects.toThrow(/invalid address/),
        ])
    })
})
