import * as z from "zod";

/**
 * Discord user ID schema: 17-19 digit numeric string
 * Discord IDs are always numeric strings assigned by Discord's infrastructure.
 */
export const discordIdSchema = z
    .string()
    .min(17, "Discord ID must be 17-19 digits")
    .max(19, "Discord ID must be 17-19 digits")
    .regex(/^\d{17,19}$/, "Discord ID must contain only digits");

/**
 * Map name schema: alphanumeric, underscores, hyphens, max 64 chars
 * CS:GO map names follow specific conventions with prefixes like de_, cs_, etc.
 * Transformed to lowercase for consistent database storage.
 */
export const mapNameSchema = z
    .string()
    .min(1, "Map name cannot be empty")
    .max(64, "Map name cannot exceed 64 characters")
    .regex(/^[\w-]+$/, "Map name contains invalid characters (only alphanumeric, underscores, and hyphens allowed)")
    .transform((val) => val.toLowerCase());

/**
 * Player name schema: printable ASCII characters, max 64 chars
 * Allows any printable ASCII except backslash (\) and angle brackets (<>)
 * to prevent Discord markdown injection at the source.
 * Pattern: \x20 (space), \x21 (!), \x23-\x7E (#-~) — excludes \ (\x5C), < (\x3C), > (\x3E)
 */
export const playerNameSchema = z
    .string()
    .min(1, "Player name cannot be empty")
    .max(64, "Player name cannot exceed 64 characters")
    // Allow printable ASCII except backslash (\x5C \), angle brackets (\x3C <, \x3E >)
    // Ranges: space-; [\x20-\x3B], ?-[\\] [\x3F-\x5B], ]-~ [\x5D-\x7E]
    .regex(/^[\x20-\x3B\x3F-\x5B\x5D-\x7E]+$/, "Player name contains invalid characters")
    .transform((val) => val.trim());

/**
 * IPv4 address schema — uses Zod v4 top-level validator
 * Replaces deprecated z.string().ipv4() with z.ipv4() for better tree-shaking
 */
export const ipv4Schema = z.ipv4();

/**
 * FQDN / hostname schema with optional port
 * Validates domain name format per RFC 1123
 */
export const fqdnSchema = z
    .string()
    .min(1, "Hostname cannot be empty")
    .max(253, "Hostname cannot exceed 253 characters")
    .regex(/^(?=.{1,253}$)([\dA-Za-z]([\dA-Za-z-]{0,61}[\dA-Za-z])?\.)*[\dA-Za-z]([\dA-Za-z-]{0,61}[\dA-Za-z])?$/, "Invalid hostname format")
    .refine((hostname) => !hostname.includes("..") && !hostname.includes("/") && !hostname.includes("\\"), "Invalid hostname: contains disallowed characters");

/**
 * Server name schema: printable ASCII, max 64 chars
 */
export const serverNameSchema = z
    .string()
    .min(1, "Server name cannot be empty")
    .max(64, "Server name cannot exceed 64 characters")
    .regex(/^[\x20-\x7E]+$/, "Server name contains invalid characters");

/**
 * Full IP address schema: hostname or IP with port
 */
export const fullIpSchema = z
    .string()
    .min(1, "IP address cannot be empty")
    .max(45, "IP address cannot exceed 45 characters")
    .regex(/^[\d.:A-Za-z-]+$/, "IP address contains invalid characters");

/**
 * All validation schemas exported as a single object for convenience
 */
export const validationSchemas = {
    discordId: discordIdSchema,
    fqdn: fqdnSchema,
    fullIp: fullIpSchema,
    ipv4: ipv4Schema,
    mapName: mapNameSchema,
    playerName: playerNameSchema,
    serverName: serverNameSchema
};
