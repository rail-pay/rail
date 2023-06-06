import { ContractFactory } from "ethers"
import { ethers } from "hardhat"
import chains from "@rail-protocol/config"

import { VaultFactory, Vault } from "../typechain"

const { CHAIN } = process.env
if (!CHAIN) { throw new Error("Please specify CHAIN environment variable (dev0, dev1, gnosis, polygon, mainnet)") }
const { vaultFactoryAddress } = chains[CHAIN]

async function main() {
    const vaultCF = await ethers.getContractFactory("Vault")
    const vault = await vaultCF.deploy()
    await vault.deployed() as Vault
    console.log("Vault template deployed at %s", vault.address)

    const vaultFactoryCF = await ethers.getContractFactory("VaultFactory") as ContractFactory
    const vaultFactory = vaultFactoryCF.attach(vaultFactoryAddress) as VaultFactory
    console.log("Vault factory deployed at %s", vaultFactory.address)

    const oldTemplateAddress = await vaultFactory.vault()
    console.log("Old Vault template at %s", oldTemplateAddress)

    const tx = await vaultFactory.setTemplate(vault.address)
    await tx.wait()
    console.log("Vault template updated")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
