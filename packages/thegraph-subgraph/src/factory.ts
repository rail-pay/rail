import { log, BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts'

import { DUCreated } from '../generated/VaultFactory/VaultFactory'
import { SidechainDUCreated } from '../generated/VaultFactorySidechain/VaultFactorySidechain'
import { DataUnion as DataUnionDatabaseObject } from '../generated/schema'
import { DataUnion } from '../generated/templates'

// DU2 VaultFactorySidechain
// event SidechainDUCreated(address indexed mainnet, address indexed sidenet, address indexed owner, address template);
export function handleDU2Created(event: SidechainDUCreated): void {
    let duAddress = event.params.sidenet
    let initialOwner = event.params.owner
    log.warning('[old] handleDU2Created: address={} blockNumber={}', [duAddress.toHexString(), event.block.number.toString()])
    createDataUnion(duAddress, initialOwner, event.block.timestamp)
}

// DU3 VaultFactory
// event DUCreated(address indexed du, address indexed owner, address template);
export function handleDUCreated(event: DUCreated): void {
    let duAddress = event.params.du
    let initialOwner = event.params.owner
    log.warning('handleDUCreated: address={} blockNumber={}', [duAddress.toHexString(), event.block.number.toString()])
    createDataUnion(duAddress, initialOwner, event.block.timestamp)
}

export function createDataUnion(duAddress: Address, initialOwner: Address, creationDate: BigInt): void {
    let dataUnion = new DataUnionDatabaseObject(duAddress.toHexString())
    dataUnion.memberCount = 0
    dataUnion.revenueWei = BigInt.zero()
    dataUnion.creationDate = creationDate
    dataUnion.owner = initialOwner.toHexString()
    dataUnion.totalWeight = BigDecimal.zero()
    dataUnion.save()

    // Instantiate a template: start listening to the new DU contract, trigger src/dataunion.ts on events
    DataUnion.create(duAddress)
}
