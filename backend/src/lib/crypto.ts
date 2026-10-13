import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getSecretKey(): Buffer {
    const key = process.env.APP_SECRET_KEY;
    if (!key || key.length !== 64) {
        throw new Error(
            'APP_SECRET_KEY must be set as a 64-character hex string (32 bytes). ' +
            'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
    }
    return Buffer.from(key, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-CBC.
 * Returns `iv:ciphertext` as hex strings separated by `:`.
 */
export function encrypt(plainText: string): string {
    const key = getSecretKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an `iv:ciphertext` hex string back to plaintext.
 */
export function decrypt(encryptedText: string): string {
    const key = getSecretKey();
    const [ivHex, cipherHex] = encryptedText.split(':');
    if (!ivHex || !cipherHex) {
        throw new Error('Invalid encrypted format. Expected iv:ciphertext');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Generate a random verify token (32-char hex).
 */
export function generateVerifyToken(): string {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Mask a token for display: show first 8 and last 4 chars.
 */
export function maskToken(token: string): string {
    if (token.length <= 12) return '••••••••';
    return `${token.substring(0, 8)}${'•'.repeat(Math.min(token.length - 12, 20))}${token.substring(token.length - 4)}`;
}
