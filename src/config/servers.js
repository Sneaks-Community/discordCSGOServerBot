/**
 * servers.json: the single place the file is read, and its validation.
 *
 * Validating at startup means a typo (missing ip, wrong type, duplicate keyword,
 * too many servers) fails fast with a precise message instead of surfacing later
 * as a runtime query failure or a broken embed.
 */

import serverObject from "../../servers.json" with { type: "json" };
import { serversFileSchema } from "../schemas/validationSchemas.js";
import { formatZodPathSuffix } from "../utils/zodValidator.js";

/**
 * The parsed server list, re-exported so nothing else reaches for the file.
 * Consumers read it through config/index.js alongside the rest of the config.
 * One owner also means P0-7's loader replaces one import rather than three.
 */
export { serverObject };

/**
 * Fields a server entry may define. Anything else is reported as an ignored
 * field rather than rejected, so a config carrying a removed option (such as
 * the `show` flag) still starts.
 */
const KNOWN_SERVER_FIELDS = new Set(["ip", "keywords", "nick", "protocol"]);

/**
 * Render a Zod issue as a message prefixed with its location in servers.json.
 * File-level issues (empty path) already name the file, so they are left alone.
 * @param {import('zod').core.$ZodIssue} issue - Zod issue
 * @returns {string} - e.g. `servers.json: "Beginner_Surf".keywords[2]: ...`
 */
function formatIssue(issue) {
    if (issue.path.length === 0) return issue.message;

    const [name, ...rest] = issue.path;

    return `servers.json: "${String(name)}"${formatZodPathSuffix(rest)}: ${issue.message}`;
}

/**
 * Collect non-fatal problems that are worth reporting but should not stop the bot
 * @param {Object} servers - The raw servers.json object
 * @returns {string[]} - Warning messages
 */
function collectWarnings(servers) {
    const warnings = [];
    const addressOwners = new Map();

    for (const [name, server] of Object.entries(servers)) {
        if (!server || typeof server !== "object") continue;

        const unknownFields = Object.keys(server).filter((field) => !KNOWN_SERVER_FIELDS.has(field));
        if (unknownFields.length > 0) {
            warnings.push(`servers.json: "${name}" has unrecognized field(s) ${unknownFields.map((field) => `"${field}"`).join(", ")} which are ignored`);
        }

        // Two entries pointing at the same address are queried twice every tick
        // and appear twice in the embed
        if (typeof server.ip === "string") {
            const owner = addressOwners.get(server.ip);
            if (owner === undefined) {
                addressOwners.set(server.ip, name);
            } else {
                warnings.push(`servers.json: "${name}" and "${owner}" share the address "${server.ip}"; it will be queried once per entry`);
            }
        }

        // getServerByKeyword also matches a server's position in the list, so a
        // numeric keyword is ambiguous with an index lookup
        if (Array.isArray(server.keywords)) {
            for (const keyword of server.keywords) {
                if (typeof keyword === "string" && /^\d+$/.test(keyword)) {
                    warnings.push(`servers.json: "${name}" keyword "${keyword}" is numeric and collides with server index lookups`);
                }
            }
        }
    }

    return warnings;
}

/**
 * Validate the server list
 * @param {Object} [servers] - Server list to validate (defaults to servers.json)
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateServersConfig(servers = serverObject) {
    const result = serversFileSchema.safeParse(servers);

    if (!result.success) {
        return {
            errors: result.error.issues.map(formatIssue),
            // A failed parse means the entries cannot be trusted to have the
            // shape collectWarnings reads, and startup aborts on errors anyway,
            // so warnings would be noise ahead of the fatal line
            warnings: []
        };
    }

    return { errors: [], warnings: collectWarnings(servers) };
}
