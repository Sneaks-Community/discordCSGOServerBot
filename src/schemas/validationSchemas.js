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
