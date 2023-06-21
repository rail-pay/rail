---
sidebar_position: 3
---

# 3️⃣ Make your first deposit

Now that you have deployed your vault, we can send the first deposits to your beneficiaries.

## Installation

First, install `rail` into a node environment.

```
$ npm i @rail
```

## Client setup

Next, we need to write a script.

Create a file and name it `manage-vault.ts` or, if you prefer, js `manage-vault.js` and add the import to the top of the file.

```ts title=manage-vault.ts
import { RailClient } from '@rail';
```

Now we configure the client to make transactions on the blockchain.

Add the same private key to the client you used to deploy the vault, as it is, by default, the operator of the contract.

Choose the EVM chain you deployed the vault on.

:::info
Ensure that you possess a sufficient amount of MATIC in your wallet. It will be essential for the deployment and modification of the vault.
:::

```ts title=manage-vault.ts
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const rail = new RailClient({
  auth: {
    privateKey: PRIVATE_KEY,
  },
  chain: 'polygon',
});
```

## Add beneficiaries

```ts title=manage-vault.ts
// Paste the contract address of your newly created vault
const VAULT_ADDRESS = '0x0D483E...141641';

const vault = await rail.getVault(VAULT_ADDRESS);
const tx = await vault.addBeneficiaries(['0xabcd', '0x1234']);
```

## Send deposit

```ts title=manage-vault.ts
const tx = await vault.sendDeposit(amount);

// or

const tx = await rail.sendDeposit(vaultAddress, amount);
```

:::info
Alternatively you can send an ERC20 transaction to the vault contract address.
:::
