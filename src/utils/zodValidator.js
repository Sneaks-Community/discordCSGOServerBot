/**
 * Render the nested part of a Zod issue path as a readable accessor chain.
 * The first segment is the thing being validated (a server name, an environment
 * variable) and each caller prefixes it in its own style, so only the remainder
 * is formatted here.
 * @param {ReadonlyArray<string|number|symbol>} path - Issue path segments after the first
 * @returns {string} - e.g. `[0].channelID` or `.keywords[2]`, empty for a top-level issue
 */
export function formatZodPathSuffix(path) {
    return path.map((segment) => (typeof segment === "number" ? `[${segment}]` : `.${String(segment)}`)).join("");
}

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

