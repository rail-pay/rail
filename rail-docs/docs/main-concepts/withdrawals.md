---
sidebar_position: 4
---

# 🏦 Withdrawals

:::info in a nutshell

- Beneficiaries can trade in vault shares to withdraw deposited tokens
- Beneficiaries can call the withdrawal method of the vault contract
- Tokens can be withdrawn to the beneficiary address or any chosen address
- Withdrawals are contract calls and require gas
- Sponsorship can improve the withdrawal user experience

:::

## Check withdrawable funds

Beneficiaries can check their earnings (minus earlier withdrawals).

```ts
const VAULT_ADDRESS = '0x0D483E...141641';

const vault = await rail.getVault(VAULT_ADDRESS);

// get funds to rail client address
const amount = await vault.getWithdrawableFunds();

// get funds to a specific address
const amount = await vault.getWithdrawableFunds('0xA0483E...52642');
```

## Withdraw funds

### With wallet provider

You most likely want your users to be able to withdraw their funds with their wallet provider (e.g., Metamask).

In your frontend, define your rail client as follows.

```ts title=your-frontend.ts
const rail = new RailClient({
  auth: {
    //add wallet provider
    ethereum: window.ethereum,
  },
  chain: 'polygon',
});

const vault = await rail.getVault(VAULT_ADDRESS);
const tx = await vault.withdrawAll();
```

### With a private key

In case you manage the private keys in a web2 scenario, you can withdraw funds with the private key as follows:

```ts title=manage-vault.ts
// use the same rail client that we defined at the beginning of the setup
const VAULT_ADDRESS = '0x0D483E...141641';

const vault = await rail.getVault(VAULT_ADDRESS);
const tx = await vault.withdrawAll();
```

## Sponsorship

:::caution coming soon
:::
