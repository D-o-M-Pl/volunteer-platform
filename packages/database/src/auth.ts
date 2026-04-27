import crypto from 'crypto';
import { scryptSync, randomBytes } from 'crypto';

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

export const SECURITY_CONFIG = {
  // Password
  PASSWORD_MIN_LENGTH: 12,
  PASSWORD_SALT_LENGTH: 32,
  PASSWORD_ITERATIONS: 100000,
  PASSWORD_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
  PASSWORD_REQUIREMENTS:
    'Minimum 12 characters, at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character (@$!%*?&)',

  // Tokens
  ACCESS_TOKEN_EXPIRY: 15 * 60, // 15 minutes
  REFRESH_TOKEN_EXPIRY: 7 * 24 * 60 * 60, // 7 days
  EMAIL_VERIFICATION_EXPIRY: 24 * 60 * 60, // 24 hours
  PASSWORD_RESET_EXPIRY: 1 * 60 * 60, // 1 hour

  // Account Security
  MAX_LOGIN_ATTEMPTS: 5,
  ACCOUNT_LOCK_DURATION: 15 * 60, // 15 minutes

  // Token Length
  TOKEN_LENGTH: 32,
};

// ============================================================================
// PASSWORD HASHING
// ============================================================================

/**
 * Hash password using PBKDF2-SHA256 with random salt
 * NIST-approved algorithm, 100k iterations
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < SECURITY_CONFIG.PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${SECURITY_CONFIG.PASSWORD_MIN_LENGTH} characters`);
  }

  if (!SECURITY_CONFIG.PASSWORD_REGEX.test(password)) {
    throw new Error(SECURITY_CONFIG.PASSWORD_REQUIREMENTS);
  }

  const salt = randomBytes(SECURITY_CONFIG.PASSWORD_SALT_LENGTH);
  const iterations = SECURITY_CONFIG.PASSWORD_ITERATIONS;

  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 64, 'sha256', (err, derived) => {
      if (err) reject(err);
      resolve(`$pbkdf2$${iterations}$${salt.toString('hex')}$${derived.toString('hex')}`);
    });
  });
}

/**
 * Verify password against hash using timing-safe comparison
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [algorithm, iterations, salt, expectedDerived] = hash.split('$').slice(1);

  if (algorithm !== 'pbkdf2') {
    throw new Error('Invalid hash format');
  }

  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      Buffer.from(salt, 'hex'),
      parseInt(iterations),
      64,
      'sha256',
      (err, derived) => {
        if (err) reject(err);
        // Timing-safe comparison to prevent timing attacks
        const computedHash = derived.toString('hex');
        const isMatch = crypto.timingSafeEqual(
          Buffer.from(computedHash),
          Buffer.from(expectedDerived)
        );
        resolve(isMatch);
      }
    );
  });
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < SECURITY_CONFIG.PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${SECURITY_CONFIG.PASSWORD_MIN_LENGTH} characters`);
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[@$!%*?&]/.test(password)) {
    errors.push('Password must contain at least one special character (@$!%*?&)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// TOKEN GENERATION
// ============================================================================

/**
 * Generate secure random token
 */
export function generateSecureToken(length: number = SECURITY_CONFIG.TOKEN_LENGTH): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate email verification token
 */
export function generateEmailVerificationToken(): string {
  return generateSecureToken(32);
}

/**
 * Generate password reset token
 */
export function generatePasswordResetToken(): string {
  return generateSecureToken(32);
}

/**
 * Generate JWT refresh token
 */
export function generateRefreshToken(): string {
  return generateSecureToken(32);
}

/**
 * Hash token for storage in database (prevents token extraction from DB)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify token by hashing and comparing
 */
export function verifyToken(token: string, storedHash: string): boolean {
  const computed = hashToken(token);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
}

// ============================================================================
// EVENT SIGNING (Outbox Pattern)
// ============================================================================

/**
 * Sign event payload with HMAC-SHA256
 */
export function signEvent(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify event signature
 */
export function verifyEventSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = signEvent(payload, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

// ============================================================================
// ENCRYPTION (At Rest)
// ============================================================================

/**
 * Encrypt value using AES-256-GCM
 */
export function encryptValue(value: string, key: string): string {
  const iv = randomBytes(16);
  const keyHash = crypto.createHash('sha256').update(key).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', keyHash, iv);

  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt value
 */
export function decryptValue(encrypted: string, key: string): string {
  const [iv, authTag, ciphertext] = encrypted.split(':');
  const keyHash = crypto.createHash('sha256').update(key).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyHash, Buffer.from(iv, 'hex'));

  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ============================================================================
// GDPR & PRIVACY
// ============================================================================

/**
 * Anonymize IP address for logging (GDPR compliance)
 * IPv4: 192.168.1.100 → 192.168.1.0
 * IPv6: ::1 → ::0
 */
export function anonymizeIpAddress(ip: string): string {
  if (!ip) return '';

  // IPv4
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = '0';
      return parts.join('.');
    }
  }

  // IPv6
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length > 0) {
      parts[parts.length - 1] = '0';
      return parts.join(':');
    }
  }

  return ip;
}

// ============================================================================
// 2FA / TOTP
// ============================================================================

/**
 * Generate TOTP secret for 2FA setup
 * Returns base32-encoded secret
 */
export function generateTOTPSecret(): string {
  return randomBytes(32).toString('base64');
}

/**
 * Generate backup codes for 2FA recovery
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}
