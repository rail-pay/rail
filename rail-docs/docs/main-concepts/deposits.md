---
sidebar_position: 3
---

# 💸 Deposits

:::info in a nutshell

- Sponsors deposit tokens to the vault contract address
- Deposits are essentially ERC20 transfers to the vault address
- Deposits grant beneficiaries a non-custodial claim to their tokens
- Tokens can accumulate in the vault for future deposits

:::

## Send deposit

```ts title=manage-vault.ts
const tx = await vault.sendDeposit(amount);

// or

const tx = await rail.sendDeposit(vaultAddress, amount);
```

:::info
Alternatively you can send an ERC20 transaction to the vault contract address.
:::

## Deposit distribution

The deposit distribution is, by default, defined by two variables in the smart contract:

#### Protocol fee:

Is 1% of vault deposits. The fee gets allocated to an address governed by Rail.

#### Operator fee:

Is x% of vault deposits. The operator can change it at any time (previous deposits are not affected when changed), and earnings get allocated to the owner's address.

## Calculation

Individual beneficiary earnings are calculated as follows:

- totalBeneficiaryEarnings = revenue - (revenue \* (adminFee + protocolFee))
- individualBeneficiaryEarnings = totalBeneficiaryEarnings / allActiveBeneficiaries

## Weighted tiers

Rail vaults support tiered distribution. For example, three tiers of beneficiaries could receive three different token amounts for every deposit into the vault.

You can individually assign weights to Beneficiaries if you don't want them to get rewarded equally.

The beneficiary weighting is a number between 0 and 1.

Every weight change is a transaction on the blockchain, which involves transaction fees.

:::tip
**Don't change the weights too often** as this will defeat the purpose of saving transactions/transaction fees. Try to minimize changing the weight factor as well as you can.
:::

Here is an example of the weighting. Let's say we have three addresses in the vault and get a deposit of 5000 tokens:

| Address | Weight | Earnings |
| ------- | ------ | -------- |
| 0x1234  | 1      | 2000     |
| 0x4321  | 1      | 2000     |
| 0xabcd  | 0.5    | 1000     |

#### Calculation:

- totalWeight = 2.5
- eceivedRevenue = 5000 token
- baseEarnings = receivedRevenue / totalWeight
- = 5000 / 2.5 = 2000

#### Earnings for each beneficiary:

- addr1 = weight x _ baseEarnings = 1 x _ 2000 = 2000
- addr2 = weight x _ baseEarnings = 1 x _ 2000 = 2000
- addr3 = weight x _ baseEarnings = 0.5 x _ 2000 = 1000
