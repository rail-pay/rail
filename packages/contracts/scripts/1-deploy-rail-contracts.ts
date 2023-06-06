import { ethers, upgrades } from "hardhat"

import { getAddress } from "@ethersproject/address"

import chains from "@rail-protocol/config"

import { VaultFactory, DefaultFeeOracle } from "../typechain"
import { parseEther } from "@ethersproject/units"

const {
    PROTOCOL_BENEFICIARY_ADDRESS,
    CHAIN = "docker"
} = process.env

if (!PROTOCOL_BENEFICIARY_ADDRESS) { throw new Error("Environment variable PROTOCOL_BENEFICIARY_ADDRESS not set") }
const protocolBeneficiaryAddress = getAddress(PROTOCOL_BENEFICIARY_ADDRESS)

const { tokenAddress } = chains[CHAIN]

async function deployContracts() {
    const signer = (await ethers.getSigners())[0]

    const vaultFactory = await ethers.getContractFactory("Vault", { signer })
    const vault = await vaultFactory.deploy()
    await vault.deployed()
    console.log("Vault template deployed at %s", vault.address)

    const feeOracleFactory = await ethers.getContractFactory("DefaultFeeOracle", { signer })
    const feeOracle = await upgrades.deployProxy(feeOracleFactory, [
        parseEther("0.01"),
        protocolBeneficiaryAddress
    ], { kind: "uups" }) as DefaultFeeOracle
    await feeOracle.deployed()
    console.log("Fee oracle deployed at %s", feeOracle.address)

    const factoryFactory = await ethers.getContractFactory("VaultFactory", { signer })
    const factory = await upgrades.deployProxy(factoryFactory, [
        vault.address,
        tokenAddress,
        feeOracle.address,
    ], { kind: "uups" }) as VaultFactory
    console.log("Vault factory deployed at %s", factory.address)
}

deployContracts()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
