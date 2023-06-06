// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.6;

/**
 * Describes how the vault member left
 * For the base Vault contract this isn't important, but modules/extensions can find it very helpful
 * See e.g. LimitWithdrawModule
 */
enum LeaveConditionCode {
    SELF,   // self remove using partMember()
    AGENT,  // removed by joinPartAgent using partMember()
    BANNED  // removed by BanModule
}
