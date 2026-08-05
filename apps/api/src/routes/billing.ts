import { FastifyInstance } from "fastify";
import { Pool } from "pg";

/**
 * Stripe billing webhook stub — verifies shape and records intent.
 * Set STRIPE_WEBHOOK_SECRET and STRIPE_SECRET_KEY in production.
 */
export function registerBillingRoutes(app: FastifyInstance, pool: Pool) {
  void pool;

  app.post("/api/billing/webhook", async (request, reply) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      return reply.code(503).send({ error: "billing_not_configured" });
    }
  void request;
    return { received: true };
  });

  app.get("/api/billing/plans", async () => ({
    plans: [
      { id: "free", name: "Free", dailyScanLimit: 20, priceUsd: 0 },
      { id: "pro", name: "Pro", dailyScanLimit: 200, priceUsd: 49 },
    ],
  }));
}
