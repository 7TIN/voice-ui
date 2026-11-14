import { GoogleGenAI } from "@google/genai"
import { describePrimitives } from "./primitives"

export type GeminiDecision = {
  intent: string
  confidence: number
}

/**
 * Everything the classifier needs about one example. `ExampleVoice` satisfies
 * this shape structurally, so the interpreter can pass its spec straight in.
 */
export type DecisionSpec = {
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

/**
 * Classify a transcript into an intent using the Gemini Decisions API.
 * Returns null if the API call fails (caller should fall back to grammar).
 */
export async function classifyIntent(
  transcript: string,
  apiKey: string,
  context: string | undefined,
  spec: DecisionSpec,
): Promise<GeminiDecision | null> {
  try {
    const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" })

    const criteria: Record<string, string> = {}
    for (const intent of spec.intents) criteria[intent.intent] = intent.criteria
    criteria.unknown = spec.unknown

    const intentNames = Object.keys(criteria)

    const input = [
      "App: " + spec.app,
      "Controls visible now:",
      context || "- (none reported)",
      "",
      "Primitive behaviour on this page:",
      describePrimitives(spec.primitives),
      "",
      'User said: "' + transcript + '"',
    ].join("\n")

    const result = await ai.decisions.create({
      model: "gemini-decision-1",
      input,
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

    const intent =
      answer?.type === "choice" && intentNames.includes(answer.choice)
        ? answer.choice
        : "unknown"
    const confidence = (answer?.type === "choice" ? answer.confidence : undefined) ?? 0

    // A strong specific intent outranks a cautious "not a command" verdict,
    // but only when the utterance actually talks about the page. This rescues
    // fragments such as "Visibility to followers." while leaving page text like
    // "2 followers." alone.
    const scopeScore = scope?.type === "noul" ? (scope.noul ?? 1) : 1
    if (
      scopeScore < 0.5 &&
      !(
        intent !== "unknown" &&
        confidence >= 0.75 &&
        spec.actionable.test(transcript)
      )
    ) {
      return {
        intent: "unknown",
        confidence: Math.max(scopeScore, scope?.confidence ?? 0),
      }
    }

    return { intent, confidence }
  } catch {
    return null
  }
}
