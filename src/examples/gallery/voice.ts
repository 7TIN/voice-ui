import type { ExampleVoice } from "../types"

export const galleryVoice: ExampleVoice = {
  id: "gallery",
  app: "Murmur — a gallery of voice-controllable ui-sdk examples.",
  hint:
    'Try "open the timeline example", "open the form example", or "back to the examples".',
  suggestions: [
    "open the timeline example",
    "open the form example",
  ],
  rules: [
    {
      pattern: /^(?:open|show|go\s+to)\s+(?:the\s+)?(?:timeline|twitter|feed|posts?)\s*(?:example)?$/,
      build: (_match, snapshot) => {
        const button = snapshot.find(
          (component) =>
            !component.offPage &&
            component.actions.includes("press") &&
            normalizeLabel(component.label ?? "") === "open timeline example",
        )
        if (!button) return { error: "No timeline example card found.", hint: "Open the gallery." }
        return {
          transcript: "",
          steps: [{ ref: button.label ?? button.ref, action: "press", args: [] }],
          say: "Opening the timeline example.",
          done: "Timeline example opened.",
        }
      },
    },
    {
      pattern: /^(?:open|show|go\s+to)\s+(?:the\s+)?(?:form|composer|post\s+composer)\s*(?:example)?$/,
      build: (_match, snapshot) => {
        const button = snapshot.find(
          (component) =>
            !component.offPage &&
            component.actions.includes("press") &&
            normalizeLabel(component.label ?? "") === "open form example",
        )
        if (!button) return { error: "No form example card found.", hint: "Open the gallery." }
        return {
          transcript: "",
          steps: [{ ref: button.label ?? button.ref, action: "press", args: [] }],
          say: "Opening the form example.",
          done: "Form example opened.",
        }
      },
    },
  ],
  intents: [],
  unknown:
    "No actionable request for the gallery. Commands here open an example card.",
  instructions: ["You classify commands that open one of the example cards."],
  actionable: /\b(?:open|show|go|form|timeline|composer|example)\b/i,
  scope: {
    instructions:
      "Is this utterance a request to open one of the example cards? " +
      "Questions about the app itself, chit-chat and unrelated words are not.",
    trueDescription:
      "The utterance asks to open or show an example: the form example or the timeline example.",
    falseDescription:
      "The utterance is chit-chat, a question about the app, or unrelated.",
  },
  buildPlan: () => ({ error: "I don't know that one yet.", hint: "Try “open the timeline example”." }),
  dictation: {
    noun: () => "text",
    label: () => "Text",
    prompt: () => "Type a command.",
    contentPlan: (target, text) => ({
      transcript: "",
      steps: [{ ref: target, action: "setValue", args: [text] }],
      say: "Setting the field.",
      done: "Field set.",
    }),
  },
  primitives: ["Button"],
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase()
}
