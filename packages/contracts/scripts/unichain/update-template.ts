import { ContractFactory } from "ethers"
import { ethers } from "hardhat"
import { Chains } from "@streamr/config"

import { VaultFactory, DataUnionTemplate } from "../../typechain"

const { CHAIN } = process.env
if (!CHAIN) { throw new Error("Please specify CHAIN environment variable (dev0, dev1, gnosis, polygon, mainnet)") }

const {
    contracts: {
        VaultFactory: FACTORY_ADDRESS
    }
} = Chains.load()[CHAIN]

async function main() {
    const dataUnionTemplateFactory = await ethers.getContractFactory("DataUnionTemplate")
    const dataUnionTemplate = await dataUnionTemplateFactory.deploy()
    await dataUnionTemplate.deployed() as DataUnionTemplate
    console.log("DU template deployed at %s", dataUnionTemplate.address)

    const factoryFactory = await ethers.getContractFactory("VaultFactory") as ContractFactory
    const factory = factoryFactory.attach(FACTORY_ADDRESS) as VaultFactory
    console.log("DU factory deployed at %s", factory.address)

    const oldTemplateAddress = await factory.dataUnionTemplate()
    console.log("Old DU template at %s", oldTemplateAddress)

    const tx = await factory.setTemplate(dataUnionTemplate.address)
    await tx.wait()
    console.log("DU template updated")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
