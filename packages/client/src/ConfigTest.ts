import config from "@rail-protocol/config"

const {
    REST_URL,
    STREAMR_DOCKER_DEV_HOST,
    TOKEN_ADDRESS = config.docker.tokenAddress,
    FACTORY_ADDRESS = config.docker.vaultFactoryAddress,
    TEMPLATE_ADDRESS = config.docker.vaultTemplateAddress,
    JOIN_PART_AGENT_ADDRESS = config.docker.joinPartAgentAddress,
    ETHEREUM_SERVER_URL,
    TEST_TIMEOUT,
} = process.env

function toNumber(value: any): number | undefined {
    return (value !== undefined) ? Number(value) : undefined
}

/**
 * Streamr client constructor options that work in the test environment
 */
export const ConfigTest = {
    // theGraphUrl: `http://${STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-contracts`,
    restUrl: REST_URL || `http://${STREAMR_DOCKER_DEV_HOST || 'localhost'}/api/v2`,
    tokenAddress: TOKEN_ADDRESS,
    vault: {
        factoryAddress: FACTORY_ADDRESS,
        templateAddress: TEMPLATE_ADDRESS,
        joinPartAgentAddress: JOIN_PART_AGENT_ADDRESS,
    },
    network: {
        name: 'dev1',
        chainId: 8996,
        rpcs: [{
            url: ETHEREUM_SERVER_URL || `http://${STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8546`,
            timeout: toNumber(TEST_TIMEOUT) ?? 30 * 1000
        }]
    },
    _timeouts: {
        theGraph: {
            timeout: 10 * 1000,
            retryInterval: 500
        },
        jsonRpc: {
            timeout: 20 * 1000,
            retryInterval: 500
        },
        httpFetch: {
            timeout: 30 * 1000,
            retryInterval: -1
        }
    }
}
