import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';

export type AppRole = 'PLATFORM_ADMIN' | 'ORGANIZATION' | 'VOLUNTEER';
export type AuthContext = { subject: string; roles: AppRole[] };

declare module 'fastify' { interface FastifyRequest { auth: AuthContext } }

let verifier: ReturnType<typeof createRemoteJWKSet> | undefined;

function config() {
  const issuer = process.env.AUTH_ISSUER?.trim();
  const audience = process.env.AUTH_AUDIENCE?.trim();
  const jwksUri = process.env.AUTH_JWKS_URI?.trim();
  if (!issuer || !audience || !jwksUri) throw new Error('AUTH_ISSUER, AUTH_AUDIENCE and AUTH_JWKS_URI are required');
  verifier ??= createRemoteJWKSet(new URL(jwksUri), { cooldownDuration: 30_000, timeoutDuration: 5_000 });
  return { issuer, audience, verifier };
}

function normalizeRoles(value: unknown): AppRole[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return raw.flatMap((role): AppRole[] => {
    if (role === 'PLATFORM_ADMIN' || role === 'ADMIN') return ['PLATFORM_ADMIN'];
    if (role === 'ORGANIZATION' || role === 'VOLUNTEER') return [role];
    return [];
  });
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  if (!request.url.startsWith('/api/')) return;
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '');
  if (!match) return reply.status(401).send({ error: 'authentication_required' });
  try {
    const { issuer, audience, verifier: jwks } = config();
    const { payload } = await jwtVerify(match[1], jwks, { issuer, audience, algorithms: ['RS256', 'ES256'], clockTolerance: 5, maxTokenAge: '1h' });
    if (!payload.sub) throw new Error('missing subject');
    const roles = normalizeRoles(payload.roles ?? payload.role);
    if (roles.length === 0) throw new Error('missing application role');
    request.auth = { subject: payload.sub, roles };
  } catch (error) {
    request.log.warn({ err: error }, 'JWT validation failed');
    return reply.status(401).send({ error: 'invalid_token' });
  }
}

export function hasRole(request: FastifyRequest, ...roles: AppRole[]) { return request.auth.roles.some((role) => roles.includes(role)); }
export function requireRole(request: FastifyRequest, reply: FastifyReply, ...roles: AppRole[]) {
  if (hasRole(request, ...roles)) return true;
  reply.status(403).send({ error: 'forbidden' });
  return false;
}
