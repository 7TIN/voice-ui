import { classifyIntent, type GeminiIntent } from "./gemini"
import type { AgentComponent } from "@ui-sdk/react/agent"
import type { DictationRequest, Interpreted, Plan, PlanProblem } from "./plan"
import { isDictation, isPlan } from "./plan"

/**
 * The in-page interpreter. It is deliberately two layers:
 *
 * 1. A deterministic grammar that handles the common, exact phrasings instantly.
 * 2. Gemini's Decisions API, which classifies the intent of anything the grammar
 *    misses — including fragments, indirect phrasing and speech-to-text errors.
 *
 * Both layers emit the same `Plan` of `agent.act` steps, so the executor never
 * knows (or cares) which one understood the command.
 */
const TITLE = "Post title"
const BODY = "Post body"
const COMMUNITY = "Community"
const VISIBILITY = "Who can see this"
const COMMENTS = "Allow comments"
const PUBLISH = "Publish post"
const PREVIEW = "Preview post"

const hint =
  "Try \"set the title to ...\", \"open the community menu\", " +
  "\"change the audience to Followers\", \"turn comments off\", or \"publish the post\"."

type Rule = {
  pattern: RegExp
  build: (
    match: RegExpMatchArray,
    snapshot: AgentComponent[],
  ) => Interpreted | null
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function itemKey(value: string) {
  return normalize(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** The words a person said, without the quotes and full stop around them. */
function spoken(value: string) {
  return value
    .trim()
    .replace(/^["'""`]/g, "")
    .replace(/["'""`']$/g, "")
    .replace(/^(?:to|as|about|saying|is)\s+/i, "")
    .replace(/[.,;!?]+$/, "")
    .trim()
}

/** How people actually describe each option, beyond its literal label. */
const VALUE_ALIASES: Record<string, string[]> = {
  ai: ["ai", "a i", "ai ml", "ai and ml", "artificial intelligence", "machine learning", "ml"],
  design: ["design", "designs", "design community", "creative", "ui", "ux"],
  engineering: ["engineering", "engineer", "eng", "dev", "development", "software", "backend", "frontend"],
  product: ["product", "products", "prod", "product community"],
  general: ["general", "general community", "random", "misc", "everything else", "other"],
  everyone: [
    "everyone",
    "everybody",
    "every one",
    "public",
    "publicly",
    "anyone",
    "anybody",
    "any body",
    "all",
    "the world",
    "worldwide",
    "anyone on murmur",
  ],
  followers: [
    "followers",
    "follower",
    "followers only",
    "my followers",
    "people who follow me",
    "people who follow you",
    "subscribers",
    "mutuals",
    "friends",
  ],
  "only-me": [
    "only me",
    "just me",
    "just for me",
    "only for me",
    "for me only",
    "only myself",
    "just myself",
    "myself",
    "me only",
    "me alone",
    "private",
    "privately",
    "no one else",
    "nobody else",
    "only i",
    "just i",
    "only mine",
    "keep it to myself",
  ],
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
function containsPhrase(haystack: string, needle: string) {
  if (!needle) return false
  return (" " + haystack + " ").includes(" " + needle + " ")
}

type Item = NonNullable<AgentComponent["items"]>[number]

/**
 * Find the item a phrase mentions. Handles the literal label, the value, common
 * synonyms, partial mentions, and one-or-two-character speech-to-text slips.
 * A later mention wins, because commands usually put the value at the end.
 */
function mention(component: AgentComponent, text: string): Item | null {
  const haystack = itemKey(text)
  if (!haystack) return null

  let best: { item: Item; score: number } | null = null

  for (const item of component.items ?? []) {
    const candidates = [item.label, item.value, ...(VALUE_ALIASES[item.value] ?? [])]

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
      } else if (haystack.length >= 4 && distance(haystack, key) <= (key.length >= 8 ? 2 : 1)) {
        score = 70 + haystack.length
      }

      if (score && (!best || score > best.score)) best = { item, score }
    }
  }

  return best?.item ?? null
}

/** Match a free-text value against a component's items. */
function matchItem(component: AgentComponent, said: string) {
  return mention(component, said)
}

function find(snapshot: AgentComponent[], label: string) {
  return snapshot.find(
    (component) => !component.offPage && normalize(component.label ?? "") === normalize(label),
  )
}

function unavailable(label: string, action: string): PlanProblem {
  return {
    error: label + " can't be used right now.",
    hint: "It may be disabled, or the page may have changed. It should offer " + action + ".",
  }
}

function missing(label: string): PlanProblem {
  return { error: "I can't find " + label + " on this page.", hint: hint }
}

function noItems(
  label: string,
  said: string,
  items: AgentComponent["items"],
): PlanProblem {
  const labels = (items ?? []).map((item) => item.label)
  const prefix = said ? "\"" + said + "\" isn't" : "I couldn't tell which one you meant; it isn't"
  return {
    error: prefix + " one of the choices for " + label.toLowerCase() + ".",
    hint: labels.length
      ? "Try " + labels.map((value) => "\"" + value + "\"").join(", ") + "."
      : "Open the control to see its choices.",
  }
}

/** The value part of a command, for error messages like “X isn’t an option”. */
function valuePart(text: string, nouns: RegExp) {
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

const COMMUNITY_NOUNS = /^(?:the\s+)?(?:community|category|channel|group)\b\s*/i
const VISIBILITY_NOUNS =
  /^(?:the\s+)?(?:audience|visibility|privacy|who\s+can\s+see\s+(?:this|it))\b\s*/i

function setText(
  label: string,
  text: string,
  say: string,
  done: string,
): (snapshot: AgentComponent[]) => Plan | PlanProblem {
  return (snapshot) => {
    const component = find(snapshot, label)
    if (!component) return missing(label)
    if (!component.actions.includes("setValue")) return unavailable(label, "setValue")
    return {
      transcript: "",
      steps: [{ ref: label, action: "setValue", args: [text] }],
      say: say,
      done: done,
    }
  }
}

function choicePlan(component: AgentComponent, item: Item): Plan {
  const ref = component.label ?? component.ref
  const label = normalize(component.label ?? "")

  if (label === normalize(COMMUNITY)) {
    return {
      transcript: "",
      steps: [{ ref, action: "setValue", args: [item.value] }],
      say: "Switching to " + item.label + ".",
      done: "Community set to " + item.label + ".",
    }
  }

  if (label === normalize(VISIBILITY)) {
    return {
      transcript: "",
      steps: [{ ref, action: "setValue", args: [item.value] }],
      say: "Setting the audience to " + item.label + ".",
      done: "Audience set to " + item.label + ".",
    }
  }

  return {
    transcript: "",
    steps: [{ ref, action: "setValue", args: [item.value] }],
    say: "Choosing " + item.label + ".",
    done: ref + " set to " + item.label + ".",
  }
}

/** The options hint shown after a menu is opened or a control is listed. */
function choicesHint(component: AgentComponent) {
  const labels = (component.items ?? []).map((item) => "\"" + item.label + "\"").join(", ")
  const current = component.items?.find((item) => item.value === component.value)?.label
  const currentText = current ? " It is currently " + current + "." : ""
  return component.label + " offers " + labels + "." + currentText
}

function openChoice(
  label: string,
  snapshot: AgentComponent[],
  noun: string,
): Plan | PlanProblem {
  const component = find(snapshot, label)
  if (!component) return missing(label)

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
    steps: [{ ref: component.label ?? component.ref, action: "setOpen", args: [true] }],
    say: "Opening the " + noun + " menu.",
    done: choicesHint(component),
  }
}

function pickCommunity(said: string, snapshot: AgentComponent[]): Plan | PlanProblem {
  const component = find(snapshot, COMMUNITY)
  if (!component) return missing(COMMUNITY)
  const item = matchItem(component, said)
  if (!item) return noItems(COMMUNITY, valuePart(said, COMMUNITY_NOUNS), component.items)
  return choicePlan(component, item)
}

function pickVisibility(said: string, snapshot: AgentComponent[]): Plan | PlanProblem {
  const component = find(snapshot, VISIBILITY)
  if (!component) return missing(VISIBILITY)
  const item = matchItem(component, said)
  if (!item) return noItems(VISIBILITY, valuePart(said, VISIBILITY_NOUNS), component.items)
  return choicePlan(component, item)
}

/**
 * Resolve a bare option — "product", "followers", "change it to Design" — against
 * the choices on the page. An open menu wins, then the control named in the
 * phrase, then the community and audience controls in that order.
 */
function resolveChoice(
  text: string,
  snapshot: AgentComponent[],
): { component: AgentComponent; item: Item } | null {
  const candidates = snapshot.filter(
    (component) =>
      !component.offPage &&
      component.items?.length &&
      component.actions.includes("setValue"),
  )

  let best: { component: AgentComponent; item: Item; score: number } | null = null

  for (const component of candidates) {
    const item = mention(component, text)
    if (!item) continue

    const label = normalize(component.label ?? "")
    let rank = 0
    if (component.open === true) rank += 100
    if (label === normalize(COMMUNITY)) rank += 10
    if (label === normalize(VISIBILITY)) rank += 9

    const score = rank
    if (!best || score > best.score) best = { component, item, score }
  }

  return best ? { component: best.component, item: best.item } : null
}

function setComments(on: boolean, snapshot: AgentComponent[]): Plan | PlanProblem {
  const component = find(snapshot, COMMENTS)
  if (!component) return missing(COMMENTS)
  if (!component.actions.includes("setChecked")) return unavailable(COMMENTS, "setChecked")
  return {
    transcript: "",
    steps: [{ ref: COMMENTS, action: "setChecked", args: [on] }],
    say: "Turning comments " + (on ? "on" : "off") + ".",
    done: "Comments are " + (on ? "on" : "off") + ".",
  }
}

function publishPlan(snapshot: AgentComponent[]): Plan | PlanProblem {
  const component = find(snapshot, PUBLISH)
  if (!component) {
    return { error: "There is no post to publish.", hint: "Open the composer first." }
  }
  if (component.disabled || !component.actions.includes("press")) {
    return { error: "The post isn't ready to publish.", hint: "Add a title and a body first." }
  }
  return {
    transcript: "",
    steps: [{ ref: component.label ?? PUBLISH, action: "press", args: [] }],
    say: "Publishing.",
    done: "Published.",
  }
}

function previewPlan(snapshot: AgentComponent[]): Plan | PlanProblem {
  const component = find(snapshot, PREVIEW)
  if (!component || component.disabled) {
    return { error: "There is no preview to open.", hint: "Open the composer first." }
  }
  return {
    transcript: "",
    steps: [{ ref: component.label ?? PREVIEW, action: "press", args: [] }],
    say: "Opening the preview.",
    done: "Preview opened.",
  }
}

function clearPlan(label: string, snapshot: AgentComponent[]): Plan | PlanProblem {
  const component = find(snapshot, label)
  if (!component) return missing(label)
  if (!component.actions.includes("clear")) return unavailable(label, "clear")
  const noun = label === BODY ? "body" : "title"
  return {
    transcript: "",
    steps: [{ ref: label, action: "clear", args: [] }],
    say: "Clearing the " + noun + ".",
    done: (label === BODY ? "Body" : "Title") + " cleared.",
  }
}

function dictation(target: "title" | "body"): DictationRequest {
  return {
    dictate: target,
    prompt:
      target === "title"
        ? 'Listening for the title. Say it, then "done".'
        : 'Listening for the body. Say it, then "done".',
  }
}

/**
 * A plan that writes literal content. Used while dictating: the words are the
 * post, not a command, so they bypass the interpreter entirely.
 */
export function contentPlan(target: "title" | "body", text: string): Plan {
  const label = target === "title" ? TITLE : BODY
  const value = target === "title" ? text.slice(0, 90) : text
  return {
    transcript: "",
    steps: [{ ref: label, action: "setValue", args: [value] }],
    say: target === "title" ? "Setting the title." : "Setting the body.",
    done: target === "title" ? "Title set." : "Body set.",
  }
}

const rules: Rule[] = [
  // ---------------------------------------------------------------------------
  // Dictation primers. These must come first: "set the title" with no value is
  // not a failed command, it is an invitation to speak the title.
  // ---------------------------------------------------------------------------
  {
    pattern:
      /^(?:please\s+)?(?:set|change|edit|write|enter|type|update|draft|start|begin|dictate|record)\s+(?:the\s+|my\s+|a\s+)?(?:post\s+)?title\s*(?:now|please)?$/,
    build: () => dictation("title"),
  },
  {
    pattern:
      /^(?:please\s+)?(?:set|change|edit|write|enter|type|update|draft|start|begin|dictate|record|fill(?:\s+in)?)\s+(?:the\s+|my\s+|a\s+)?(?:post\s+)?(?:body|content|text)\s*(?:now|please)?$/,
    build: () => dictation("body"),
  },
  {
    pattern:
      /^(?:please\s+)?(?:write|draft|compose|create)\s+(?:a\s+|the\s+|my\s+)?(?:long\s+|new\s+|whole\s+)?post\s*(?:now|please)?$/,
    build: () => dictation("body"),
  },
  {
    pattern:
      /^(?:i\s+(?:want|need|would\s+like|'?d\s+like)\s+to\s+)?(?:write|draft|compose)\s+(?:a\s+|the\s+|my\s+)?(?:long\s+|new\s+)?post\s*(?:now|please)?$/,
    build: () => dictation("body"),
  },

  // ---------------------------------------------------------------------------
  // Opening controls. "Show Community." must not be mistaken for a value.
  // ---------------------------------------------------------------------------
  {
    pattern:
      /^(?:open|show|display|reveal|bring\s+up|pull\s+up|open\s+up)\s+(?:the\s+|my\s+)?community(?:\s+(?:menu|list|options|choices|dropdown|picker|selector))?$/,
    build: (_match, snapshot) => openChoice(COMMUNITY, snapshot, "community"),
  },
  {
    pattern:
      /^(?:open|show|display|reveal|bring\s+up|pull\s+up|open\s+up)\s+(?:the\s+|my\s+)?(?:audience|visibility|privacy|who\s+can\s+see\s+(?:this|it))(?:\s+(?:menu|list|options|choices|dropdown|picker|selector))?$/,
    build: (_match, snapshot) => openChoice(VISIBILITY, snapshot, "audience"),
  },
  {
    pattern: /^(?:the\s+)?community(?:\s+menu)?$/,
    build: (_match, snapshot) => openChoice(COMMUNITY, snapshot, "community"),
  },
  {
    pattern: /^(?:the\s+)?(?:audience|visibility|privacy|who\s+can\s+see\s+(?:this|it))$/,
    build: (_match, snapshot) => openChoice(VISIBILITY, snapshot, "audience"),
  },

  // ---------------------------------------------------------------------------
  // Title
  // ---------------------------------------------------------------------------
  {
    pattern:
      /^(?:set|change|rename|make|write|draft|update|edit)\s+(?:the\s+|my\s+|a\s+)?(?:post\s+)?title\s+(?:to|as|about|saying|is|:|=)\s*(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint: hint }
    },
  },
  {
    pattern:
      /^(?:write|draft|create|make)\s+(?:a|the|my)\s+title\s+(?:about|saying|that\s+says|which\s+says)\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint: hint }
    },
  },
  {
    pattern: /^(?:the\s+)?title\s*[:=]\s*(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint: hint }
    },
  },

  // ---------------------------------------------------------------------------
  // Body
  // ---------------------------------------------------------------------------
  {
    pattern:
      /^(?:set|change|fill(?:\s+in)?|write|replace|update|edit)\s+(?:the\s+|my\s+|a\s+)?(?:body|post\s+body|post|content)\s+(?:to|with|about|saying|is|:|=)\s*(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1])
      return text
        ? setText(BODY, text, "Setting the body.", "Body set.")(snapshot)
        : { error: "There was no body text in that.", hint: hint }
    },
  },
  {
    pattern: /^(?:the\s+)?(?:body|post\s+body|content)\s*[:=]\s*(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1])
      return text
        ? setText(BODY, text, "Setting the body.", "Body set.")(snapshot)
        : { error: "There was no body text in that.", hint: hint }
    },
  },

  // ---------------------------------------------------------------------------
  // Community and audience
  // ---------------------------------------------------------------------------
  {
    pattern:
      /^(?:set|change|choose|pick|select|switch|move|make|update)\s+(?:it\s+|this\s+|the\s+|my\s+)?(?:community|category|channel|group)\s*(?:to|into|as|is|:|=)?\s*(.+)$/,
    build: (match, snapshot) => pickCommunity(match[1], snapshot),
  },
  {
    pattern:
      /^(?:post|put|share)\s+(?:it\s+|this\s+)?(?:in|to)\s+(?:the\s+)?(.+?)(?:\s+(?:community|category|channel))?$/,
    build: (match, snapshot) => pickCommunity(match[1], snapshot),
  },
  {
    pattern: /^(?:the\s+)?(?:community|category|channel)\s*(?:to|is|:|=)\s*(.+)$/,
    build: (match, snapshot) => pickCommunity(match[1], snapshot),
  },
  {
    pattern:
      /^(?:set|change|make|switch|move|update)\s+(?:the\s+|my\s+)?(?:audience|visibility|privacy|who\s+can\s+see\s+(?:this|it))\s*(?:to|as|is|:|=)?\s*(.+)$/,
    build: (match, snapshot) => pickVisibility(match[1], snapshot),
  },
  {
    pattern:
      /^(?:the\s+)?(?:audience|visibility|privacy|who\s+can\s+see\s+(?:this|it))\s*(?:to|is|:|=)\s*(.+)$/,
    build: (match, snapshot) => pickVisibility(match[1], snapshot),
  },

  // ---------------------------------------------------------------------------
  // Comments
  // ---------------------------------------------------------------------------
  {
    pattern: /^(?:turn|switch|set)\s+comments?\s+(on|off|of)$/,
    build: (match, snapshot) => setComments(/^on$/i.test(match[1]), snapshot),
  },
  {
    pattern: /^(?:turn|switch|set)\s+(on|off)\s+comments?$/,
    build: (match, snapshot) => setComments(/^on$/i.test(match[1]), snapshot),
  },
  {
    pattern: /^comments?\s+(on|off|of)$/,
    build: (match, snapshot) => setComments(/^on$/i.test(match[1]), snapshot),
  },
  {
    pattern:
      /^(?:enable|allow|start|open|permit)\s+(?:people\s+|anyone\s+)?(?:to\s+)?(?:comment|reply|respond)(?:\s+comments?)?$/,
    build: (_match, snapshot) => setComments(true, snapshot),
  },
  {
    pattern: /^(?:enable|allow|start|open|permit)\s+comments?$/,
    build: (_match, snapshot) => setComments(true, snapshot),
  },
  {
    pattern: /^(?:let|allow)\s+(?:people|anyone)\s+(?:comment|reply|respond)$/,
    build: (_match, snapshot) => setComments(true, snapshot),
  },
  {
    pattern: /^(?:disable|block|stop|close|shut|remove|hide)\s+(?:allow(?:ing)?\s+)?comments?$/,
    build: (_match, snapshot) => setComments(false, snapshot),
  },
  {
    pattern: /^no\s+comments?$/,
    build: (_match, snapshot) => setComments(false, snapshot),
  },
  {
    pattern:
      /^(?:i\s+)?(?:don'?t|do\s+not|dont)\s+(?:allow|enable|turn\s+on|let)\s+(?:people\s+|anyone\s+)?(?:to\s+)?comments?$/,
    build: (_match, snapshot) => setComments(false, snapshot),
  },
  {
    pattern: /^(?:i\s+)?(?:don'?t|do\s+not|dont)\s+want\s+(?:any\s+)?comments?$/,
    build: (_match, snapshot) => setComments(false, snapshot),
  },

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------
  {
    pattern:
      /^(?:clear|delete|remove|erase|empty|wipe|reset)\s+(?:the\s+|my\s+)?(?:post\s+)?(title|body)$/,
    build: (match, snapshot) =>
      clearPlan(/body/i.test(match[1]) ? BODY : TITLE, snapshot),
  },
  {
    pattern: /^(?:clear|reset|empty)\s+(?:everything|both)$/,
    build: (_match, snapshot) => {
      const title = clearPlan(TITLE, snapshot)
      if (!isPlan(title)) return title
      const body = clearPlan(BODY, snapshot)
      if (!isPlan(body)) return body
      return {
        transcript: "",
        steps: [...title.steps, ...body.steps],
        say: "Clearing the title and the body.",
        done: "Title and body cleared.",
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Publish and preview
  // ---------------------------------------------------------------------------
  {
    pattern:
      /^(?:publish|post|submit|send|share|push)\s*(?:the\s+|this\s+|my\s+)?(?:post|draft|it)?\s*(?:now)?$/,
    build: (_match, snapshot) => publishPlan(snapshot),
  },
  {
    pattern: /^(?:go\s+live|put\s+(?:it|this)\s+up|make\s+it\s+live|i'?m\s+done|that'?s\s+it|done)$/,
    build: (_match, snapshot) => publishPlan(snapshot),
  },
  {
    pattern:
      /^(?:preview|review|view)\s+(?:me\s+)?(?:the\s+|this\s+|my\s+)?(?:post|preview|it|draft)?\s*(?:please)?$/,
    build: (_match, snapshot) => previewPlan(snapshot),
  },
  {
    pattern: /^(?:show|see|check)\s+(?:me\s+)?(?:the\s+|this\s+|my\s+)?(?:post|preview|it|draft)\s*(?:first|please)?$/,
    build: (_match, snapshot) => previewPlan(snapshot),
  },
  {
    pattern: /^(?:let\s+me\s+)?(?:see|view|check)\s+(?:it|this|the\s+post)(?:\s+first)?$/,
    build: (_match, snapshot) => previewPlan(snapshot),
  },
  {
    pattern: /^(?:how\s+does\s+it\s+look|what\s+does\s+it\s+look\s+like|open\s+(?:the\s+)?preview)$/,
    build: (_match, snapshot) => previewPlan(snapshot),
  },

  // ---------------------------------------------------------------------------
  // Looser title/body variants. These put the value at the end without a
  // connector, which is what speech transcripts usually look like.
  // ---------------------------------------------------------------------------
  {
    pattern:
      /^(?:set|change|rename|make|write|draft|update|edit)\s+(?:the\s+|my\s+|a\s+)?(?:post\s+)?title\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint: hint }
    },
  },
  {
    pattern:
      /^(?:set|change|fill(?:\s+in)?|write|replace|draft|update|edit)\s+(?:the\s+|my\s+|a\s+)?(?:body|post\s+body|post|content)\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1])
      return text
        ? setText(BODY, text, "Setting the body.", "Body set.")(snapshot)
        : { error: "There was no body text in that.", hint: hint }
    },
  },
  {
    pattern: /^(?:the\s+)?(?:post\s+)?title\s+(?:is|to)\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint: hint }
    },
  },
  {
    pattern: /^(?:the\s+)?(?:body|post\s+body|content)\s+(?:is|to)\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1])
      return text
        ? setText(BODY, text, "Setting the body.", "Body set.")(snapshot)
        : { error: "There was no body text in that.", hint: hint }
    },
  },

  // ---------------------------------------------------------------------------
  // Bare option commands. "Change it to product", "go with Design", "the
  // followers one", and a plain "Product" all resolve against the visible
  // choices, preferring whichever menu is already open.
  // ---------------------------------------------------------------------------
  {
    pattern:
      /^(?:change|switch|set|make|pick|choose|select|use|go|move|show)\s+(?:it\s+|this\s+|that\s+|the\s+|my\s+)?(?:(?:community|category|audience|visibility|privacy|who\s+can\s+see\s+(?:this|it))\s*)?(?:to|into|with|as)?\s*(.+)$/,
    build: (match, snapshot) => {
      const found = resolveChoice(match[1], snapshot)
      return found ? choicePlan(found.component, found.item) : null
    },
  },
  {
    pattern: /^(?:the\s+)?(.+?)\s+one$/,
    build: (match, snapshot) => {
      const found = resolveChoice(match[1], snapshot)
      return found ? choicePlan(found.component, found.item) : null
    },
  },
  {
    pattern: /^(?:i\s+want|i'?d\s+like|let'?s\s+(?:do|go\s+with|use)|we\s+should\s+use)\s+(?:the\s+)?(.+)$/,
    build: (match, snapshot) => {
      const found = resolveChoice(match[1], snapshot)
      return found ? choicePlan(found.component, found.item) : null
    },
  },
  {
    pattern: /^(?:the\s+)?(.+)$/,
    build: (match, snapshot) => {
      // Only a whole-phrase option ("Product", "Only me", "AI and ML") is
      // accepted here. A stray word inside a sentence must not change a control.
      const key = itemKey(match[1])
      const found = resolveChoice(match[1], snapshot)
      if (!found) return null
      const candidates = [
        found.item.label,
        found.item.value,
        ...(VALUE_ALIASES[found.item.value] ?? []),
      ]
      const exact = candidates.some((candidate) => itemKey(candidate) === key)
      return exact ? choicePlan(found.component, found.item) : null
    },
  },
]

