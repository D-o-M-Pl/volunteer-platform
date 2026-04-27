import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

export function getDb(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }
  return prisma;
}

export { PrismaClient } from '@prisma/client';
export type {
  Volunteer,
  Organization,
  Task,
  Application,
  OutboxEvent,
  User,
  LoginToken,
  AuditLog,
  DataDeletionRequest,
  UserRole,
  AuditActionType,
  DataDeletionStatus,
} from '@prisma/client';

// Security utilities
export * from './auth';
