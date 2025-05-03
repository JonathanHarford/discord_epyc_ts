/**
 * Generate a random alphanumeric ID
 * @param length Length of the ID (default: 10)
 * @returns Random alphanumeric string
 */
export function generateUniqueId(length: number = 10): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
} 