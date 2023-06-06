const chai = require('chai')
const { assert, expect } = chai
chai.use(require('chai-as-promised'))
const sinon = require('sinon')
const { JoinRequestService, VaultJoinError, VaultRetrievalError } = require('../../src/app/JoinRequestService')
const { unitTestLogger } = require('../rest/unitTestLogger')

describe('JoinRequestService', () => {
	const MEMBER_ADDRESS = '0x0123456789012345678901234567890123456789'
	const VAULT_ADDRESS = '0x1234567890123456789012345678901234567890'
	const CHAIN = 'polygon'

	let joinRequestService
	let railClient
	let vaultObject
	let onMemberJoin

	beforeEach(() => {
		vaultObject = {
			isMember: sinon.stub().resolves(false),
			addMembers: sinon.stub().resolves(true),
		}

		railClient = {
			getVault: sinon.stub().resolves(vaultObject),
		}

		const clients = new Map()
		clients.set(CHAIN, railClient)
		onMemberJoin = sinon.stub()
		joinRequestService = new JoinRequestService(unitTestLogger, clients, onMemberJoin)
	})

	afterEach(() => {
		joinRequestService = undefined
	})

	describe('create', () => {
		it('adds members using the RailClient', async () => {
			const response = await joinRequestService.create(MEMBER_ADDRESS, VAULT_ADDRESS, CHAIN)
			assert.isTrue(vaultObject.addMembers.calledWith([MEMBER_ADDRESS]))
			assert.equal(response.member, MEMBER_ADDRESS)
			assert.equal(response.vault, VAULT_ADDRESS)
			assert.equal(response.chain, CHAIN)
		})

		it('rejects when vault is not found', async () => {
			railClient.getVault = sinon.stub().rejects()
			await expect(joinRequestService.create(MEMBER_ADDRESS, VAULT_ADDRESS, CHAIN)).to.be.rejectedWith(VaultRetrievalError)
		})

		it('rejects if the member is already a member', async () => {
			vaultObject.isMember = sinon.stub().resolves(true),
			await expect(joinRequestService.create(MEMBER_ADDRESS, VAULT_ADDRESS, CHAIN)).to.be.rejectedWith(VaultJoinError)
		})

		it('rejects when joining vault fails', async () => {
			vaultObject.addMembers = sinon.stub().rejects()
			await expect(joinRequestService.create(MEMBER_ADDRESS, VAULT_ADDRESS, CHAIN)).to.be.rejectedWith(VaultJoinError)
		})

		it('calls the onMemberJoin function on join', async() => {
			await joinRequestService.create(MEMBER_ADDRESS, VAULT_ADDRESS, CHAIN)
			assert.isTrue(onMemberJoin.calledWith(MEMBER_ADDRESS, VAULT_ADDRESS, CHAIN))
		})
	})
})
