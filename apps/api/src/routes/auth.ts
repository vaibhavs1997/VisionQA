import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Pool } from "pg";
import { createUser, findUserByEmail, getUserById } from "@ui-quality/database";
import { hashPassword, verifyPassword } from "../auth/password";
import { issueSessionToken } from "../auth/session";
import { requireAuth, requireMongoAuth } from "../auth/middleware";
import { createMongoUser, findMongoUserByEmail, getMongoUserById, verifyMongoPassword } from "../auth/mongo-user-repository";
import { checkRateLimit } from "../services/rate-limiter";

const registerSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const mongoRegisterSchema = registerSchema.extend({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});

export function registerAuthRoutes(app: FastifyInstance, pool: Pool) {
  app.post("/api/auth/register", async (request, reply) => {
    const rateLimitResult = await checkRateLimit(request.ip, "auth_register");
    if (!rateLimitResult.allowed) {
      return reply.code(429).send({ error: "rate_limited", retryAfterMs: rateLimitResult.retryAfterMs });
    }

    const parsed = (process.env.AUTH_STORE ?? "postgres") === "mongo"
      ? mongoRegisterSchema.safeParse(request.body)
      : registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    if ((process.env.AUTH_STORE ?? "postgres") === "mongo") {
      const input = parsed.data as z.infer<typeof mongoRegisterSchema>;
      const existing = await findMongoUserByEmail(input.email);
      if (existing) return reply.code(409).send({ error: "email_already_registered" });
      const user = await createMongoUser(input);
      const token = issueSessionToken({ userId: user.id });
      return reply.code(201).send({ token, user: { id: user.id, email: user.id, firstName: user.firstName, lastName: user.lastName } });
    }

    const existing = await findUserByEmail(pool, parsed.data.email);
    if (existing) {
      // Deliberately generic — confirming an email is already registered
      // is a (minor) user-enumeration leak; not worth the UX tradeoff to
      // fully hide it for this project's scope, but the message itself
      // stays neutral rather than "that email is taken."
      return reply.code(409).send({ error: "email_already_registered" });
    }

    const { hash, salt } = await hashPassword(parsed.data.password);
    const user = await createUser(pool, { email: parsed.data.email, passwordHash: hash, passwordSalt: salt });
    const token = issueSessionToken({ userId: user.id });

    return reply.code(201).send({ token, user: { id: user.id, email: user.email } });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const rateLimitResult = await checkRateLimit(request.ip, "auth_login");
    if (!rateLimitResult.allowed) {
      return reply.code(429).send({ error: "rate_limited", retryAfterMs: rateLimitResult.retryAfterMs });
    }

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    if ((process.env.AUTH_STORE ?? "postgres") === "mongo") {
      const user = await findMongoUserByEmail(parsed.data.email);
      const invalidCredentials = () => reply.code(401).send({ error: "invalid_credentials" });
      if (!user || !user.isActive || !(await verifyMongoPassword(parsed.data.password, user.password))) return invalidCredentials();
      const token = issueSessionToken({ userId: user.id });
      return reply.send({ token, user: { id: user.id, email: user.id, firstName: user.firstName, lastName: user.lastName } });
    }

    const user = await findUserByEmail(pool, parsed.data.email);
    // Deliberately identical error for "no such user" and "wrong
    // password" — distinguishing them tells an attacker which emails
    // are registered.
    const invalidCredentials = () => reply.code(401).send({ error: "invalid_credentials" });
    if (!user) return invalidCredentials();

    const valid = await verifyPassword(parsed.data.password, user.passwordHash, user.passwordSalt);
    if (!valid) return invalidCredentials();

    const token = issueSessionToken({ userId: user.id });
    return reply.send({ token, user: { id: user.id, email: user.email } });
  });

  app.get("/api/auth/me", { preHandler: (process.env.AUTH_STORE ?? "postgres") === "mongo" ? requireMongoAuth() : requireAuth(pool) }, async (request, reply) => {
    if ((process.env.AUTH_STORE ?? "postgres") === "mongo") {
      const user = await getMongoUserById(request.user!.id);
      if (!user || !user.isActive) return reply.code(401).send({ error: "unauthorized" });
      return { id: user.id, email: user.id, firstName: user.firstName, lastName: user.lastName, tenantId: user.tenantId };
    }
    const user = await getUserById(pool, request.user!.id);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    return { id: user.id, email: user.email };
  });
}
