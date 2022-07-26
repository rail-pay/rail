/**
 * Config and utilities for interating with identity & Ethereum chain.
 */
import type { Signer } from '@ethersproject/abstract-signer'
import { getAddress } from '@ethersproject/address'
import type { BigNumber } from '@ethersproject/bignumber'
import type { Overrides } from '@ethersproject/contracts'
import type { ExternalProvider, Provider } from '@ethersproject/providers'
import { getDefaultProvider, JsonRpcProvider, Web3Provider } from '@ethersproject/providers'
import { computeAddress } from '@ethersproject/transactions'
import { Wallet } from '@ethersproject/wallet'
import type { ConnectionInfo } from '@ethersproject/web'
import { inject, Lifecycle, scoped } from 'tsyringe'

import { ConfigInjectionToken } from './Config'
import type { EthereumAddress } from './types'

export type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }
export type XOR<T, U> = (T | U) extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U

export type ProviderConfig = ExternalProvider

// Auth Config

export type ProviderAuthConfig = {
    ethereum: ProviderConfig
}

export type PrivateKeyAuthConfig = {
    privateKey: string,
    // The address property is not used. It is included to make the object
    // compatible with StreamrClient.generateEthereumAccount(), as we typically
    // use that method to generate the client "auth" option.
    address?: EthereumAddress
}

export type SessionTokenAuthConfig = {
    sessionToken: string
}

// eslint-disable-next-line @typescript-eslint/ban-types
export type UnauthenticatedAuthConfig = XOR<{}, { unauthenticated: true }>
export type AuthenticatedConfig = XOR<ProviderAuthConfig, PrivateKeyAuthConfig> & Partial<SessionTokenAuthConfig>
export type AuthConfig = XOR<AuthenticatedConfig, UnauthenticatedAuthConfig>

// Ethereum Config

// these should come from ETH-184 config package when it's ready
export type NetworkConfig = {
    name: string
    chainId: number
    rpcs: ConnectionInfo[]
    overrides?: Overrides
    gasPriceStrategy?: (estimatedGasPrice: BigNumber) => BigNumber
}

export type EthereumConfig = {
    tokenAddress: EthereumAddress
    network: NetworkConfig
}

@scoped(Lifecycle.ContainerScoped)
export class Ethereum {
    static generateEthereumAccount() {
        const wallet = Wallet.createRandom()
        return {
            address: wallet.address,
            privateKey: wallet.privateKey,
        }
    }

    private _getAddress?: () => Promise<string>
    private _getSigner?: () => Signer

    constructor(
        @inject(ConfigInjectionToken.Auth) authConfig: AuthConfig,
        @inject(ConfigInjectionToken.Ethereum) private ethereumConfig: EthereumConfig
    ) {
        if ('privateKey' in authConfig && authConfig.privateKey) {
            const key = authConfig.privateKey
            const address = getAddress(computeAddress(key))
            this._getAddress = async () => address
            this._getSigner = () => new Wallet(key, this.getProvider())
        } else if ('ethereum' in authConfig && authConfig.ethereum) {
            const { ethereum } = authConfig
            this._getAddress = async () => {
                try {
                    if (!(ethereumConfig && 'request' in ethereum && typeof ethereum.request === 'function')) {
                        throw new Error(`invalid ethereum provider ${ethereumConfig}`)
                    }
                    const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
                    const account = getAddress(accounts[0]) // convert to checksum case
                    return account
                } catch {
                    throw new Error('no addresses connected+selected in Metamask')
                }
            }
            this._getSigner = () => {
                const metamaskProvider = new Web3Provider(ethereum)
                const metamaskSigner = metamaskProvider.getSigner()
                return metamaskSigner
            }
            // TODO: handle events
            // ethereum.on('accountsChanged', (accounts) => { })
            // https://docs.metamask.io/guide/ethereum-provider.html#events says:
            //   "We recommend reloading the page unless you have a very good reason not to"
            //   Of course we can't and won't do that, but if we need something chain-dependent...
            // ethereum.on('chainChanged', (chainId) => { window.location.reload() });
        }
    }

    /** @internal */
    isAuthenticated() {
        return (this._getAddress !== undefined)
    }

    /** @internal */
    canEncrypt() {
        return !!(this._getAddress && this._getSigner)
    }

    async getAddress(): Promise<EthereumAddress> {
        if (!this._getAddress) {
            // _getAddress is assigned in constructor
            throw new Error('StreamrClient is not authenticated with private key')
        }

        return (await this._getAddress())
    }

    /** @internal */
    getSigner(): Signer {
        if (!this._getSigner) {
            // _getSigner is assigned in constructor
            throw new Error("StreamrClient not authenticated! Can't send transactions or sign messages.")
        }

        return this._getSigner()
    }

    /**
     * @returns Ethers.js Provider, a connection to the Ethereum network (mainnet)
     * @internal
     */
    getProvider(): Provider {
        return this.getAllProviders()[0]
    }

    /**
     * @returns Array of Ethers.js Providers, connections to the Ethereum network (mainnet)
     * @internal
     */
    private getAllProviders(): Provider[] {
        if (!this.ethereumConfig.network?.rpcs || !this.ethereumConfig.network?.rpcs?.length) {
            return [getDefaultProvider()]
        }

        return this.ethereumConfig.network.rpcs.map((config: ConnectionInfo) => {
            return new JsonRpcProvider(config)
        })
    }

    /**
     * Apply the gasPriceStrategy to the estimated gas price, if given
     * Ethers.js will resolve the gas price promise before sending the tx
     */
    getOverrides(): Overrides {
        const chainConfig = this.ethereumConfig?.network
        if (!chainConfig) { return {} }
        const overrides = chainConfig?.overrides ?? {}
        if (chainConfig.gasPriceStrategy) {
            return {
                ...overrides,
                gasPrice: this.getProvider().getGasPrice().then(chainConfig.gasPriceStrategy)
            }
        }
        return overrides
    }
}