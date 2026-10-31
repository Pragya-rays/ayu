import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Lang } from "../types/voice.js";
import { RateLimiter } from "./rateLimit.js";

const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_ACTIVE = 20;

/** Normal mode keeps no case or record. A session id only grants one short voice session. */
export class NormalSessions {
  private readonly ids = new Set<string>();

  create() {
    if (this.ids.size >= MAX_ACTIVE) return null;
    const id = randomUUID();
    this.ids.add(id);
    setTimeout(() => this.ids.delete(id), SESSION_TTL_MS).unref();
    return id;
  }

  has(id: string) {
    return this.ids.has(id);
  }
}

export function registerNormalRoutes(app: FastifyInstance, sessions: NormalSessions) {
  const limiter = new RateLimiter(10, 60_000);

  app.post<{ Body: { lang: Lang; consent: boolean } }>("/api/normal/session", {
    schema: {
      body: {
        type: "object",
        required: ["lang", "consent"],
        additionalProperties: false,
        properties: { lang: { enum: ["hi", "hinglish", "en"] }, consent: { type: "boolean" } },
      },
    },
  }, async (request, reply) => {
    if (!request.body.consent) return reply.code(400).send({ error: "consent_required" });
    const sessionId = limiter.allow(request.ip) ? sessions.create() : null;
    if (!sessionId) return reply.code(429).send({ error: "too_many_requests" });
    return reply.code(201).send({ sessionId });
  });
}
