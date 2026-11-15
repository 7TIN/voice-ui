import type { AgentComponent } from "@ui-sdk/react/agent"
import { spoken } from "../../agent/interpret.ts"
import type {
  DictationRequest,
  Plan,
} from "../../agent/plan"
import type { ExampleVoice } from "../types"
import {
  POST_AUTHORS,
  SUGGESTED_PEOPLE,
  TIMELINE_SECTIONS,
} from "./data.ts"

const hint =
  'Try "like Ada\'s post", "show comments on Kofi\'s post", ' +
  '"go to explore", "follow Margaret Hamilton", or "report Linus\'s post".'

let currentPostAuthor = POST_AUTHORS[0]!
let currentPostIndex = 0
let currentPostCount = POST_AUTHORS.length

export function setCurrentTimelinePost(author: string, index?: number, count?: number) {
  if (author.trim()) currentPostAuthor = author
  if (index !== undefined) currentPostIndex = index
  if (count !== undefined && count > 0) currentPostCount = count
}

function authorFrom(text: string): string | null {
  const key = text.toLowerCase()
  for (const author of POST_AUTHORS) {
    const first = author.split(" ")[0].toLowerCase()
    if (key.includes(author.toLowerCase()) || key.includes(first)) return author
  }
  const ordinals = ["first", "second", "third", "fourth"]
  for (let index = 0; index < ordinals.length; index += 1) {
    const ordinalMention = new RegExp("\\b" + ordinals[index] + "\\b").test(key)
    const numberMention = new RegExp("\\b(?:post\\s+" + (index + 1) + "|" + (index + 1) + "\\s+post)\\b").test(key)
    if (ordinalMention || numberMention) {
      return POST_AUTHORS[index] ?? null
    }
  }
  if (key.includes("last")) return POST_AUTHORS[POST_AUTHORS.length - 1] ?? null
  return null
}

function resolvePost(text: string): string | null {
  const author = authorFrom(text) ?? currentPostAuthor
  if (author) return author
  if (/\b(?:this|it|the\s+post|post)\b/i.test(text)) return currentPostAuthor
  return null
}

function resolvePerson(text: string) {
  const key = text.toLowerCase()
  for (const person of SUGGESTED_PEOPLE) {
    const first = person.name.split(" ")[0].toLowerCase()
    if (
      key.includes(person.name.toLowerCase()) ||
      key.includes(first) ||
      key.includes(person.handle.toLowerCase())
    ) {
      return person
    }
  }
  return null
}

function resolveSubmit(snapshot: AgentComponent[], text: string): string | null {
  const textareas = snapshot.filter(
    (component) =>
      !component.offPage &&
      component.component === "textarea" &&
      /^Your (?:reply to|quote of) /.test(component.label ?? ""),
  )
  const wantsQuote = /quote/i.test(text)
  let candidates = wantsQuote
    ? textareas.filter((component) => /quote/i.test(component.label ?? ""))
    : textareas.filter((component) => /reply/i.test(component.label ?? ""))
  if (!candidates.length) candidates = textareas

  // A named author ("post reply to Ada") wins over the filled field.
  const author = authorFrom(text) ?? currentPostAuthor
  if (author) {
    const named = candidates.filter((component) =>
      (component.label ?? "").includes(author),
    )
    if (named.length) candidates = named
  }

  const active =
    candidates.find((component) => String(component.value ?? "").trim()) ??
    candidates[0] ??
    null
  if (!active?.label) return null
  const target = active.label.replace(/^Your (?:reply to|quote of) /, "")
  return /quote/i.test(active.label)
    ? "Post quote of " + target
    : "Post reply to " + target
}