function cleanTranscript(transcript: string) {
  return transcript
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(?:um|uh|so|well|okay|ok|hey|hi|please|murmur)\s*,?\s*/i, "")
    .replace(/\s*,?\s*(?:please|thanks|thank you|now)\s*[.!?]*$/i, "")
    .replace(/[.!?]+$/, "")
    .trim()
}

function applyRules(text: string, snapshot: AgentComponent[]): Interpreted | null {
  for (const rule of rules) {
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

function contextHint(snapshot: AgentComponent[]) {
  const open = snapshot.find(
    (component) => !component.offPage && component.open === true && component.items?.length,
  )
  if (!open) return hint
  const labels = (open.items ?? []).map((item) => "\"" + item.label + "\"").join(", ")
  return (
    "The " + (open.label ?? "menu") + " menu is open. Say an option like " + labels + "."
  )
}

export function interpretGrammar(transcript: string, snapshot: AgentComponent[]): Interpreted {
  const text = cleanTranscript(transcript)
  if (!text) {
    return { error: "I didn't catch that.", hint: "Try again, or type the command." }
  }

  const direct = applyRules(text, snapshot)
  if (direct) return isPlan(direct) ? { ...direct, transcript } : direct

  // Two commands in one breath: only combine when every part is a real plan.
  const parts = splitSequence(text)
  if (parts.length > 1) {
    const plans: Plan[] = []
    for (const part of parts) {
      const result = applyRules(cleanTranscript(part), snapshot)
      if (!result || !isPlan(result)) {
        plans.length = 0
        break
      }
      plans.push(result)
    }
    if (plans.length) return combine(plans, transcript)
  }

  return { error: "I don't know that one yet.", hint: contextHint(snapshot) }
}

/** A compact description of the page for the classifier's input. */
function controlContext(snapshot: AgentComponent[]) {
  return snapshot
    .filter((component) => !component.offPage && component.label)
    .map((component) => {
      const facts: string[] = [component.component]
      if (component.value !== undefined && component.value !== null && component.value !== "") {
        facts.push("current " + JSON.stringify(component.value))
      }
      if (component.checked !== undefined) facts.push("checked " + String(component.checked))
      if (component.open !== undefined) facts.push(component.open ? "OPEN" : "closed")
      if (component.disabled) facts.push("disabled")
      if (component.items?.length) {
        facts.push(
          "options " + component.items.map((item) => item.label).join(" / "),
        )
      }
      return "- " + component.label + " (" + facts.join("; ") + ")"
    })
    .join("\n")
}

export async function interpret(
  transcript: string,
  snapshot: AgentComponent[],
  options?: { apiKey?: string | null },
): Promise<Interpreted> {
  // Fast path: deterministic grammar (instant, free, no network).
  const grammarResult = interpretGrammar(transcript, snapshot)
  if (isPlan(grammarResult) || isDictation(grammarResult)) return grammarResult

  // If the grammar didn't match and we have an API key, ask Gemini.
  const apiKey = options?.apiKey
  if (apiKey) {
    const decision = await classifyIntent(transcript, apiKey, controlContext(snapshot))
    if (decision) {
      if (decision.intent !== "unknown" && decision.confidence >= 0.4) {
        const plan = buildPlanFromIntent(decision.intent, transcript, snapshot)
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
      hint: "I couldn't reach the classifier. " + contextHint(snapshot),
    }
  }

  // Fall back to the grammar's "unknown" result.
  return grammarResult
}

function buildPlanFromIntent(
  intent: GeminiIntent,
  transcript: string,
  snapshot: AgentComponent[],
): Interpreted {
  switch (intent) {
    case "set_title": {
      const text = spoken(
        transcript.replace(
          /^(?:set|change|rename|make|write|draft|update|edit)\s+(?:the\s+|my\s+|a\s+)?(?:post\s+)?title\s*(?:to|as|about|saying|is|:|=)?\s*/i,
          "",
        ),
      ).slice(0, 90)
      if (!text) return dictation("title")
      return setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
    }

    case "set_body": {
      const text = spoken(
        transcript.replace(
          /^(?:set|change|fill(?:\s+in)?|write|replace|draft|update|edit)\s+(?:the\s+|my\s+|a\s+)?(?:body|post\s+body|post|content)\s*(?:to|with|about|saying|is|:|=)?\s*/i,
          "",
        ),
      )
      if (!text) return dictation("body")
      return setText(BODY, text, "Setting the body.", "Body set.")(snapshot)
    }

    case "dictate_title":
      return dictation("title")

    case "dictate_body":
      return dictation("body")

    case "set_community":
      return pickCommunity(transcript, snapshot)

    case "set_visibility":
      return pickVisibility(transcript, snapshot)

    case "choose_option": {
      const found = resolveChoice(transcript, snapshot)
      if (!found) {
        const open = snapshot.find(
          (component) => component.open === true && component.items?.length,
        )
        return {
          error: "I couldn't tell which option you meant.",
          hint: open ? choicesHint(open) : hint,
        }
      }
      return choicePlan(found.component, found.item)
    }

    case "open_community":
      return openChoice(COMMUNITY, snapshot, "community")

    case "show_visibility":
      return openChoice(VISIBILITY, snapshot, "audience")

    case "toggle_comments_on":
      return setComments(true, snapshot)

    case "toggle_comments_off":
      return setComments(false, snapshot)

    case "publish":
      return publishPlan(snapshot)

    case "preview":
      return previewPlan(snapshot)

    case "clear_title":
      return clearPlan(TITLE, snapshot)

    case "clear_body":
      return clearPlan(BODY, snapshot)

    default:
      return { error: "Couldn't build that plan.", hint: hint }
  }
}
