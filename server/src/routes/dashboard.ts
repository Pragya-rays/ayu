import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { CaseStore } from "../cases/store.js";
import type { DispatchSimulator } from "../dispatch/simulator.js";
import { RateLimiter } from "./rateLimit.js";

const COOKIE = "ayu_dashboard";
const HEARTBEAT_MS = 20_000;
const SESSION_SECONDS = 12 * 60 * 60;

const sha256 = (value: string) => createHash("sha256").update(value).digest();

function readCookie(header: string | undefined, name: string) {
  for (const part of (header ?? "").split(";")) {
    const [key, value] = part.trim().split("=");
    if (key === name) return value;
  }
  return undefined;
}

export function registerDashboardRoutes(
  app: FastifyInstance,
  cases: CaseStore,
  dispatch: DispatchSimulator,
  options: { secret: string; secureCookies: boolean },
) {
  const token = createHmac("sha256", options.secret).update("dashboard-session").digest("hex");
  const loginLimiter = new RateLimiter(10, 60_000);

  const requireDashboard = async (request: FastifyRequest, reply: FastifyReply) => {
    if (readCookie(request.headers.cookie, COOKIE) !== token) return reply.code(401).send({ error: "unauthorized" });
  };

  app.post<{ Body: { secret: string } }>("/api/dashboard/login", {
    schema: { body: { type: "object", required: ["secret"], properties: { secret: { type: "string", maxLength: 200 } } } },
  }, async (request, reply) => {
    if (!loginLimiter.allow(request.ip)) return reply.code(429).send({ error: "too_many_requests" });
    if (!timingSafeEqual(sha256(request.body.secret), sha256(options.secret))) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const secure = options.secureCookies ? "; Secure" : "";
    reply.header("set-cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${secure}`);
    return { ok: true };
  });

  app.get("/api/cases", { preHandler: requireDashboard }, async () => cases.list());

  app.get<{ Params: { id: string } }>("/api/cases/:id", { preHandler: requireDashboard }, async (request, reply) => {
    const item = cases.get(request.params.id);
    if (!item) return reply.code(404).send({ error: "not_found" });
    return { ...item, timeline: cases.eventsFor(item.id) };
  });

  app.post<{ Params: { id: string }; Body: { ambulanceId?: string } }>("/api/cases/:id/accept", {
    preHandler: requireDashboard,
    schema: { body: { type: "object", additionalProperties: false, properties: { ambulanceId: { type: "string", maxLength: 40 } } } },
  }, async (request, reply) => {
    const accepted = dispatch.accept(request.params.id, request.body?.ambulanceId);
    return accepted ? accepted : reply.code(404).send({ error: "not_found" });
  });

  app.post<{ Params: { id: string }; Body: { status: "en_route" | "arrived" } }>("/api/cases/:id/status", {
    preHandler: requireDashboard,
    schema: {
      body: {
        type: "object",
        required: ["status"],
        additionalProperties: false,
        properties: { status: { enum: ["en_route", "arrived"] } },
      },
    },
  }, async (request, reply) => {
    const updated = dispatch.setStatus(request.params.id, request.body.status);
    return updated ? updated : reply.code(404).send({ error: "not_found" });
  });

  app.get("/api/cases/stream", { preHandler: requireDashboard }, (request, reply) => {
    reply.hijack();
    const stream = reply.raw;
    stream.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const write = (event: string, data: unknown) => stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    write("snapshot", cases.list());
    const unsubscribe = cases.subscribe((updated) => write("case", updated));
    const unsubscribeTimeline = cases.subscribeTimeline((caseId) => write("timeline", { caseId }));
    const heartbeat = setInterval(() => stream.write(": ping\n\n"), HEARTBEAT_MS);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      unsubscribeTimeline();
    });
  });
}
