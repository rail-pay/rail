import { log, Address, BigInt, BigDecimal } from '@graphprotocol/graph-ts'

import { Vault, VaultBucket, Member, RevenueEvent } from '../generated/schema'
import {
    MemberJoined,
    MemberParted,
    OwnershipTransferred,
    RevenueReceived,
    MemberWeightChanged,
} from '../generated/templates/Vault/Vault'

///////////////////////////////////////////////////////////////
// HANDLERS: see subgraph.*.yaml for the events that are handled
///////////////////////////////////////////////////////////////

export function handleOwnershipTransferred(event: OwnershipTransferred): void {
    let vault = getVault(event.address)
    vault.owner = event.params.newOwner.toHexString()
    vault.save()
}

export function handleMemberJoined(event: MemberJoined): void {
    let vaultAddress = event.address
    let beneficiaryAddress = event.params.beneficiary
    log.warning('handleMemberJoined: beneficiary={} vaultAddress={}', [beneficiaryAddress.toHexString(), vaultAddress.toHexString()])

    let beneficiary = getMember(beneficiaryAddress, vaultAddress)
    beneficiary.address = beneficiaryAddress.toHexString()
    beneficiary.vault = vaultAddress.toHexString()
    beneficiary.joinDate = event.block.timestamp
    beneficiary.status = 'ACTIVE'
    beneficiary.weight = BigDecimal.fromString('1')
    beneficiary.save()

    updateVault(vaultAddress, event.block.timestamp, 1)
}

export function handleMemberParted(event: MemberParted): void {
    let vaultAddress = event.address
    let beneficiaryAddress = event.params.beneficiary
    log.warning('handleMemberParted: beneficiary={} vaultAddress={}', [beneficiaryAddress.toHexString(), vaultAddress.toHexString()])

    let beneficiary = getMember(beneficiaryAddress, vaultAddress)
    beneficiary.status = 'INACTIVE'
    beneficiary.save()

    updateVault(vaultAddress, event.block.timestamp, -1)
}

export function handleRevenueReceived(event: RevenueReceived): void {
    let vaultAddress = event.address
    let amount = event.params.amount
    log.warning('handleRevenueReceived: vaultAddress={} amount={}', [vaultAddress.toHexString(), amount.toString()])

    updateVault(vaultAddress, event.block.timestamp, 0, BigDecimal.zero(), amount)

    // additionally save the individual events for later querying
    let revenueEvent = new RevenueEvent(
        vaultAddress.toHexString() + '-' +
        event.block.number.toString() + '-' +
        event.transaction.index.toHexString() + '-' +
        event.transactionLogIndex.toString()
    )
    revenueEvent.vault = vaultAddress.toHexString()
    revenueEvent.amountWei = amount
    revenueEvent.date = event.block.timestamp
    revenueEvent.save()
}

export function handleMemberWeightChanged(event: MemberWeightChanged): void {
    let vaultAddress = event.address
    let beneficiaryAddress = event.params.beneficiary
    let oldWeightWei = event.params.oldWeight
    let weightWei = event.params.newWeight
    let weight = weightWei.toBigDecimal().div(BigDecimal.fromString('1000000000000000000'))
    let weightChange = weightWei.minus(oldWeightWei).toBigDecimal().div(BigDecimal.fromString('1000000000000000000'))
    log.warning('handleMemberWeightChanged: beneficiary={} vaultAddress={} weight={} (+ {})', [
        beneficiaryAddress.toHexString(), vaultAddress.toHexString(), weight.toString(), weightChange.toString()
    ])

    let beneficiary = getMember(beneficiaryAddress, vaultAddress)
    beneficiary.weight = weight
    beneficiary.save()

    updateVault(vaultAddress, event.block.timestamp, 0, weightChange)
}

function updateVault(
    vaultAddress: Address,
    timestamp: BigInt,
    beneficiaryCountChange: i32,
    totalWeightChange: BigDecimal = BigDecimal.zero(),
    revenueChangeWei: BigInt = BigInt.zero()
): void {
    log.warning('updateVault: vaultAddress={} timestamp={}', [vaultAddress.toHexString(), timestamp.toString()])

    // buckets must be done first so that *AtStart values are correct for newly created buckets
    let hourBucket = getBucket('HOUR', timestamp, vaultAddress)
    hourBucket.beneficiaryCountChange += beneficiaryCountChange
    hourBucket.revenueChangeWei += revenueChangeWei
    hourBucket.totalWeightChange += totalWeightChange
    hourBucket.save()

    let dayBucket = getBucket('DAY', timestamp, vaultAddress)
    dayBucket.beneficiaryCountChange += beneficiaryCountChange
    dayBucket.revenueChangeWei += revenueChangeWei
    dayBucket.totalWeightChange += totalWeightChange
    dayBucket.save()

    let vault = getVault(vaultAddress)
    vault.beneficiaryCount += beneficiaryCountChange
    vault.revenueWei += revenueChangeWei
    vault.totalWeight += totalWeightChange
    vault.save()
}

///////////////////////////////////////////////////////////////
// GETTERS: load an existing object or create a new one
///////////////////////////////////////////////////////////////

function getVault(vaultAddress: Address): Vault {
    let vault = Vault.load(vaultAddress.toHexString())
    if (vault == null) {
        // this should never happen because in factory.ts we create a Vault object for every new Vault template instantiation
        //   the functions in this file can only be called after the template is instantiated
        // if you get this error, it means either that the DB is in bad state, or code has been changed to instantiate
        //   Vault templates without creating the corresponding Vault DB objects
        throw new Error('getVault: Vault database object was not found, address=' + vaultAddress.toHexString())
    }
    return vault
}

function getMember(beneficiaryAddress: Address, vaultAddress: Address): Member {
    let beneficiaryId = beneficiaryAddress.toHexString() + '-' + vaultAddress.toHexString()
    let beneficiary = Member.load(beneficiaryId)
    if (beneficiary == null) {
        beneficiary = new Member(beneficiaryId)
    }
    return beneficiary
}

function getBucket(length: string, timestamp: BigInt, vaultAddress: Address): VaultBucket {
    let bucketSeconds: BigInt
    if (length === 'HOUR') {
        bucketSeconds = BigInt.fromI32(60 * 60)
    } else if (length === 'DAY') {
        bucketSeconds = BigInt.fromI32(24 * 60 * 60)
    } else {
        log.error('getBucketLength: unknown length={}', [length])
        length = 'HOUR'
        bucketSeconds = BigInt.fromI32(60 * 60)
    }

    let bucketStartDate = timestamp.minus(timestamp.mod(bucketSeconds))
    let bucketId = vaultAddress.toHexString() + '-' + length + '-' + bucketStartDate.toString()
    let bucket = VaultBucket.load(bucketId)

    // Create a new bucket, get starting values from Vault
    if (bucket == null) {
        bucket = new VaultBucket(bucketId)
        bucket.type = length
        bucket.vault = vaultAddress.toHexString()
        bucket.startDate = bucketStartDate
        bucket.endDate = bucketStartDate.plus(bucketSeconds)

        let vault = getVault(vaultAddress)
        bucket.beneficiaryCountAtStart = vault.beneficiaryCount
        bucket.revenueAtStartWei = vault.revenueWei
        bucket.totalWeightAtStart = vault.totalWeight

        bucket.beneficiaryCountChange = 0
        bucket.revenueChangeWei = BigInt.zero()
        bucket.totalWeightChange = BigDecimal.zero()
    }
    return bucket
}