function resolveComposerAction(
  snapshot: AgentComponent[],
  text: string,
  action: "Close" | "Cancel",
): string | null {
  const fields = snapshot.filter(
    (component) =>
      !component.offPage &&
      component.component === "textarea" &&
      /^Your (?:reply to|quote of) /.test(component.label ?? ""),
  )
  const wantsQuote = /quote/i.test(text)
  const wantsReply = /reply|replay|comment/i.test(text)
  let candidates = wantsQuote
    ? fields.filter((component) => /quote/i.test(component.label ?? ""))
    : wantsReply
      ? fields.filter((component) => /reply/i.test(component.label ?? ""))
      : fields
  const author = authorFrom(text) ?? currentPostAuthor
  if (author) {
    const named = candidates.filter((component) => (component.label ?? "").includes(author))
    if (named.length) candidates = named
  }
  const field =
    candidates.find((component) => (component.label ?? "").includes(author)) ??
    candidates.find((component) => component.label) ??
    fields.find((component) => component.label)
  if (!field?.label) return null
  const isQuote = /quote/i.test(field.label)
  const kind = isQuote ? "quote" : "reply"
  const authorName = field.label.replace(/^Your (?:reply to|quote of) /, "")
  return action === "Close"
    ? postLabel(authorName, kind)
    : "Cancel " + kind + " to " + authorName
}

function resolveSection(text: string): string | null {
  const key = text.toLowerCase()
  for (const section of TIMELINE_SECTIONS) {
    if (key.includes(section.value) || key.includes(section.label.toLowerCase())) {
      return section.value
    }
  }
  if (key.includes("home") || key.includes("feed")) return "home"
  if (key.includes("explore") || key.includes("search")) return "explore"
  if (key.includes("notification")) return "notifications"
  if (key.includes("message")) return "messages"
  if (key.includes("bookmark") || key.includes("saved")) return "bookmarks"
  if (key.includes("profile") || key.includes("me")) return "profile"
  return null
}

function postLabel(author: string, kind: string) {
  if (kind === "like") return "Like " + author + "'s post"
  if (kind === "repost") return "Repost " + author + "'s post"
  if (kind === "reply") return "Reply to " + author + "'s post"
  if (kind === "quote") return "Quote " + author + "'s post"
  if (kind === "options") return "Options for " + author + "'s post"
  if (kind === "comments") return "Comments on " + author + "'s post"
  return author
}

function simplePlan(ref: string, action: string, args: unknown[], say: string, done: string): Plan {
  return {
    transcript: "",
    steps: [{ ref, action, args }],
    say,
    done,
  }
}

function menuOptionPlan(
  author: string,
  option: string,
  snapshot: AgentComponent[],
): Plan {
  const ref = postLabel(author, "options")
  const openMenu = snapshot.find(
    (component) =>
      !component.offPage &&
      component.open === true &&
      (component.label ?? "").includes(author) &&
      component.items?.length,
  )
  const needle = option === "save" ? "bookmark" : option === "copy link" ? "copy" : option
  const item = openMenu?.items?.find((entry) => entry.label.toLowerCase().startsWith(needle))
    ?? openMenu?.items?.find((entry) => entry.label.toLowerCase().includes(needle))
  const fallback = option === "save" ? "bookmark" : option === "copy link" ? "Copy link to post" : option
  const label = item?.label ?? fallback
  return {
    transcript: "",
    steps: [
      { ref, action: "setOpen", args: [true] },
      { ref, action: "press", args: [label] },
    ],
    say: "Opening the post menu and selecting " + option + ".",
    done: "Menu option selected.",
  }
}

