import 'reflect-metadata'

// ESM EntryPoint
import RailClient from './index.js'
export * from './index.js'
// required to get import RailClient from './RailClient' to work
export default RailClient.default
// note this file is manually copied as-is into dist/src since we don't want tsc to compile it to commonjs
