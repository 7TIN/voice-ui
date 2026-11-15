export type GeminiDecision = {
  intent: string
  confidence: number
}

export type DecisionSpec = {
  id: string
  app: string
  instructions: string[]
  intents: { intent: string; criteria: string }[]
  unknown: string
  scope: {
    instructions: string
    trueDescription: string
    falseDescription: string
  }
  actionable: RegExp
  primitives: string[]
}

export async function classifyIntent(
  transcript: string,
  context: string | undefined,
  spec: DecisionSpec,
): Promise<GeminiDecision | null> {
  try {
    const response = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        voiceId: spec.id,
        transcript,
        context,
      }),
    })
    if (!response.ok) return null

    const result = (await response.json()) as Partial<GeminiDecision>
    if (
      typeof result.intent !== "string" ||
      typeof result.confidence !== "number" ||
      !Number.isFinite(result.confidence)
    ) {
      return null
    }
    return { intent: result.intent, confidence: result.confidence }
  } catch {
    return null
  }
}
