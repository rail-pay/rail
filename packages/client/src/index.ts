/**
 * RailClient
 *
 * @packageDocumentation
 * @module RailClient
 */

import 'reflect-metadata'
import { RailClient } from './RailClient'

/**
 * This file captures named exports so we can manipulate them for cjs/browser builds.
 */
export { BigNumber } from '@ethersproject/bignumber'
export type { Bytes, BytesLike } from '@ethersproject/bytes'
export { Contract } from '@ethersproject/contracts'
export type { ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
export type { ExternalProvider } from '@ethersproject/providers'
export type { ConnectionInfo } from '@ethersproject/web'

export { RailClientConfig, RAIL_CLIENT_DEFAULTS } from './Config'
export * from './EthereumAddress'

export * from './RailClient'
export * from './Vault'

export default RailClient
