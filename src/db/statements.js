/**
 * The two things every query in this directory does: validate its inputs, then
 * run a cached prepared statement. Shared so each table module is only its own
 * SQL.
 */

import { dbLogger } from "../utils/logger.js";
import { validateWithZod } from "../utils/zodValidator.js";
import { getStatement } from "./connection.js";

/**
 * Helper to validate and execute database operations using Zod v4 schemas
 * @param {import('zod').ZodType} schema - Zod v4 schema to validate against
 * @param {any} value - Value to validate
 * @param {string} operationName - Name of the operation for error messages
 * @returns {any} Validated and transformed value
 */
export function validateOrThrow(schema, value, operationName) {
    const result = validateWithZod(schema, value, operationName);
    if (!result.valid) {
        throw new Error(result.error);
    }
    return result.data;
}

/**
 * Run a statement with error handling, reusing a cached prepared statement
 * @param {string} sql - SQL statement
 * @param {Array} params - Parameters for the statement
 * @param {string} operationName - Name of the operation for error logging
 * @param {"all" | "get" | "run"} mode - better-sqlite3 method to invoke
 * @returns {any} Result of the operation
 */
export function runStatement(sql, params, operationName, mode) {
    const stmt = getStatement(sql);
    try {
        return stmt[mode](...params);
    } catch (err) {
        dbLogger.error({ err, operation: operationName }, "Database error");
        throw err;
    }
}
