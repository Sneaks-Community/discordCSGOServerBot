/**
 * The one gate whose bug is a privilege escalation rather than a wrong reply.
 * Both member shapes are covered on purpose: discord.js hands over a cached
 * collection when the guild is cached and a raw array of role IDs when it is
 * not, and denying an admin on a cache miss is as wrong as allowing a stranger.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PermissionFlagsBits } from "discord.js";

const GUILD = "123456789012345678";
const OTHER_GUILD = "987654321098765432";
const ADMIN_ROLE = "222222222222222222";
const OTHER_ROLE = "333333333333333333";
const OWNER = "300000000000000001";
const STRANGER = "400000000000000001";

process.env.ADMIN_ROLE_ID = ADMIN_ROLE;
process.env.DISCORD_GUILD_ID = GUILD;
process.env.DISCORD_TOKEN = "test-token";
process.env.LOG_LEVEL = "silent";

const { hasAdminRole } = await import("../src/commands/adminAuth.js");

/**
 * Only the fields hasAdminRole reads. `roles` is passed through untouched so a
 * test can hand over either member shape.
 * @param {object} fields
 * @param {string|null} [fields.guildId]
 * @param {string} [fields.ownerId]
 * @param {bigint} [fields.permissions] - The permission bits the member holds
 * @param {any} [fields.roles] - An array of IDs, or an object with a `cache`
 * @param {string} [fields.userId]
 * @returns {object}
 */
function interaction(fields) {
    const { guildId = GUILD, ownerId = OWNER, permissions = 0n, roles, userId = STRANGER } = fields;

    return {
        guild: { ownerId },
        guildId,
        member: roles === undefined ? undefined : { roles },
        memberPermissions: { has: flag => (permissions & flag) === flag },
        user: { id: userId }
    };
}

/**
 * The member shape discord.js builds from a cached guild.
 * @param {string[]} ids
 * @returns {object}
 */
function cachedRoles(ids) {
    return { cache: new Set(ids) };
}

describe("hasAdminRole", () => {
    it("refuses any guild but the configured one, Administrator included", () => {
        assert.equal(hasAdminRole(interaction({ guildId: OTHER_GUILD, permissions: PermissionFlagsBits.Administrator })), false);
        assert.equal(hasAdminRole(interaction({ guildId: OTHER_GUILD, ownerId: STRANGER, userId: STRANGER })), false);
        assert.equal(hasAdminRole(interaction({ guildId: OTHER_GUILD, roles: cachedRoles([ADMIN_ROLE]) })), false);
    });

    it("refuses a DM, where guildId is null", () => {
        assert.equal(hasAdminRole(interaction({ guildId: null, roles: cachedRoles([ADMIN_ROLE]) })), false);
    });

    it("allows a member holding Administrator", () => {
        assert.equal(hasAdminRole(interaction({ permissions: PermissionFlagsBits.Administrator })), true);
    });

    it("allows the guild owner without the role or Administrator", () => {
        assert.equal(hasAdminRole(interaction({ ownerId: OWNER, userId: OWNER })), true);
    });

    it("allows the configured role from a cached member", () => {
        assert.equal(hasAdminRole(interaction({ roles: cachedRoles([OTHER_ROLE, ADMIN_ROLE]) })), true);
    });

    it("allows the configured role from an uncached member's raw array", () => {
        assert.equal(hasAdminRole(interaction({ roles: [OTHER_ROLE, ADMIN_ROLE] })), true);
    });

    it("refuses a member carrying only other roles, in either shape", () => {
        assert.equal(hasAdminRole(interaction({ roles: cachedRoles([OTHER_ROLE]) })), false);
        assert.equal(hasAdminRole(interaction({ roles: [OTHER_ROLE] })), false);
    });

    it("refuses a member with no roles at all", () => {
        assert.equal(hasAdminRole(interaction({ roles: cachedRoles([]) })), false);
        assert.equal(hasAdminRole(interaction({ roles: [] })), false);
        assert.equal(hasAdminRole(interaction({})), false);
    });

    it("refuses a member whose permissions are missing rather than merely empty", () => {
        const bare = interaction({});
        delete bare.memberPermissions;

        assert.equal(hasAdminRole(bare), false);
    });

    it("refuses a member holding a lesser permission than Administrator", () => {
        assert.equal(hasAdminRole(interaction({ permissions: PermissionFlagsBits.ManageGuild })), false);
        assert.equal(hasAdminRole(interaction({ permissions: PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers })), false);
    });

    it("does not mistake a role id for a user id, or the reverse", () => {
        assert.equal(hasAdminRole(interaction({ ownerId: ADMIN_ROLE, roles: [], userId: ADMIN_ROLE })), true);
        assert.equal(hasAdminRole(interaction({ roles: [OWNER] })), false);
    });
});
