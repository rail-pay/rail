const { QueryTypes } = require('sequelize')

class StreamrDB {
	constructor(sequelize) {
		this.sequelize = sequelize
	}

	async getStreamsForVault(vault, chain) {
		// TODO: once product-stream mapping is on chain, do this via The Graph
		return await this.sequelize.query(
			`SELECT DISTINCT ps.stream_id FROM product p
			JOIN product_streams as ps on p.id = ps.product_id
			WHERE p.beneficiary_address like :vault and p.chain like :chain`, {
				replacements: {
					vault,
					chain,
				},
				type: QueryTypes.SELECT
			}
		)
	}

}

module.exports = StreamrDB