const rules = [
  {
    pattern: /^(?:close|hide|dismiss|cancel|discard)$/i,
    build: (match: RegExpMatchArray, snapshot: AgentComponent[]) => {
      const action = /cancel|discard/i.test(match[0]) ? "Cancel" : "Close"
      const button = resolveComposerAction(snapshot, match[0], action)
      return button
        ? simplePlan(button, "press", [], action === "Cancel" ? "Cancelling the draft." : "Closing the composer.", action === "Cancel" ? "Draft cancelled." : "Composer closed.")
        : null
    },
  },
  {
    pattern: /^(?:close|hide|dismiss|cancel|discard)(?:\s+(?:the|this|that|it))?\s+(?:(?:reply|replay|comment|quote)(?:\s+(?:box|composer|draft))?|(?:reply|replay|comment|quote)\s+(?:box|composer|draft))(?:\s+.*)?$/i,
    build: (match: RegExpMatchArray, snapshot: AgentComponent[]) => {
      const action = /cancel|discard/i.test(match[0]) ? "Cancel" : "Close"
      const button = resolveComposerAction(snapshot, match[0], action)
      return button
        ? simplePlan(button, "press", [], action === "Cancel" ? "Cancelling the draft." : "Closing the composer.", action === "Cancel" ? "Draft cancelled." : "Composer closed.")
        : null
    },
  },
  {
    pattern: /^(?:close|hide|dismiss|cancel|discard)\s+(?:this|that|it|the composer|this post|the post)$/i,
    build: (match: RegExpMatchArray, snapshot: AgentComponent[]) => {
      const action = /cancel|discard/i.test(match[0]) ? "Cancel" : "Close"
      const button = resolveComposerAction(snapshot, match[0], action)
      return button
        ? simplePlan(button, "press", [], action === "Cancel" ? "Cancelling the draft." : "Closing the composer.", action === "Cancel" ? "Draft cancelled." : "Composer closed.")
        : null
    },
  },
  {
    pattern: /^(?:comment(?:\s+on)?|reply(?:\s+to)?)(?:\s+.*)?\s+(?:saying|with)\s+(.+)$/i,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "") ?? currentPostAuthor
      const text = spoken(match[1])
      if (!text) return null
      return {
        transcript: "",
        steps: [
          { ref: postLabel(author, "reply"), action: "press", args: [] },
          { ref: "Your reply to " + author, action: "setValue", args: [text] },
        ],
        say: "Drafting a reply.",
        done: "Reply drafted.",
      }
    },
  },
  {
    pattern: /^(?:comment|comment on|reply|reply to)(?:\s+.*)?$/i,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "") ?? currentPostAuthor
      const field = "Your reply to " + author
      const request: DictationRequest = {
        dictate: field,
        prompt: 'Listening for your reply to ' + author + '. Say it, then "done".',
        steps: [{ ref: postLabel(author, "reply"), action: "press", args: [] }],
      }
      return request
    },
  },
  {
    pattern: /^(?:select|focus|choose)\s+(?:the\s+)?(first|second|third|fourth|last|\d+)(?:\s+post)?$/i,
    build: (match: RegExpMatchArray) => {
      const ordinal = match[1]!.toLowerCase()
      const index = ordinal === "last"
        ? POST_AUTHORS.length - 1
        : ["first", "second", "third", "fourth"].indexOf(ordinal) >= 0
          ? ["first", "second", "third", "fourth"].indexOf(ordinal)
          : Number(ordinal) - 1
      const target = Math.max(0, Math.min(currentPostCount - 1, index))
      const current = currentPostIndex
      const action = target >= current ? "Next post" : "Previous post"
      const steps = Array.from({ length: Math.abs(target - current) }, () => ({
        ref: action,
        action: "press",
        args: [],
      }))
      return { transcript: "", steps, say: "Selecting the post.", done: "Post selected." }
    },
  },
  {
    pattern: /^(?:like|heart|favorite|favourite|love)(?:\s+.*)?$/,
    build: (_match: RegExpMatchArray, _snapshot: AgentComponent[]) => {
      const author = resolvePost(_match.input ?? "")
      if (!author) return null
      return simplePlan(
        postLabel(author, "like"),
        "setPressed",
        [true],
        "Liking " + author + "'s post.",
        "Liked.",
      )
    },
  },
  {
    pattern: /^(?:unlike|unheart|remove\s+(?:my\s+)?like|take\s+back\s+the\s+like)(?:\s+.*)?$/,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "")
      if (!author) return null
      return simplePlan(
        postLabel(author, "like"),
        "setPressed",
        [false],
        "Unliking " + author + "'s post.",
        "Unliked.",
      )
    },
  },
  {
    pattern: /^(?:repost|retweet|boost|share)(?:\s+.*)?$/,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "")
      if (!author) return null
      return simplePlan(
        postLabel(author, "repost"),
        "setPressed",
        [true],
        "Reposting " + author + "'s post.",
        "Reposted.",
      )
    },
  },
  {
    pattern: /^(?:undo\s+(?:the\s+)?(?:repost|retweet)|unrepost|unretweet|remove\s+(?:the\s+)?repost)(?:\s+.*)?$/,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "")
      if (!author) return null
      return simplePlan(
        postLabel(author, "repost"),
        "setPressed",
        [false],
        "Undoing the repost.",
        "Repost removed.",
      )
    },
  },
  {
    pattern:
      /^reply(?:\s+to)?(?:\s+(?:this|it|the\s+post))?(?:\s+(?:by|from|of)\s+.*)?\s+(?:saying|with)\s+(.+)$/,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "") ?? POST_AUTHORS[0]!
      const text = spoken(match[1])
      if (!text) return null
      return {
        transcript: "",
        steps: [
          { ref: postLabel(author, "reply"), action: "press", args: [] },
          { ref: "Your reply to " + author, action: "setValue", args: [text] },
        ],
        say: "Drafting a reply.",
        done: "Reply drafted.",
      }
    },
  },
  {
    pattern: /^reply(?:\s+.*)?$/,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "") ?? POST_AUTHORS[0]!
      const field = "Your reply to " + author
      const request: DictationRequest = {
        dictate: field,
        prompt: 'Listening for your reply to ' + author + '. Say it, then "done".',
        steps: [{ ref: postLabel(author, "reply"), action: "press", args: [] }],
      }
      return request
    },
  },
  {
    pattern:
      /^quote(?:\s+(?:this|it|the\s+post))?(?:\s+(?:by|from|of)\s+.*)?\s+(?:saying|with)\s+(.+)$/,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "") ?? POST_AUTHORS[0]!
      const text = spoken(match[1])
      if (!text) return null
      return {
        transcript: "",
        steps: [
          { ref: postLabel(author, "quote"), action: "press", args: [] },
          { ref: "Your quote of " + author, action: "setValue", args: [text] },
        ],
        say: "Drafting a quote.",
        done: "Quote drafted.",
      }
    },
  },
  {
    pattern: /^quote(?:\s+.*)?$/,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "") ?? POST_AUTHORS[0]!
      const field = "Your quote of " + author
      const request: DictationRequest = {
        dictate: field,
        prompt: 'Listening for your quote of ' + author + '. Say it, then "done".',
        steps: [{ ref: postLabel(author, "quote"), action: "press", args: [] }],
      }
      return request
    },
  },
  {
    pattern: /^(?:show|open|see|expand|view)\s+(?:the\s+)?comments?(?:\s+.*)?$/,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "")
      if (!author) return null
      return simplePlan(
        postLabel(author, "comments"),
        "setOpen",
        [true],
        "Showing the comments.",
        "Comments shown.",
      )
    },
  },
  {
    pattern: /^(?:hide|close|collapse)\s+(?:the\s+)?comments?(?:\s+.*)?$/,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "")
      if (!author) return null
      return simplePlan(
        postLabel(author, "comments"),
        "setOpen",
        [false],
        "Hiding the comments.",
        "Comments hidden.",
      )
    },
  },
  {
    pattern: /^(?:next|previous|prev)(?:\s+post)?$/,
    build: (match: RegExpMatchArray) => {
      const text = match[0].toLowerCase()
      const ref = text.startsWith("prev") ? "Previous post" : "Next post"
      return simplePlan(ref, "press", [], "Moving through the feed.", "Moved.")
    },
  },
  {
    pattern: /^(?:(?:open|show|display|bring\s+up)\s+)?(?:the\s+)?menu\s+options(?:\s+(?:for|on)\s+.*)?$/i,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "") ?? currentPostAuthor
      return simplePlan(
        postLabel(author, "options"),
        "setOpen",
        [true],
        "Opening the post menu.",
        "Menu open.",
      )
    },
  },
  {
    pattern: /^(?:(?:open|show|display|bring\s+up)\s+)?(?:the\s+)?(?:(?:three|3)\s+)?(?:dots?|more|extra)?\s*(?:menu|options)(?:\s+(?:for|on)\s+.*)?$/i,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "") ?? currentPostAuthor
      return simplePlan(
        postLabel(author, "options"),
        "setOpen",
        [true],
        "Opening the post menu.",
        "Menu open.",
      )
    },
  },
  {
    pattern: /^(?:close|hide|dismiss|toggle)(?:\s+the)?\s+(?:(?:three|3)\s+)?(?:dots?|more|extra)?\s*(?:menu|options)$/i,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "") ?? currentPostAuthor
      return simplePlan(
        postLabel(author, "options"),
        "setOpen",
        [false],
        "Closing the post menu.",
        "Menu closed.",
      )
    },
  },
  {
    pattern: /^(?:(?:select|choose|click|activate|use)(?:\s+the)?\s+)?(copy\s+link|bookmark|save|mute|unmute|follow|unfollow|report)(?:\s+(?:this|the)\s+post)?(?:\s+(?:option|action))?(?:\s+(?:from|in)\s+(?:the\s+)?menu)?(?:\s+(?:for|on)\s+(?:this|the)\s+post)?$/i,
    build: (match: RegExpMatchArray, snapshot: AgentComponent[]) => {
      const author = resolvePost(match.input ?? "") ?? currentPostAuthor
      const option = match[1]!.toLowerCase().replace(/\s+/g, " ")
      return menuOptionPlan(author, option, snapshot)
    },
  },
  {
    pattern: /^(?:go\s+to|show|open)\s+(?:the\s+)?(home|explore|notifications?|messages?|bookmarks?|profile|feed)$/,
    build: (match: RegExpMatchArray) => {
      const section = resolveSection(match[1])
      if (!section) return null
      return simplePlan(
        "Sections",
        "setValue",
        [section],
        "Switching sections.",
        "Section changed.",
      )
    },
  },
  {
    pattern: /^(?:open|show)\s+(?:the\s+)?options?(?:\s+.*)?$/,
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "")
      if (!author) return null
      return simplePlan(
        postLabel(author, "options"),
        "setOpen",
        [true],
        "Opening the options.",
        "Options open.",
      )
    },
  },
  {
    pattern: /^(?:report)(?:\s+(?:this|it|the\s+post))?(?:\s+.*)?$/,
    build: (match: RegExpMatchArray, snapshot: AgentComponent[]) => {
      const author = resolvePost(match.input ?? "")
      if (!author) return null
      return menuOptionPlan(author, "report", snapshot)
    },
  },
  {
    pattern: /^(?:follow)\s+(.+)$/,
    build: (match: RegExpMatchArray) => {
      const person = resolvePerson(match[1])
      if (!person) return null
      return simplePlan(
        "Follow " + person.name,
        "setPressed",
        [true],
        "Following " + person.name + ".",
        "Followed.",
      )
    },
  },
  {
    pattern: /^(?:unfollow)\s+(.+)$/,
    build: (match: RegExpMatchArray) => {
      const person = resolvePerson(match[1])
      if (!person) return null
      return simplePlan(
        "Follow " + person.name,
        "setPressed",
        [false],
        "Unfollowing " + person.name + ".",
        "Unfollowed.",
      )
    },
  },
  {
    pattern:
      /^(?:please\s+)?(?:post|submit|send|publish)\b(?:\s+(?:this|it|that|the|my|a|an))?(?:\s+(?:reply|comment|quote|message|response|answer|post|it|this|that))?(?:\s+now)?(?:\s+(?:to|on)\s+.+)?$/,
    build: (_match: RegExpMatchArray, snapshot: AgentComponent[]) => {
      const button = resolveSubmit(snapshot, _match.input ?? "")
      if (!button) return null
      return simplePlan(button, "press", [], "Posting.", "Posted.")
    },
  },
  {
    pattern: /^(?:back|go\s+back|all\s+examples|examples)$/,
    build: () => {
      return simplePlan("Back to examples", "press", [], "Going back.", "Back.")
    },
  },
  {
    pattern: /^(?:new\s+post|compose|write\s+a\s+post)$/,
    build: () => simplePlan("New post", "press", [], "Opening the composer.", "Opened."),
  },
]

