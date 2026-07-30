/**
 * The error validateConfig raises instead of exiting.
 *
 * Configuration is rejected in two places (the environment and servers.json) and
 * both used to call process.exit(1) from inside the validator, which made the
 * function impossible to test and gave the process two exit paths for one class
 * of failure. Carrying the collected messages on the error instead lets
 * index.js stay the single exit point and log them exactly as before.
 */
export class ConfigError extends Error {
    /**
     * @param {string} message - What is wrong and how to fix it
     * @param {string[]} [errors] - Every individual failure, in declaration order
     */
    constructor(message, errors = []) {
        super(message);
        this.name = "ConfigError";
        this.errors = errors;
    }
}
