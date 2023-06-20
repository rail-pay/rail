---
sidebar_position: 2
---

# 2️⃣ Create a vault

Follow this guide to write a script to deploy a vault contract. With the contract, you can manage your vault and the deposits made to the vault.

## Installation

First, install `rail` into a node environment.

```
$ npm i @rail
```

## Client setup

Next, we need to write the script.

Create a file and name it `deploy-vault.ts` or, if you prefer, js `deploy-vault.js` and add the import to the top of the file.

```ts title=deploy-vault.ts
import { RailClient } from '@rail';
```

Now we configure the client to make transactions on the blockchain.

Add a private key to the client. The address that deploys the contract will automatically become the vault operator.

Choose a desired EVM chain and add it to the chain parameter. We currently support Gnosis, Polygon, and Ethereum.

:::info
Ensure that you possess a sufficient amount of MATIC in your wallet. It will be essential for the deployment and modification of the vault.
:::

```ts title=deploy-vault.ts
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const rail = new RailClient({
  auth: {
    privateKey: PRIVATE_KEY,
  },
  chain: 'polygon',
});
```

## Configure your vault

Before deployment, you can define options or leave them empty to get the default options.

```ts title=deploy-vault.ts
const DEPLOYMENT_OPTIONS = {
    operator: YOUR_PUBLIC_KEY, // (default = deployer) Will be the operator of the newly created vault
    joinPartAgents: /* By default set to operator and default join server */,
    operatorFee: 0.3, // Must be between 0...1 and defines how much you get from each deposit
    metadata: {
        "information": "related to your vault",
        "canBe": [" ", "anything"]
    }
}
```

## Deploy the vault

Save the contract address somewhere; you'll need it later. You can find it in your transaction history on the block explorer of the chain you deployed on if you lost it. Search for your public address; all the past transactions will come up.

```ts title=deploy-vault.ts
const vault = await rail.deployVault(DEPLOYMENT_OPTIONS);

console.log('My vault contract address:', vault.getAddress());
```

## The whole script

```ts title=deploy-vault.ts
import { RailClient } from '@rail';

const DEPLOYMENT_OPTIONS = {
    operator: YOUR_PUBLIC_KEY, // (default = deployer) Will be operator of the newly created vault
    joinPartAgents: /* By default set to operator and default join server */,
    operatorFee: 0.3, // Must be between 0...1 and defines how much you get from each deposit
    metadata: {
        "information": "related to your vault",
        "canBe": [" ", "anything"]
    }
}

const deploy = async () => {
    const PRIVATE_KEY = process.env.PRIVATE_KEY;

    const rail = new RailClient({
        auth: {
            privateKey: PRIVATE_KEY,
        },
        chain: 'polygon',
    });

    const vault = await rail.deployVault(DEPLOYMENT_OPTIONS);

    console.log('My vault contract address:', vault.getAddress());
}

deploy()
```
