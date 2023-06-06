// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.6;

import "../IERC677.sol";
import "../LeaveConditionCode.sol";

interface IVault {
    function owner() external returns (address);
    function removeMember(address beneficiary, LeaveConditionCode leaveCondition) external;
    function addMember(address newMember) external;
    function isMember(address beneficiary) external view returns (bool);
    function isJoinPartAgent(address agent) external view returns (bool) ;
}

contract VaultModule {
    address public vault;

    modifier onlyOwner() {
        require(msg.sender == IVault(vault).owner(), "error_onlyOwner");
        _;
    }

    modifier onlyJoinPartAgent() {
        require(IVault(vault).isJoinPartAgent(msg.sender), "error_onlyJoinPartAgent");
        _;
    }

    modifier onlyVault() {
        require(msg.sender == vault, "error_onlyVaultContract");
        _;
    }

    constructor(address vaultAddress) {
        vault = vaultAddress;
    }
}
