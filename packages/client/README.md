<h1 align="left">
  DataUnion Client
</h1>

The Data Union framework is a data crowdsourcing and crowdselling solution. Working in tandem with the Streamr Network and Ethereum, the framework powers applications that enable people to earn by sharing valuable data. You can [read more about it here](https://docs.dataunions.org/getting-started/intro-to-data-unions)

#### Getting started

Start by obtaining a DataUnionClient object:
1) Give the DU client an access to signing with your private key.
2) Choose a desired EVM chain and add it to the chain parameter. We currently support `gnosis`, and `polygon` (default).

This first option for browsers is to hand in the Metamask object. This means DU client will not ever see the private key, and can only send transactions and sign messages with the user's explicit consent (pops up a Metamask window). This would connect to the polygon chain using Metamask:
```js
import { DataUnionClient } from '@rail-protocol/client'
const { ethereum } = window
const DU = new DataUnionClient({
  auth: { ethereum }
});
```

The second option is to give the private key directly in cleartext. This is meant for the server side node.js scripts, but also can be used in the browser; especially in the case where you don't need to sign things at all but only use the "getters" or read-only functions, in which case you can give a bogus/0x000... private key (since it won't ever be used). On server, it's recommended to store the private key encrypted on disk and only decrypt it just before handing it to the DataUnionClient, so that it will be in cleartext only in memory, never on disk.
```js
import { DataUnionClient } from '@rail-protocol/client'
const { privateKey } = Wallet.fromEncryptedJsonSync(process.env.WALLET_FILE)
const DU = new DataUnionClient({
  auth: { privateKey },
  chain: 'gnosis',
});
```

The DataUnionClient object can be used to either deploy a new Data Union contract, or manipulate/query an existing one.

