import { existsSync } from "node:fs";
import { resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { NoLLM } from "./adapters/llm.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerSosRoutes } from "./routes/sos.js";
import { registerVoiceGateway, type VoiceGatewayDeps } from "./voice/gateway.js";

export interface AppDeps extends VoiceGatewayDeps {
  dashboardSecret: string;
  production: boolean;
}

export async function buildApp(deps: AppDeps) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    trustProxy: deps.production,
  });
  await app.register(fastifyWebsocket, { options: { maxPayload: 64 * 1024 } });

  const llm = deps.llm instanceof NoLLM ? "rules" : "gemini";
  app.get("/api/health", async () => ({ ok: true, voiceMode: deps.voiceMode, voiceLab: deps.voiceLab, llm }));
  registerVoiceGateway(app, deps);
  registerSosRoutes(app, deps.cases);
  registerDashboardRoutes(app, deps.cases, { secret: deps.dashboardSecret, secureCookies: deps.production });

  const webDist = resolve(import.meta.dirname, "../../apps/web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((request, reply) => {
      const isPage = request.method === "GET" && !request.url.startsWith("/api") && !request.url.startsWith("/ws");
      return isPage ? reply.sendFile("index.html") : reply.code(404).send({ error: "not_found" });
    });
  }

  return app;
}
