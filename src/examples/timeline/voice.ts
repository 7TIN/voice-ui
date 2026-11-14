import type { AgentComponent } from "@ui-sdk/react/agent"
import { spoken } from "../../agent/interpret"
import type {
  DictationRequest,
  Plan,
} from "../../agent/plan"
import type { ExampleVoice } from "../types"
import {
  POST_AUTHORS,
  SUGGESTED_PEOPLE,
  TIMELINE_SECTIONS,
} from "./data"

const hint =
  'Try "like Ada\'s post", "show comments on Kofi\'s post", ' +
  '"go to explore", "follow Margaret Hamilton", or "report Linus\'s post".'

function authorFrom(text: string): string | null {
  const key = text.toLowerCase()
  for (const author of POST_AUTHORS) {
    const first = author.split(" ")[0].toLowerCase()
    if (key.includes(author.toLowerCase()) || key.includes(first)) return author
  }
  const ordinals = ["first", "second", "third", "fourth"]
  for (let index = 0; index < ordinals.length; index += 1) {
    if (key.includes(ordinals[index]) || key.includes(String(index + 1))) {
      return POST_AUTHORS[index] ?? null
    }
  }
  if (key.includes("last")) return POST_AUTHORS[POST_AUTHORS.length - 1] ?? null
  return null
}

function resolvePost(text: string): string | null {
  const author = authorFrom(text)
  if (author) return author
  if (/\b(?:this|it|the\s+post|post)\b/i.test(text)) return POST_AUTHORS[0] ?? null
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
      /^Your (?:reply|quote) to /.test(component.label ?? ""),
  )
  const isQuoteHint = /quote/i.test(text)
  let candidates = textareas
  if (isQuoteHint) {
    candidates = textareas.filter((component) => /quote/i.test(component.label ?? ""))
  } else {
    candidates = textareas.filter((component) => /reply/i.test(component.label ?? ""))
  }
  if (!candidates.length) candidates = textareas
  const active =
    candidates.find((component) => component.value && String(component.value).trim()) ??
    candidates[0] ??
    textareas[0]
  if (!active?.label) return null
  const author = active.label.replace(/^Your (?:reply|quote) to /, "")
  const isQuote = /quote/i.test(active.label)
  return isQuote ? "Post quote of " + author : "Post reply to " + author
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

const rules = [
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
    build: (match: RegExpMatchArray) => {
      const author = resolvePost(match.input ?? "")
      if (!author) return null
      return simplePlan(
        postLabel(author, "options"),
        "press",
        ["Report post"],
        "Reporting the post.",
        "Reported.",
      )
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
    pattern: /^(?:post|submit|send|publish)\s+(?:this|it|the\s+(?:reply|quote|message))?$/,
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
      "Examples: 'reply to this post', 'reply to Ada's post', 'reply saying hello', " +
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
      "Examples: 'open the options', 'show options for this post', 'post options'.",
  },
  {
    intent: "report_post",
    criteria:
      "The speaker wants to report a post. " +
      "Examples: 'report this post', 'report Ada's post', 'report it'. " +
      "Reporting needs a person's approval.",
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
      "Examples: 'post this reply', 'post this', 'submit this', 'send it', 'publish this message'.",
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
  "   or by 'this'/'it' when a post is in focus. 'Like Ada's post' = like_post.",
  "3. A person is identified by name or handle in the right-hand 'Who to follow' list.",
  "4. 'Follow' and 'unfollow' refer to people, never to posts.",
  "5. 'Report' is consequential and always needs a person's approval; still classify it.",
  "6. 'Reply saying X' and 'quote saying X' carry the text X; 'reply' alone starts dictation.",
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
    /\b(?:post|like|heart|repost|retweet|reply|quote|comment|follow|unfollow|report|option|next|previous|section|home|explore|notification|message|bookmark|profile|open|show|go|new)\b/i,
  scope: {
    instructions:
      "Is this utterance a request to act on the timeline: like, repost, reply, quote, " +
      "show or hide comments, move between posts, follow a person, open options, report, " +
      "switch sections, or return to the gallery? Questions about the app, chit-chat and " +
      "page text read aloud are not.",
    trueDescription:
      "The utterance asks to act on a post or the timeline: like, repost, reply, quote, " +
      "comments, navigation, follow, options, report, section switch, or back. " +
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
        return simplePlan(postLabel(author, "options"), "press", ["Report post"], "Reporting the post.", "Reported.")
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
