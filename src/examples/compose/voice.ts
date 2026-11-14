import type { AgentComponent } from "@ui-sdk/react/agent"
import {
  choicesHint,
  find,
  itemKey,
  matchItem,
  mention,
  missing,
  noItems,
  normalize,
  openChoice,
  setValuePlan,
  spoken,
  unavailable,
  valuePart,
} from "../../agent/interpret"
import type {
  DictationRequest,
  Plan,
  PlanProblem,
} from "../../agent/plan"
import { isPlan } from "../../agent/plan"
import type { ExampleVoice, VoiceRule } from "../types"

const TITLE = "Post title"
const BODY = "Post body"
const COMMUNITY = "Community"
const VISIBILITY = "Who can see this"
const COMMENTS = "Allow comments"
const PUBLISH = "Publish post"
const PREVIEW = "Preview post"

const hint =
  'Try "set the title to ...", "open the community menu", ' +
  '"change the audience to Followers", "turn comments off", or "publish the post".'

/** How people actually describe each option, beyond its literal label. */
const VALUE_ALIASES: Record<string, string[]> = {
  ai: ["ai", "a i", "ai ml", "ai and ml", "artificial intelligence", "machine learning", "ml"],
  design: ["design", "designs", "design community", "creative", "ui", "ux"],
  engineering: [
    "engineering",
    "engineer",
    "eng",
    "dev",
    "development",
    "software",
    "backend",
    "frontend",
  ],
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
    if (!component) return missing(label, hint)
    if (!component.actions.includes("setValue")) return unavailable(label, "setValue")
    return {
      transcript: "",
      steps: [{ ref: label, action: "setValue", args: [text] }],
      say,
      done,
    }
  }
}

