const app = require('../../src/app')
const { unitTestLogger } = require('./unitTestLogger')

function newUnitTestServer(conf) {
	const clients = new Map()
	const onMemberJoin = async (_beneficiary, _vault, _chain) => {}
	return new app.JoinServer({
		privateKey: '52ada1a52c1224e7c5d7b17860cb622efb60eb4145e297a1b28b6fa06649be52',
		joinRequestService: new app.JoinRequestService(unitTestLogger, clients, onMemberJoin),
		port: process.env.PORT,
		logger: unitTestLogger,
		clients: new Map(),
		...conf,
	})
}

module.exports = {
	newUnitTestServer,
}