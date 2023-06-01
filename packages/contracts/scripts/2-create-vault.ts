import { ethers } from "hardhat"

import { BigNumber, providers } from "ethers"
import { parseEther } from "ethers/lib/utils"
import { VaultFactory, Vault } from "../typechain"

const { CHAIN } = process.env
if (!CHAIN) { throw new Error("Please specify CHAIN environment variable (dev0, dev1, gnosis, polygon, mainnet)") }
const { contracts, rpc } = Chains.load()[CHAIN]

const sideChainProvider = new providers.JsonRpcProvider(rpc)

const walletSidechain = new ethers.Wallet(DEFAULTPRIVATEKEY, sideChainProvider)
let vaultFactoryContract: VaultFactory
let tokenfromfac: EthereumAddress

const connectToAllContracts = async () => {
    const vaultFactoryCF = await ethers.getContractFactory("VaultFactory", walletSidechain)
    const vaultFactory = await vaultFactoryCF.attach(contracts.VaultFactory)
    vaultFactoryContract = await vaultFactory.deployed() as VaultFactory
    console.log("factory connected " + vaultFactoryContract.address)
    tokenfromfac = await vaultFactoryContract.defaultToken()
    console.log("token from factory " + tokenfromfac)
}

const createVault = async () => {
    const sendtx = await walletSidechain.sendTransaction({
        to: vaultFactoryContract.address,
        value: parseEther("2"),
    })
    await sendtx.wait()
    console.log("sent 2 ether to factory")

    const args: [EthereumAddress, BigNumber, BigNumber, EthereumAddress, EthereumAddress[]] = [
        // creator.address,
        walletSidechain.address,
        parseEther("0"),
        parseEther("0"),
        // others[0].address,
        walletSidechain.address,
        // agents.map(a => a.address),
        [ walletSidechain.address ]
    ]

    const tx = await vaultFactoryContract.deployNewDataUnion(...args)
    const tr = await tx.wait()
    const [createdEvent] = tr?.events?.filter((evt: any) => evt?.event === "DUCreated") ?? []
    if (!createdEvent || !createdEvent.args || !createdEvent.args.length) {
        throw new Error("Missing DUCreated event")
    }
    const [newDuAddress] = createdEvent?.args
    console.log(newDuAddress)
    // const bytecode = await sideChainProvider.getCode(newDuAddress)
    // console.log("bytecode " + bytecode)
    const dataUnionF = await ethers.getContractFactory("Vault", walletSidechain)
    const dataUnion = await dataUnionF.attach(newDuAddress)
    const du = await dataUnion.deployed() as Vault
    console.log("du connected " + du.address)
    // const inittx = await du.initialize(args[0], tokenfromfac, args[4], args[1], args[1], args[1], args[0])
    // await inittx.wait()
    // console.log("initialized")
}


async function main() {
    await connectToAllContracts()
    await createVault()
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })

