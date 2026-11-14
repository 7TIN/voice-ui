/**
 * A command is interpreted into a plan, never into DOM work. A step names a
 * component by its accessible label and calls one of the actions its snapshot
 * entry advertises. The executor re-reads the snapshot before it runs anything,
 * so a stale plan fails loudly instead of pressing the wrong control.
 */
export type PlanStep = {
  ref: string
  action: string
  args: unknown[]
}

export type Plan = {
  transcript: string
  steps: PlanStep[]
  /** Status while the steps run. */
  say: string
  /** Result once the steps are verified. */
  done: string
}

export type PlanProblem = {
  error: string
  hint: string
}

/**
 * The user asked to fill a long field but did not say the content yet. The
 * voice session switches into dictation: the next words are content, not a
 * command, and they may span several pauses.
 */
export type DictationRequest = {
  dictate: "title" | "body"
  /** What to show while the microphone waits for the content. */
  prompt: string
}

export type Interpreted = Plan | PlanProblem | DictationRequest

export function isPlan(value: Interpreted): value is Plan {
  return "steps" in value
}

export function isDictation(value: Interpreted): value is DictationRequest {
  return "dictate" in value
}
