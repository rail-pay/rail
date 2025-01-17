class JoinRequestService {
	constructor(logger, clients, onMemberJoin) {
		if (logger === undefined) {
			throw new Error(`Variable logger is required`)
		}
		this.logger = logger
		if (clients === undefined) {
			throw new Error(`Variable clients is required`)
		}
		this.clients = clients
		if (onMemberJoin === undefined) {
			throw new Error(`Function onMemberJoin is required`)
		}
		this.onMemberJoin = onMemberJoin
	}

	async create(beneficiary, vault, chain) {
		const railClient = this.clients.get(chain)
		let du
		try {
			du = await railClient.getVault(vault)
		} catch (err) {
			throw new VaultRetrievalError(`Error while retrieving vault ${vault}: ${err.message}`)
		}

		if (await du.isMember(beneficiary)) {
			throw new VaultJoinError(`Member ${beneficiary} is already a beneficiary of ${vault}!`)
		}

		try {
			await du.addMembers([beneficiary])
		} catch (err) {
			throw new VaultJoinError(`Error while adding beneficiary ${beneficiary} to vault ${vault}: ${err.message}`)
		}

		try {
			await this.onMemberJoin(beneficiary, vault, chain)
		} catch (err) {
			throw new VaultJoinError(`Error while adding beneficiary ${beneficiary} to vault ${vault}: ${err.message}`)
		}

		return {
			beneficiary,
			vault,
			chain: chain,
		}
	}

	close() {
		this.clients.forEach((railClient) => {
			railClient.close()
		})
	}
}

class VaultRetrievalError extends Error {}
class VaultJoinError extends Error {}

module.exports = {
	JoinRequestService,
	VaultRetrievalError,
	VaultJoinError,
}