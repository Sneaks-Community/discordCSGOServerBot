/**
 * Configuration module - main entry point
 * Handles config loading and validation from environment variables
 */

import { configLogger } from "../utils/logger.js";
import { config, CONFIG_VALUES, ENV_ERRORS, ENV_WARNINGS, REQUIRED_PERMISSIONS } from "./config.js";
import { validateServersConfig } from "./servers.js";

export { config, CONFIG_VALUES, REQUIRED_PERMISSIONS };

/**
 * Validate configuration and stop the process if it cannot be honoured.
 *
 * The environment is described entirely by schemas/envSchema.js, which is what
 * produced ENV_ERRORS and ENV_WARNINGS at import time; this function reports
 * those and then checks the one input that does not come from the environment,
 * servers.json.
 * @returns {{ errors: string[], warnings: string[] }} - Everything reported
 */
export function validateConfig() {
    // Malformed variables come first and abort immediately: when envSchema rejects
    // anything, every value in `config` has fallen back to its default, so nothing
    // further would be describing the operator's actual configuration.
    if (ENV_ERRORS.length > 0) {
        configLogger.fatal(
            { errors: ENV_ERRORS },
            "Invalid environment variables; fix the values listed in errors (see .env.example for the accepted range of each)"
        );
        process.exit(1);
    }

    // A bad entry here breaks server queries or the embed rather than startup
    const servers = validateServersConfig();
    const warnings = [...ENV_WARNINGS, ...servers.warnings];

    for (const warning of warnings) {
        configLogger.warn(warning);
    }

    if (servers.errors.length > 0) {
        configLogger.fatal(
            { errors: servers.errors },
            "Critical servers.json errors; fix the reported entries (see README Server Configuration)"
        );
        process.exit(1);
    }

    return { errors: servers.errors, warnings };
}
