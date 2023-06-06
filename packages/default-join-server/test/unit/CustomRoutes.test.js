const express = require('express')
const request = require('supertest')
const { expect } = require('chai')
const sinon = require('sinon')
const createCustomRoutes = require('../../src/CustomRoutes')

describe('CustomRoutes', () => {
	let expressApp
	let client
	let db
	let vault

	beforeEach(() => {
		expressApp = express()
		expressApp.use(express.json())
		expressApp.use((req, res, next) => {
			req.validatedRequest = JSON.parse(req.body.request)
			next()
		})

		vault = {
			getAdminAddress: sinon.stub().resolves('0xabcdef')
		}

		client = {
			getVault: sinon.spy(async (vaultAddress) => {
				if (vaultAddress === '0x12345') {
					return vault
				}
			})
		}

		db = {}
		const clients = new Map()
		clients.set('test-chain', client)

		createCustomRoutes(db)(expressApp, clients)
	})

	afterEach(() => {

	})

	const runTest = async (endpoint, expectedStatus, body) => {
		return await request(expressApp).post(endpoint)
			.set('Content-Type', 'application/json')
			.send(body)
			.expect((res) => (res.status != expectedStatus ? console.error(res.body) : true)) // print debug info if something went wrong
			.expect(expectedStatus)
			.expect('Content-Type', 'application/json; charset=utf-8')
	}

	describe('POST /secrets/list', () => {

		it('requires the caller to be the operator', async () => {
			db.listSecrets = sinon.stub().rejects(new Error('db.listSecrets should not be called!'))

			await runTest('/secrets/list', 403, {
				address: 'not-operator',
				request: JSON.stringify({
					vault: '0x12345',
					chain: 'test-chain',
				})
			})

			expect(vault.getAdminAddress.calledOnce).to.be.true
			expect(db.listSecrets.called).to.be.false
		})

		it('fails if the Vault is not found', async () => {
			db.listSecrets = sinon.stub().rejects(new Error('db.listSecrets should not be called!'))

			await runTest('/secrets/list', 404, {
				address: '0xabcdef',
				request: JSON.stringify({
					vault: 'not-found',
					chain: 'test-chain',
				})
			})

			expect(client.getVault.calledOnceWith('not-found'))
			expect(vault.getAdminAddress.calledOnce).to.be.false
			expect(db.listSecrets.called).to.be.false
		})

		it('list the secrets for a Vault', async () => {
			const results = [{
				foo: 'bar'
			}]
			db.listSecrets = sinon.stub().resolves(results)

			const res = await runTest('/secrets/list', 200, {
				address: '0xabcdef',
				request: JSON.stringify({
					vault: '0x12345',
					chain: 'test-chain',
				})
			})

			expect(db.listSecrets.calledOnceWith('0x12345', 'test-chain')).to.be.true
			expect(res.body).to.be.deep.equal(results)
		})
	})

	describe('POST /secrets/create', () => {

		it('requires the caller to be the operator', async () => {
			db.createAppSecret = sinon.stub().rejects(new Error('db.createAppSecret should not be called!'))

			await runTest('/secrets/create', 403, {
				address: 'not-operator',
				request: JSON.stringify({
					vault: '0x12345',
					chain: 'test-chain',
					name: 'Test secret',
				})
			})

			expect(vault.getAdminAddress.calledOnce).to.be.true
			expect(db.createAppSecret.called).to.be.false
		})

		it('fails if the Vault is not found', async () => {
			db.createAppSecret = sinon.stub().rejects(new Error('db.createAppSecret should not be called!'))

			await runTest('/secrets/create', 404, {
				address: '0xabcdef',
				request: JSON.stringify({
					vault: 'not-found',
					chain: 'test-chain',
				})
			})

			expect(client.getVault.calledOnceWith('not-found'))
			expect(vault.getAdminAddress.calledOnce).to.be.false
			expect(db.createAppSecret.called).to.be.false
		})

		it('creates secrets', async () => {
			const result = {
				foo: 'bar'
			}
			db.createAppSecret = sinon.stub().resolves(result)

			const res = await runTest('/secrets/create', 200, {
				address: '0xabcdef',
				request: JSON.stringify({
					vault: '0x12345',
					chain: 'test-chain',
					name: 'test-secret',
				})
			})

			expect(db.createAppSecret.calledOnceWith('0x12345', 'test-chain', 'test-secret')).to.be.true
			expect(res.body).to.be.deep.equal(result)
		})
	})

	describe('POST /secrets/delete', () => {

		it('requires the caller to be the operator', async () => {
			db.getAppSecret = sinon.stub().rejects(new Error('db.getAppSecret should not be called!'))
			db.deleteAppSecret = sinon.stub().rejects(new Error('db.deleteAppSecret should not be called!'))

			await runTest('/secrets/delete', 403, {
				address: 'not-operator',
				request: JSON.stringify({
					vault: '0x12345',
					chain: 'test-chain',
					secret: 'test-secret'
				})
			})

			expect(vault.getAdminAddress.calledOnce).to.be.true
			expect(db.getAppSecret.called).to.be.false
			expect(db.deleteAppSecret.called).to.be.false
		})

		it('fails if the Vault is not found', async () => {
			db.getAppSecret = sinon.stub().rejects(new Error('db.getAppSecret should not be called!'))
			db.deleteAppSecret = sinon.stub().rejects(new Error('db.deleteAppSecret should not be called!'))

			await runTest('/secrets/create', 404, {
				address: '0xabcdef',
				request: JSON.stringify({
					vault: 'not-found',
					chain: 'test-chain',
				})
			})

			expect(client.getVault.calledOnceWith('not-found'))
			expect(vault.getAdminAddress.calledOnce).to.be.false
			expect(db.deleteAppSecret.called).to.be.false
		})

		it('deletes secrets', async () => {
			const secret = {
				secret: 'test-secret'
			}

			db.getAppSecret = sinon.stub().resolves(secret)
			db.deleteAppSecret = sinon.stub().resolves()

			const res = await runTest('/secrets/delete', 200, {
				address: '0xabcdef',
				request: JSON.stringify({
					vault: '0x12345',
					chain: 'test-chain',
					secret: 'test-secret',
				})
			})

			expect(db.getAppSecret.calledOnceWith('test-secret')).to.be.true
			expect(db.deleteAppSecret.calledOnceWith('test-secret')).to.be.true
			expect(res.body).to.be.deep.equal(secret)
		})

	})
})
