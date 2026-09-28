export interface JwtPayload {
    exp?: number;
    sub?: string;
    [key: string]: unknown;
}

/**
 * Safely decodes a JWT payload from base64url string.
 */
export function parseJwt(token: string): JwtPayload | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const base64Url = parts[1];
        if (!base64Url) return null;

        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
        const jsonPayload = decodeURIComponent(
            atob(padded)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
}

/**
 * Checks whether the token exists and has not expired according to its JWT 'exp' field.
 */
export function isTokenValid(token: string | null): boolean {
    if (!token) return false;
    const payload = parseJwt(token);
    // If not a valid JWT format, treat as invalid
    if (!payload) return false;

    // exp is in seconds since epoch
    if (typeof payload.exp === 'number') {
        return payload.exp * 1000 > Date.now();
    }

    return true;
}

/**
 * Returns remaining time in milliseconds before the token expires.
 * Returns 0 if already expired or invalid.
 */
export function getTokenRemainingTime(token: string | null): number {
    if (!token) return 0;
    const payload = parseJwt(token);
    if (!payload || typeof payload.exp !== 'number') return 0;
    return Math.max(0, payload.exp * 1000 - Date.now());
}
