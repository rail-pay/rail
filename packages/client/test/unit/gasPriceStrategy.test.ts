import { parseUnits } from '@ethersproject/units'
import { RailClient } from '../../src/RailClient'

describe("Gas price strategy", () => {
    it("default Gnosis strategy", async () => {
        const client = new RailClient({
            auth: {
                privateKey: "0x0000000000000000000000000000000000000000000000000000000000000001"
            },
            chain: "gnosis"
        })
        client.wallet.provider!.getGasPrice = async () => parseUnits("100", "gwei")
        const calculated = await client.gasPriceStrategy!(client.wallet.provider!)
        const expected = parseUnits("110", "gwei")
        expect(calculated.gasPrice!.toString()).toEqual(expected.toString())
    })
})
