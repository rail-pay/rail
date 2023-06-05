import { getAddress, isAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import { JsonRpcProvider, Web3Provider } from '@ethersproject/providers'
import { Wallet } from '@ethersproject/wallet'
import { debug } from 'debug'
import type { Overrides as EthersOverrides } from '@ethersproject/contracts'
import type { Signer } from '@ethersproject/abstract-signer'
import type { Provider } from '@ethersproject/providers'

import chainConfig from '@rail-protocol/config'
import { tokenAbi, vaultFactoryAbi, vaultAbi } from '@rail-protocol/contracts'
import type { VaultFactory, Vault as VaultContract, IERC677 } from '@rail-protocol/contracts'

import { RAIL_CLIENT_DEFAULTS } from './Config'
import { Rest } from './Rest'
import { gasPriceStrategies } from './gasPriceStrategies'
import { Vault } from './Vault'
import type { RailClientConfig } from './Config'
import type { VaultDeployOptions } from './Vault'
import type { EthereumAddress } from './EthereumAddress'
import type { GasPriceStrategy } from './gasPriceStrategies'

const log = debug('RailClient')

export class RailClient {

    /** @internal */
    // readonly id: string
    /** @internal */
    // readonly debug: Debugger

    readonly wallet: Signer
    readonly chainName: string

    readonly overrides: EthersOverrides
    readonly gasPriceStrategy?: GasPriceStrategy

    readonly factoryAddress: EthereumAddress
    readonly joinPartAgentAddress: EthereumAddress
    readonly tokenAddress: EthereumAddress

    readonly restPlugin?: Rest
    constructor(clientOptions: Partial<RailClientConfig> = {}) {

        // this.id = 'RailClient'
        // this.debug = Debug('RailClient')
        if (!clientOptions.auth) { throw new Error("Must include auth in the config!") }
        const options: RailClientConfig = { ...RAIL_CLIENT_DEFAULTS, ...clientOptions }

        // get defaults for networks from @streamr/config
        const chain = (chainConfig as any)[options.chain] as {[key: string]: string}

        this.chainName = options.chain
        this.overrides = options.ethersOverrides ?? {}
        this.gasPriceStrategy = options.gasPriceStrategy ?? gasPriceStrategies[options.chain]

        if (options.auth.ethereum) {
            // browser: we let Metamask do the signing, and also the RPC connections
            if (typeof options.auth.ethereum.request !== 'function') {
                throw new Error('invalid ethereum provider given to auth.ethereum')
            }
            const metamaskProvider = new Web3Provider(options.auth.ethereum)
            this.wallet = metamaskProvider.getSigner()

            // TODO: is this really needed? Doesn't simple `await wallet.getAddress()` work?
            // this._getAddress = async () => {
            //     try {
            //         const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
            //         const account = getAddress(accounts[0]) // convert to checksum case
            //         return account
            //     } catch {
            //         throw new Error('no addresses connected+selected in Metamask')
            //     }
            // }

            // TODO: handle events
            // ethereum.on('accountsChanged', (accounts) => { })
            // https://docs.metamask.io/guide/ethereum-provider.html#events says:
            //   "We recommend reloading the page unless you have a very good reason not to"
            //   Of course we can't and won't do that, but if we need something chain-dependent...
            // ethereum.on('chainChanged', (chainId) => { window.location.reload() });

        } else if (options.auth.privateKey) {
            // node.js: we sign with the given private key, and we connect to given provider RPC URL
            const rpcUrl = options.rpcs?.[0] || chain.rpcUrl
            const provider = new JsonRpcProvider(rpcUrl)
            this.wallet = new Wallet(options.auth.privateKey, provider)

        } else {
            throw new Error("Must include auth.ethereum or auth.privateKey in the config!")
        }

        // TODO: either tokenAddress -> defaultTokenAddress or delete completely; DUs can have different tokens
        this.tokenAddress = getAddress(options.tokenAddress ?? chain.tokenAddress ?? "Must include tokenAddress or chain in the config!")
        this.factoryAddress = getAddress(options.factoryAddress ?? chain.vaultFactoryAddress
                                            ?? "Must include factoryAddress or chain in the config!")
        this.joinPartAgentAddress = getAddress(options.joinPartAgentAddress ?? chain.joinPartAgentAddress)

        if (options.joinServerUrl) {
            this.restPlugin = new Rest(options.joinServerUrl)
        }
    }

    async getAddress(): Promise<EthereumAddress> {
        return this.wallet.getAddress()
    }

    close(): void {
        this.wallet.provider!.removeAllListeners()
    }

    /**
     * Apply the gasPriceStrategy to the estimated gas price, if given in options.network.gasPriceStrategy
     * Ethers.js will resolve the gas price promise before sending the tx
     */
    async getOverrides(): Promise<EthersOverrides> {
        if (this.gasPriceStrategy) {
            const { gasPrice, maxFeePerGas, maxPriorityFeePerGas } = await this.gasPriceStrategy(this.wallet.provider!)

            // EIP-1559 or post-London gas price
            if (maxFeePerGas && maxPriorityFeePerGas) {
                return {
                    ...this.overrides,
                    maxFeePerGas,
                    maxPriorityFeePerGas,
                }
            }

            // "old style" gas price
            if (gasPrice) {
                return {
                    ...this.overrides,
                    gasPrice,
                }
            }
        }
        return this.overrides
    }

    /**
     * Can be used for Polygon and Gnosis too
     * @returns a randomly generated secure Ethereum wallet
     */
    static generateEthereumAccount(): { address: string, privateKey: string } {
        const wallet = Wallet.createRandom()
        return {
            address: wallet.address,
            privateKey: wallet.privateKey,
        }
    }

    async getFactory(factoryAddress: EthereumAddress = this.factoryAddress, wallet: Signer = this.wallet): Promise<VaultFactory> {
        if (await wallet.provider!.getCode(factoryAddress) === '0x') {
            throw new Error(`No Contract found at ${factoryAddress}, check RailClient.options.vault.factoryAddress!`)
        }
        return new Contract(factoryAddress, vaultFactoryAbi, wallet) as unknown as VaultFactory
    }

    getTemplate(templateAddress: EthereumAddress, provider: Provider | Signer = this.wallet): VaultContract {
        return new Contract(templateAddress, vaultAbi, provider) as unknown as VaultContract
    }

    // TODO decide: use DATAv2 instead of IERC677 for "default token"?
    getToken(tokenAddress: EthereumAddress = this.tokenAddress, provider: Provider | Signer = this.wallet): IERC677 {
        return new Contract(tokenAddress, tokenAbi, provider) as unknown as IERC677
    }

    /**
     * Get token balance in "wei" (10^-18 parts) for given address
     * @param address to query, or this DU client's address if omitted
     */
    async getTokenBalance(address?: EthereumAddress): Promise<BigNumber> {
        const a = address ? getAddress(address) : await this.wallet.getAddress()
        return this.getToken().balanceOf(a)
    }

    /**
     * @category Important
     */
    async getVault(contractAddress: EthereumAddress): Promise<Vault> {
        if (!isAddress(contractAddress)) {
            throw new Error(`Can't get Vault, invalid Ethereum address: ${contractAddress}`)
        }

        if (await this.wallet.provider!.getCode(contractAddress) === '0x') {
            throw new Error(`${contractAddress} is not an Ethereum contract!`)
        }

        // giving the wallet instead of just a provider to Vault wouldn't really be required for most operations (reading)
        //   but some operations (withdrawing) won't work without.
        // if this getSigner does nasty things (like Metamask popup?) then it could be replaced by separating
        //   getVaultReadonly for the cases where reading isn't required, OR
        //   just giving a read-only vault contract here, then .connect(wallet) in withdraw functions
        const contract = this.getTemplate(contractAddress, this.wallet)

        // memberData throws an error <=> not a Vault contract (probably...)
        const looksLikeVault = await contract.memberData("0x0000000000000000000000000000000000000000").then(() => true).catch(() => false)
        if (!looksLikeVault) {
            throw new Error(`${contractAddress} is not a Vault!`)
        }

        return new Vault(contract, this, this.restPlugin)
    }

    async deployVaultUsingToken(token: EthereumAddress, options: VaultDeployOptions = {}): Promise<Vault> {
        const {
            adminAddress = await this.wallet.getAddress(),
            joinPartAgents = [adminAddress, this.joinPartAgentAddress],
            vaultName = `Vault-${Date.now()}`, // TODO: use uuid
            adminFee = 0,
            confirmations = 1,
            gasPrice,
            metadata = {},
        } = options

        log(`Going to deploy Vault with name: ${vaultName}`)

        const tokenAddress = getAddress(token)
        const ownerAddress = getAddress(adminAddress)
        const agentAddressList = joinPartAgents.map(getAddress)

        if (adminFee < 0 || adminFee > 1) { throw new Error('VaultDeployOptions.adminFee must be a number between 0...1, got: ' + adminFee) }
        const adminFeeBN = BigNumber.from((adminFee * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish, but that's not much value

        const ethersOverrides = await this.getOverrides()
        if (gasPrice) { ethersOverrides.gasPrice = gasPrice }

        // function deployNewVaultUsingToken(
        //     address token,
        //     address payable owner,
        //     address[] memory agents,
        //     uint256 initialAdminFeeFraction
        // )
        const vaultFactory = await this.getFactory()
        const tx = await vaultFactory.deployNewVaultUsingToken(
            tokenAddress,
            ownerAddress,
            agentAddressList,
            adminFeeBN,
            JSON.stringify(metadata),
            ethersOverrides
        )
        const receipt = await tx.wait(confirmations)

        const createdEvent = receipt.events?.find((e) => e.event === 'DUCreated')
        if (createdEvent == null) {
            throw new Error('Factory did not emit a DUCreated event!')
        }

        const contractAddress = createdEvent.args!.du as string
        log(`Vault deployed ${contractAddress}`)

        const contract = this.getTemplate(contractAddress, this.wallet)
        return new Vault(contract, this, this.restPlugin)
    }

    /**
     * Create a new Vault contract using the Ethereum provider given in the constructor
     * @return Promise<Vault> that resolves when the new DU is deployed over the bridge to side-chain
     */
    async deployVault(options: VaultDeployOptions = {}): Promise<Vault> {
        const {
            adminAddress = await this.wallet.getAddress(),
            joinPartAgents = [adminAddress, this.joinPartAgentAddress],
            vaultName = `Vault-${Date.now()}`, // TODO: use uuid
            adminFee = 0,
            confirmations = 1,
            gasPrice,
            metadata = {},
        } = options

        log(`Going to deploy Vault with name: ${vaultName}`)

        const ownerAddress = getAddress(adminAddress)
        const agentAddressList = joinPartAgents.map(getAddress)

        if (adminFee < 0 || adminFee > 1) { throw new Error('VaultDeployOptions.adminFee must be a number between 0...1, got: ' + adminFee) }
        const adminFeeBN = BigNumber.from((adminFee * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish, but that's not much value

        const ethersOverrides = await this.getOverrides()
        if (gasPrice) { ethersOverrides.gasPrice = gasPrice }

        // function deployNewVault(
        //     address payable owner,
        //     uint256 adminFeeFraction,
        //     address[] memory agents
        // )
        const vaultFactory = await this.getFactory()
        const tx = await vaultFactory.deployNewVault(
            ownerAddress,
            adminFeeBN,
            agentAddressList,
            JSON.stringify(metadata),
            ethersOverrides
        )
        const receipt = await tx.wait(confirmations)

        const createdEvent = receipt.events?.find((e) => e.event === 'DUCreated')
        if (createdEvent == null) {
            throw new Error('Factory did not emit a DUCreated event!')
        }

        const contractAddress = createdEvent.args!.du as string
        log(`Vault deployed ${contractAddress}`)

        const contract = this.getTemplate(contractAddress, this.wallet)
        return new Vault(contract, this, this.restPlugin)
    }
}
