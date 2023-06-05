const { InvalidRequestError } = require('@rail-protocol/join-server')

module.exports = (db) => {
	return async (address, joinRequest) => {
		if (!joinRequest.secret) {
			throw new InvalidRequestError(`App secret not provided by ${address}`)
		}

		const secret = await db.getAppSecret(joinRequest.secret)
		if (!secret
            || secret.vault.toLowerCase() !== joinRequest.vault.toLowerCase()
            || secret.chain !== joinRequest.chain) {
			throw new InvalidRequestError(`Invalid app secret provided by ${address}`)
		}
	}
}