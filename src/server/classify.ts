import { GoogleGenAI } from "@google/genai"
import type { DecisionSpec } from "../agent/gemini.ts"
import { describePrimitives } from "../agent/primitives.ts"
import type { ExampleVoice } from "../examples/types"
import { composeVoice } from "../examples/compose/voice.ts"
import { galleryVoice } from "../examples/gallery/voice.ts"
import { timelineVoice } from "../examples/timeline/voice.ts"

const voiceSpecs: Record<string, ExampleVoice> = {
  gallery: galleryVoice,
  compose: composeVoice,
  timeline: timelineVoice,
}

const MAX_BODY_BYTES = 32_000
const MAX_CONTEXT_CHARS = 20_000
const MAX_TRANSCRIPT_CHARS = 1_000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_REQUESTS = 60
const requestsByClient = new Map<string, { startedAt: number; count: number }>()

type ClassifierResult = {
  status: number
  body: Record<string, string | number>
}

function json(status: number, body: ClassifierResult["body"]): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function allowRequest(clientId: string) {
  const now = Date.now()
  if (requestsByClient.size > 2_000) {
    for (const [key, value] of requestsByClient) {
      if (now - value.startedAt >= RATE_LIMIT_WINDOW_MS) requestsByClient.delete(key)
    }
  }
  const existing = requestsByClient.get(clientId)
  if (!existing || now - existing.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestsByClient.set(clientId, { startedAt: now, count: 1 })
    return true
  }
  if (existing.count >= RATE_LIMIT_REQUESTS) return false
  existing.count += 1
  return true
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

function validSpec(value: ExampleVoice): value is ExampleVoice & DecisionSpec {
  return Boolean(
    value &&
      value.id &&
      value.app &&
      Array.isArray(value.instructions) &&
      Array.isArray(value.intents) &&
      value.scope &&
      value.actionable instanceof RegExp &&
      Array.isArray(value.primitives),
  )
}

async function readRequestBody(request: Request) {
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new RangeError("Request too large")
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function createInput(
  transcript: string,
  context: string,
  spec: DecisionSpec,
) {
  const criteria: Record<string, string> = {}
  for (const intent of spec.intents) criteria[intent.intent] = intent.criteria
  criteria.unknown = spec.unknown

  return [
    "App: " + spec.app,
    "Controls visible now:",
    context || "- (none reported)",
    "",
    "Primitive behaviour on this page:",
    describePrimitives(spec.primitives),
    "",
    'User said: "' + transcript + '"',
  ].join("\n")
}

async function decide(
  transcript: string,
  context: string,
  spec: DecisionSpec,
  apiKey: string,
) {
  const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" })
  const criteria: Record<string, string> = {}
  for (const intent of spec.intents) criteria[intent.intent] = intent.criteria
  criteria.unknown = spec.unknown

  const result = await ai.decisions.create({
    model: "gemini-decision-1",
    input: createInput(transcript, context, spec),
    questions: {
      is_command: {
        type: "noul",
        instructions: spec.scope.instructions,
        criteria: {
          true_description: spec.scope.trueDescription,
          false_description: spec.scope.falseDescription,
        },
      },
      intent: {
        type: "choice",
        instructions: spec.instructions.join("\n"),
        criteria,
      },
    },
  })

  const scope = result.answers?.is_command
  const answer = result.answers?.intent
  const intentNames = Object.keys(criteria)
  const intent =
    answer?.type === "choice" && intentNames.includes(answer.choice)
      ? answer.choice
      : "unknown"
  const confidence =
    (answer?.type === "choice" ? answer.confidence : undefined) ?? 0
  const scopeScore = scope?.type === "noul" ? (scope.noul ?? 1) : 1

  if (
    scopeScore < 0.5 &&
    !(intent !== "unknown" && confidence >= 0.75 && spec.actionable.test(transcript))
  ) {
    return {
      intent: "unknown",
      confidence: Math.max(scopeScore, scope?.confidence ?? 0),
    }
  }
  return { intent, confidence }
}

export async function handleClassifierRequest(
  request: Request,
  apiKey = process.env.GEMINI_API_KEY,
  clientId = "unknown",
): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" })
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json(415, { error: "Expected application/json" })
  }
  if (!validOrigin(request)) {
    return json(403, { error: "Request origin not allowed" })
  }
  if (!allowRequest(clientId)) {
    return json(429, { error: "Too many classifier requests" })
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json(413, { error: "Request too large" })
  }

  let payload: unknown
  try {
    payload = JSON.parse(await readRequestBody(request))
  } catch (error) {
    if (error instanceof RangeError) {
      return json(413, { error: "Request too large" })
    }
    return json(400, { error: "Invalid JSON body" })
  }

  if (!payload || typeof payload !== "object") {
    return json(400, { error: "Invalid request body" })
  }
  const body = payload as Record<string, unknown>
  if (
    typeof body.voiceId !== "string" ||
    typeof body.transcript !== "string" ||
    body.transcript.trim().length === 0 ||
    body.transcript.length > MAX_TRANSCRIPT_CHARS ||
    (body.context !== undefined && typeof body.context !== "string") ||
    (typeof body.context === "string" && body.context.length > MAX_CONTEXT_CHARS)
  ) {
    return json(400, { error: "Invalid classifier input" })
  }

  const voice = voiceSpecs[body.voiceId]
  if (!voice || !validSpec(voice)) {
    return json(400, { error: "Unknown voice example" })
  }
  if (!apiKey) {
    return json(503, { error: "Classifier is not configured" })
  }

  try {
    const decision = await decide(
      body.transcript,
      typeof body.context === "string" ? body.context : "",
      voice,
      apiKey,
    )
    return json(200, decision)
  } catch {
    console.error("Gemini classifier request failed")
    return json(502, { error: "Classifier request failed" })
  }
}