function sectionFromText(text: string) {
  return resolveSection(text)
}

function personFromText(text: string) {
  return resolvePerson(text)
}

const criteria: { intent: string; criteria: string }[] = [
  {
    intent: "like_post",
    criteria:
      "The speaker wants to like a post. " +
      "Examples: 'like this post', 'like Ada's post', 'heart it', 'favorite the post', " +
      "'love this'. Speech-to-text slips: 'like at his post'.",
  },
  {
    intent: "unlike_post",
    criteria:
      "The speaker wants to remove a like. " +
      "Examples: 'unlike this post', 'remove my like', 'take back the like'.",
  },
  {
    intent: "repost",
    criteria:
      "The speaker wants to repost or retweet a post. " +
      "Examples: 'repost this', 'retweet Ada's post', 'boost it', 'share it'.",
  },
  {
    intent: "undo_repost",
    criteria:
      "The speaker wants to undo a repost. " +
      "Examples: 'undo the repost', 'unrepost', 'remove the repost'.",
  },
  {
    intent: "reply_to_post",
    criteria:
      "The speaker wants to reply to a post. " +
      "Examples: 'comment on this post', 'comment this post', 'reply to this post', 'reply to Ada's post', 'reply saying hello', " +
      "'answer this'. With or without the reply text.",
  },
  {
    intent: "quote_post",
    criteria:
      "The speaker wants to quote a post with their own comment. " +
      "Examples: 'quote this post', 'quote Ada's post', 'quote saying great point'.",
  },
  {
    intent: "show_comments",
    criteria:
      "The speaker wants to see a post's comments. " +
      "Examples: 'show comments', 'open comments on this post', 'expand the comments'.",
  },
  {
    intent: "hide_comments",
    criteria:
      "The speaker wants to hide a post's comments. " +
      "Examples: 'hide comments', 'close comments', 'collapse the comments'.",
  },
  {
    intent: "next_post",
    criteria:
      "The speaker wants the next post in the feed. " +
      "Examples: 'next post', 'next', 'scroll down', 'show me the next one'.",
  },
  {
    intent: "previous_post",
    criteria:
      "The speaker wants the previous post. " +
      "Examples: 'previous post', 'previous', 'scroll up', 'go back one'.",
  },
  {
    intent: "follow_person",
    criteria:
      "The speaker wants to follow a suggested person. " +
      "Examples: 'follow Margaret Hamilton', 'follow her', 'follow @margaret'.",
  },
  {
    intent: "unfollow_person",
    criteria:
      "The speaker wants to unfollow a person. " +
      "Examples: 'unfollow Margaret Hamilton', 'unfollow her'.",
  },
  {
    intent: "open_post_options",
    criteria:
      "The speaker wants to open the options menu on a post. " +
      "Examples: 'open the options', 'show options for this post', 'post options', 'open the three dots menu', 'open the extra menu', 'menu options for this post'.",
  },
  {
    intent: "report_post",
    criteria:
      "The speaker wants to report a post. " +
      "Examples: 'report this post', 'report Ada's post', 'report it'.",
  },
  {
    intent: "go_section",
    criteria:
      "The speaker wants to switch the left-hand section. " +
      "Examples: 'go to explore', 'show notifications', 'open messages', " +
      "'go to bookmarks', 'show my profile', 'home'.",
  },
  {
    intent: "new_post",
    criteria:
      "The speaker wants to start a new post. " +
      "Examples: 'new post', 'compose', 'write a post'.",
  },
  {
    intent: "post_submit",
    criteria:
      "The speaker wants to post the reply or quote they just typed or dictated. " +
      "Examples: 'post this reply', 'post this', 'post reply', 'post this comment', " +
      "'submit this', 'send it', 'publish this message', 'post reply to Ada'. " +
      "This is not for starting a new post or for 'post in Design'.",
  },
  {
    intent: "back_to_gallery",
    criteria:
      "The speaker wants to leave the example and return to the gallery. " +
      "Examples: 'back', 'go back', 'all examples', 'examples'.",
  },
]

