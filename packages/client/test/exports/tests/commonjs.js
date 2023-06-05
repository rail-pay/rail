// checks that require works
const { Wallet } = require('@ethersproject/wallet')
const RailClient = require('@rail-protocol/client')
const assert = require('node:assert')

assert(!!RailClient.RAIL_CLIENT_DEFAULTS, 'RailClient should have RAIL_CLIENT_DEFAULTS')

const client = new RailClient({
    auth: Wallet.createRandom(),
})

client.getAddress().then(async () => {
    console.info('success')
    process.exit(0)
})
