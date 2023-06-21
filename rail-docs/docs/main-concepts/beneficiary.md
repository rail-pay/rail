---
sidebar_position: 1
---

# 🤑 Beneficiary

:::info in a nutshell

- Beneficiaries are the wallet addresses that receive deposits.
- Rail protocol's vaults can scale to thousands or even millions of beneficiaries.
- After joining, they receive a share of the deposits that will accumulate in the vault contract.
- At any time, they can withdraw their funds.

:::

## Adding and removing beneficiaries

**You must have the join/part agent permission** to carry out add and remove transactions.

The **operator address has the join/part permission by default** and can grant/revoke additional addresses.

### Grant and revoke join/part permission

```ts
const VAULT_ADDRESS = '0x0D483E...141641';

// make sure your rail client is configured with the operator's address
const vault = await rail.getVault(VAULT_ADDRESS);

// grant
const tx = await vault.addJoinPartAgent('0x1234...abcd');

// revoke
const tx = await vault.removeJoinPartAgent('0x1234...abcd');
```

### Add beneficiaries

:::note
Once you have added an address as a beneficiary, they will be eligible for incoming deposits made to the contract.
:::

```ts
const tx = await vault.addBeneficiaries([ADDRESS_1, ADDRESS_2, ADDRESS_3]);
```

### Remove/inactivate beneficiaries

:::note
Once you have removed an address as a beneficiary, they won't be eligible for incoming deposits made to the contract any more and will get set to inactive.
:::

```ts
const tx = await vault.removeBeneficiaries([ADDRESS_1, ADDRESS_2, ADDRESS_3]);
```

### Automate joins in your vault

:::caution coming soon
:::