The address that deploys the contract will become the admin of the data union. To deploy a new DataUnion with default [deployment options](#deployment-options):
```js
const dataUnion = await DU.deployDataUnion()
```

To get an existing (previously deployed) `DataUnion` instance:
```js
const dataUnion = await DU.getDataUnion('0x12345...')
```


#### Admin Functions

Executing the admin functions generate transactions and as such require having enough of the native token to pay the gas on the chain you deployed on. To get some native token, you can reach out on the [Data Union Discord](https://discord.gg/AY7kDBEtkr). We can send you some to get started. Transactions usually cost a fraction of a cent in Polygon, and Gnosis has historically been especially cheap.

Adding members using admin functions is not at feature parity with the member function `join`. The newly added member will not automatically be granted publish permissions to the streams inside the Data Union. This will need to be done manually using the StreamrClient, see `StreamrClient.grantPermissions()`. Similarly, after removing a member using the admin function `removeMembers`, the publish permissions will need to be removed in a secondary step using `StreamrClient.revokePermissions()`. This is because the member function `join` relies on DU DAO hosted infrastructure, while the admin functions are completely self-sufficient (in fact, the DU DAO hosted server uses these very admin functions :).

Adding members (joinPart agent only, [read here more about the roles](https://docs.dataunions.org/main-concepts/roles-and-responsibilities/joinpart-agents)):
```js
const receipt = await dataUnion.addMembers([
    '0x11111...',
    '0x22222...',
    '0x33333...',
])
```
Removing members (joinPart agent only (usually the admin is also a joinPart agent) read more [here](https://docs.dataunions.org/main-concepts/roles-and-responsibilities/joinpart-agents)):
```js
const receipt = await dataUnion.removeMembers([
    '0x11111...',
    '0x22222...',
    '0x33333...',
])
```
New Data Unions have the "member weights" feature, it can be used to give some members different share of revenues. The weights are relative to each other, so if you have e.g. 3 members with weights `1.5, 1.5, 3`, then the first two members will get 25% each, and the third member will get 50% of the future revenues. The weights can be set when adding members:
```js
const receipt = await dataUnion.addMembersWithWeights([
    ['0x11111...', 1.5],
    ['0x22222...', 1.5],
    ['0x33333...', 3],
])
```
The weights can be changed later with the `setMemberWeights` function, which additionally allows adding and removing members in the same transaction:
```js
const receipt = await dataUnion.setMemberWeights([
    ['0x11111...', 3], // change the weight
    ['0x22222...', 0], // remove member
    ['0x44444...', 3], // add new member
])
```
The users can part with the data union themselves
```js
const receipt = await dataUnion.part()
```

Checking if an address belongs to the Data Union:
```js
const isMember = await dataUnion.isMember('0x12345...')
```

Send all withdrawable earnings to the member's address:
```js
const receipt = await dataUnion.withdrawAllToMember('0x12345...')
```

Send all withdrawable earnings to the address signed off by the member:
```js
const recipientAddress = '0x22222...'

const signature = await dataUnion.signWithdrawAllTo(recipientAddress)
const receipt = await dataUnion.withdrawAllToSigned(
    '0x11111...', // member address
    recipientAddress,
    signature
)
```

Send only some of the withdrawable earnings to the address signed off by the member
```js
const oneEth = "1000000000000000000" // amounts in wei
const signature = await dataUnion.signWithdrawAmountTo(recipientAddress, oneEth)
const receipt = await dataUnion.withdrawAmountToSigned(
    '0x12345...', // member address
    recipientAddress,
    oneEth,
    signature
)
```

Setting a new admin fee:
```js
// Any number between 0 and 1, inclusive
const receipt = await dataUnion.setAdminFee(0.4)
```

Setting new metadata: Store information about your data union in a JSON file on-chain inside the contract. For example you can store a DAO manifesto, a name or anything else you can think of.
```js
const receipt = await dataUnion.setMetadata(
    {"name": "awesome DU", "maintainer": ["josh#4223", "marc#2324"]}
);

const metadata = await dataUnion.getMetadata();
```

If the Data Union is set up to use the [default join server](https://github.com/rail-protocol/rail/tree/main/packages/default-join-server) then members can join the Data Union by giving a correct secret.

Admin can add secrets that allow anyone to join, as well as revoke those secrets, using the following functions:
```js
await dataUnion.createSecret() // returns the newly created secret
await dataUnion.createSecret('user XYZ') // admin can also give the secret a more human-readable name
await dataUnion.deleteSecret(secret) // secret as returned by createSecret
await dataUnion.listSecrets() // in case you forgot ;)
```

The `dataUnion.createSecret()` response will look like the following:
```js
{
	"secret": "0fc6b4d6-6558-4c04-b42e-49a8ae5b5ebf",
	"dataUnion": "0x12345",
	"chain": "polygon",
	"name": "A human-readable label for the new secret"
}
```

The member can then join using that same response object, or simply an object with the correct field "secret":
```js
await dataUnion.join(secretResponse)
await dataUnion.join({ secret: "0fc6b4d6-6558-4c04-b42e-49a8ae5b5ebf" })
```

#### Query functions
These are available for everyone and anyone, to query publicly available info from a Data Union.

Get Data Union's statistics:
```js
const stats = await dataUnion.getStats()
```
Get a member's stats:
```js
const memberStats = await dataUnion.getMemberStats('0x12345...')
```
Get the withdrawable DATA tokens in the DU for a member:
```js
// Returns a BigNumber
const balance = await dataUnion.getWithdrawableEarnings('0x12345...')
```
Getting the set admin fee:
```js
const adminFee = await dataUnion.getAdminFee()
```
Getting admin's address:
```js
const adminAddress = await dataUnion.getAdminAddress()
```

Getting the Data Union's version:
```js
const version = await dataUnion.getVersion()
// Can be 0, 1, 2, or 3
// 0 if the contract is not a data union
```

#### Deployment options

`deployDataUnion` can take an options object as the argument. It's an object that can contain the following parameters. All shown values are the defaults for each property:
```js
const deploymentOptions = {
    adminAddress: "0x123...", // If omitted, defaults to the deployer. Will be the admin of the newly created data union
    adminFee: 0.3, // Share of revenue allocated to the adminAddress. Must be between 0...1
    joinPartAgents: ["0x123..."], // Addresses that can join and part members. If omitted, set by default to include the admin as well as the default join server hosted by DU DAO
    metadata: { // optional
        "information": "related to your data union",
        "canBe": ["", "anything"]
    }
}

const dataUnion = await DU.deployDataUnion({
    deploymentOptions
})
```

The [Default Join Server](https://github.com/dataunions/default-join-server) hosted by the Data Union DAO is added as a `joinPartAgent` by default so that joining with secret works using the member function `join`. If you plan to run your own join server, include its address in the `joinPartAgents`:
```js
const dataUnion = await DU.deployDataUnion({
    joinPartAgents: [adminAddress, myJoinServerAddress],
    adminFee,
})
```

### Utility functions
In order to retrieve the client's address an async call must me made to `dataunions.getAddress`
```js
const address = await dataunions.getAddress()
```

If you want to generate a new random wallet, you can use
```js
const { address, privateKey } = DataUnionClient.generateEthereumAccount()
```
