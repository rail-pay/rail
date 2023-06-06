const chai = require('chai')
const { expect } = chai
chai.use(require('chai-as-promised'))
const sinon = require('sinon')
const StreamrClient = require('streamr-client')

const createStreamrAwareJoinHook = require("../../src/OnMemberJoin")

describe('StreamrAwareJoinHook', () => {

	let streamrDB
	let streamrClient
	let onMemberJoin

	beforeEach(() => {
		streamrDB = {
			getStreamsForVault: sinon.mock().resolves([
				'streamId1',
				'streamId2'
			]),
		}
		streamrClient = {
			getAddress: sinon.mock().resolves('my-address'),
			getStream: sinon.spy(async (streamId) => {
				return {
					id: streamId,
					hasPermission: sinon.mock().resolves(true)
				}
			}),
			setPermissions: sinon.mock().resolves()
		}
		onMemberJoin = createStreamrAwareJoinHook(streamrDB, /* privateKey */ null, streamrClient)
	})

	it('grants PUBLISH permissions to streams in the given Vault', async () => {
		await onMemberJoin('beneficiary', 'vault', 'chain')
		expect(streamrDB.getStreamsForVault.calledOnceWith('vault', 'chain')).to.be.true
		expect(streamrClient.setPermissions.calledOnceWith([
			{
				streamId: 'streamId1',
				assignments: [
					{
						user: 'beneficiary',
						permissions: [StreamrClient.StreamPermission.PUBLISH]
					}
				]
			},
			{
				streamId: 'streamId2',
				assignments: [
					{
						user: 'beneficiary',
						permissions: [StreamrClient.StreamPermission.PUBLISH]
					}
				]
			},
		])).to.be.true
	})

	it('fails fast if the current user does not have the GRANT permission', async () => {
		streamrClient.getStream = sinon.spy(async (streamId) => {
			return {
				id: streamId,
				hasPermission: sinon.mock().resolves(false)
			}
		})

		await expect(onMemberJoin('beneficiary', 'vault', 'chain')).to.be.rejectedWith(Error)
		expect(streamrClient.setPermissions.called).to.be.false
	})

	it('does nothing if no streams are associated with the vault', async () => {
		streamrDB.getStreamsForVault = sinon.mock().resolves([])
		await onMemberJoin('beneficiary', 'vault', 'chain')
		expect(streamrClient.setPermissions.called).to.be.false
	})

})