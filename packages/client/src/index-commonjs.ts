import RailClient from "./index"
import * as NamedExports from './index'
// CJS entrypoint.

const AugmentedClient = Object.assign(RailClient, NamedExports)

// required to get require('@rail-protocol/client') instead of require('@rail-protocol/client').default
module.exports = AugmentedClient

export default RailClient
export * from './index'
