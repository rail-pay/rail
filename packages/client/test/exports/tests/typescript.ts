// check ts esm works via tsc

import assert from 'node:assert'
import { Wallet } from '@ethersproject/wallet'
import DefaultExport, * as NamedExports from '@rail-protocol/client'

console.info('import DefaultExport, * as NamedExports from \'@rail-protocol/client\':', { DefaultExport, NamedExports })

const RailClient = DefaultExport

assert(!!NamedExports.RAIL_CLIENT_DEFAULTS, 'Named exports should contain RAIL_CLIENT_DEFAULTS')

const client = new RailClient({
    auth: Wallet.createRandom(),
})

client.getAddress().then(async () => {
    console.info('success')
    process.exit(0)
})
