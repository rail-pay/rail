const { newUnitTestServer } = require('./newUnitTestServer')
const { unitTestLogger } = require('./unitTestLogger')
const request = require('supertest')
const { assert } = require('chai')
const sinon = require('sinon')
const app = require('../../src/app')

describe('POST /join', async () => {
	let srv

	beforeEach(() => {
		// JoinRequestService with mocked create()
		const logger = unitTestLogger
		const clients = new Map()
		const onMemberJoin = function(_beneficiary, _vault, _chain) {}
		const joinRequestService = new app.JoinRequestService(logger, clients, onMemberJoin)
		joinRequestService.create = sinon.spy((beneficiary, vault, chain) => {
			return {
				beneficiary,
				vault,
				chain,
			}
		})

		srv = newUnitTestServer({
			logger: unitTestLogger,
			joinRequestService,
			signedRequestValidator: sinon.spy(async (req) => {
				req.validatedRequest = JSON.parse(req.body.request)
			}),
			customJoinRequestValidator: sinon.stub().resolves(true),
		})
	})

	afterEach(() => {
		srv.close()
		srv = undefined
	})

	const happyTestCases = [
		{
			name: 'send join vault request',
			body: {
				address: '0x766760C748bcEcf5876a6469a6aed3C642CdA261',
				request: JSON.stringify({
					vault: '0x81ed645D344cB2096aBA56B94d336E6dcF80f6C6',
					chain: 'polygon',
				}),
			},
		},
	]
	happyTestCases.forEach((tc) => {
		it(tc.name, async () => {
			const expectedStatus = 200
			const res = await request(srv.expressApp)
				.post(`/join`)
				.set('Content-Type', 'application/json')
				.send(tc.body)
				.expect((res) => (res.status != expectedStatus ? console.error(res.body) : true)) // print debug info if something went wrong
				.expect(expectedStatus)
				.expect('Content-Type', 'application/json; charset=utf-8')

			assert.isTrue(srv.signedRequestValidator.calledOnce)
			assert.isTrue(srv.customJoinRequestValidator.calledOnce)
			assert.isTrue(srv.joinRequestService.create.calledOnce)

			const joinRequest = JSON.parse(tc.body.request)
			const expectedBody = {
				beneficiary: tc.body.address,
				vault: joinRequest.vault,
			}
			if (joinRequest.chain) {
				expectedBody.chain = joinRequest.chain
			}
			assert.deepEqual(res.body, expectedBody)
		})
	})

	const testCases = [
		{
			name: 'client sends invalid beneficiary address',
			body: {
				address: '0x00000',
				request: JSON.stringify({
					vault: '0x81ed645D344cB2096aBA56B94d336E6dcF80f6C6',
					chain: 'polygon',
				}),
			},
			expectedErrorMessage: `Invalid beneficiary address: '0x00000'`,
		},
		{
			name: 'client sends invalid vault address',
			body: {
				address: '0x766760C748bcEcf5876a6469a6aed3C642CdA261',
				request: JSON.stringify({
					vault: '0x01234',
					chain: 'polygon',
				}),
			},
			expectedErrorMessage: `Invalid Vault contract address: '0x01234'`,
		},
		{
			name: 'client sends invalid chain name',
			body: {
				address: '0x766760C748bcEcf5876a6469a6aed3C642CdA261',
				request: JSON.stringify({
					vault: '0x81ed645D344cB2096aBA56B94d336E6dcF80f6C6',
					chain: 'foobar',
				}),
			},
			expectedErrorMessage: `Invalid chain name: 'foobar'`,
		},
		{
			name: 'send join vault request without chain',
			body: {
				address: '0x766760C748bcEcf5876a6469a6aed3C642CdA261',
				request: JSON.stringify({
					vault: '0x81ed645D344cB2096aBA56B94d336E6dcF80f6C6',
				}),
			},
			expectedErrorMessage: `Invalid chain name: 'undefined'`,
		},
	]
	testCases.forEach((tc) => {
		it(tc.name, async () => {
			const expectedStatus = 400
			const res = await request(srv.expressApp)
				.post(`/join`)
				.set('Content-Type', 'application/json')
				.send(tc.body)
				.expect((res) => (res.status != expectedStatus ? console.error(res.body) : true)) // print debug info if something went wrong
				.expect(expectedStatus)
				.expect('Content-Type', 'application/json; charset=utf-8')

			assert.equal(res.body.error.message, tc.expectedErrorMessage)
			assert.isFalse(srv.customJoinRequestValidator.called)
			assert.isFalse(srv.joinRequestService.create.called)
		})
	})
})
