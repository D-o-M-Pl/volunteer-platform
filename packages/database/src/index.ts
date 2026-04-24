import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

export function getDb(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
    });
  }
  return prisma;
}

export { PrismaClient } from '@prisma/client';
export type { Volunteer, Organization, Task, Application, OutboxEvent } from '@prisma/client';
