import type { AgentComponent } from "@ui-sdk/react/agent"
import { classifyIntent } from "./gemini"
import type { Interpreted, Plan, PlanProblem } from "./plan"
import { isDictation, isPlan } from "./plan"
import type { ExampleVoice } from "../examples/types"

/**
 * The in-page interpreter. It is deliberately two layers:
 *
 * 1. A deterministic grammar, owned by the current example, that handles the
 *    common phrasings instantly.
 * 2. Gemini's Decisions API, which classifies the intent of anything the grammar
 *    misses — including fragments, indirect phrasing and speech-to-text errors.
 *
 * Both layers emit the same `Plan` of `agent.act` steps, so the executor never
 * knows (or cares) which one understood the command.
 */

export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function itemKey(value: string) {
  return normalize(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** The words a person said, without the quotes and full stop around them. */
export function spoken(value: string) {
  return value
    .trim()
    .replace(/^["'“”`]/g, "")
    .replace(/["'“”`']$/g, "")
    .replace(/^(?:to|as|about|saying|is)\s+/i, "")
    .replace(/[.,;!?]+$/, "")
    .trim()
}

function distance(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        previous[j] + 1,
        row[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = row
  }
  return previous[b.length]
}

/** Whole-word containment, so "all" never matches "allow". */
export function containsPhrase(haystack: string, needle: string) {
  if (!needle) return false
  return (" " + haystack + " ").includes(" " + needle + " ")
}

export type Item = NonNullable<AgentComponent["items"]>[number]

export type MentionOptions = {
  /** Synonyms beyond an item's literal label and value. */
  aliases?: Record<string, string[]>
}

/**
 * Find the item a phrase mentions. Handles the literal label, the value, common
 * synonyms, partial mentions, and one-or-two-character speech-to-text slips.
 * A later mention wins, because commands usually put the value at the end.
 */
export function mention(
  component: AgentComponent,
  text: string,
  options: MentionOptions = {},
): Item | null {
  const haystack = itemKey(text)
  if (!haystack) return null

  let best: { item: Item; score: number } | null = null

  for (const item of component.items ?? []) {
    const candidates = [
      item.label,
      item.value,
      ...(options.aliases?.[item.value] ?? []),
    ]

    for (const candidate of candidates) {
      const key = itemKey(candidate)
      if (!key) continue

      let score = 0
      if (haystack === key) {
        score = 300 + key.length
      } else if (containsPhrase(haystack, key)) {
        // Prefer the rightmost mention, then the longest phrase.
        score = 140 + key.length * 2 + haystack.lastIndexOf(key) / 1000
      } else if (containsPhrase(key, haystack) && haystack.length >= 4) {
        score = 90 + haystack.length
      } else if (
        haystack.length >= 4 &&
        distance(haystack, key) <= (key.length >= 8 ? 2 : 1)
      ) {
        score = 70 + haystack.length
      }

      if (score && (!best || score > best.score)) best = { item, score }
    }
  }

  return best?.item ?? null
}

/** Match a free-text value against a component's items. */
export function matchItem(
  component: AgentComponent,
  said: string,
  options?: MentionOptions,
) {
  return mention(component, said, options)
}

export function find(snapshot: AgentComponent[], label: string) {
  return snapshot.find(
    (component) =>
      !component.offPage && normalize(component.label ?? "") === normalize(label),
  )
}

export function unavailable(label: string, action: string): PlanProblem {
  return {
    error: label + " can't be used right now.",
    hint:
      "It may be disabled, or the page may have changed. It should offer " +
      action +
      ".",
  }
}

export function missing(label: string, hint: string): PlanProblem {
  return { error: "I can't find " + label + " on this page.", hint }
}

export function noItems(
  label: string,
  said: string,
  items: AgentComponent["items"],
): PlanProblem {
  const labels = (items ?? []).map((item) => item.label)
  const prefix = said
    ? '"' + said + '" isn\'t'
    : "I couldn't tell which one you meant; it isn't"
  return {
    error: prefix + " one of the choices for " + label.toLowerCase() + ".",
    hint: labels.length
      ? "Try " + labels.map((value) => '"' + value + '"').join(", ") + "."
      : "Open the control to see its choices.",
  }
}

/** The value part of a command, for error messages like “X isn’t an option”. */
export function valuePart(text: string, nouns: RegExp) {
  const stripped = text
    .replace(
      /^(?:please\s+)?(?:set|change|choose|pick|select|switch|move|make|use|go|put|post|update|turn)\s+(?:it\s+|this\s+|that\s+|the\s+|my\s+|a\s+)?/i,
      "",
    )
    .replace(nouns, "")
    .replace(/^(?:to|into|as|is|with|:|=)\s*/i, "")
    .replace(/\s+(?:please|now|thanks|thank\s+you)$/i, "")
    .replace(/[.,;!?]+$/, "")
    .trim()

  return spoken(stripped) || spoken(text)
}

export function setValuePlan(
  label: string,
  text: string,
  say: string,
  done: string,
): (snapshot: AgentComponent[]) => Plan | PlanProblem {
  return (snapshot) => {
    const component = find(snapshot, label)
    if (!component) return missing(label, "")
    if (!component.actions.includes("setValue")) return unavailable(label, "setValue")
    return {
      transcript: "",
      steps: [{ ref: label, action: "setValue", args: [text] }],
      say,
      done,
    }
  }
}

/** The options hint shown after a menu is opened or a control is listed. */
export function choicesHint(component: AgentComponent) {
  const labels = (component.items ?? [])
    .map((item) => '"' + item.label + '"')
    .join(", ")
  const current = component.items?.find((item) => item.value === component.value)?.label
  const currentText = current ? " It is currently " + current + "." : ""
  return component.label + " offers " + labels + "." + currentText
}

export function openChoice(
  label: string,
  snapshot: AgentComponent[],
  noun: string,
  hint: string,
): Plan | PlanProblem {
  const component = find(snapshot, label)
  if (!component) return missing(label, hint)

  if (!component.actions.includes("setOpen")) {
    // A radio group has no menu to open; answer with its choices instead.
    return {
      transcript: "",
      steps: [],
      say: "Here are the choices.",
      done: choicesHint(component),
    }
  }

  if (component.open === true) {
    return {
      transcript: "",
      steps: [],
      say: "The " + noun + " menu is already open.",
      done: choicesHint(component),
    }
  }

  return {
    transcript: "",
    steps: [
      { ref: component.label ?? component.ref, action: "setOpen", args: [true] },
    ],
    say: "Opening the " + noun + " menu.",
    done: choicesHint(component),
  }
}

export function cleanTranscript(transcript: string) {
  return transcript
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(?:um|uh|so|well|okay|ok|hey|hi|please|murmur)\s*,?\s*/i, "")
    .replace(/\s*,?\s*(?:please|thanks|thank you|now)\s*[.!?]*$/i, "")
    .replace(/[.!?]+$/, "")
    .trim()
}

function applyRules(
  text: string,
  snapshot: AgentComponent[],
  voice: ExampleVoice,
): Interpreted | null {
  for (const rule of voice.rules) {
    // Patterns are written lowercase; match without touching the case of the spoken words.
    const match = text.match(new RegExp(rule.pattern.source, "i"))
    if (!match) continue
    const plan = rule.build(match, snapshot)
    if (plan) return plan
    // `null` means "this rule recognised the shape but not a real option";
    // keep looking instead of stopping on a bad guess.
  }
  return null
}

/** Split "open the community menu and change to product" into two commands. */
function splitSequence(text: string) {
  return text
    .split(/\s*(?:,\s*)?(?:and\s+then|and|then)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

function combine(plans: Plan[], transcript: string): Plan {
  return {
    transcript,
    steps: plans.flatMap((plan) => plan.steps),
    say: plans.map((plan) => plan.say).join(" "),
    done: plans[plans.length - 1].done,
  }
}

function contextHint(snapshot: AgentComponent[], fallback: string) {
  const open = snapshot.find(
    (component) =>
      !component.offPage && component.open === true && component.items?.length,
  )
  if (!open) return fallback
  const labels = (open.items ?? [])
    .map((item) => '"' + item.label + '"')
    .join(", ")
  return (
    "The " +
    (open.label ?? "menu") +
    " menu is open. Say an option like " +
    labels +
    "."
  )
}

export function interpretGrammar(
  transcript: string,
  snapshot: AgentComponent[],
  voice: ExampleVoice,
): Interpreted {
  const text = cleanTranscript(transcript)
  if (!text) {
    return { error: "I didn't catch that.", hint: "Try again, or type the command." }
  }

  const direct = applyRules(text, snapshot, voice)
  if (direct) return isPlan(direct) ? { ...direct, transcript } : direct

  // Two commands in one breath: only combine when every part is a real plan.
  const parts = splitSequence(text)
  if (parts.length > 1) {
    const plans: Plan[] = []
    for (const part of parts) {
      const result = applyRules(cleanTranscript(part), snapshot, voice)
      if (!result || !isPlan(result)) {
        plans.length = 0
        break
      }
      plans.push(result)
    }
    if (plans.length) return combine(plans, transcript)
  }

  return { error: "I don't know that one yet.", hint: contextHint(snapshot, voice.hint) }
}

/** A compact description of the page for the classifier's input. */
function controlContext(snapshot: AgentComponent[]) {
  return snapshot
    .filter((component) => !component.offPage && component.label)
    .map((component) => {
      const facts: string[] = [component.component]
      if (
        component.value !== undefined &&
        component.value !== null &&
        component.value !== ""
      ) {
        facts.push("current " + JSON.stringify(component.value))
      }
      if (component.checked !== undefined) facts.push("checked " + String(component.checked))
      if (component.pressed !== undefined)
        facts.push("pressed " + String(component.pressed))
      if (component.open !== undefined) facts.push(component.open ? "OPEN" : "closed")
      if (component.disabled) facts.push("disabled")
      if (component.items?.length) {
        facts.push("options " + component.items.map((item) => item.label).join(" / "))
      }
      return "- " + component.label + " (" + facts.join("; ") + ")"
    })
    .join("\n")
}

export async function interpret(
  transcript: string,
  snapshot: AgentComponent[],
  voice: ExampleVoice,
  options?: { apiKey?: string | null },
): Promise<Interpreted> {
  // Fast path: deterministic grammar (instant, free, no network).
  const grammarResult = interpretGrammar(transcript, snapshot, voice)
  if (isPlan(grammarResult) || isDictation(grammarResult)) return grammarResult

  // If the grammar didn't match and we have an API key, ask Gemini.
  const apiKey = options?.apiKey
  if (apiKey) {
    const decision = await classifyIntent(
      transcript,
      apiKey,
      controlContext(snapshot),
      voice,
    )
    if (decision) {
      if (decision.intent !== "unknown" && decision.confidence >= 0.4) {
        const plan = voice.buildPlan(decision.intent, transcript, snapshot)
        if (isPlan(plan)) return { ...plan, transcript }
        // Plan building returned a specific error (bad value, disabled control);
        // show it instead of a generic "I don't know".
        if (plan && !isPlan(plan)) return plan
      }

      // A weak or unknown classification is the same as a miss: use the
      // grammar's suggestion rather than exposing classifier scores.
      return grammarResult
    }

    // Gemini call failed (null) — API error or network issue.
    return {
      error: "I don't know that one yet.",
      hint: "I couldn't reach the classifier. " + contextHint(snapshot, voice.hint),
    }
  }

  // Fall back to the grammar's "unknown" result.
  return grammarResult
}
