import { log, BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts'

import { VaultCreated } from '../generated/VaultFactory/VaultFactory'
import { Vault as VaultDatabaseObject } from '../generated/schema'
import { Vault } from '../generated/templates'

// event VaultCreated(address indexed du, address indexed owner, address template);
export function handleVaultCreated(event: VaultCreated): void {
    let vaultAddress = event.params.du
    let initialOwner = event.params.owner
    log.warning('handleVaultCreated: address={} blockNumber={}', [vaultAddress.toHexString(), event.block.number.toString()])
    createVault(vaultAddress, initialOwner, event.block.timestamp)
}

export function createVault(vaultAddress: Address, initialOwner: Address, creationDate: BigInt): void {
    let vault = new VaultDatabaseObject(vaultAddress.toHexString())
    vault.memberCount = 0
    vault.revenueWei = BigInt.zero()
    vault.creationDate = creationDate
    vault.owner = initialOwner.toHexString()
    vault.totalWeight = BigDecimal.zero()
    vault.save()

    // Instantiate a template: start listening to the new Contract, trigger src/vault.ts on events
    Vault.create(vaultAddress)
}