function choicePlan(component: AgentComponent, item: NonNullable<AgentComponent["items"]>[number]): Plan {
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

function pickCommunity(said: string, snapshot: AgentComponent[]): Plan | PlanProblem {
  const component = find(snapshot, COMMUNITY)
  if (!component) return missing(COMMUNITY, hint)
  const item = matchItem(component, said, { aliases: VALUE_ALIASES })
  if (!item) {
    return noItems(COMMUNITY, valuePart(said, COMMUNITY_NOUNS), component.items)
  }
  return choicePlan(component, item)
}

function pickVisibility(said: string, snapshot: AgentComponent[]): Plan | PlanProblem {
  const component = find(snapshot, VISIBILITY)
  if (!component) return missing(VISIBILITY, hint)
  const item = matchItem(component, said, { aliases: VALUE_ALIASES })
  if (!item) {
    return noItems(VISIBILITY, valuePart(said, VISIBILITY_NOUNS), component.items)
  }
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
): { component: AgentComponent; item: NonNullable<AgentComponent["items"]>[number] } | null {
  const candidates = snapshot.filter(
    (component) =>
      !component.offPage &&
      component.items?.length &&
      component.actions.includes("setValue"),
  )

  let best: {
    component: AgentComponent
    item: NonNullable<AgentComponent["items"]>[number]
    score: number
  } | null = null

  for (const component of candidates) {
    const item = mention(component, text, { aliases: VALUE_ALIASES })
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
  if (!component) return missing(COMMENTS, hint)
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
  if (!component) return missing(label, hint)
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
    dictate: target === "title" ? TITLE : BODY,
    prompt:
      target === "title"
        ? 'Listening for the title. Say it, then "done".'
        : 'Listening for the body. Say it, then "done".',
  }
}

/** A plan that writes literal content; used while dictating, never classified. */
function contentPlan(target: string, text: string): Plan {
  const value = target === TITLE ? text.slice(0, 90) : text
  return {
    transcript: "",
    steps: [{ ref: target, action: "setValue", args: [value] }],
    say: target === TITLE ? "Setting the title." : "Setting the body.",
    done: target === TITLE ? "Title set." : "Body set.",
  }
}

const rules: VoiceRule[] = [
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
    build: (_match, snapshot) => openChoice(COMMUNITY, snapshot, "community", hint),
  },
  {
    pattern:
      /^(?:open|show|display|reveal|bring\s+up|pull\s+up|open\s+up)\s+(?:the\s+|my\s+)?(?:audience|visibility|privacy|who\s+can\s+see\s+(?:this|it))(?:\s+(?:menu|list|options|choices|dropdown|picker|selector))?$/,
    build: (_match, snapshot) => openChoice(VISIBILITY, snapshot, "audience", hint),
  },
  {
    pattern: /^(?:the\s+)?community(?:\s+menu)?$/,
    build: (_match, snapshot) => openChoice(COMMUNITY, snapshot, "community", hint),
  },
  {
    pattern: /^(?:the\s+)?(?:audience|visibility|privacy|who\s+can\s+see\s+(?:this|it))$/,
    build: (_match, snapshot) => openChoice(VISIBILITY, snapshot, "audience", hint),
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
        : { error: "There was no title in that.", hint }
    },
  },
  {
    pattern:
      /^(?:write|draft|create|make)\s+(?:a|the|my)\s+title\s+(?:about|saying|that\s+says|which\s+says)\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint }
    },
  },
  {
    pattern: /^(?:the\s+)?title\s*[:=]\s*(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint }
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
        : { error: "There was no body text in that.", hint }
    },
  },
  {
    pattern: /^(?:the\s+)?(?:body|post\s+body|content)\s*[:=]\s*(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1])
      return text
        ? setText(BODY, text, "Setting the body.", "Body set.")(snapshot)
        : { error: "There was no body text in that.", hint }
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
    pattern:
      /^(?:go\s+live|put\s+(?:it|this)\s+up|make\s+it\s+live|i'?m\s+done|that'?s\s+it|done)$/,
    build: (_match, snapshot) => publishPlan(snapshot),
  },
  {
    pattern:
      /^(?:preview|review|view)\s+(?:me\s+)?(?:the\s+|this\s+|my\s+)?(?:post|preview|it|draft)?\s*(?:please)?$/,
    build: (_match, snapshot) => previewPlan(snapshot),
  },
  {
    pattern:
      /^(?:show|see|check)\s+(?:me\s+)?(?:the\s+|this\s+|my\s+)?(?:post|preview|it|draft)\s*(?:first|please)?$/,
    build: (_match, snapshot) => previewPlan(snapshot),
  },
  {
    pattern: /^(?:let\s+me\s+)?(?:see|view|check)\s+(?:it|this|the\s+post)(?:\s+first)?$/,
    build: (_match, snapshot) => previewPlan(snapshot),
  },
  {
    pattern:
      /^(?:how\s+does\s+it\s+look|what\s+does\s+it\s+look\s+like|open\s+(?:the\s+)?preview)$/,
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
        : { error: "There was no title in that.", hint }
    },
  },
  {
    pattern:
      /^(?:set|change|fill(?:\s+in)?|write|replace|draft|update|edit)\s+(?:the\s+|my\s+|a\s+)?(?:body|post\s+body|post|content)\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1])
      return text
        ? setText(BODY, text, "Setting the body.", "Body set.")(snapshot)
        : { error: "There was no body text in that.", hint }
    },
  },
  {
    pattern: /^(?:the\s+)?(?:post\s+)?title\s+(?:is|to)\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1]).slice(0, 90)
      return text
        ? setText(TITLE, text, "Setting the title.", "Title set.")(snapshot)
        : { error: "There was no title in that.", hint }
    },
  },
  {
    pattern: /^(?:the\s+)?(?:body|post\s+body|content)\s+(?:is|to)\s+(.+)$/,
    build: (match, snapshot) => {
      const text = spoken(match[1])
      return text
        ? setText(BODY, text, "Setting the body.", "Body set.")(snapshot)
        : { error: "There was no body text in that.", hint }
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

const criteria: Record<string, string> = {
  set_title:
    "The speaker supplies the text of the post title. " +
    "Direct: 'set the title to X', 'change title to X', 'rename the title to X', 'title is X', 'title: X'. " +
    "Indirect: 'call it X', 'headline it X', 'make the heading X', 'I want the title to be X'. " +
    "Speech-to-text slips: 'set title too X', 'settle title X', 'tidal X'. " +
    "Use this only when the title text is actually present in the utterance. " +
    "If the speaker asks to start writing the title without giving it, use dictate_title.",
  set_body:
    "The speaker supplies the text of the post body or content. " +
    "Direct: 'set the body to X', 'write the body with X', 'body is X', 'post content X', 'replace the content with X'. " +
    "Indirect: 'say X in the body', 'the text should be X', 'add this to the post: X', 'write X as the post'. " +
    "Speech-to-text slips: 'write the body with' plus the value, 'set body to X', 'post body X'. " +
    "Use this only when body text is actually present. " +
    "If the speaker asks to start writing the body without giving it, use dictate_body.",
  dictate_title:
    "The speaker asks to start filling the title but has not said the title text yet. " +
    "Examples: 'set the title', 'change the title', 'write the title', 'enter the title', " +
    "'let me dictate the title', 'I'll say the title now', 'title', 'start the title', " +
    "'I want to type the title', 'ready for the title', 'give me the title field'. " +
    "This starts a dictation turn: the app answers and waits for a longer sentence. " +
    "If the same utterance also contains the title text, use set_title instead.",
  dictate_body:
    "The speaker asks to start filling the body but has not said the body text yet. " +
    "Examples: 'set the body', 'write the body', 'write the post', 'enter the content', " +
    "'let me dictate the body', 'I'll say the post now', 'body', 'start the content', " +
    "'I want to write a long post', 'ready for the body', 'give me the body field'. " +
    "This starts a dictation turn: the app answers and waits for a longer sentence. " +
    "If the same utterance also contains body text, use set_body instead. " +
    "Do not confuse this with publish: 'post it', 'send it' and 'put it up' are publish.",
  set_community:
    "The speaker names the community the post belongs in. " +
    "Values: AI & ML, Design, Engineering, Product, General. " +
    "Direct: 'choose community Design', 'switch to Engineering', 'post in Product', 'community General'. " +
    "Indirect: 'put this in Design', 'the AI one', 'make it a product post', 'where should this go — Design', " +
    "'I want it in AI and ML', 'use the engineering community'. " +
    "Speech-to-text slips: 'comedy' for 'community', 'produce' for 'Product', 'in genial' for 'General'. " +
    "Use this when the community is named or unmistakable. " +
    "If no community is named and the speaker only wants the menu, use open_community.",
  set_visibility:
    "The speaker chooses who can see the post. " +
    "Values: Everyone (public, anybody, anyone, all), Followers (my followers, people who follow me, subscribers, friends), " +
    "Only me (just me, myself, private, nobody else, keep it to myself). " +
    "Direct: 'set visibility to Everyone', 'who can see this Followers', 'audience Only me'. " +
    "Fragments without a verb are still commands: 'visibility to followers', 'audience everyone', 'who can see this just me'. " +
    "Indirect: 'make it public', 'only my followers', 'just for me', 'keep it private', 'share it with everyone'. " +
    "Speech-to-text slips: 'visible to followers', 'visibility two followers', 'these two followers' (means 'this to Followers'), " +
    "'only need' for 'Only me', 'follow us' for 'followers'. " +
    "If the audience is not named and the speaker only wants the choices, use show_visibility.",
  open_community:
    "The speaker wants the community menu or its choices shown, without choosing one. " +
    "Examples: 'open the community menu', 'show community', 'show me the communities', " +
    "'what communities are there', 'community options', 'where can I post', 'open the category list', " +
    "'let me pick a community', 'which communities exist'. " +
    "Speech-to-text slips: 'show comedy', 'open community menu'. " +
    "The key difference from set_community: no specific community is named. " +
    "Never treat the word 'community' alone as a value.",
  show_visibility:
    "The speaker wants to hear or see the audience choices without choosing one. " +
    "Examples: 'who can see this', 'show the audience options', 'what are my visibility choices', " +
    "'who is allowed to see it', 'list the privacy options', 'explain who can see this'. " +
    "Speech-to-text slips: 'who can see these', 'visibility options'. " +
    "The key difference from set_visibility: no specific audience is named.",
  choose_option:
    "The speaker names an option without naming its control, usually because a menu is open. " +
    "Examples: 'change to Product', 'go with Design', 'the followers one', 'let's do AI', " +
    "'use Engineering', 'make it General', 'the second one', 'that one'. " +
    "Also use this for 'change it to X', 'switch it to X', 'I'll take X' when X is one of the visible options " +
    "but the utterance does not say 'community' or 'audience'. " +
    "If the control is named ('community Product', 'audience Followers'), use set_community or set_visibility instead.",
  toggle_comments_on:
    "The speaker wants to allow comments or replies. " +
    "Examples: 'turn comments on', 'enable comments', 'allow comments', 'let people reply', " +
    "'open the comments', 'comments on', 'people should be able to comment', 'start comments'. " +
    "Speech-to-text slips: 'comment on', 'turn comment on'. Negation is the opposite intent.",
  toggle_comments_off:
    "The speaker wants to turn comments or replies off. " +
    "Examples: 'turn comments off', 'disable comments', 'block comments', 'close comments', " +
    "'stop comments', 'comments off', 'no comments', 'nobody can reply', 'remove comments'. " +
    "Negated forms matter: \"don't allow comments\", 'do not enable comments', 'no one should reply', " +
    "'comments should not be on', 'I do not want comments'. " +
    "Speech-to-text slips: 'comments of', 'comment off', 'disable allow comments', 'don't allow comment'.",
  publish:
    "The speaker wants to publish the draft. " +
    "Examples: 'publish', 'publish the post', 'publish it now', 'submit', 'send it', 'post it', " +
    "'go live', 'put it up', 'put this out', 'ship it', 'share it', 'I'm done', 'that's it'. " +
    "Speech-to-text slips: 'pub lish', 'publish the post'. " +
    "Do not choose this for 'write the post' or 'post in Design'.",
  preview:
    "The speaker wants to see the post before publishing. " +
    "Examples: 'preview', 'preview the post', 'show preview', 'show me the post', 'review it', " +
    "'let me see it first', 'how does it look', 'check the post', 'open the preview'. " +
    "Speech-to-text slips: 'review post' (means preview), 'prev you', 'preview the post'.",
  clear_title:
    "The speaker wants to erase the title. " +
    "Examples: 'clear the title', 'delete the title', 'remove the title', 'erase title', " +
    "'empty the title', 'wipe the title', 'blank the title', 'start the title over'.",
  clear_body:
    "The speaker wants to erase the body. " +
    "Examples: 'clear the body', 'delete the body', 'remove the content', 'erase the body', " +
    "'empty the post', 'wipe the body', 'start the body over'.",
}

const INSTRUCTIONS = [
  "You classify one spoken utterance for Murmur, a social post composer.",
  "The speaker may use direct commands, indirect requests, pronouns, fragments, negation,",
  "politeness, or repetitions. Speech-to-text often mishears words.",
  "",
  "Core rules:",
  "1. Classify by MEANING, not exact wording. 'Make it public' = set_visibility (Everyone).",
  "   'Just for me' = set_visibility (Only me). 'Let people reply' = toggle_comments_on.",
  "   'Let me see it first' = preview. 'Put it up' = publish. 'Wipe the title' = clear_title.",
  "2. A control noun plus a value is a command even without a verb or preposition:",
  "   'visibility to followers', 'audience everyone', 'community product', 'comments off'.",
  "3. A control noun alone is a request to open or show it: 'community', 'show community',",
  "   'open the community menu', 'who can see this', 'show audience options'.",
  "4. When a menu is open or the option is obvious, a bare option belongs to that menu:",
  "   'change to product', 'go with design', 'the followers one' → choose_option.",
  "5. Handle negation as the opposite switch: \"don't allow comments\", 'no comments',",
  "   'do not enable comments' all mean toggle_comments_off.",
  "6. Ignore filler and politeness: 'um', 'please', 'could you', 'hey Murmur', trailing punctuation.",
  "7. Tolerate speech-to-text confusion: review/preview, of/off, too/to, these/this,",
  "   aloud/allowed, comedy/community, produce/product, follow us/followers, only need/only me.",
  "8. Distinguish setting content from starting dictation:",
  "   'set the title to X' = set_title; 'set the title' (no X) = dictate_title.",
  "   'write the body with X' = set_body; 'write the body' (no X) = dictate_body.",
  "9. When a control is clear but its value is missing or unknown, still choose that control's",
  "   intent — the app will say which options exist. Choose unknown only when no action is identifiable.",
  "10. Never invent a community, audience, title or body that the speaker did not say.",
].join("\n")

export const composeVoice: ExampleVoice = {
  id: "compose",
  app: "Murmur — a social post composer with a title, body, community, audience and comments.",
  hint,
  suggestions: [
    "set the title to A quieter web",
    "turn comments off",
    "change the audience to followers",
    "publish the post",
  ],
  rules,
  intents: Object.entries(criteria).map(([intent, text]) => ({
    intent,
    criteria: text,
  })),
  unknown:
    "No actionable request for the composer. " +
    "Chit-chat ('how are you', 'tell me a joke'), questions about how to use the app, " +
    "page text read aloud, random words, and fragments with neither a control nor an identifiable action. " +
    "A command with a clear control but an odd value is NOT unknown: classify the control so the app can " +
    "explain its options (e.g. 'community pizza' is set_community).",
  instructions: [INSTRUCTIONS],
  actionable:
    /\b(?:title|body|content|text|community|categor(?:y|ies)|audience|visibility|visible|privacy|private|comments?|repl(?:y|ies)|respond|publish|preview|review|clear|delete|remove|erase|open|show|display|set|change|switch|turn|enable|disable|allow|block|make|put|keep|share|see)\b/i,
  scope: {
    instructions:
      "Is this utterance a request to change, open, show, clear, preview or publish something " +
      "in the post composer? Fragments that name a control and a value count as commands " +
      "(for example 'visibility to followers'). Questions about how to use the app, " +
      "chit-chat, and page text read aloud do not.",
    trueDescription:
      "The utterance asks to act on the post: set a field, choose an option, open or show a control, " +
      "toggle comments, clear a field, preview, or publish. Direct, indirect, incomplete and " +
      "speech-to-text-garbled commands all count.",
    falseDescription:
      "The utterance is chit-chat, a question about the app itself, page content read aloud, " +
      "a list of unrelated words, or has no identifiable action on the post.",
  },
  buildPlan(intent, transcript, snapshot) {
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
        return openChoice(COMMUNITY, snapshot, "community", hint)

      case "show_visibility":
        return openChoice(VISIBILITY, snapshot, "audience", hint)

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
        return { error: "Couldn't build that plan.", hint }
    }
  },
  dictation: {
    noun: (target) => (target === BODY ? "body" : "title"),
    label: (target) => (target === BODY ? "Body" : "Title"),
    prompt: (target, source) => {
      if (source === "voice") {
        return target === BODY
          ? 'Listening for the body. Say it, then "done".'
          : 'Listening for the title. Say it, then "done".'
      }
      return (
        "Adding to the " +
        (target === BODY ? "body" : "title") +
        '. Type "done" when you finish.'
      )
    },
    contentPlan,
  },
  primitives: [
    "Button",
    "Input",
    "Textarea",
    "Select",
    "RadioGroup",
    "Switch",
    "Dialog",
    "AlertDialog",
    "Toast",
  ],
}

// Kept for the executor's first pre-check in older call sites.
export { setValuePlan }
