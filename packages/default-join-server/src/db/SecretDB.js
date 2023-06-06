const { QueryTypes } = require('sequelize')
const { v4: uuid } = require('uuid')

class SecretDB {
	constructor(sequelize) {
		this.sequelize = sequelize
	}

	async getAppSecret(secret) {
		const result = await this.sequelize.query(
			'SELECT * FROM data_union_secret WHERE secret = :secret LIMIT 1', {
				replacements: {
					secret,
				},
				type: QueryTypes.SELECT
			}
		)
		return result[0]
	}

	async listSecrets(vaultAddress, chain) {
		const results = await this.sequelize.query(
			'SELECT * FROM data_union_secret WHERE vault = :vaultAddress AND chain = :chain', {
				replacements: {
					vaultAddress,
					chain,
				},
				type: QueryTypes.SELECT
			}
		)
		return results
	}

	async createAppSecret(vaultAddress, chain, name) {
		const secret = uuid()
		await this.sequelize.query(
			'INSERT INTO data_union_secret (`secret`, `vault`, `chain`, `name`) VALUES (:secret, :vaultAddress, :chain, :name)',
			{
				replacements: {
					secret,
					vaultAddress,
					chain,
					name,
				},
				type: QueryTypes.INSERT
			}
		)

		return this.getAppSecret(secret)
	}

	async deleteAppSecret(secret) {
		const result = await this.sequelize.query(
			'DELETE FROM data_union_secret WHERE secret = :secret', {
				replacements: {
					secret,
				},
				type: QueryTypes.DELETE
			}
		)
		console.log(result)
	}

}

module.exports = SecretDB