const INSTRUCTIONS = [
  "You classify one spoken utterance for Murmur, a Twitter-like social timeline.",
  "The speaker may use direct commands, indirect requests, pronouns, fragments, negation,",
  "politeness, or repetitions. Speech-to-text often mishears words.",
  "",
  "Core rules:",
  "1. Classify by MEANING, not exact wording. 'Heart it' = like_post. 'Boost this' = repost.",
  "   'Show the replies' = show_comments. 'Next' = next_post.",
  "2. A post is identified by an author's name, an ordinal ('first post', 'second post'),",
  "   or by 'this'/'it' for the currently focused or most visible post. 'Like Ada's post' = like_post.",
  "3. A person is identified by name or handle in the right-hand 'Who to follow' list.",
  "4. 'Follow' and 'unfollow' refer to people, never to posts.",
  "5. 'Report' is consequential; classify it normally — the app runs it right away.",
  "6. 'Comment on this post' and 'reply' open the reply composer for the currently active post.",
  "   'Reply saying X' and 'quote saying X' carry the text X. 'Close reply' closes and keeps its draft; 'cancel reply' clears and closes it. The same applies to quotes.",
  "   'Open the three dots menu' and 'extra menu' open options for the active post; 'close menu' closes it. 'Select bookmark', 'choose mute' and similar phrases choose an option and close the menu.",
  "7. Sections are Home, Explore, Notifications, Messages, Bookmarks, Profile.",
  "8. Ignore filler and politeness: 'um', 'please', 'could you'.",
  "9. Tolerate speech-to-text confusion: like/heart, repost/retweet, comment/reply.",
  "10. Never invent an author, person or section the speaker did not say.",
].join("\n")

