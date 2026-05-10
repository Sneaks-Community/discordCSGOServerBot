/**
 * Validate input against a Zod v4 schema
 * @param {import('zod').ZodType} schema - Zod schema to validate against
 * @param {unknown} input - Input to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {{ valid: true, data: any } | { valid: false, error: string }}
 */
export function validateWithZod(schema, input, fieldName = "Input") {
    const result = schema.safeParse(input);
    if (result.success) {
        return { data: result.data, valid: true };
    }

    // Extract the first meaningful error message from Zod v4 error structure
    // In Zod v4, errors are in result.error.issues as an array
    const errorMessage = result.error.issues?.[0]?.message || "Validation failed";
    return { error: `${fieldName}: ${errorMessage}`, valid: false };
}

/**
 * Validate and escape input for Discord display
 * Combines Zod validation with Discord markdown escaping in one step
 * @param {import('zod').ZodType} schema - Zod schema to validate against
 * @param {unknown} input - Input to validate and escape
 * @param {string} fieldName - Field name for error messages
 * @param {Function} escapeFn - Escape function to apply (default: escapeForDiscord)
 * @returns {{ valid: true, data: string } | { valid: false, error: string }}
 */
export function validateAndEscapeForDiscord(schema, input, fieldName = "Input", escapeFn) {
    const result = schema.safeParse(input);
    if (!result.success) {
        const errorMessage = result.error.issues?.[0]?.message || "Validation failed";
        return { error: `${fieldName}: ${errorMessage}`, valid: false };
    }

    // Apply the escape function to the validated/sanitized data
    const escaped = escapeFn(result.data);
    return { data: escaped, valid: true };
}
