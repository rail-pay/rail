#!/bin/bash
set -ex

# go to package directory
case "$PWD" in
    *rail/packages/contracts/scripts) cd ..;;
    *rail/packages/contracts) ;;
    *rail/packages) cd contracts;;
    *data-unions) cd packages/contracts;;
    *) exit 1;; # default case
esac

# This should be done right after a deployment: update thegraph definitions, use the most current ABIs

jq .abi artifacts/contracts/VaultFactory.sol/VaultFactory.json > ../subgraph/abis/VaultFactory.json
jq .abi artifacts/contracts/Vault.sol/Vault.json > ../subgraph/abis/Vault.json
