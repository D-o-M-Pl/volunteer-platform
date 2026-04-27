import { Router, Request, Response } from 'express';
import { getDb, hashPassword, verifyPassword, validatePasswordStrength } from '@volunteer/database';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyJWT,
  verifyRefreshToken,
  hashToken,
  generateSecureToken,
  AuthRequest,
} from '../middleware/auth';
import { z } from 'zod';
import { anonymizeIpAddress } from '@volunteer/database';

const router = Router();
const db = getDb();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const RegisterSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['VOLUNTEER', 'ORGANIZATION']),
  organizationName: z.string().optional(),
  contactEmail: z.string().email().optional(),
});

const LoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string(),
  totpCode: z.string().optional(),
});

const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
});

const VerifyEmailSchema = z.object({
  token: z.string(),
});

const PasswordResetRequestSchema = z.object({
  email: z.string().email().toLowerCase(),
});

const PasswordResetSchema = z.object({
  token: z.string(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
});

// ============================================================================
// HELPERS
// ============================================================================

function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    (req.socket.remoteAddress as string) ||
    'unknown'
  );
}

async function logAuditEvent(
  userId: string,
  action: string,
  ipAddress: string,
  success: boolean
) {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action: action as any,
        ipAddress: anonymizeIpAddress(ipAddress),
        userAgent: '',
      },
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * POST /auth/register
 * Register new user (volunteer or organization)
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = RegisterSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: validation.error.errors,
      });
      return;
    }

    const { email, password, name, role, organizationName, contactEmail } = validation.data;
    const clientIp = getClientIp(req);

    // Check if email already exists
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(409).json({
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'Email address is already registered',
      });
      return;
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      res.status(400).json({
        error: 'WEAK_PASSWORD',
        details: passwordValidation.errors,
      });
      return;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);
    const emailNormalized = email.toLowerCase();

    // Generate email verification token
    const emailVerificationToken = generateSecureToken();

    // Create user
    const user = await db.user.create({
      data: {
        email,
        emailNormalized,
        hashedPassword,
        role: role as any,
        emailVerificationToken,
        emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Create volunteer or organization profile
    if (role === 'VOLUNTEER') {
      await db.volunteer.create({
        data: {
          userId: user.id,
          name,
          status: 'PENDING',
        },
      });
    } else if (role === 'ORGANIZATION') {
      await db.organization.create({
        data: {
          userId: user.id,
          name: organizationName || name,
          contactEmail: contactEmail || email,
        },
      });
    }

    // Log audit event
    await logAuditEvent(user.id, 'USER_REGISTERED', clientIp, true);

    // TODO: Send email verification email with emailVerificationToken
    // await sendVerificationEmail(email, emailVerificationToken);

    res.status(201).json({
      message: 'User registered successfully',
      userId: user.id,
      email: user.email,
      role: user.role,
      requiresEmailVerification: true,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'REGISTRATION_ERROR',
      message: 'Failed to register user',
    });
  }
});

/**
 * POST /auth/login
 * Authenticate user and return JWT tokens
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = LoginSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: validation.error.errors,
      });
      return;
    }

    const { email, password, totpCode } = validation.data;
    const clientIp = getClientIp(req);

    // Find user
    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
      return;
    }

    // Check if account is locked
    if (user.accountLocked) {
      if (user.lockExpiresAt && user.lockExpiresAt > new Date()) {
        res.status(429).json({
          error: 'ACCOUNT_LOCKED',
          message: 'Account is temporarily locked due to multiple failed login attempts',
          unlockTime: user.lockExpiresAt,
        });
        return;
      } else {
        // Unlock account
        await db.user.update({
          where: { id: user.id },
          data: { accountLocked: false, failedLoginAttempts: 0 },
        });
      }
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.hashedPassword);

    if (!passwordValid) {
      // Increment failed login attempts
      const newFailedAttempts = user.failedLoginAttempts + 1;
      const shouldLock = newFailedAttempts >= 5;

      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newFailedAttempts,
          accountLocked: shouldLock,
          lockExpiresAt: shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      });

      // Log failed login
      await logAuditEvent(user.id, 'USER_LOGIN_FAILED', clientIp, false);

      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        attemptsRemaining: Math.max(0, 5 - newFailedAttempts),
      });
      return;
    }

    // Check if email is verified
    if (!user.emailVerified) {
      res.status(403).json({
        error: 'EMAIL_NOT_VERIFIED',
        message: 'Email address must be verified before login',
        verificationRequired: true,
      });
      return;
    }

    // If 2FA is enabled, require TOTP code
    if (user.totpEnabled) {
      if (!totpCode) {
        res.status(403).json({
          error: 'TOTP_REQUIRED',
          message: '2FA code is required',
          totp_required: true,
        });
        return;
      }

      // TODO: Verify TOTP code
      // const isTOTPValid = await verifyTOTPCode(user.totpSecret, totpCode);
      // if (!isTOTPValid) { ... }
    }

    // Reset failed login attempts
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        accountLocked: false,
        lastLoginAt: new Date(),
        lastLoginIp: anonymizeIpAddress(clientIp),
      },
    });

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);
    const tokenHash = hashToken(refreshToken);

    // Store refresh token in database
    await db.loginToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        ipAddress: anonymizeIpAddress(clientIp),
      },
    });

    // Log successful login
    await logAuditEvent(user.id, 'USER_LOGIN', clientIp, true);

    res.json({
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'LOGIN_ERROR',
      message: 'Failed to authenticate',
    });
  }
});

/**
 * POST /auth/refresh
 * Generate new access token from refresh token
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = RefreshTokenSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: validation.error.errors,
      });
      return;
    }

    const { refreshToken } = validation.data;
    const clientIp = getClientIp(req);

    // Verify refresh token JWT
    const payload = verifyRefreshToken(refreshToken);

    if (!payload || !payload.userId) {
      res.status(401).json({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      });
      return;
    }

    // Get user and verify token in database
    const user = await db.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
      return;
    }

    const tokenHash = hashToken(refreshToken);
    const loginToken = await db.loginToken.findUnique({
      where: { tokenHash },
    });

    if (!loginToken || loginToken.revokedAt) {
      res.status(401).json({
        error: 'TOKEN_REVOKED',
        message: 'Refresh token has been revoked',
      });
      return;
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user.id, user.email, user.role);

    res.json({
      accessToken: newAccessToken,
      expiresIn: 15 * 60,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'REFRESH_ERROR',
      message: 'Failed to refresh token',
    });
  }
});

/**
 * POST /auth/logout
 * Revoke refresh token
 */
