# Vault contracts package

The Rail framework is a data crowdsourcing and crowdselling solution. Working in tandem with the Streamr Network and Ethereum, the framework powers applications that enable people to earn by sharing valuable data. You can [read more about it here](https://docs.rail.dev/getting-started/intro).

Vault builders are encouraged to not use this package directly, but rather via the [@rail-protocol/client package](https://www.npmjs.com/package/@rail-protocol/client).

## @rail-protocol/contracts

The contracts are found in `contracts`. They are also what this NPM package exports:
```typescript
import { Vault as templateJson, VaultFactory as factoryJson } from '@rail-protocol/contracts'
import type { Vault, VaultFactory } from '@rail-protocol/contracts/typechain'

import { ContractFactory, Contract } from 'ethers'
const factoryFactory = new ContractFactory(factoryJson.abi, factoryJson.bytecode, creatorWallet)
const factory = factoryFactory.deploy(templateAddress, tokenAddress, feeOracleAddress) as VaultFactory
const newVault = factory.deployNewVault(adminAddress, adminFee, agents, metadata) as Vault
const existingVault = new Contract(templateJson.abi, vaultAddress, creatorWallet) as Vault
```
