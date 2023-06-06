// SPDX-License-Identifier: UNLICENSED
/* solhint-disable not-rely-on-time */

pragma solidity 0.8.6;

import "./VaultModule.sol";
import "./IJoinListener.sol";

/**
 * @title Vault module that limits per-user withdraws to given amount per period
 * @dev Setup: vault.setJoinListener(this); vault.addJoinPartAgent(this);
 */
contract BanModule is VaultModule, IJoinListener {
    mapping (address => uint) public bannedUntilTimestamp;

    event MemberBanned(address indexed beneficiary);
    event BanWillEnd(address indexed beneficiary, uint banEndTimestamp);
    event BanRemoved(address indexed beneficiary);

    constructor(address vaultAddress) VaultModule(vaultAddress) {}

    function isBanned(address beneficiary) public view returns (bool) {
        return block.timestamp < bannedUntilTimestamp[beneficiary];
    }

    /**
     * Returns which beneficiaries are banned in the given input list
     *
     * Example code snippets to read the result in TypeScript:
     * ```
     * async function areMembersBanned(beneficiaries: EthereumAddress[]): Promise<boolean[]> {
     *    const banBits = await banModuleAdmin.areBanned(beneficiaries)
     *    return beneficiaries.map((_, i) => banBits.shr(i).and(1).eq(1))
     * }
     * async function selectBannedMembers(beneficiaries: EthereumAddress[]): Promise<EthereumAddress[]> {
     *    const banBits = await banModuleAdmin.areBanned(beneficiaries)
     *    return beneficiaries.filter((_, i) => banBits.shr(i).and(1).eq(1))
     * }
     * ```
     * @return beneficiariesBannedBitfield where least significant bit is the ban-state first address in input list etc.
     */
    function areBanned(address[] memory beneficiaries) public view returns (uint256 beneficiariesBannedBitfield) {
        uint bit = 1;
        for (uint8 i = 0; i < beneficiaries.length; ++i) {
            if (isBanned(beneficiaries[i])) {
                beneficiariesBannedBitfield |= bit;
            }
            bit <<= 1;
        }
    }

    /** Ban a beneficiary indefinitely */
    function ban(address beneficiary) public onlyJoinPartAgent {
        bannedUntilTimestamp[beneficiary] = type(uint).max;
        if (IVault(vault).isMember(beneficiary)) {
            IVault(vault).removeMember(beneficiary, LeaveConditionCode.BANNED);
        }
        emit MemberBanned(beneficiary);
    }

    /** Ban several beneficiaries indefinitely */
    function banMembers(address[] memory beneficiaries) public onlyJoinPartAgent {
        for (uint8 i = 0; i < beneficiaries.length; ++i) {
            ban(beneficiaries[i]);
        }
    }

    /** Ban a beneficiary for the given time period (in seconds) */
    function banSeconds(address beneficiary, uint banLengthSeconds) public onlyJoinPartAgent {
        ban(beneficiary);
        bannedUntilTimestamp[beneficiary] = block.timestamp + banLengthSeconds;
        emit BanWillEnd(beneficiary, bannedUntilTimestamp[beneficiary]);
    }

    /** Ban several beneficiaries the given time period (in seconds) */
    function banMembersSeconds(address[] memory beneficiaries, uint banLengthSeconds) public onlyJoinPartAgent {
        for (uint8 i = 0; i < beneficiaries.length; ++i) {
            banSeconds(beneficiaries[i], banLengthSeconds);
        }
    }

    /** Ban several beneficiaries, each for a specific time period (in seconds, for each user) */
    function banMembersSpecificSeconds(address[] memory beneficiaries, uint[] memory banLengthSeconds) public onlyJoinPartAgent {
        for (uint8 i = 0; i < beneficiaries.length; ++i) {
            banSeconds(beneficiaries[i], banLengthSeconds[i]);
        }
    }

    /** Reverse a ban and re-join the beneficiary to the vault */
    function restore(address beneficiary) public onlyJoinPartAgent {
        require(isBanned(beneficiary), "error_beneficiaryNotBanned");
        removeBan(beneficiary);
        IVault(vault).addMember(beneficiary);
    }

    /** Reverse ban and re-join the beneficiaries to the vault */
    function restoreMembers(address[] memory beneficiaries) public onlyJoinPartAgent {
        for (uint8 i = 0; i < beneficiaries.length; ++i) {
            restore(beneficiaries[i]);
        }
    }

    /** Remove a ban without re-joining the beneficiary */
    function removeBan(address beneficiary) public onlyJoinPartAgent {
        delete bannedUntilTimestamp[beneficiary];
        emit BanRemoved(beneficiary);
    }

    /** Remove ban without re-joining the beneficiaries */
    function removeBanMembers(address[] memory beneficiaries) public onlyJoinPartAgent {
        for (uint8 i = 0; i < beneficiaries.length; ++i) {
            removeBan(beneficiaries[i]);
        }
    }

    /** Callback that gets called when a beneficiary wants to join */
    function onJoin(address newMember) override view external onlyVault {
        require(!isBanned(newMember), "error_beneficiaryBanned");
    }
}
