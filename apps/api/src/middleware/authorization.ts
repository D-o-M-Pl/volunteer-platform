import { Request, Response, NextFunction } from 'express';
import { getDb, UserRole } from '@volunteer/database';
import { AuthRequest } from './auth';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AuthorizedRequest extends AuthRequest {
  requiredRoles?: UserRole[];
}

// ============================================================================
// RBAC MIDDLEWARE
// ============================================================================

/**
 * Middleware to check if user has required role(s)
 * Can check for single role or multiple roles (OR logic)
 */
export const requireRole =
  (...roles: UserRole[]) =>
  (req: AuthorizedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
        return;
      }

      const userRole = req.user.role as UserRole;

      if (!roles.includes(userRole)) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: `This action requires one of these roles: ${roles.join(', ')}`,
          requiredRoles: roles,
          userRole,
        });
        return;
      }

      req.requiredRoles = roles;
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({
        error: 'AUTHORIZATION_ERROR',
        message: 'Failed to check authorization',
      });
    }
  };

/**
 * Middleware to require admin role
 */
export const requireAdmin = (req: AuthorizedRequest, res: Response, next: NextFunction): void => {
  requireRole('ADMIN')(req, res, next);
};

/**
 * Middleware to require organization role
 */
export const requireOrganization = (
  req: AuthorizedRequest,
  res: Response,
  next: NextFunction
): void => {
  requireRole('ORGANIZATION')(req, res, next);
};

/**
 * Middleware to require volunteer role
 */
export const requireVolunteer = (
  req: AuthorizedRequest,
  res: Response,
  next: NextFunction
): void => {
  requireRole('VOLUNTEER')(req, res, next);
};

// ============================================================================
// RESOURCE OWNERSHIP CHECKS
// ============================================================================

/**
 * Verify user owns the volunteer profile
 */
export const isVolunteerOwner = async (
  req: AuthorizedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
      return;
    }

    const volunteerId = req.params.volunteerId;
    const db = getDb();

    const volunteer = await db.volunteer.findUnique({
      where: { id: volunteerId },
      select: { userId: true },
    });

    if (!volunteer) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Volunteer profile not found',
      });
      return;
    }

    if (volunteer.userId !== req.userId) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You can only access your own volunteer profile',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Volunteer ownership check error:', error);
    res.status(500).json({
      error: 'AUTHORIZATION_ERROR',
      message: 'Failed to verify ownership',
    });
  }
};

/**
 * Verify user owns the organization profile
 */
export const isOrganizationOwner = async (
  req: AuthorizedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
      return;
    }

    const organizationId = req.params.organizationId;
    const db = getDb();

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { userId: true },
    });

    if (!organization) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Organization not found',
      });
      return;
    }

    if (organization.userId !== req.userId) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You can only access your own organization',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Organization ownership check error:', error);
    res.status(500).json({
      error: 'AUTHORIZATION_ERROR',
      message: 'Failed to verify ownership',
    });
  }
};

/**
 * Verify user can access task (either owner or volunteer applying)
 */
export const canAccessTask = async (
  req: AuthorizedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
      return;
    }

    const taskId = req.params.taskId;
    const db = getDb();

    const task = await db.task.findUnique({
      where: { id: taskId },
      include: {
        organization: {
          select: { userId: true },
        },
      },
    });

    if (!task) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Task not found',
      });
      return;
    }

    // Organization owner or admin
    if (req.user?.role === 'ADMIN' || task.organization.userId === req.userId) {
      next();
      return;
    }

    // Check if volunteer has application for this task
    if (req.user?.role === 'VOLUNTEER') {
      const volunteer = await db.volunteer.findUnique({
        where: { userId: req.userId },
        select: { id: true },
      });

      if (!volunteer) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Volunteer profile not found',
        });
        return;
      }

      const application = await db.application.findUnique({
        where: {
          volunteerId_taskId: {
            volunteerId: volunteer.id,
            taskId,
          },
        },
        select: { id: true },
      });

      if (!application && req.method !== 'GET') {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You can only access tasks you have applied to',
        });
        return;
      }

      next();
      return;
    }

    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'You do not have access to this task',
    });
  } catch (error) {
    console.error('Task access check error:', error);
    res.status(500).json({
      error: 'AUTHORIZATION_ERROR',
      message: 'Failed to verify access',
    });
  }
};

/**
 * Verify user can modify application (either owner or task organization)
 */
export const canModifyApplication = async (
  req: AuthorizedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
      return;
    }

    const applicationId = req.params.applicationId;
    const db = getDb();

    const application = await db.application.findUnique({
      where: { id: applicationId },
      include: {
        volunteer: {
          select: { userId: true },
        },
        task: {
          include: {
            organization: {
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!application) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Application not found',
      });
      return;
    }

    const isVolunteerOwner = application.volunteer.userId === req.userId;
    const isOrganizationOwner = application.task.organization.userId === req.userId;
    const isAdmin = req.user?.role === 'ADMIN';

    if (!isVolunteerOwner && !isOrganizationOwner && !isAdmin) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You do not have permission to modify this application',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Application modification check error:', error);
    res.status(500).json({
      error: 'AUTHORIZATION_ERROR',
      message: 'Failed to verify modification rights',
    });
  }
};

// ============================================================================
// ROW-LEVEL SECURITY
// ============================================================================

/**
 * Build WHERE clause for row-level security based on user role
 */
export function buildSecurityFilter(userId: string, role: UserRole): any {
  switch (role) {
    case 'ADMIN':
      // Admins can see everything
      return {};

    case 'ORGANIZATION':
      // Organizations can only see their own resources
      return {
        organization: {
          userId,
        },
      };

    case 'VOLUNTEER':
      // Volunteers can only see their own applications and public tasks
      return {}; // Will be handled by application-level queries

    default:
      return { organization: { userId } }; // Default: user's own organization
  }
}

/**
 * Middleware to enforce row-level security on list queries
 */
export const enforceRowLevelSecurity = (
  req: AuthorizedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.userId || !req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
      return;
    }

    // Store security filter in request for later use
    (req as any).securityFilter = buildSecurityFilter(req.userId, req.user.role);
    (req as any).userId = req.userId;
    (req as any).userRole = req.user.role;

    next();
  } catch (error) {
    console.error('Row-level security enforcement error:', error);
    res.status(500).json({
      error: 'AUTHORIZATION_ERROR',
      message: 'Failed to enforce security',
    });
  }
};

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Middleware to log authorization events
 */
export const logAuthorizationEvent = async (
  req: AuthorizedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // This will be called after successful authorization
    // Actual logging happens in route handlers
    next();
  } catch (error) {
    console.error('Authorization logging error:', error);
    next();
  }
};
