---
sidebar_position: 4
---

# 4️⃣ Withdraw funds

Now that you have tokens in your vault that can get claimed by the beneficiaries. Here is how beneficiaries can withdraw their funds.

## Withdraw funds

There are two options for withdrawing the funds...

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
// use the same rail client that we defined at the beginning of setup
const VAULT_ADDRESS = '0x0D483E...141641';

const vault = await rail.getVault(VAULT_ADDRESS);
const tx = await vault.withdrawAll();
```
