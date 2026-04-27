import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '@volunteer/database';
import { verifyToken, hashToken } from '@volunteer/database';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
  token?: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: 'ADMIN' | 'ORGANIZATION' | 'VOLUNTEER';
  iat: number;
  exp: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-key-change-in-production';
const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days

// ============================================================================
// JWT UTILITIES
// ============================================================================

/**
 * Generate JWT access token
 */
export function generateAccessToken(userId: string, email: string, role: string): string {
  return jwt.sign(
    {
      userId,
      email,
      role,
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'volunteer-platform',
      subject: userId,
    }
  );
}

/**
 * Generate JWT refresh token
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign(
    {
      userId,
      type: 'refresh',
    },
    JWT_REFRESH_SECRET,
    {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      issuer: 'volunteer-platform',
      subject: userId,
    }
  );
}

/**
 * Verify and decode JWT access token
 */
export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'volunteer-platform',
    }) as JWTPayload;
    return decoded;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Verify and decode JWT refresh token
 */
export function verifyRefreshToken(token: string): any | null {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'volunteer-platform',
    });
    return decoded;
  } catch (error) {
    console.error('Refresh token verification failed:', error);
    return null;
  }
}

// ============================================================================
// MIDDLEWARE: JWT VERIFICATION
// ============================================================================

/**
 * Middleware to verify JWT token from Authorization header
 * Header format: Bearer <token>
 */
export const verifyJWT = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'MISSING_AUTH_TOKEN',
        message: 'Authorization header missing or invalid format',
      });
      return;
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix
    req.token = token;

    const payload = verifyAccessToken(token);

    if (!payload) {
      res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Token is invalid or expired',
      });
      return;
    }

    req.userId = payload.userId;
    req.user = payload;

    next();
  } catch (error) {
    console.error('JWT verification error:', error);
    res.status(401).json({
      error: 'AUTH_ERROR',
      message: 'Authentication failed',
    });
  }
};

/**
 * Optional JWT verification - doesn't fail if token is missing
 */
export const verifyJWTOptional = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = verifyAccessToken(token);

      if (payload) {
        req.userId = payload.userId;
        req.user = payload;
      }
    }

    next();
  } catch (error) {
    console.error('Optional JWT verification error:', error);
    next(); // Don't fail, just continue
  }
};

// ============================================================================
// MIDDLEWARE: TOKEN REFRESH
// ============================================================================

/**
 * Middleware to handle token refresh
 * Checks if refresh token is valid and stored in database
 */
export const refreshTokenMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'MISSING_REFRESH_TOKEN',
        message: 'Refresh token is required',
      });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);

    if (!payload || !payload.userId) {
      res.status(401).json({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      });
      return;
    }

    const db = getDb();
    const tokenHash = hashToken(refreshToken);

    // Verify token exists in database and is not revoked
    const loginToken = await db.loginToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!loginToken) {
      res.status(401).json({
        error: 'TOKEN_NOT_FOUND',
        message: 'Token not found in database',
      });
      return;
    }

    if (loginToken.revokedAt) {
      res.status(401).json({
        error: 'TOKEN_REVOKED',
        message: 'Token has been revoked',
      });
      return;
    }

    if (new Date(loginToken.expiresAt) < new Date()) {
      res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Refresh token has expired',
      });
      return;
    }

    // Token is valid, generate new access token
    const newAccessToken = generateAccessToken(
      loginToken.user.id,
      loginToken.user.email,
      loginToken.user.role
    );

    req.userId = loginToken.user.id;
    req.user = loginToken.user;
    req.token = newAccessToken;

    next();
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'REFRESH_ERROR',
      message: 'Failed to refresh token',
    });
  }
};

// ============================================================================
// MIDDLEWARE: TOTP VERIFICATION
// ============================================================================

/**
 * Verify TOTP code (2FA)
 * This middleware should be used after JWT verification
 */
export const verifyTOTP = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        error: 'MISSING_USER_ID',
        message: 'User ID required for 2FA verification',
      });
      return;
    }

    const db = getDb();
    const user = await db.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
      return;
    }

    // If 2FA is not enabled, skip verification
    if (!user.totpEnabled) {
      next();
      return;
    }

    const { totpCode } = req.body;

    if (!totpCode) {
      res.status(400).json({
        error: 'MISSING_TOTP_CODE',
        message: '2FA code is required',
      });
      return;
    }

    // TODO: Implement TOTP verification using speakeasy or similar library
    // For now, this is a placeholder that should be implemented with actual TOTP logic
    const isValidTOTP = await verifyTOTPCode(user.totpSecret || '', totpCode);

    if (!isValidTOTP) {
      // Check if it's a backup code
      const isBackupCode = user.totpBackupCodes && user.totpBackupCodes.includes(totpCode);

      if (!isBackupCode) {
        res.status(401).json({
          error: 'INVALID_TOTP_CODE',
          message: 'Invalid 2FA code or backup code',
        });
        return;
      }

      // Remove used backup code
      const updatedBackupCodes = user.totpBackupCodes?.filter((code) => code !== totpCode) || [];
      await db.user.update({
        where: { id: req.userId },
        data: { totpBackupCodes: updatedBackupCodes },
      });
    }

    next();
  } catch (error) {
    console.error('TOTP verification error:', error);
    res.status(500).json({
      error: 'TOTP_ERROR',
      message: 'Failed to verify 2FA code',
    });
  }
};

/**
 * Verify TOTP code (placeholder - implement with speakeasy)
 */
async function verifyTOTPCode(secret: string, code: string): Promise<boolean> {
  // TODO: Implement with speakeasy library
  // import speakeasy from 'speakeasy';
  // const isValid = speakeasy.totp.verify({
  //   secret,
  //   encoding: 'base64',
  //   token: code,
  //   window: 2,
  // });
  // return isValid;
  return false; // Placeholder
}

// ============================================================================
// MIDDLEWARE: OPTIONAL 2FA CHECK
// ============================================================================

/**
 * Check if user has 2FA enabled and return flag
 */
export const check2FAStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      next();
      return;
    }

    const db = getDb();
    const user = await db.user.findUnique({
      where: { id: req.userId },
      select: { totpEnabled: true },
    });

    if (user) {
      (req as any).has2FA = user.totpEnabled;
    }

    next();
  } catch (error) {
    console.error('2FA status check error:', error);
    next();
  }
};

// ============================================================================
// ERROR HANDLER
// ============================================================================

export const authErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Auth error:', err);

  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Invalid token',
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      error: 'TOKEN_EXPIRED',
      message: 'Token has expired',
    });
    return;
  }

  res.status(500).json({
    error: 'AUTH_ERROR',
    message: 'Authentication error occurred',
  });
};
