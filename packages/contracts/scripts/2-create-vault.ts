import { BigNumber, providers, utils } from "ethers"

import chains from "@rail-protocol/config"

import { VaultFactory, Vault } from "../typechain"

const { parseEther } = utils

const { CHAIN } = process.env
if (!CHAIN) { throw new Error("Please specify CHAIN environment variable (dev0, dev1, gnosis, polygon, mainnet)") }
const { contracts, rpc } = Chains.load()[CHAIN]

const provider = new providers.JsonRpcProvider(rpc)
const wallet = new ethers.Wallet(DEFAULTPRIVATEKEY, provider)

async function createVault() {
    const vaultFactoryCF = await ethers.getContractFactory("VaultFactory", wallet)
    const vaultFactory = await vaultFactoryCF.attach(contracts.VaultFactory) as VaultFactory
    await vaultFactory.deployed()
    console.log("factory connected " + vaultFactory.address)

    const tokenAddress = await vaultFactory.defaultToken()
    console.log("token from factory " + tokenAddress)

    const sendtx = await wallet.sendTransaction({
        to: vaultFactory.address,
        value: parseEther("2"),
    })
    await sendtx.wait()
    console.log("sent 2 ether to factory")

    const args: [EthereumAddress, BigNumber, BigNumber, EthereumAddress, EthereumAddress[]] = [
        // creator.address,
        wallet.address,
        parseEther("0"),
        parseEther("0"),
        // others[0].address,
        wallet.address,
        // agents.map(a => a.address),
        [ wallet.address ]
    ]

    const tx = await vaultFactory.deployNewVault(...args)
    const tr = await tx.wait()
    const [createdEvent] = tr?.events?.filter((evt: any) => evt?.event === "DUCreated") ?? []
    if (!createdEvent || !createdEvent.args || !createdEvent.args.length) {
        throw new Error("Missing DUCreated event")
    }
    const [newVaultAddress] = createdEvent?.args
    console.log(newVaultAddress)
    const bytecode = await provider.getCode(newVaultAddress)
    console.log("bytecode " + bytecode)
    const dataUnionF = await ethers.getContractFactory("Vault", wallet)
    const dataUnion = await dataUnionF.attach(newVaultAddress)
    const du = await dataUnion.deployed() as Vault
    console.log("vault connected " + du.address)
    // const inittx = await du.initialize(args[0], tokenfromfac, args[4], args[1], args[1], args[1], args[0])
    // await inittx.wait()
    // console.log("initialized")
}

createVault()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })

