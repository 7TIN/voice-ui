import type { AgentComponent } from "@ui-sdk/react/agent"
import type { Interpreted, Plan } from "../agent/plan"

/**
 * One phrase-shape the deterministic grammar understands. A rule either builds
 * an answer or returns null, which means "this looked like my shape but the
 * value was not real; keep looking".
 */
export type VoiceRule = {
  pattern: RegExp
  build: (
    match: RegExpMatchArray,
    snapshot: AgentComponent[],
  ) => Interpreted | null
}

/** One label the classifier may choose, with the wording that teaches it. */
export type VoiceIntent = {
  intent: string
  criteria: string
}

/** How an example turns a long spoken field into ui-sdk steps. */
export type DictationSpec = {
  /** A short noun for status lines: "title", "body", "reply". */
  noun: (target: string) => string
  /** A capitalised noun for result lines: "Title set.", "Reply set." */
  label: (target: string) => string
  /** The waiting message, matching whether the person is speaking or typing. */
  prompt: (target: string, source: "voice" | "typed") => string
  /** Write the accumulated content into the target control. */
  contentPlan: (target: string, text: string) => Plan
}

/**
 * Everything the voice pipeline needs to understand one example. The grammar,
 * the classifier prompt, the dictation state machine and the suggestion line
 * are all read from this object, so switching examples switches the whole
 * language of the page without switching the executor.
 */
export type ExampleVoice = {
  /** A stable id, used to reset a voice session when the example changes. */
  id: string
  /** What the Decisions API is looking at, such as "Murmur, a social timeline". */
  app: string
  /** The fallback help line shown after an unknown command. */
  hint: string
  /** Natural commands offered in the pill before anyone speaks. */
  suggestions: string[]
  /** The deterministic rules, tried in order. */
  rules: VoiceRule[]
  /** Every intent the classifier may return, except unknown. */
  intents: VoiceIntent[]
  /** The criteria for the unknown intent. */
  unknown: string
  /** Example-specific rules appended to the classifier instructions. */
  instructions: string[]
  /** Words that make a strong classifier result actionable even if scope says no. */
  actionable: RegExp
  /** What "is this a command for this page?" means here. */
  scope: {
    instructions: string
    trueDescription: string
    falseDescription: string
  }
  /** Turn a classifier intent into the same plan the grammar would build. */
  buildPlan: (
    intent: string,
    transcript: string,
    snapshot: AgentComponent[],
  ) => Interpreted
  /** The dictation contract for this page. */
  dictation: DictationSpec
  /** The ui-sdk primitives this example composes, described to the classifier. */
  primitives: string[]
}
