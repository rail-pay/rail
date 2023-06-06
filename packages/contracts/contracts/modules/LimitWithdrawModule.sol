// SPDX-License-Identifier: UNLICENSED
/* solhint-disable not-rely-on-time */

pragma solidity 0.8.6;

import "../IERC677.sol";
import "./VaultModule.sol";
import "./IWithdrawModule.sol";
import "./IJoinListener.sol";
import "./IPartListener.sol";

/**
 * @title Vault module that limits per-user withdraws to given amount per period
 * @dev Setup: vault.setWithdrawModule(this); vault.addJoinListener(this); vault.addPartListener(this)
 */
contract LimitWithdrawModule is VaultModule, IWithdrawModule, IJoinListener, IPartListener {
    uint public requiredMemberAgeSeconds;
    uint public withdrawLimitPeriodSeconds;
    uint public withdrawLimitDuringPeriod;
    uint public minimumWithdrawTokenWei;

    mapping (address => uint) public beneficiaryJoinTimestamp;
    mapping (address => uint) public lastWithdrawTimestamp;
    mapping (address => uint) public withdrawnDuringPeriod;
    mapping (address => bool) public blackListed;

    event ModuleReset(address newVault, uint newRequiredMemberAgeSeconds, uint newWithdrawLimitPeriodSeconds, uint newWithdrawLimitDuringPeriod, uint newMinimumWithdrawTokenWei);

    constructor(
        address vaultAddress,
        uint newRequiredMemberAgeSeconds,
        uint newWithdrawLimitPeriodSeconds,
        uint newWithdrawLimitDuringPeriod,
        uint newMinimumWithdrawTokenWei
    ) VaultModule(vaultAddress) {
        requiredMemberAgeSeconds = newRequiredMemberAgeSeconds;
        withdrawLimitPeriodSeconds = newWithdrawLimitPeriodSeconds;
        withdrawLimitDuringPeriod = newWithdrawLimitDuringPeriod;
        minimumWithdrawTokenWei = newMinimumWithdrawTokenWei;
    }

    function setParameters(
        address vaultAddress,
        uint newRequiredMemberAgeSeconds,
        uint newWithdrawLimitPeriodSeconds,
        uint newWithdrawLimitDuringPeriod,
        uint newMinimumWithdrawTokenWei
    ) external onlyOwner {
        vault = vaultAddress;
        requiredMemberAgeSeconds = newRequiredMemberAgeSeconds;
        withdrawLimitPeriodSeconds = newWithdrawLimitPeriodSeconds;
        withdrawLimitDuringPeriod = newWithdrawLimitDuringPeriod;
        minimumWithdrawTokenWei = newMinimumWithdrawTokenWei;
        emit ModuleReset(vault, requiredMemberAgeSeconds, withdrawLimitPeriodSeconds, withdrawLimitDuringPeriod, minimumWithdrawTokenWei);
    }

    /**
     * (Re-)start the "age counter" for new beneficiaries
     * Design choice: restart it also for those who have been beneficiaries before (and thus maybe already previously waited the cooldown period).
     * Reasoning: after re-joining, the beneficiary has accumulated new earnings, and those new earnings should have the limitation period.
     *   Anyway, the beneficiary has the chance to withdraw BEFORE joining again, so restarting the "age counter" doesn't prevent withdrawing the old earnings (before re-join).
     */
    function onJoin(address newMember) override external onlyVault {
        beneficiaryJoinTimestamp[newMember] = block.timestamp;

        // undo a previously banned beneficiary's withdraw limitation, see onPart
        delete blackListed[newMember];
    }

    /**
     * Design choice: banned beneficiaries will not be able to withdraw until they re-join.
     *   Just removing the ban isn't enough because this module won't know about it.
     *   However, BanModule.restore causes a re-join, so it works fine.
     */
    function onPart(address leavingMember, LeaveConditionCode leaveConditionCode) override external onlyVault {
        if (leaveConditionCode == LeaveConditionCode.BANNED) {
            blackListed[leavingMember] = true;
        }
    }

    function getWithdrawLimit(address beneficiary, uint maxWithdrawable) override external view returns (uint256) {
        return blackListed[beneficiary] ? 0 : maxWithdrawable;
    }

    /** Admin function to set join timestamp, e.g. for migrating old users */
    function setJoinTimestamp(address beneficiary, uint timestamp) external onlyOwner {
        beneficiaryJoinTimestamp[beneficiary] = timestamp;
    }

    /**
     * When a withdraw happens in the Vault, tokens are transferred to the withdrawModule, then this function is called.
     * When we revert here, the whole withdraw transaction is reverted.
     */
    function onWithdraw(address beneficiary, address to, IERC677 token, uint amountWei) override external onlyVault {
        require(amountWei >= minimumWithdrawTokenWei, "error_withdrawAmountBelowMinimum");
        require(beneficiaryJoinTimestamp[beneficiary] > 0, "error_mustJoinBeforeWithdraw");
        require(block.timestamp >= beneficiaryJoinTimestamp[beneficiary] + requiredMemberAgeSeconds, "error_beneficiaryTooNew");

        // if the withdraw period is over, we reset the counters
        if (block.timestamp > lastWithdrawTimestamp[beneficiary] + withdrawLimitPeriodSeconds) {
            lastWithdrawTimestamp[beneficiary] = block.timestamp;
            withdrawnDuringPeriod[beneficiary] = 0;
        }
        withdrawnDuringPeriod[beneficiary] += amountWei;
        require(withdrawnDuringPeriod[beneficiary] <= withdrawLimitDuringPeriod, "error_withdrawLimit");

        // transferAndCall also enables transfers over another token bridge
        //   in this case to=another bridge's tokenMediator, and from=recipient on the other chain
        // this follows the tokenMediator API: data will contain the recipient address, which is the same as sender but on the other chain
        // in case transferAndCall recipient is not a tokenMediator, the data can be ignored (it contains the Vault beneficiary's address)
        require(token.transferAndCall(to, amountWei, abi.encodePacked(beneficiary)), "error_transfer");
    }
}