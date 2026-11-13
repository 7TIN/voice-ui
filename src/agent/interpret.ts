import type { AgentComponent } from "@ui-sdk/react/agent"
import type { Interpreted, Plan, PlanProblem } from "./plan"

/**
 * M1 speaks a small, explicit grammar. It is not a language model: it is a set
 * of rules that turn a phrase into the same `agent.act` steps a model will emit
 * in a later milestone. Keeping the shape identical means the hook, executor
 * and verification below do not change when the interpreter does.
 */
const TITLE = "Post title"
const BODY = "Post body"
const COMMUNITY = "Community"
const VISIBILITY = "Who can see this"
const COMMENTS = "Allow comments"
const PUBLISH = "Publish post"
const PREVIEW = "Preview post"

const hint =
  "Try \"set the title to ...\", \"turn comments off\", " +
  "\"preview the post\", or \"publish the post\"."

type Rule = {
  pattern: RegExp
  build: (match: RegExpMatchArray, snapshot: AgentComponent[]) => Plan | PlanProblem
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

function noItems(label: string, said: string, items: AgentComponent["items"]): PlanProblem {
  const labels = (items ?? []).map((item) => item.label)
  return {
    error: said + " isn't one of the choices for " + label.toLowerCase() + ".",
    hint: labels.length
      ? "Try " + labels.map((value) => "\"" + value + "\"").join(", ") + "."
      : "Open the control to see its choices.",
  }
}

function matchItem(component: AgentComponent, said: string) {
  const target = itemKey(said)
  return (component.items ?? []).find(
    (item) => itemKey(item.label) === target || itemKey(item.value) === target,
  )
}

function setText(
  label: string,
  text: string,
  say: string,
  done: string,
): (snapshot: AgentComponent[]) => Plan | PlanProblem {
  return (snapshot) => {
    const component = find(snapshot, label)
    if (!component) {
      return { error: "I can't find " + label + " on this page.", hint: hint }
    }
    if (!component.actions.includes("setValue")) {
      return unavailable(label, "setValue")
    }
    return {
      transcript: "",
      steps: [{ ref: label, action: "setValue", args: [text] }],
      say: say,
      done: done,
    }
  }
}

const rules: Rule[] = [
  {
    pattern: /^(?:set|change|rename|make)\s+(?:the\s+|my\s+)?title\s+(?:to|as|about|saying)\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint: hint }
    },
  },
  {
    pattern: /^(?:write|draft|create)\s+(?:a|the|my)\s+title\s+(?:about|saying|that\s+says)\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint: hint }
    },
  },
  {
    pattern: /^title\s*[:=]\s*(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint: hint }
    },
  },
  {
    pattern:
      /^(?:set|change|fill(?:\s+in)?|write|replace)\s+(?:the\s+|my\s+)?(?:body|post\s+body|post|content)\s+(?:to|with|about|saying)\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1])
      return text
        ? setText(BODY, text, "Setting the body.", "Body set.")(snapshot)
        : { error: "There was no body text in that.", hint: hint }
    },
  },
  {
    pattern: /^(?:body|post\s+body)\s*[:=]\s*(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1])
      return text
        ? setText(BODY, text, "Setting the body.", "Body set.")(snapshot)
        : { error: "There was no body text in that.", hint: hint }
    },
  },
  {
    pattern:
      /^(?:set|change|choose|pick|switch(?:\s+to)?|move(?:\s+it)?\s+to)\s+(?:the\s+|my\s+)?community\s+(?:to\s+)?(.+)$/,
    build: (match, snapshot) => pickCommunity(match[1], snapshot),
  },
  {
    pattern: /^(?:post|put)\s+(?:it\s+|this\s+)?(?:in|to)\s+(?:the\s+)?(.+?)(?:\s+community)?$/,
    build: (match, snapshot) => pickCommunity(match[1], snapshot),
  },
  {
    pattern:
      /^(?:set|change|make|switch)\s+(?:the\s+|my\s+)?(?:audience|visibility|who\s+can\s+see\s+(?:this|it))\s+(?:to\s+)?(.+)$/,
    build: (match, snapshot) => pickVisibility(match[1], snapshot),
  },
  {
    pattern: /^(?:turn|switch|set)\s+comments?\s+(on|off)$/,
    build: (match, snapshot) => setComments(match[1].toLowerCase() === "on", snapshot),
  },
  {
    pattern: /^(enable|disable|allow|block|stop|start)\s+comments?$/,
    build: (match, snapshot) =>
      setComments(!["disable", "block", "stop"].includes(match[1].toLowerCase()), snapshot),
  },
  {
    pattern: /^clear\s+(?:the\s+)?(?:title|body)$/,
    build: (match, snapshot) => {
      const label = /body/i.test(match[0]) ? BODY : TITLE
      const component = find(snapshot, label)
      if (!component) return { error: "I can't find " + label + " on this page.", hint: hint }
      if (!component.actions.includes("clear")) return unavailable(label, "clear")
      return {
        transcript: "",
        steps: [{ ref: label, action: "clear", args: [] }],
        say: "Clearing the " + (/body/i.test(match[0]) ? "body" : "title") + ".",
        done: (/body/i.test(match[0]) ? "Body" : "Title") + " cleared.",
      }
    },
  },
  {
    pattern: /^(?:publish|post)\s*(?:the\s+|this\s+|my\s+)?(?:post|draft|it)?$/,
    build: (_match, snapshot) => {
      const component = find(snapshot, PUBLISH)
      if (!component) {
        return { error: "There is no post to publish.", hint: "Open the composer first." }
      }
      if (component.disabled || !component.actions.includes("press")) {
        return { error: "The post isn't ready to publish.", hint: "Add a title and a body first." }
      }
      return { transcript: "", steps: [{ ref: PUBLISH, action: "press", args: [] }], say: "Publishing.", done: "Published." }
    },
  },
  {
    pattern: /^(?:preview|show)\s+(?:me\s+)?(?:the\s+)?(?:post|preview|it)$/,
    build: (_match, snapshot) => {
      const component = find(snapshot, PREVIEW)
      if (!component || component.disabled) {
        return { error: "There is no preview to open.", hint: "Open the composer first." }
      }
      return { transcript: "", steps: [{ ref: PREVIEW, action: "press", args: [] }], say: "Opening the preview.", done: "Preview opened." }
    },
  },
  // Looser variants: speech transcripts rarely match the strict grammar exactly.
  {
    pattern: /^(?:set|change|rename|make|write|draft)\s+(?:the\s+|my\s+|a\s+)?title\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint: hint }
    },
  },
  {
    pattern:
      /^(?:set|change|fill(?:\s+in)?|write|replace|draft)\s+(?:the\s+|my\s+|a\s+)?(?:body|post\s+body|post|content)\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1])
      return text
        ? setText(BODY, text, "Setting the body.", "Body set.")(snapshot)
        : { error: "There was no body text in that.", hint: hint }
    },
  },
  {
    pattern: /^(?:turn|switch|set)\s+(on|off)\s+comments?$/,
    build: (match, snapshot) => setComments(match[1].toLowerCase() === "on", snapshot),
  },
  {
    pattern: /^(?:publish|post|submit|send)\s*(?:the\s+|this\s+|my\s+)?(?:post|draft|it)?$/,
    build: (_match, snapshot) => {
      const component = find(snapshot, PUBLISH)
      if (!component) {
        return { error: "There is no post to publish.", hint: "Open the composer first." }
      }
      if (component.disabled || !component.actions.includes("press")) {
        return { error: "The post isn't ready to publish.", hint: "Add a title and a body first." }
      }
      return { transcript: "", steps: [{ ref: PUBLISH, action: "press", args: [] }], say: "Publishing.", done: "Published." }
    },
  },
  {
    pattern: /^title\s*(?:is|:|=)?\s*(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint: hint }
    },
  },
  {
    pattern: /^(?:body|post\s+body)\s*(?:is|:|=)?\s*(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1])
      return text
        ? setText(BODY, text, "Setting the body.", "Body set.")(snapshot)
        : { error: "There was no body text in that.", hint: hint }
    },
  },
  {
    pattern: /^comments?\s+(on|off)$/,
    build: (match, snapshot) => setComments(match[1].toLowerCase() === "on", snapshot),
  },
]

