import { GoogleGenAI } from "@google/genai"

export type GeminiIntent =
  | "set_title"
  | "set_body"
  | "dictate_title"
  | "dictate_body"
  | "set_community"
  | "set_visibility"
  | "open_community"
  | "show_visibility"
  | "choose_option"
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
  "dictate_title",
  "dictate_body",
  "set_community",
  "set_visibility",
  "open_community",
  "show_visibility",
  "choose_option",
  "toggle_comments_on",
  "toggle_comments_off",
  "publish",
  "preview",
  "clear_title",
  "clear_body",
  "unknown",
]

/**
 * What each intent means, in the words a person would actually use. The
 * Decisions API sees these descriptions, never the keys, so the wording below
 * is the whole specification: examples, synonyms, indirect requests, negation
 * and the speech-to-text mistakes that surround them.
 */
const CRITERIA: Record<GeminiIntent, string> = {
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
  unknown:
    "No actionable request for the composer. " +
    "Chit-chat ('how are you', 'tell me a joke'), questions about how to use the app, " +
    "page text read aloud, random words, and fragments with neither a control nor an identifiable action. " +
    "A command with a clear control but an odd value is NOT unknown: classify the control so the app can " +
    "explain its options (e.g. 'community pizza' is set_community).",
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

/**
 * Classify a transcript into an intent using the Gemini Decisions API.
 * Returns null if the API call fails (caller should fall back to grammar).
 */
export async function classifyIntent(
  transcript: string,
  apiKey: string,
  context?: string,
): Promise<GeminiDecision | null> {
  try {
    const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" })

    const input = [
      "App: Murmur — a social post composer.",
      "Controls visible now:",
      context || "- (none reported)",
      "",
      'User said: "' + transcript + '"',
    ].join("\n")

    const result = await ai.decisions.create({
      model: "gemini-decision-1",
      input,
      questions: {
        is_command: {
          type: "noul",
          instructions:
            "Is this utterance a request to change, open, show, clear, preview or publish something " +
            "in the post composer? Fragments that name a control and a value count as commands " +
            "(for example 'visibility to followers'). Questions about how to use the app, " +
            "chit-chat, and page text read aloud do not.",
          criteria: {
            true_description:
              "The utterance asks to act on the post: set a field, choose an option, open or show a control, " +
              "toggle comments, clear a field, preview, or publish. Direct, indirect, incomplete and " +
              "speech-to-text-garbled commands all count.",
            false_description:
              "The utterance is chit-chat, a question about the app itself, page content read aloud, " +
              "a list of unrelated words, or has no identifiable action on the post.",
          },
        },
        intent: {
          type: "choice",
          instructions: INSTRUCTIONS,
          criteria: CRITERIA,
        },
      },
    })

    const scope = result.answers?.is_command
    const answer = result.answers?.intent

    const intent =
      answer?.type === "choice" && INTENTS.includes(answer.choice as GeminiIntent)
        ? (answer.choice as GeminiIntent)
        : "unknown"
    const confidence = (answer?.type === "choice" ? answer.confidence : undefined) ?? 0

    // A strong specific intent outranks a cautious "not a command" verdict,
    // but only when the utterance actually talks about the page. This rescues
    // fragments such as "Visibility to followers." while leaving page text like
    // "2 followers." alone.
    const ACTIONABLE =
      /\b(?:title|body|content|text|community|categor(?:y|ies)|audience|visibility|visible|privacy|private|comments?|repl(?:y|ies)|respond|publish|preview|review|clear|delete|remove|erase|open|show|display|set|change|switch|turn|enable|disable|allow|block|make|put|keep|share|see)\b/i
    const scopeScore = scope?.type === "noul" ? (scope.noul ?? 1) : 1
    if (
      scopeScore < 0.5 &&
      !(intent !== "unknown" && confidence >= 0.75 && ACTIONABLE.test(transcript))
    ) {
      return {
        intent: "unknown",
        confidence: Math.max(scopeScore, scope?.confidence ?? 0),
      }
    }

    return { intent, confidence }
  } catch {
    return null
  }
}
