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
  set_title:
    "User wants to set, change, write, or rename the post title. " +
    "Examples: 'set the title to hello', 'change title to my post', 'title is hello world', " +
    "'write a title about my project', 'make the title hello', 'title hello', " +
    "'rename title to something'. " +
    "STT mishearings: 'set the title to' with the value dropped, 'set title too', 'settle title'.",
  set_body:
    "User wants to set, change, write, or replace the post body or content. " +
    "Examples: 'write the body with hello', 'set body to my text', 'body is hello world', " +
    "'change the content to something', 'draft the body', 'fill in the body', " +
    "'post body hello', 'add body text'. " +
    "STT mishearings: 'write the body with' with value dropped, 'set body to'.",
  set_community:
    "User wants to change, choose, or pick the community/category for the post. " +
    "Examples: 'choose community Design', 'switch community to Engineering', " +
    "'post in AI and ML', 'put it in Product', 'change community to General', " +
    "'move to Design community', 'community Design'. " +
    "STT mishearings: 'switch community to' with value dropped, 'choose community'. " +
    "Available communities: AI and ML, Design, Engineering, Product, General.",
  set_visibility:
    "User wants to change who can see the post (audience/visibility). " +
    "Examples: 'set visibility to Everyone', 'who can see this Followers', " +
    "'change audience to Only me', 'make it public', 'set to followers only', " +
    "'visibility Everyone', 'audience Only me'. " +
    "STT mishearings: 'change who can see these two followers', 'who can see this'. " +
    "Available options: Everyone (anyone on Murmur), Followers (people who follow you), Only me (just your eyes).",
  toggle_comments_on:
    "User wants to enable, allow, turn on, or start comments. " +
    "Examples: 'turn comments on', 'enable comments', 'allow comments', " +
    "'start comments', 'comments on', 'open comments', " +
    "'turn on comments', 'switch comments on'. " +
    "STT mishearings: 'don't allow comments' is the OPPOSITE (toggle_comments_off).",
  toggle_comments_off:
    "User wants to disable, block, turn off, or stop comments. " +
    "Examples: 'turn comments off', 'disable comments', 'block comments', " +
    "'stop comments', 'comments off', 'close comments', 'turn off comments', " +
    "'don't allow comments', 'no comments', 'comments disabled'. " +
    "STT mishearings: 'don't allow comments', 'turn comments of', 'comments of'.",
  publish:
    "User wants to publish, submit, send, or post the draft. " +
    "Examples: 'publish', 'publish the post', 'publish it', 'submit', " +
    "'send the post', 'post it', 'publish my post', 'go live', " +
    "'publish now'. " +
    "STT mishearings: 'publish the post', 'pub lish'.",
  preview:
    "User wants to preview, show, or review the post before publishing. " +
    "Examples: 'preview', 'preview the post', 'show preview', 'show the post', " +
    "'open preview', 'preview it', 'review post', 'see preview', " +
    "'show me the preview', 'preview my post'. " +
    "STT mishearings: 'review post', 'prev you', 'preview the post'.",
  clear_title:
    "User wants to clear, delete, or remove the title text. " +
    "Examples: 'clear the title', 'delete title', 'remove title', " +
    "'clear title', 'erase title', 'empty the title'.",
  clear_body:
    "User wants to clear, delete, or remove the body text. " +
    "Examples: 'clear the body', 'delete body', 'remove body', " +
    "'clear body', 'erase body', 'empty the body'.",
  unknown:
    "The transcript is not a recognizable command, is incomplete, or is garbled. " +
    "Examples: random words, page content read aloud, incomplete commands like " +
    "'switch community to' with no value, questions like 'who can see this', " +
    "or statements that don't match any of the above intents.",
}

/**
 * Classify a transcript into an intent using the Gemini Decisions API.
 * Returns null if the API call fails (caller should fall back to grammar).
 */
export async function classifyIntent(
  transcript: string,
  apiKey: string,
  availableControls?: string,
): Promise<GeminiDecision | null> {
  try {
    const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" })

    const input = availableControls
      ? "User said: \"" + transcript + "\"\n\nAvailable controls on the page: " + availableControls
      : transcript

    const result = await ai.decisions.create({
      model: "gemini-decision-1",
      input: input,
      questions: {
        is_command: {
          type: "noul",
          instructions:
            "Is this transcript a recognizable voice command for a post composer? " +
            "It should be an instruction to set, change, clear, publish, or preview something. " +
            "Random words, questions about the page, or incomplete fragments are not commands.",
          criteria: {
            true_description: "The transcript is a clear command to perform an action on the post.",
            false_description: "The transcript is random words, a question, page content read aloud, or an incomplete fragment.",
          },
        },
        intent: {
          type: "choice",
          instructions:
            "You are a voice command classifier for a social media post composer. " +
            "The user spoke a command. Classify it into exactly one intent. " +
            "Consider that speech-to-text may have misheard words: " +
            "'review' could mean 'preview', 'of' could mean 'off', " +
            "'too' could mean 'to', 'these' could mean 'this', " +
            "'don't' could mean 'disable' or 'don't allow'. " +
            "If the transcript is incomplete, garbled, or doesn't match any command, choose unknown.",
          criteria: CRITERIA,
        },
      },
    })

    const isCmd = result.answers?.is_command
    const intentAnswer = result.answers?.intent

    if (isCmd?.type === "noul" && (isCmd.noul ?? 0) < 0.5) {
      return { intent: "unknown", confidence: isCmd.confidence ?? 0 }
    }

    if (intentAnswer?.type === "choice") {
      const intent = INTENTS.includes(intentAnswer.choice as GeminiIntent)
        ? (intentAnswer.choice as GeminiIntent)
        : "unknown"
      return { intent, confidence: intentAnswer.confidence ?? 0 }
    }
    return null
  } catch {
    return null
  }
}