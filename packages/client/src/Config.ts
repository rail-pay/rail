import type { Overrides } from '@ethersproject/contracts'
import type { ExternalProvider } from '@ethersproject/providers'
import type { ConnectionInfo } from '@ethersproject/web'
import type { EthereumAddress } from './EthereumAddress'
import type { GasPriceStrategy } from './gasPriceStrategies'

/**
 * @category Important
 * Top-level client config
 */
export type RailClientConfig = {
    /** Custom human-readable debug id for client. Used in logging. Unique id will be generated regardless. TODO: delete probably */
    id?: string,

    /**
     * Authentication: identity used by this RailClient instance.
     * Can contain beneficiary privateKey or (window.)ethereum
     */
    auth: AuthConfig

    /** refers to a chain config in @rail-protocol/config */
    chain: string

    /** overrides to what @rail-protocol/config provides via the `chain` option */
    tokenAddress?: EthereumAddress

    factoryAddress?: EthereumAddress
    templateAddress?: EthereumAddress

    chainId?: number
    rpcs?: ConnectionInfo[]

    ethersOverrides?: Overrides

    joinPartAgentAddress?: string,
    joinServerUrl?: string,
    theGraphUrl?: string,

    gasPriceStrategy?: GasPriceStrategy
}

export type ProviderAuthConfig = {
    ethereum: ExternalProvider
}

export type PrivateKeyAuthConfig = {
    privateKey: string,
}

// TODO: maybe less magic pls
export type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }
export type XOR<T, U> = (T | U) extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U
export type AuthConfig = XOR<ProviderAuthConfig, PrivateKeyAuthConfig>

/**
 * @category Important
 */
export const RAIL_CLIENT_DEFAULTS: RailClientConfig = {
    auth: { privateKey: '' }, // TODO: this isn't a great default... must check in constructor that auth info really was given

    joinServerUrl: 'https://join.rail.dev',
    theGraphUrl: 'https://api.thegraph.com/subgraphs/name/rail-protocol/vaults', // TODO

    /** refers to a chain config in @rail-protocol/config */
    chain: 'polygon',
}