function pickCommunity(said: string, snapshot: AgentComponent[]): Plan | PlanProblem {
  const component = find(snapshot, COMMUNITY)
  if (!component) return { error: "I can't find " + COMMUNITY + " on this page.", hint: hint }
  const item = matchItem(component, said)
  if (!item) return noItems(COMMUNITY, said, component.items)
  return {
    transcript: "",
    steps: [{ ref: COMMUNITY, action: "setValue", args: [item.value] }],
    say: "Switching to " + item.label + ".",
    done: "Community set to " + item.label + ".",
  }
}

function pickVisibility(said: string, snapshot: AgentComponent[]): Plan | PlanProblem {
  const component = find(snapshot, VISIBILITY)
  if (!component) return { error: "I can't find " + VISIBILITY + " on this page.", hint: hint }
  const item = matchItem(component, said)
  if (!item) return noItems(VISIBILITY, said, component.items)
  return {
    transcript: "",
    steps: [{ ref: VISIBILITY, action: "setValue", args: [item.value] }],
    say: "Setting the audience to " + item.label + ".",
    done: "Audience set to " + item.label + ".",
  }
}

function setComments(on: boolean, snapshot: AgentComponent[]): Plan | PlanProblem {
  const component = find(snapshot, COMMENTS)
  if (!component) return { error: "I can't find " + COMMENTS + " on this page.", hint: hint }
  if (!component.actions.includes("setChecked")) return unavailable(COMMENTS, "setChecked")
  return {
    transcript: "",
    steps: [{ ref: COMMENTS, action: "setChecked", args: [on] }],
    say: "Turning comments " + (on ? "on" : "off") + ".",
    done: "Comments are " + (on ? "on" : "off") + ".",
  }
}

export function interpret(transcript: string, snapshot: AgentComponent[]): Interpreted {
  // Speech transcripts often carry filler words and trailing punctuation. Strip
  // the common ones so "um, set the title to hello please" still matches.
  const cleaned = transcript
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(?:um|uh|so|well|okay|ok|hey|hi|please|murmur)\s*,?\s*/i, "")
    .replace(/\s*,?\s*(?:please|thanks|thank you|now)\s*[.!?]*$/i, "")
    .replace(/[.!?]+$/, "")
    .trim()

  const text = cleaned
  if (!text) {
    return { error: "I didn't catch that.", hint: "Try again, or type the command." }
  }

  for (const rule of rules) {
    // Patterns are written lowercase; match without touching the case of the spoken words.
    const match = text.match(new RegExp(rule.pattern.source, "i"))
    if (!match) continue
    const plan = rule.build(match, snapshot)
    return "steps" in plan ? { ...plan, transcript: transcript } : plan
  }

  return { error: "I don't know that one yet.", hint: hint }
}
