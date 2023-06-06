import { defaultAbiCoder } from '@ethersproject/abi'
import { getAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { arrayify, hexZeroPad } from '@ethersproject/bytes'
import { formatEther, parseEther } from '@ethersproject/units'
import type { BigNumberish } from '@ethersproject/bignumber'
import type { ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import type { Signer } from '@ethersproject/abstract-signer'

import type { Vault as VaultContract } from '@rail-protocol/contracts/typechain'

import { sleep } from './sleep'
import { sign } from './signing'
import type { EthereumAddress } from './EthereumAddress'
import type { RailClient } from './RailClient'
import type { Rest } from './Rest'

import { debug } from 'debug'
const log = debug('Vault')

export interface VaultDeployOptions {
    adminAddress?: EthereumAddress,
    joinPartAgents?: EthereumAddress[],
    vaultName?: string,
    adminFee?: number,
    // sidechainPollingIntervalMs?: number,
    // sidechainRetryTimeoutMs?: number
    confirmations?: number
    gasPrice?: BigNumber
    metadata?: object
}

export interface JoinResponse {
    member: string
    vault: EthereumAddress
    chain: string
}

export interface VaultStats {
    // new stat added in the member weights feature, will be equal to activeMemberCount for Vaults that don't modify weights
    totalWeight: number,

    // new stats added in 2.2 (fees)
    totalRevenue?: BigNumber,
    totalAdminFees?: BigNumber,
    totalProtocolFees?: BigNumber,

    // stats that already existed in 2.0
    activeMemberCount: BigNumber,
    inactiveMemberCount: BigNumber,
    joinPartAgentCount: BigNumber,
    totalEarnings: BigNumber,
    totalWithdrawable: BigNumber,
    lifetimeMemberEarnings: BigNumber,
}

export enum MemberStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    NONE = 'NONE',
}

export interface MemberStats {
    status: MemberStatus
    totalEarnings: BigNumber
    withdrawableEarnings: BigNumber
    weight?: number // will be 1 if not modified, and missing for non-active members
}

export interface SecretsResponse {
    secret: string
    vault: EthereumAddress
    chain: string
    name: string
}

type WaitForTXOptions = {
    retries: number
    retryInterval: number
}

// TODO: is this really needed? Could retry logic be already in the ethers library?
async function waitOrRetryTx(
    tx: ContractTransaction,
    { retries = 60, retryInterval = 60000 }: Partial<WaitForTXOptions> = {}
): Promise<ContractReceipt> {
    return tx.wait().catch(async (err: any) => {
        log('Attempted transaction: %O', tx)
        log('Got error: %O', err)
        if (err?.body) {
            const body = JSON.parse(err.body)
            const msg = body.error.message
            log('Error message: %s', msg)
            if (retries > 0 && msg.includes('ancient block sync')) {
                log('Sleeping for %dms then retrying %d more time(s).', retryInterval, retries)
                // eslint-disable-next-line promise/no-nesting
                return sleep(retryInterval).then(() => waitOrRetryTx(tx, { retries: retries - 1, retryInterval }))
            }
        }
        throw err
    })
}

/**
 * @category Important
 */
export class Vault {

    // TODO: remove RailClient from here. This coupling makes all of this code a ball of mud, completely inter-connected
    private client: RailClient
    private joinServer?: Rest
    public readonly contract: VaultContract

    /** @internal */
    constructor(contract: VaultContract, client: RailClient, joinServerConnection?: Rest) {
        this.contract = contract
        this.joinServer = joinServerConnection
        this.client = client
    }

    /** @returns the contract address of the vault */
    getAddress(): EthereumAddress {
        return this.contract.address
    }

    /** @returns the name of the chain the vault contract is deployed on */
    getChainName(): string {
        return this.client.chainName
    }

    /**
     * @returns the vault admin fee fraction (between 0.0 and 1.0) that admin gets from each revenue event
     */
    async getAdminFee(): Promise<number> {
        const adminFeeBN = await this.contract.adminFeeFraction()
        return +adminFeeBN.toString() / 1e18
    }

    async getAdminAddress(): Promise<EthereumAddress> {
        return this.contract.owner()
    }

    async getVersion(): Promise<number> {
        return this.contract.version().then((versionBN: BigNumber) => versionBN.toNumber())
    }

    /**
    * Inactive members are members that got removed by a joinPartAgent or left the vault
    * @returns all members of the vault
    */
    async getActiveMemberCount(): Promise<number> {
        return this.contract.activeMemberCount().then((x) => x.toNumber())
    }

    async refreshRevenue(): Promise<ContractReceipt> {
        const ethersOverrides = await this.client.getOverrides()
        const tx = await this.contract.refreshRevenue(ethersOverrides)
        return waitOrRetryTx(tx)
    }

    /**
    * If metadata is not valid JSON, simply return the raw string.
    * This shouldn't happen if `setMetadata` was used to write the metadata because it validates the JSON;
    *   however direct access to the smart contract is of course possible, and the contract won't validate the JSON.
    * @returns the JavaScript object that was stored using `setMetadata`
    */
    async getMetadata(): Promise<object | string> {
        const metadataJsonString = await this.contract.metadataJsonString()
        try {
            return JSON.parse(metadataJsonString)
        } catch (e) {
            return metadataJsonString
        }
    }

    /**
    * The default stipend is 0 and can be set by setNewMemberStipend()
    * The stipend exists to enable members not to pay a transaction fee when withdrawing earnings
    * @returns the amount of ETH/native tokens every member gets when they first join
    */
    async getNewMemberStipend(): Promise<BigNumber> {
        return this.contract.newMemberEth()
    }

    // TODO: put signing and error handling into the Rest class maybe?
    /** Sign and send HTTP POST request to join-server */
    private async post<T extends object>(endpointPath: string[], params?: object): Promise<T> {
        const request = {
            chain: this.getChainName(),
            vault: this.getAddress(),
            ...params
        }
        const signedRequest = await sign(request, this.client.wallet)
        if (!this.joinServer) {
            throw new Error('No join server configured')
        }
        return this.joinServer.post<T>(endpointPath, signedRequest).catch((err) => {
            if (err.message?.match(/cannot estimate gas/)) {
                throw new Error("Vault join-server couldn't send the join transaction. Please contact the join-server administrator.")
            }
            throw err
        })
    }

    /**
     * @returns valuable information about the vault
     */
    async getStats(): Promise<VaultStats> {
        // Most of the interface has remained stable, but getStats has been implemented in functions that return
        // a different number of stats, hence the need for the more complex and very manually decoded query.
        const provider = this.client.wallet.provider!
        const getStatsResponse = await provider.call({
            to: this.getAddress(),
            data: '0xc59d4847', // getStats()
        })
        log('getStats raw response (length = %d) %s', getStatsResponse.length, getStatsResponse)

        const [[
            totalRevenue, totalEarnings, totalAdminFees, totalProtocolFees, totalWithdrawn,
            activeMemberCount, inactiveMemberCount, lifetimeMemberEarnings, joinPartAgentCount
        ]] = defaultAbiCoder.decode(['uint256[9]'], getStatsResponse) as BigNumber[][]
        // add totalWeight if it's available, otherwise just assume equal weight 1.0/member
        const totalWeightBN = await this.contract.totalWeight().catch(() => parseEther(activeMemberCount.toString()))
        return {
            totalRevenue, // == earnings (that go to members) + adminFees + protocolFees
            totalAdminFees,
            totalProtocolFees,
            totalEarnings,
            totalWithdrawable: totalEarnings.sub(totalWithdrawn),
            activeMemberCount,
            inactiveMemberCount,
            joinPartAgentCount,
            lifetimeMemberEarnings,
            totalWeight: Number(formatEther(totalWeightBN)),
        }
    }

    /**
    * Open {@link https://docs.rail.dev/main-concepts/data-union/data-union-observation our docs} to get more information about the stats
    * @returns stats of a single vault member
    */
    async getMemberStats(memberAddress: EthereumAddress): Promise<MemberStats> {
        const address = getAddress(memberAddress)
        const [
            [statusCode, , , withdrawnEarnings], // ignore lmeAtJoin and earningsBeforeLastJoin, their meanings changed with the weights feature
            totalEarnings,
            weightBN,
        ] = await Promise.all([
            this.contract.memberData(address),
            this.contract.getEarnings(address).catch(() => parseEther("0")),
            this.contract.memberWeight(address).catch(() => parseEther("1")),
        ])
        const withdrawable = totalEarnings.gt(withdrawnEarnings) ? totalEarnings.sub(withdrawnEarnings) : parseEther("0")
        const statusStrings = [MemberStatus.NONE, MemberStatus.ACTIVE, MemberStatus.INACTIVE]

        // add weight to the MemberStats if member is active (non-zero weight), set to 1 if the contract doesn't have the weights feature
        const maybeWeight: { weight?: number } = statusCode === 1 ? { weight: Number(formatEther(weightBN)) } : {}
        return {
            status: statusStrings[statusCode],
            totalEarnings,
            withdrawableEarnings: withdrawable,
            ...maybeWeight,
        }
    }

    /**
     * @returns the amount of tokens the member would get from a successful withdraw
     */
    async getWithdrawableEarnings(memberAddress: EthereumAddress): Promise<BigNumber> {
        return this.contract.getWithdrawableEarnings(getAddress(memberAddress)).catch((error) => {
            if (error.message.includes('error_notMember')) {
                throw new Error(`${memberAddress} is not a member of this Vault`)
            }
            throw error
        })
    }

    ///////////////////////////////
    // Member functions
    ///////////////////////////////

    /**
     * Send HTTP(s) request to the join server, asking to join the vault
     * Typically you would send a sharedSecret with the request.
     * Read more in {@link https://docs.rail.dev/main-concepts/joinpart-server joinPart server}
     */
    async join(params?: object): Promise<JoinResponse> {
        return this.post<JoinResponse>(["join"], params)
    }

    /**
     * A member can voluntarily leave the vault by calling `part()`.
     * @returns transaction receipt
     */
    async part(): Promise<ContractReceipt> {
        const memberAddress = await this.client.getAddress()
        return this.removeMembers([memberAddress])
    }

    async isMember(memberAddress?: EthereumAddress): Promise<boolean> {
        const address = memberAddress ? getAddress(memberAddress) : await this.client.getAddress()
        const memberData = await this.contract.memberData(address)
        const [ state ] = memberData
        const ACTIVE = 1 // memberData[0] is enum ActiveStatus {None, Active, Inactive}
        return (state === ACTIVE)
    }

    /**
     * Withdraw all your earnings
     * @returns the transaction receipt
     */
    async withdrawAll(): Promise<ContractReceipt> {
        const memberAddress = await this.client.getAddress()
        const ethersOverrides = await this.client.getOverrides()
        const tx = await this.contract.withdrawAll(memberAddress, false, ethersOverrides)
        return tx.wait()
    }

    /**
     * Withdraw earnings and "donate" them to the given address
     * @param recipientAddress - the address authorized to receive the tokens
     * @returns the transaction receipt
     */
    async withdrawAllTo(recipientAddress: EthereumAddress): Promise<ContractReceipt> {
        const address = getAddress(recipientAddress)
        const ethersOverrides = await this.client.getOverrides()
        const tx = await this.contract.withdrawAllTo(address, false, ethersOverrides)
        return tx.wait()
    }

    /**
     * Member can sign off to "donate" all earnings to another address such that someone else
     *   can submit the transaction (and pay for the gas)
     * This signature is only valid until next withdrawal takes place (using this signature or otherwise).
     * Note that while it's a "blank cheque" for withdrawing all earnings at the moment it's used, it's
     *   invalidated by the first withdraw after signing it. In other words, any signature can be invalidated
     *   by making a "normal" withdraw e.g. `await streamrClient.withdrawAll()`
     * Admin can execute the withdraw using this signature: ```
     *   await adminRailClient.withdrawAllToSigned(memberAddress, recipientAddress, signature)
     * ```
     * @param recipientAddress - the address authorized to receive the tokens
     * @returns signature authorizing withdrawing all earnings to given recipientAddress
     */
    async signWithdrawAllTo(recipientAddress: EthereumAddress): Promise<string> {
        return this.signWithdrawAmountTo(recipientAddress, parseEther("0"))
    }

    /**
     * Member can sign off to "donate" specific amount of earnings to another address such that someone else
     *   can submit the transaction (and pay for the gas)
     * This signature is only valid until next withdrawal takes place (using this signature or otherwise).
     * @param recipientAddress - the address authorized to receive the tokens
     * @param amountTokenWei - that the signature is for (can't be used for less or for more)
     * @returns signature authorizing withdrawing all earnings to given recipientAddress
     */
    async signWithdrawAmountTo(
        recipientAddress: EthereumAddress,
        amountTokenWei: BigNumber | number | string
    ): Promise<string> {
        const to = getAddress(recipientAddress) // throws if bad address
        const signer = this.client.wallet
        const address = await signer.getAddress()
        const [activeStatus, , , withdrawn] = await this.contract.memberData(address)
        if (activeStatus == 0) { throw new Error(`${address} is not a member in Vault (${this.contract.address})`) }
        return this._createWithdrawSignature(amountTokenWei, to, withdrawn, signer)
    }

    /** @internal */
    async _createWithdrawSignature(
        amountTokenWei: BigNumber | number | string,
        to: EthereumAddress,
        withdrawn: BigNumber,
        signer: Signer
    ): Promise<string> {
        const message = to
            + hexZeroPad(BigNumber.from(amountTokenWei).toHexString(), 32).slice(2)
            + this.getAddress().slice(2)
            + hexZeroPad(withdrawn.toHexString(), 32).slice(2)
        const signature = await signer.signMessage(arrayify(message))
        return signature
    }

    /**
     * Transfer an amount of earnings to another member in Vault
     * @param memberAddress - the other member who gets their tokens out of the Vault
     * @param amountTokenWei - the amount that want to add to the member
     * @returns receipt once transfer transaction is confirmed
     */
    async transferWithinContract(
        memberAddress: EthereumAddress,
        amountTokenWei: BigNumber | number | string
    ): Promise<ContractReceipt> {
        const address = getAddress(memberAddress) // throws if bad address
        const ethersOverrides = await this.client.getOverrides()
        const tx = await this.contract.transferWithinContract(address, amountTokenWei, ethersOverrides)
        return waitOrRetryTx(tx)
    }

    ///////////////////////////////
    // Admin functions
    ///////////////////////////////

    /**
     * Admin: Add a new vault secret to enable members to join without specific approval using this secret.
     * For vaults that use the default-join-server
     */
    async createSecret(name: string = 'Untitled Secret'): Promise<SecretsResponse> {
        return this.post<SecretsResponse>(['secrets', 'create'], { name })
    }

    /** Admin: */
    async deleteSecret(secret: string): Promise<SecretsResponse> {
        return this.post<SecretsResponse>(['secrets', 'delete'], { secret })
    }

    /** Admin: */
    async listSecrets(): Promise<SecretsResponse[]> {
        return this.post<SecretsResponse[]>(['secrets', 'list'])
    }

    /**
     * JoinPartAgents: Add given Ethereum addresses as vault members
     * @param memberAddressList - list of Ethereum addresses to add as members
     */
    async addMembers(memberAddressList: EthereumAddress[]): Promise<ContractReceipt> {
        const members = memberAddressList.map(getAddress) // throws if there are bad addresses
        const ethersOverrides = await this.client.getOverrides()
        const tx = await this.contract.addMembers(members, ethersOverrides)
        // TODO ETH-93: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
        return waitOrRetryTx(tx)
    }

    /**
     * JoinPartAgents: Add given Ethereum addresses as vault members with weights (instead of the default 1.0)
     * @param memberAddressList - list of Ethereum addresses to add as members, may NOT be already in the Vault
     * @param weights - list of (non-zero) weights to assign to the new members (will be converted same way as ETH or tokens, multiplied by 10^18)
     */
    async addMembersWithWeights(memberAddressList: EthereumAddress[], weights: number[]): Promise<ContractReceipt> {
        const members = memberAddressList.map(getAddress) // throws if there are bad addresses
        const ethersOverrides = await this.client.getOverrides()
        const weightsBN = weights.map((w) => parseEther(w.toString()))
        const tx = await this.contract.addMembersWithWeights(members, weightsBN, ethersOverrides)
        // TODO ETH-93: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
        return waitOrRetryTx(tx)
    }

    /**
     * JoinPartAgents: Set weights for given Ethereum addresses as vault members; zero weight means "remove member"
     * This function can be used to simultaneously add and remove members in one transaction:
     *  - add a member by setting their weight to non-zero
     *  - remove a member by setting their weight to zero
     *  - change a member's weight by setting it to a non-zero value
     * @param memberAddressList - list of Ethereum addresses
     * @param weights - list of weights to assign to the members (will be converted same way as ETH or tokens, multiplied by 10^18)
     */
    async setMemberWeights(memberAddressList: EthereumAddress[], weights: number[]): Promise<ContractReceipt> {
        const members = memberAddressList.map(getAddress) // throws if there are bad addresses
        const ethersOverrides = await this.client.getOverrides()
        const weightsBN = weights.map((w) => parseEther(w.toString()))
        const tx = await this.contract.setMemberWeights(members, weightsBN, ethersOverrides)
        // TODO ETH-93: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
        return waitOrRetryTx(tx)
    }

    /**
     * JoinPartAgents: Remove given members from vault
     */
    async removeMembers(memberAddressList: EthereumAddress[]): Promise<ContractReceipt> {
        const members = memberAddressList.map(getAddress) // throws if there are bad addresses
        const ethersOverrides = await this.client.getOverrides()
        const tx = await this.contract.partMembers(members, ethersOverrides)
        // TODO ETH-93: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
        return waitOrRetryTx(tx)
    }

    /**
     * Admin: withdraw earnings (pay gas) on behalf of a member
     * @param memberAddress - the other member who gets their tokens out of the Vault
     */
    async withdrawAllToMember(
        memberAddress: EthereumAddress,
    ): Promise<ContractReceipt> {
        const address = getAddress(memberAddress) // throws if bad address
        const ethersOverrides = await this.client.getOverrides()
        const tx = await this.contract.withdrawAll(address, false, ethersOverrides)
        return waitOrRetryTx(tx)
    }

    /**
     * Admin: Withdraw a member's earnings to another address, signed by the member
     * @param memberAddress - the member whose earnings are sent out
     * @param recipientAddress - the address to receive the tokens in mainnet
     * @param signature - from member, produced using signWithdrawAllTo
     */
    async withdrawAllToSigned(
        memberAddress: EthereumAddress,
        recipientAddress: EthereumAddress,
        signature: string,
    ): Promise<ContractReceipt> {
        const from = getAddress(memberAddress) // throws if bad address
        const to = getAddress(recipientAddress)
        const ethersOverrides = await this.client.getOverrides()
        const tx = await this.contract.withdrawAllToSigned(from, to, false, signature, ethersOverrides)
        return waitOrRetryTx(tx)
    }

    /**
     * Admin: Withdraw a specific amount member's earnings to another address, signed by the member
     * @param memberAddress - the member whose earnings are sent out
     * @param recipientAddress - the address to receive the tokens in mainnet
     * @param signature - from member, produced using signWithdrawAllTo
     */
    async withdrawAmountToSigned(
        memberAddress: EthereumAddress,
        recipientAddress: EthereumAddress,
        amountTokenWei: BigNumber | number | string,
        signature: string,
    ): Promise<ContractReceipt> {
        const from = getAddress(memberAddress) // throws if bad address
        const to = getAddress(recipientAddress)
        const amount = BigNumber.from(amountTokenWei)
        const ethersOverrides = await this.client.getOverrides()
        const tx = await this.contract.withdrawToSigned(from, to, amount, false, signature, ethersOverrides)
        return waitOrRetryTx(tx)
    }

    async sendAdminTx(
        func: (...args: any[]) => Promise<ContractTransaction>,
        ...args: Parameters<typeof func>
    ): Promise<ContractReceipt> {
        let tx: ContractTransaction
        try {
            tx = await func(...args.concat(await this.client.getOverrides()))
            return waitOrRetryTx(tx)
        } catch(error) {
            if ((error as Error).message.includes('error_onlyOwner')) {
                const myAddress = await this.contract.signer.getAddress()
                throw new Error(`Call to vault ${this.contract.address} failed: ${myAddress} is not the Vault admin!`)
            }
            throw error
        }
    }

    /**
     * Admin: set admin fee (between 0.0 and 1.0) for the vault
     */
    async setAdminFee(newFeeFraction: number): Promise<ContractReceipt> {
        if (newFeeFraction < 0 || newFeeFraction > 1) {
            throw new Error('newFeeFraction argument must be a number between 0...1, got: ' + newFeeFraction)
        }

        const adminFeeBN = parseEther(newFeeFraction.toString())
        return this.sendAdminTx(this.contract.setAdminFee, adminFeeBN)
    }

    /**
     * Admin: Stores a Javascript object in JSON format in the vault contract, can be retrieved with `getMetadata`
     * @param metadata object to be stored in the vault contract
     */
    async setMetadata(metadata: object): Promise<ContractReceipt> {
        return this.sendAdminTx(this.contract.setMetadata, JSON.stringify(metadata))
    }

    /**
    * Admin: Automate sending ETH/native token to new beneficiaries so that they can afford to do a withdraw
    *          without first having to acquire ETH/native token
    * @param stipendWei in ETH/native token that is sent to every new beneficiary
    */
    async setNewMemberStipend(stipendWei: BigNumberish): Promise<ContractReceipt> {
        return this.sendAdminTx(this.contract.setNewMemberEth, stipendWei)
    }

    /**
     * Transfer amount to specific other beneficiary in Vault
     * @param memberAddress - target member who gets the tokens added to their earnings in the the Vault
     * @param amountTokenWei - the amount that want to add to the member
     * @returns receipt once transfer transaction is confirmed
     */
    async transferToMemberInContract(
        memberAddress: EthereumAddress,
        amountTokenWei: BigNumber | number | string
    ): Promise<ContractReceipt> {
        const address = getAddress(memberAddress) // throws if bad address
        const amount = BigNumber.from(amountTokenWei)
        const myAddress = await this.client.getAddress()
        const ethersOverrides = await this.client.getOverrides()

        // TODO: implement as ERC677 transfer with data=memberAddress, after this feature is deployed
        // const tx = await this.client.token.transferAndCall(this.contract.address, amount, memberAddress, ethersOverrides)
        // TODO: all things below can then be removed until the "return" line, also delete the 2-step test

        // check first that we have enough allowance to do the transferFrom within the transferToMemberInContract
        const allowance = await this.client.getToken().allowance(myAddress, this.contract.address)
        if (allowance.lt(amount)) {
            // TODO: some tokens could fail here; might need resetting allowance to 0 first.
            //   That's why @openzeppelin/contracts:ERC20.sol has "increaseAllowance" but since it's not part of IERC20, prefer not use it here
            const approveTx = await this.client.getToken().approve(this.contract.address, amount, ethersOverrides)
            const approveTr = await waitOrRetryTx(approveTx)
            log('Approval transaction receipt: %o', approveTr)
        }

        const tx = await this.contract.transferToMemberInContract(address, amount, ethersOverrides)
        return waitOrRetryTx(tx)
    }
}
