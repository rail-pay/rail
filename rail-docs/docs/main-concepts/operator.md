---
sidebar_position: 2
---

# 👨🏼‍💼 Operator

:::info in a nutshell

- Each vault has one operator who owns the contract/vault.
- The operator has permission to add and remove beneficiaries to/from the vault.
- The operator can receive an operator fee for each deposit made to the vault.
- The operator can't tamper with beneficiary funds _after_ they have been allocated in the contract.

:::

## Transfer ownership

The vault smart contracts inherit an Ownable.sol contract, which handles the ownership of the vault. The address that deploys the contract is the contract's initial operator (owner).

The operator can reassign the role to someone else. Follow these steps to reassign the ownership.

#### 1️⃣ Get your vault address:

```ts
console.log(await vault.getAddress());
```

#### 2️⃣ Copy and paste it into the search on https://polygonscan.com/

#### 3️⃣ Navigate to the 'contract' tab and click on 'write contract'

#### 4️⃣ Connect your wallet with the operator's address

#### 5️⃣ Find the 'transferOwnership()' function and enter the address you would like to be the new operator

#### 6️⃣ After the transaction has gone through, switch to the new address and call 'claimOwnership()'

## Metadata

Store information about your vault in a JSON file on-chain. For example, you can store a DAO manifesto, a name, or anything else you can think of.

```ts
const tx = await vault.setMetadata({
  name: 'My awesome vault',
  maintainer: ['josh#4223', 'marc#2324'],
});

const metadata = await vault.getMetadata();
```
