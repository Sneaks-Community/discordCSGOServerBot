/**
 * Input validation utilities
 * Validates IP addresses, FQDNs, server inputs, and map names
 */

/**
 * Validate IPv4 address format
 * @param {string} ip - The IP address to validate
 * @returns {Object} - { valid: boolean, error?: string, isPrivate?: boolean }
 */
export function validateIPv4(ip) {
    // IPv4 regex pattern
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(ipv4Regex);
    
    if (!match) {
        return { valid: false, error: "Invalid IPv4 address format" };
    }
    
    // Check each octet is in valid range (0-255)
    const octets = match.slice(1).map(Number);
    for (const octet of octets) {
        if (octet < 0 || octet > 255) {
            return { valid: false, error: "Invalid IPv4 address: octets must be 0-255" };
        }
    }
    
    // Check for private/reserved IP ranges
    const isPrivate =
        octets[0] === 10 || // 10.0.0.0/8
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || // 172.16.0.0/12
        (octets[0] === 192 && octets[1] === 168) || // 192.168.0.0/16
        (octets[0] === 127) || // 127.0.0.0/8 (loopback)
        (octets[0] === 0) || // 0.0.0.0/8
        (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) || // 100.64.0.0/10 (CGNAT)
        (octets[0] === 169 && octets[1] === 254) || // 169.254.0.0/16 (link-local)
        (octets[0] === 198 && octets[1] >= 18 && octets[1] <= 19); // 198.18.0.0/15 (benchmark)
    
    return { valid: true, isPrivate };
}

/**
 * Validate FQDN format
 * @param {string} fqdn - The FQDN to validate (may include port)
 * @returns {Object} - { valid: boolean, error?: string, hostname?: string, port?: string }
 */
export function validateFQDN(fqdn) {
    if (!fqdn || typeof fqdn !== "string") {
        return { valid: false, error: "Invalid FQDN: must be a non-empty string" };
    }
    
    const trimmed = fqdn.trim();
    
    // Split hostname and port if present
    let hostname = trimmed;
    let port = null;
    
    // Handle port (e.g., "example.com:27015")
    // Note: IPv6 is not supported, so we don't need to handle bracket notation
    if (trimmed.includes(":")) {
        const lastColonIndex = trimmed.lastIndexOf(":");
        hostname = trimmed.substring(0, lastColonIndex);
        const portStr = trimmed.substring(lastColonIndex + 1);
        
        // Validate port
        const portNum = parseInt(portStr, 10);
        if (isNaN(portNum) || portNum < 1023 || portNum > 49152) {
            return { valid: false, error: "Invalid port number. Must be between 1023 and 49152" };
        }
        port = portStr;
    }
    
    // Validate hostname format
    // FQDN regex: allows letters, numbers, hyphens, and dots
    // Each label must start and end with alphanumeric, max 63 chars per label
    // Total max 253 chars (255 with trailing dot)
    const hostnameRegex = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
    
    if (!hostnameRegex.test(hostname)) {
        return { valid: false, error: "Invalid hostname format. Must be a valid domain name (e.g., example.com)" };
    }
    
    // Check for suspicious patterns (directory traversal, etc.)
    if (hostname.includes("..") || hostname.includes("/") || hostname.includes("\\")) {
        return { valid: false, error: "Invalid hostname: contains disallowed characters" };
    }
    
    return { valid: true, hostname, port };
}

/**
 * Validate server input - accepts FQDNs, public IPv4, or keywords from servers.json
 * @param {string} input - The input to validate
 * @param {Function} keywordToServer - Function to convert keyword to server object
 * @returns {Object} - { valid: boolean, error?: string, type?: 'ipv4'|'fqdn'|'keyword', value?: object }
 */
export function validateServerInput(input, keywordToServer) {
    if (!input || typeof input !== "string") {
        return { valid: false, error: "Invalid input: must be a non-empty string" };
    }
    
    const trimmed = input.trim();
    
    // Check if it's a keyword from servers.json
    const server = keywordToServer(trimmed.toLowerCase());
    if (server) {
        return { valid: true, type: "keyword", value: { server } };
    }
    
    // Check if it's a valid IPv4 address
    const ipv4Result = validateIPv4(trimmed);
    if (ipv4Result.valid) {
        if (ipv4Result.isPrivate) {
            return { valid: false, error: "Private IP addresses are not allowed for security reasons" };
        }
        return { valid: true, type: "ipv4", value: { ip: trimmed } };
    }
    
    // Check if it's a valid FQDN
    const fqdnResult = validateFQDN(trimmed);
    if (fqdnResult.valid) {
        return { valid: true, type: "fqdn", value: { hostname: fqdnResult.hostname, port: fqdnResult.port } };
    }
    
    // Return error with guidance
    return {
        valid: false,
        error: "Invalid input. Must be a public IPv4 address, a valid domain name (e.g., example.com:27015), or a server keyword. IPv6 addresses are not supported."
    };
}

/**
 * Validate map name input - ensures map names are safe and follow CS:GO conventions
 * @param {string} mapName - The map name to validate
 * @param {Object} Discord - Discord.js library for mention patterns
 * @returns {Object} - { valid: boolean, error?: string }
 */
export function validateMapName(mapName, Discord) {
    // Check for empty or whitespace-only input
    if (!mapName || mapName.trim().length === 0) {
        return { valid: false, error: "Map name cannot be empty" };
    }

    // Check for mentions (users, roles, everyone) if Discord is provided
    if (Discord) {
        if (mapName.match(Discord.MessageMentions.USERS_PATTERN) || 
            mapName.match(Discord.MessageMentions.ROLES_PATTERN) || 
            mapName.match(Discord.MessageMentions.EVERYONE_PATTERN)) {
            return { valid: false, error: "Map name cannot contain mentions" };
        }
    }

    // Validate map name format - CS:GO map names typically start with specific prefixes
    // and contain only alphanumeric characters, underscores, and hyphens
    const mapNameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!mapNameRegex.test(mapName)) {
        return { valid: false, error: "Map name contains invalid characters" };
    }

    // Ensure map name is not too long (CS:GO limit is typically 64 characters)
    if (mapName.length > 64) {
        return { valid: false, error: "Map name is too long (max 64 characters)" };
    }

    return { valid: true };
}