router.post('/logout', verifyJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'User not authenticated',
      });
      return;
    }

    const clientIp = getClientIp(req);
    const { refreshToken } = req.body;

    // Revoke refresh token if provided
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await db.loginToken.updateMany({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });
    } else {
      // Revoke all refresh tokens for this user
      await db.loginToken.updateMany({
        where: { userId: req.userId },
        data: { revokedAt: new Date() },
      });
    }

    // Log logout
    await logAuditEvent(req.userId, 'USER_LOGOUT', clientIp, true);

    res.json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'LOGOUT_ERROR',
      message: 'Failed to logout',
    });
  }
});

/**
 * POST /auth/verify-email
 * Verify email with verification token
 */
router.post('/verify-email', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = VerifyEmailSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: validation.error.errors,
      });
      return;
    }

    const { token } = validation.data;

    // Find user with verification token
    const user = await db.user.findUnique({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      res.status(404).json({
        error: 'INVALID_TOKEN',
        message: 'Verification token not found',
      });
      return;
    }

    // Check token expiry
    if (user.emailVerificationExpiresAt && user.emailVerificationExpiresAt < new Date()) {
      res.status(410).json({
        error: 'TOKEN_EXPIRED',
        message: 'Verification token has expired',
      });
      return;
    }

    // Mark email as verified
    await db.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    });

    // Log audit event
    await logAuditEvent(user.id, 'EMAIL_VERIFIED', '0.0.0.0', true);

    res.json({
      message: 'Email verified successfully',
      userId: user.id,
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      error: 'VERIFICATION_ERROR',
      message: 'Failed to verify email',
    });
  }
});

/**
 * POST /auth/password-reset-request
 * Request password reset with email
 */
router.post('/password-reset-request', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = PasswordResetRequestSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: validation.error.errors,
      });
      return;
    }

    const { email } = validation.data;
    const clientIp = getClientIp(req);

    // Find user
    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if email exists (security)
      res.status(200).json({
        message: 'If email exists, password reset link will be sent',
      });
      return;
    }

    // Generate password reset token
    const passwordResetToken = generateSecureToken();

    // Update user with reset token
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken,
        passwordResetExpiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour
      },
    });

    // Log audit event
    await logAuditEvent(user.id, 'PASSWORD_RESET', clientIp, true);

    // TODO: Send password reset email with passwordResetToken
    // await sendPasswordResetEmail(email, passwordResetToken);

    res.json({
      message: 'If email exists, password reset link will be sent',
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      error: 'PASSWORD_RESET_ERROR',
      message: 'Failed to process password reset request',
    });
  }
});

/**
 * POST /auth/password-reset
 * Reset password with reset token
 */
router.post('/password-reset', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = PasswordResetSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: validation.error.errors,
      });
      return;
    }

    const { token, password } = validation.data;
    const clientIp = getClientIp(req);

    // Find user with reset token
    const user = await db.user.findUnique({
      where: { passwordResetToken: token },
    });

    if (!user) {
      res.status(404).json({
        error: 'INVALID_TOKEN',
        message: 'Password reset token not found',
      });
      return;
    }

    // Check token expiry
    if (user.passwordResetExpiresAt && user.passwordResetExpiresAt < new Date()) {
      res.status(410).json({
        error: 'TOKEN_EXPIRED',
        message: 'Password reset token has expired',
      });
      return;
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      res.status(400).json({
        error: 'WEAK_PASSWORD',
        details: passwordValidation.errors,
      });
      return;
    }

    // Hash new password
    const hashedPassword = await hashPassword(password);

    // Update user
    await db.user.update({
      where: { id: user.id },
      data: {
        hashedPassword,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        passwordChangedAt: new Date(),
      },
    });

    // Log audit event
    await logAuditEvent(user.id, 'PASSWORD_CHANGED', clientIp, true);

    res.json({
      message: 'Password reset successfully',
      userId: user.id,
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      error: 'PASSWORD_RESET_ERROR',
      message: 'Failed to reset password',
    });
  }
});

export default router;
