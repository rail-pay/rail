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

	async create(member, vault, chain) {
		const railClient = this.clients.get(chain)
		let du
		try {
			du = await railClient.getVault(vault)
		} catch (err) {
			throw new VaultRetrievalError(`Error while retrieving data union ${vault}: ${err.message}`)
		}

		if (await du.isMember(member)) {
			throw new VaultJoinError(`Member ${member} is already a member of ${vault}!`)
		}

		try {
			await du.addMembers([member])
		} catch (err) {
			throw new VaultJoinError(`Error while adding member ${member} to data union ${vault}: ${err.message}`)
		}

		try {
			await this.onMemberJoin(member, vault, chain)
		} catch (err) {
			throw new VaultJoinError(`Error while adding member ${member} to data union ${vault}: ${err.message}`)
		}

		return {
			member,
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