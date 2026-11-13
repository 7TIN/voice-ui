import { GoogleGenAI } from "@google/genai"

export type GeminiIntent =
  | "set_title"
  | "set_body"
  | "set_community"
  | "set_visibility"
  | "toggle_comments_on"
  | "toggle_comments_off"
  | "publish"
  | "preview"
  | "clear_title"
  | "clear_body"
  | "unknown"

export type GeminiDecision = {
  intent: GeminiIntent
  confidence: number
}

const INTENTS: GeminiIntent[] = [
  "set_title",
  "set_body",
  "set_community",
  "set_visibility",
  "toggle_comments_on",
  "toggle_comments_off",
  "publish",
  "preview",
  "clear_title",
  "clear_body",
  "unknown",
]

const CRITERIA: Record<GeminiIntent, string> = {
  set_title: "User wants to set, change, or write the post title.",
  set_body: "User wants to set, change, or write the post body or content.",
  set_community: "User wants to change or choose the community.",
  set_visibility: "User wants to change who can see the post (audience/visibility).",
  toggle_comments_on: "User wants to enable, allow, or turn on comments.",
  toggle_comments_off: "User wants to disable, block, or turn off comments.",
  publish: "User wants to publish or submit the post.",
  preview: "User wants to preview the post.",
  clear_title: "User wants to clear or delete the title.",
  clear_body: "User wants to clear or delete the body.",
  unknown: "The transcript doesn't match any known command.",
}

/**
 * Classify a transcript into an intent using the Gemini Decisions API.
 * Returns null if the API call fails (caller should fall back to grammar).
 */
export async function classifyIntent(
  transcript: string,
  apiKey: string,
): Promise<GeminiDecision | null> {
  try {
    const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" })
    const result = await ai.decisions.create({
      model: "gemini-decision-1",
      input: transcript,
      questions: {
        intent: {
          type: "choice",
          instructions:
            "Classify the user's spoken command into exactly one of the available intents. If the transcript is not a recognizable command, choose unknown.",
          criteria: CRITERIA,
        },
      },
    })

    const answer = result.answers?.intent
    if (answer?.type === "choice") {
      const intent = INTENTS.includes(answer.choice as GeminiIntent)
        ? (answer.choice as GeminiIntent)
        : "unknown"
      return { intent, confidence: answer.confidence ?? 0 }
    }
    return null
  } catch {
    return null
  }
}