export const timelineVoice: ExampleVoice = {
  id: "timeline",
  app: "Murmur — a Twitter-like social timeline with posts, comments, likes, reposts, quotes and side menus.",
  hint,
  suggestions: [
    "like Ada's post",
    "show comments on Kofi's post",
    "go to explore",
    "follow Margaret Hamilton",
  ],
  rules,
  intents: criteria,
  unknown:
    "No actionable request for the timeline. " +
    "Chit-chat, questions about the app, page text read aloud, random words, and fragments " +
    "with neither a control nor an identifiable action. " +
    "A command with a clear control but an odd value is NOT unknown.",
  instructions: [INSTRUCTIONS],
  actionable:
    /\b(?:post|like|heart|repost|retweet|reply|quote|comment|follow|unfollow|report|option|options|menu|extra|dots?|bookmark|save|mute|copy|next|previous|section|home|explore|notification|message|profile|open|show|go|new|close|cancel|dismiss|discard)\b/i,
  scope: {
    instructions:
      "Is this utterance a request to act on the timeline: like, repost, reply, quote, " +
      "show or hide comments, move between posts, follow a person, open or close a post menu, select a menu option, report, " +
      "switch sections, or return to the gallery? Questions about the app, chit-chat and " +
      "page text read aloud are not.",
    trueDescription:
      "The utterance asks to act on a post or the timeline: like, repost, reply, quote, " +
      "comments, navigation, follow, post menu options, report, section switch, or back. " +
      "Direct, indirect, incomplete and garbled commands all count.",
    falseDescription:
      "The utterance is chit-chat, a question about the app itself, page content read aloud, " +
      "a list of unrelated words, or has no identifiable action on the timeline.",
  },
  buildPlan(intent, transcript, snapshot) {
    const author = resolvePost(transcript) ?? POST_AUTHORS[0]!
    const person = personFromText(transcript) ?? SUGGESTED_PEOPLE[0]!
    const section = sectionFromText(transcript)

    switch (intent) {
      case "like_post":
        return simplePlan(postLabel(author, "like"), "setPressed", [true], "Liking " + author + "'s post.", "Liked.")
      case "unlike_post":
        return simplePlan(postLabel(author, "like"), "setPressed", [false], "Unliking " + author + "'s post.", "Unliked.")
      case "repost":
        return simplePlan(postLabel(author, "repost"), "setPressed", [true], "Reposting " + author + "'s post.", "Reposted.")
      case "undo_repost":
        return simplePlan(postLabel(author, "repost"), "setPressed", [false], "Undoing the repost.", "Repost removed.")
      case "reply_to_post": {
        const match = transcript.match(/\b(?:saying|with)\s+(.+)$/i)
        const text = match ? spoken(match[1]) : ""
        if (text) {
          return {
            transcript: "",
            steps: [
              { ref: postLabel(author, "reply"), action: "press", args: [] },
              { ref: "Your reply to " + author, action: "setValue", args: [text] },
            ],
            say: "Drafting a reply.",
            done: "Reply drafted.",
          }
        }
        const request: DictationRequest = {
          dictate: "Your reply to " + author,
          prompt: 'Listening for your reply to ' + author + '. Say it, then "done".',
          steps: [{ ref: postLabel(author, "reply"), action: "press", args: [] }],
        }
        return request
      }
      case "quote_post": {
        const match = transcript.match(/\b(?:saying|with)\s+(.+)$/i)
        const text = match ? spoken(match[1]) : ""
        if (text) {
          return {
            transcript: "",
            steps: [
              { ref: postLabel(author, "quote"), action: "press", args: [] },
              { ref: "Your quote of " + author, action: "setValue", args: [text] },
            ],
            say: "Drafting a quote.",
            done: "Quote drafted.",
          }
        }
        const request: DictationRequest = {
          dictate: "Your quote of " + author,
          prompt: 'Listening for your quote of ' + author + '. Say it, then "done".',
          steps: [{ ref: postLabel(author, "quote"), action: "press", args: [] }],
        }
        return request
      }
      case "show_comments":
        return simplePlan(postLabel(author, "comments"), "setOpen", [true], "Showing the comments.", "Comments shown.")
      case "hide_comments":
        return simplePlan(postLabel(author, "comments"), "setOpen", [false], "Hiding the comments.", "Comments hidden.")
      case "next_post":
        return simplePlan("Next post", "press", [], "Moving through the feed.", "Moved.")
      case "previous_post":
        return simplePlan("Previous post", "press", [], "Moving through the feed.", "Moved.")
      case "follow_person":
        return simplePlan("Follow " + person.name, "setPressed", [true], "Following " + person.name + ".", "Followed.")
      case "unfollow_person":
        return simplePlan("Follow " + person.name, "setPressed", [false], "Unfollowing " + person.name + ".", "Unfollowed.")
      case "open_post_options":
        return simplePlan(postLabel(author, "options"), "setOpen", [true], "Opening the options.", "Options open.")
      case "report_post":
        return menuOptionPlan(author, "report", snapshot)
      case "go_section":
        return simplePlan("Sections", "setValue", [section ?? "home"], "Switching sections.", "Section changed.")
      case "new_post":
        return simplePlan("New post", "press", [], "Opening the composer.", "Opened.")
      case "post_submit": {
        const button = resolveSubmit(snapshot, transcript)
        if (!button) return { error: "Nothing to post.", hint }
        return simplePlan(button, "press", [], "Posting.", "Posted.")
      }
      case "back_to_gallery":
        return simplePlan("Back to examples", "press", [], "Going back.", "Back.")
      default:
        return { error: "Couldn't build that plan.", hint }
    }
  },
  dictation: {
    noun: (target) => {
      if (target.startsWith("Your reply")) return "reply"
      if (target.startsWith("Your quote")) return "quote"
      return "text"
    },
    label: (target) => {
      if (target.startsWith("Your reply")) return "Reply"
      if (target.startsWith("Your quote")) return "Quote"
      return "Text"
    },
    prompt: (target, source) => {
      if (source === "voice") {
        return 'Listening for your ' + (target.startsWith("Your reply") ? "reply" : "quote") + '. Say it, then "done".'
      }
      return "Adding to the " + (target.startsWith("Your reply") ? "reply" : "quote") + '. Type "done" when you finish.'
    },
    contentPlan: (target, text) => ({
      transcript: "",
      steps: [{ ref: target, action: "setValue", args: [text] }],
      say: "Setting the field.",
      done: "Field set.",
    }),
  },
  primitives: [
    "Timeline",
    "Tabs",
    "Toggle",
    "Collapsible",
    "Menu",
    "Dialog",
    "Avatar",
    "Button",
    "Input",
    "Textarea",
    "Toast",
  ],
}

// Keep helper exports for any external consumers.
export { sectionFromText, personFromText }
