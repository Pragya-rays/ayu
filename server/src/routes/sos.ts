import type { FastifyInstance } from "fastify";
import type { AddressLookup } from "../cases/addresses.js";
import type { CaseStore } from "../cases/store.js";
import type { DispatchSimulator } from "../dispatch/simulator.js";
import type { Case } from "../types/case.js";
import type { Lang } from "../types/voice.js";
import { RateLimiter } from "./rateLimit.js";

const MAX_ACTIVE_CASES = 20;

const coordinates = {
  lat: { type: "number", minimum: -90, maximum: 90 },
  lng: { type: "number", minimum: -180, maximum: 180 },
  accuracyM: { type: "number", minimum: 0 },
} as const;

const medicalField = { type: "string", maxLength: 200 } as const;

interface StartBody {
  lang: Lang;
  consent: boolean;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  medicalId?: Case["medicalId"];
}

export function registerSosRoutes(
  app: FastifyInstance,
  deps: { cases: CaseStore; dispatch: DispatchSimulator; addresses: AddressLookup },
) {
  const { cases, dispatch, addresses } = deps;
  const startLimiter = new RateLimiter(10, 60_000);

  app.post<{ Body: StartBody }>("/api/sos/start", {
    schema: {
      body: {
        type: "object",
        required: ["lang", "consent"],
        additionalProperties: false,
        properties: {
          lang: { enum: ["hi", "hinglish", "en"] },
          consent: { type: "boolean" },
          ...coordinates,
          medicalId: {
            type: "object",
            additionalProperties: false,
            properties: { allergies: medicalField, conditions: medicalField, medicines: medicalField },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { lang, consent, lat, lng, accuracyM, medicalId } = request.body;
    if (!consent) return reply.code(400).send({ error: "consent_required" });
    if (!startLimiter.allow(request.ip) || cases.activeCount() >= MAX_ACTIVE_CASES) {
      return reply.code(429).send({ error: "too_many_requests" });
    }
    const location = lat !== undefined && lng !== undefined ? { lat, lng, accuracyM: accuracyM ?? 0 } : undefined;
    const created = cases.create({ lang, location, medicalId });
    dispatch.track(created.id);
    addresses.start(created.id);
    return reply.code(201).send({ caseId: created.id });
  });

  app.post<{ Params: { id: string }; Body: { lat: number; lng: number; accuracyM: number } }>("/api/sos/:id/location", {
    schema: {
      body: { type: "object", required: ["lat", "lng", "accuracyM"], additionalProperties: false, properties: coordinates },
    },
  }, async (request, reply) => {
    const updated = cases.setLocation(request.params.id, request.body);
    if (!updated) return reply.code(404).send({ error: "not_found" });
    addresses.start(updated.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/sos/:id/cancel", async (request, reply) => {
    const updated = cases.cancel(request.params.id);
    return updated ? { ok: true } : reply.code(404).send({ error: "not_found" });
  });
}
