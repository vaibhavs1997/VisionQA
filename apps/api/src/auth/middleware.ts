import { FastifyRequest, FastifyReply } from "fastify";
import { Pool } from "pg";
import { getUserById, getMembership, WorkspaceRole } from "@ui-quality/database";
import { verifySessionToken } from "./session";
import { getMongoUserById } from "./mongo-user-repository";

declare module "fastify" {
  interface FastifyRequest {
    user?: { id: string };
  }
}

function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

/**
 * Verifies the session token and attaches `request.user`. Every
 * workspace-scoped route needs this PLUS `requireWorkspaceMembership` —
 * being logged in and belonging to the specific workspace in the URL are
 * two separate checks, and conflating them is exactly how tenant-
 * isolation bugs happen (a valid user token alone must never be
 * sufficient to read another workspace's data).
 */
export function requireAuth(pool: Pool) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractBearerToken(request);
    if (!token) {
      return reply.code(401).send({ error: "unauthorized", message: "Missing bearer token." });
    }
    const claims = verifySessionToken(token);
    if (!claims) {
      return reply.code(401).send({ error: "unauthorized", message: "Invalid or expired session." });
    }
    const user = await getUserById(pool, claims.userId);
    if (!user) {
      return reply.code(401).send({ error: "unauthorized", message: "User no longer exists." });
    }
    request.user = { id: user.id };
  };
}

export function requireMongoAuth() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractBearerToken(request);
    if (!token) return reply.code(401).send({ error: "unauthorized", message: "Missing bearer token." });
    const claims = verifySessionToken(token);
    if (!claims) return reply.code(401).send({ error: "unauthorized", message: "Invalid or expired session." });
    const user = await getMongoUserById(claims.userId);
    if (!user || !user.isActive) return reply.code(401).send({ error: "unauthorized", message: "User no longer exists." });
    request.user = { id: user.id };
  };
}

/**
 * The core tenant-isolation enforcement point (see also
 * workspaces.repo.ts's getMembership doc comment). Reads `workspaceId`
 * from the route params — every route that touches workspace-scoped
 * data must declare this param and use this guard before doing anything
 * else, no exceptions.
 */
export function requireWorkspaceMembership(pool: Pool, minRole: WorkspaceRole = "member") {
  const roleRank: Record<WorkspaceRole, number> = { member: 0, admin: 1, owner: 2 };

  return async (request: FastifyRequest<{ Params: { workspaceId?: string } }>, reply: FastifyReply) => {
    if (!request.user) {
      // requireAuth must run first — this is a programming error if hit,
      // not a client error, but fail safe (deny) either way.
      return reply.code(401).send({ error: "unauthorized" });
    }
    const workspaceId = request.params.workspaceId;
    if (!workspaceId) {
      return reply.code(400).send({ error: "invalid_request", message: "workspaceId is required." });
    }
    const membership = await getMembership(pool, workspaceId, request.user.id);
    if (!membership) {
      // Deliberately 404, not 403 — per common tenant-isolation practice,
      // confirming "this workspace exists but you can't access it" leaks
      // information a 404 doesn't.
      return reply.code(404).send({ error: "not_found" });
    }
    if (roleRank[membership.role] < roleRank[minRole]) {
      return reply.code(403).send({ error: "forbidden", message: `Requires ${minRole} role or higher.` });
    }
  };
}
