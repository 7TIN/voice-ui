# Voice UI — Project Documentation

A social feed you can operate with your voice, built on Vercel's [ui-sdk](https://ui-sdk.dev)
(`@ui-sdk/*`), React 19 + Vite + TypeScript, with Bun as the toolchain.

Status: **M0, M1, and the M1.1 voice pass built and verified (2026-11-14). M2 (feed) not started.**
Last researched: ui-sdk `0.1.0-beta.1` (public beta, APIs may change).

---

## 1. The product

Two ways to do everything:

- **Mouse + keyboard** — the app is a normal, fully usable social feed.
- **Voice** — press the mic, say "scroll one post", "like this post", "open its comments",
  "write a comment saying I really like this", "submit it".

Voice is not a chatbot bolted onto the side. It is a second input method that reaches the
*same* component state through the same API a keyboard user reaches. There is no voice-only
back door: if a control is not visible and operable by hand, the agent must not reach it either.

The agent never clicks coordinates, never reads pixels, never injects JavaScript. It reads the
UI's exposed state, picks a validated action, calls it, then verifies the result.

---

## 2. What ui-sdk actually is (verified, not assumed)

### 2.1 Package reality

| Assumption | Reality |
| --- | --- |
| Package is `@vercel/ui` | **Does not exist on npm.** The repo `vercel-labs/ui` publishes `@ui-sdk/*`. |
| There is a root import | Each component has its own entry: `@ui-sdk/react/input`, `@ui-sdk/react/select`, … |
| It ships styled components | Unstyled. Behavior, ARIA, focus, keyboard, popups, state. No visual design. |
| It is a Next.js thing | Framework-agnostic. React/Vue/Svelte/Solid/web components, works in Vite. |
| An agent can remote-control any site using it | Only a page that calls `createAgent()` and registers components exposes anything. |

Install:

```bash
bun add @ui-sdk/react @ui-sdk/core
```

`@ui-sdk/react` peers on React `>=19`, which this project already has.

### 2.2 The agent bridge (the part this project is built on)

```ts
import { createAgent } from "@ui-sdk/react/agent"

const agent = createAgent({ allow })
```

Created **once, in the browser, before the app renders**. It discovers ui-sdk components as
they mount, including ones created later and ones inside portals (dialogs, menus).

| Method | Behavior |
| --- | --- |
| `agent.snapshot()` | Synchronous list of components: `ref`, `component`, `label`, `row`, exposed state (`value`, `checked`, `open`, …), `items`, `actions`, `disabled`, `offPage`, `confirm`, `source` (dev only) |
| `agent.act({ steps })` | Runs steps in order. Stops at the first failure. **No rollback.** Returns `{ ok, error, steps, open, appeared, values }` |
| `agent.query({ text, within, kind })` | Finds components and list choices without dumping the page. Resolves to an array or `{ error }` |
| `agent.subscribe(fn)` | Fires on settled changes, from people *and* agents, with `source` and `reason` |

A step is `{ ref, action, args? }`, where `ref` is a bridge ref (`"c12"`), a label, row text, or
a component kind. Labels match whole words, case- and accent-insensitively. Ambiguous names
fail and the error lists the matches — that is useful, not a bug.

`act` is **not** "simulate a click". It calls the component's API. Consequences:

- `onKeyDown` / `onClick` checks never see agent actions.
- State must flow through `onValueChange` / `onCheckedChange` / `onOpenChange` callbacks.
- A callback can call `details.cancel()`; then `act` can return `ok: true` with **no change**.
  Verification is mandatory (see §8).
- `details.source === "agent"` distinguishes agent changes from human ones.

### 2.3 The three safety marks

| Attribute | Effect |
| --- | --- |
| `data-agent-confirm="Publishes this post"` | An agent alone cannot do it. The step waits for `allow` to return `true`. |
| `data-agent-secret` | Agent may type, never read. Value becomes `"[redacted]"`. |
| `data-agent-hidden` | Component is invisible to `snapshot`/`query`. |

`allow` is asked before the action, and may be asked once more while a popup is opened to
resolve a label. It returns `boolean` or `Promise<boolean>`. Without it, a confirm-marked step
fails with `Needs a person`.

### 2.4 Custom components are first-class

ui-sdk has no "feed", "post", or "notification row". A component built with `definePrimitive`
from `@ui-sdk/core` joins the bridge like a built-in, as long as it has:

- an accessible name on its root (`aria-label` or a label part),
- an `agent` key: `{ actions, closed, items, reveals, shown, secret }`,
- declared `controlled` state keys it wants exposed.

Rendered in React with `createParts(primitive, { root: "div" })` from
`@ui-sdk/react/primitive`. This is the SDK's sanctioned extension path — not a hack.

### 2.5 What is explicitly **not** available

- No remote control across origins. Our voice agent runs *inside* our page.
- No WebMCP requirement. `registerTools(agent, { allow })` is optional and only works where
  `document.modelContext` exists. We are not using it in the MVP.
- No built-in STT, LLM, or backend.
- No visual components: we style Tailwind against `data-slot` and state attributes.

**Correction to the original idea:** "an agent can control any site built with ui-sdk" is only
true for a site that (a) installs the bridge and (b) ships the agent that drives it, or exposes
WebMCP. For this project that is fine — we own the site, so the voice agent ships with it.

---

## 3. Stack decisions

| Area | Decision | Why |
| --- | --- | --- |
| Build tool | **Vite** (already scaffolded) | The brief said Next.js; the repo is Vite. Nothing in M0–M3 needs SSR. |
| Runtime/PM | **Bun** for install, scripts, tests, and the optional API proxy | One tool, fast. |
| UI behaviors | `@ui-sdk/react` + `@ui-sdk/core`, pinned to `0.1.0-beta.1` | Beta: pin exact versions, upgrade deliberately. |
| Styling | **Tailwind 4** directly on ui-sdk parts | ui-sdk is unstyled; Tailwind is already installed. |
| shadcn/ui | **Do not use for interactive controls** | Its `Button`/`Input` are bare `<button>`/`<input>`. The bridge only sees ui-sdk parts, so the agent would be blind to them. Borrow visual patterns only. |
| Icons | `lucide-react` | Small, tree-shakeable. |
| State | React state + context; `localStorage` for posts/drafts/history | No auth, no backend in the MVP. |
| Router | None in M0. Add React Router (or a tiny hash router) at M2 | Keep the first slice small. |
| Tests | Vitest + jsdom + Testing Library | Matches the SDK's own agent test recipe. |

Tailwind entry must declare the layer first:

```css
@layer ui-sdk;
@import "tailwindcss";
```

---

## 4. Architecture

```
 mic ──► Transcriber ──► transcript ──► Planner (LLM) ──► Plan (JSON)
                                                             │
                                                     Validator (live snapshot)
                                                             │
                                              agent.act({ steps })  ◄── allow / confirm
                                                             │
                                                   Component APIs (ui-sdk)
                                                             │
                                                     React state ──► DOM
                                                             │
                                              Verifier (result + fresh snapshot)
                                                             │
                                                  Voice log + status UI
```

### 4.1 Module boundaries

| Module | Responsibility | Must not |
| --- | --- | --- |
| `src/agent/bridge.ts` | Create the single bridge, wire `allow` to the confirmation controller, expose `window.agent` in dev | Know about speech or UI |
| `src/agent/context.ts` | Focus model: route, current post, last target, open overlay, recent commands | Call the model |
| `src/agent/snapshot.ts` | Project `agent.snapshot()` into a compact, prompt-safe form | Invent fields |
| `src/agent/planner.ts` | One LLM call → a `Plan` | Touch the DOM or the bridge |
| `src/agent/validate.ts` | Check steps against the live snapshot | Run actions |
| `src/agent/execute.ts` | `agent.act`, confirmations, verification, result reporting | Decide intent |
| `src/voice/transcriber.ts` | STT adapter (`start`, `stop`, interim + final events) | Know about components |
| `src/voice/useVoice.ts` | State machine and wiring | Contain UI |
| `src/ui/**` | Components and styling | Contain agent logic |
| `src/primitives/**` | Custom ui-sdk primitives + React parts | Contain app data |

The direction is one-way: UI → bridge → agent modules. Agent modules never reach into React
state directly; UI changes arrive through component callbacks.

### 4.2 One bridge, created first

```ts
// src/agent/bridge.ts
import { createAgent } from "@ui-sdk/react/agent"

export const agent = createAgent({
  allow: (step, { signal }) =>
    step.confirm ? askForConfirmation(step.confirm, { signal }) : true,
})
```

```tsx
// src/main.tsx — import before render so the bridge sees components as they mount
import "./agent/bridge"
```

`askForConfirmation` returns a promise resolved by the in-app confirm card (and, from M3, by
"yes"/"no"). It must reject-resolve `false` on timeout so the step fails cleanly.

Do **not** pass `allow: () => true`. That silently removes the human gate for publish/submit.

---

## 5. Component contract

### 5.1 M0 — the first slice: a Create Post form

Built **only** from ui-sdk parts, no custom primitives, no voice. It proves the bridge before
anything else is built, and it is not throwaway: it becomes the app's composer.

| Control | ui-sdk | Label (unique, human) |
| --- | --- | --- |
| Title | `Field` + `FieldLabel` + `Input` | `Post title` |
| Body | `Field` + `FieldLabel` + `Textarea` | `Post body` |
| Community | `Field` + `Select` (+ `items`) | `Community` |
| Visibility | `Field` + `Radio` (Everyone / Followers / Only me) | `Who can see this` |
| Comments | `Field` + `Switch` | `Allow comments` |
| Preview | `Dialog` with `DialogTitle` | `Preview post` |
| Publish | `Button` with `data-agent-confirm="Publishes this post to the feed"` | `Publish post` |
| Discard | `AlertDialog` → confirm button `Discard draft` | `Discard draft` |

Notes:

- `Select` gets `items` up front so the bridge can read choices while the popup is closed.
- `Publish` is a `type="submit"` Button; validation lives in the Field's `invalid` + `FieldError`.
- The form keeps values in React state through `onValueChange`, never via DOM reads.
- No `disabled` Publish. Use `focusableWhenDisabled` so the control stays discoverable and its
  hint explains what is missing.

**Built** in `src/components/compose-page.tsx` (the form, the preview dialog, the discard alert
dialog, and the published state), with the page chrome in `src/App.tsx`. What the build changed
from the plan above:

- The radio hints ("Anyone on Murmur") sit next to each label. ui-sdk composes an item's label
  from its text content, so the hint is `aria-hidden="true"`; otherwise the agent sees
  `EveryoneAnyone on Murmur`. A test asserts the item labels are exactly the three options.
- Empty drafts have a `Publish post` Button with `actions: []` (disabled) — the agent cannot
  publish nothing, and the hint says why.
- Discard's confirm button reads `Delete draft`, deliberately different from the `Discard draft`
  trigger, so a `press` step's text matches one button only.
- `ConfirmationDialog`, the `AgentInspector`, and the toast region are all `data-agent-hidden`:
  an agent can neither approve its own request nor drive the dev panel.
- ui-sdk ships no dialog positioning. Its `web.css` theme is not imported, and Tailwind's
  preflight resets the browser's `margin: auto` on a top-layer dialog, so an unstyled
  `DialogContent` lands in the top-left corner. `dialogSurfaceClass` in
  `src/components/button-styles.ts` restores centring with `fixed inset-0 m-auto` plus a
  `max-height` and scroll, and all three dialogs use it.
- The preview and discard dialogs pass `container={document.body}`, so their content renders
  outside the composer `<form>`. ui-sdk warns about nested forms otherwise, and any field added
  to a dialog later would silently join the composer's form. Focus, Escape and scroll locking
  follow the container.
- Verified in headless Chrome through the bridge itself: fill (5 steps), publish refused, publish
  approved, preview and discard dialogs centred, and the dialog label changing to its title when
  open (use `ref` for a follow-up step).

### 5.2 Social app mapping

| Need | ui-sdk | Agent action(s) |
| --- | --- | --- |
| Sidebar navigation | `Button` (or `Tabs` for the current section) | `press` |
| Search box | `Combobox` or `Input` | `setValue`, `clear` |
| Search results | `Listbox` | `setValue` |
| Notifications | `Dialog` + `Scroll Area` + `Button` rows | `open`, `press` |
| Like / unlike | `Toggle` with `defaultPressed` | `press`, `setPressed` |
| Open comments | `Button` or `Collapsible` | `press` / `setOpen` |
| Comment composer | `Textarea` + `Button` (`data-agent-confirm`) | `setValue`, `press` |
| Post details | `Dialog` | `open`, `close` |
| New post | `Dialog` + the M0 form | `open`, `press` |
| Profile panels | `Tabs` | `setValue` |
| Toasts / status | `Toast` region, `data-agent-hidden` | — |
| **Feed** | **custom primitive** (§5.3) | `next`, `previous`, `goTo` |

Rule: never hardcode the action list in app code. Read `entry.actions` from the snapshot and
pass that verbatim to the planner. The table above is for humans, not for the model.

### 5.3 The one custom primitive: Feed

No ui-sdk component models "a list with a current item that scrolls by one". `Carousel` has
slide semantics and `Scroll Area` has no notion of a current item, so this is built once with
`definePrimitive`:

```ts
// src/primitives/feed/feed.ts
import { definePrimitive } from "@ui-sdk/core"

export const feed = definePrimitive({
  name: "feed",
  // state: { index, total }, controlled: ["index"],
  // api: next(), previous(), goTo(i), first(), last()
  agent: { actions: ["next", "previous", "goTo", "first", "last"] },
  // slots: root, item
})
```

Requirements:

- Root is named (`aria-label="Feed"`), items are named by their post title/author.
- `next`/`previous` both scroll the container and update `index` through `createChange`, so the
  agent's change is reported with `source: "agent"` and can be cancelled.
- `goTo` validates its argument (`Number.isInteger`, in range) inside the method — non-`set`
  action arguments arrive unchecked.
- State is exposed so verification can read `index` back.

**Decision to confirm:** composed ui-sdk parts for the post card (Toggle + Buttons) in M2;
extract a `post` primitive only if the snapshot becomes noisy. Prefer composing what the SDK
ships over rewriting it.

### 5.4 Naming rules (this is load-bearing)

The model finds targets by label, so labels are the API.

- Unique where they sit: `Like Ada Lovelace's post`, not `Like`. Every repeated row control
  derives its label from data.
- A row's controls each need their own verb; never name a control the bare post title.
- Labels inside a dialog must differ from the page's, because the bridge still sees the page
  behind an open modal.
- Items and tabs are named by their visible text; `aria-label` on an item is ignored.
- Two "Name" fields are fine only if `row` text disambiguates them.
- Every control gets a label or an `aria-label`. The M0 test walks the whole snapshot and fails
  on any unnamed entry.
- A dialog is named by its trigger while closed and by its `Title` while open (`Preview post` →
  `Post preview`). That is fine for a person, but a plan that opens something and then closes it
  must address the second step by `ref`, not by the old label. The planner replaces labels with
  refs from the same snapshot before it calls `act`.


---

## 6. Voice pipeline

### 6.1 States

`idle → listening → transcribing → planning → confirming → executing → done | error`

Only one command runs at a time; results are serialized through a promise chain so a long
dictation cannot interleave with a plan. The recognizer is **continuous**: `done` returns to
`listening` while the microphone session is open, and a silence `end` restarts it after 250 ms.
The person closes the session with the Stop button.

A **dictation turn** is `listening` with `dictation: "title" | "body"` set. In that state the
next words are content, not commands: they are written straight through `contentPlan()` and
never classified. `done` (or `"…, done"`) commits and returns to command listening; `cancel`
discards. The accumulation survives pauses because the recognizer is continuous and every final
chunk appends to the same buffer.

### 6.2 Speech-to-text

| Option | Cost | Key | Trade-off |
| --- | --- | --- | --- |
| **Web Speech API** (`SpeechRecognition`) | free | none | Chrome/Edge only, online, interim + continuous results, no control over model |
| Hosted STT (Groq Whisper, OpenAI, Deepgram) via our Bun proxy | per minute | server-side | Better accuracy/latency control, needs a server |
| Local whisper.cpp | free | none | Heavy install, slow start |

**MVP: Web Speech API behind a `Transcriber` interface**, with a **typed-command fallback** that
feeds the exact same pipeline. The typed path is also the dev harness and the E2E hook.

The DOM type for `SpeechRecognition` is not in TS's default lib; add a small ambient declaration
rather than sprinkling `any`.

### 6.3 Decision model

Two layers, one output shape (`Plan`):

1. **Grammar first** (`interpretGrammar`, `src/agent/interpret.ts`): deterministic rules for the
   common phrasings, exact values, menu opening, sequences ("open the community menu and change
   to product"), and dictation primers. Instant, free, offline.
2. **Gemini Decisions API** (`classifyIntent`, `src/agent/gemini.ts`, model
   `gemini-decision-1`) when the grammar misses. It is a **classifier**, not a generator: it
   returns one intent and a calibrated confidence. Parameters are extracted deterministically
   afterwards by scanning the transcript against the control's real items and aliases.

The Decisions API question set is:

- `is_command` — a `noul` scope check that rejects chit-chat, questions about the app, and page
  text read aloud.
- `intent` — a `choice` question over 16 intents: set/clear title or body, dictate title or body,
  set community or audience, open the community menu, show the audience choices, choose an open
  option, comments on/off, publish, preview, unknown.

The prompt itself is the specification: each intent carries its use case, direct and indirect
examples, synonyms, negation, and the speech-to-text slips it should forgive (`review`/`preview`,
`of`/`off`, `too`/`to`, `these`/`this`, `comedy`/`community`, `produce`/`Product`,
`follow us`/`followers`, `only need`/`Only me`). The visible controls (labels, current values,
open state, and options) are passed as context, so "change to product" while the Community menu
is open is understood as that menu's option.

A strong intent (≥ 0.75) overrides a cautious `is_command: false` only when the transcript
mentions a control or an action word. This rescues fragments like "Visibility to followers."
while leaving page text like "2 followers." alone. The overall intent threshold is 0.4; below
it, the pill says what it heard and suggests a phrasing.

Deterministic value matching (`mention`) accepts the label, the raw value, curated aliases
("public" → Everyone, "just for me" → Only me, "people who follow me" → Followers), whole-word
containment, and one-or-two-character speech-to-text slips. A later mention wins, because people
finish with the value.

### 6.4 API keys in a Vite app

Vite ships only client code, so a key in the bundle is public. The current demo setup:

- `VITE_GEMINI_API_KEY` in `.env` is the first source; `.env` is gitignored and
  `.env.example` lists the name only.
- Otherwise the pill's **Key** panel stores the key in `localStorage["gemini-api-key"]`.
- No key → grammar-only mode. Every deterministic command still works; indirect phrasings fall
  back to the "I don't know that one yet" hint.

This is a demo convenience, not a production posture. The open follow-up is a Bun proxy holding
`GEMINI_API_KEY` server-side and exposing `/api/classify`, so the client bundle stays clean.

### 6.5 Dictation and persistence

Saying a field's name without its content starts a dictation turn:

| Said | Effect |
| --- | --- |
| "set the title", "write the title", "let me dictate the title" | `dictate: "title"` |
| "write the body", "write the post", "I want to write a long post" | `dictate: "body"` |
| "set the title to X" (content present) | normal `setValue` plan |
| "done", "that's it", "…, done" | commit and return to command listening |
| "cancel", "never mind", "forget it" | discard, nothing written |

While dictating, the pill shows the growing text in its hint; each final chunk is written to the
field immediately, so a long sentence survives a pause or a recognizer restart. The microphone
stays open after the commit (persistent session) until Stop is pressed.

The typed fallback follows the same state machine: type "write the body", then type the body,
then "done". It is also the way to exercise dictation in a browser without a microphone, and in
jsdom tests.

---

## 7. Planning contract

```ts
type Step = { ref: string; action: string; args?: unknown[] }

type Plan =
  | { kind: "act"; steps: Step[]; say?: string }
  | { kind: "ask"; question: string; options?: { label: string; ref?: string }[] }
  | { kind: "unsupported"; say: string }
```

The model returns JSON only; a parser validates shape and rejects anything else. Unknown keys,
extra fields, and steps that do not validate are discarded — never "repaired" silently.

Validation against a **fresh** snapshot, per step:

1. `ref` resolves to exactly one entry.
2. Not `offPage`, not `disabled`.
3. `action` is in `entry.actions`.
4. Argument shape is plausible for the component (`setValue` needs 1 arg; `press` takes 0–1).
5. Target is not hidden.

Because `act` stops at the first failure and does not roll back, plans are short and ordered,
and a failure is reported as "did step 2 of 3, then stopped", never as full success.

---

## 8. Execution and verification

```ts
const result = await agent.act({ steps })

if (!result.ok) return reportFailure(result.error) // { step, message }

const after = agent.snapshot()
for (const done of result.steps) {
  // done.changes may be absent even when ok === true (a callback cancelled it)
  // done.gone means the component left the page (e.g. a dialog closed)
  // for state, re-read the target entry and compare to the expected value
}
```

Success requires **all** of:

- `result.ok === true`;
- every step has the expected `changes` entry, or the target's live state matches;
- nothing expected disappeared (`gone`) unexpectedly.

Otherwise the UI says what did happen. `ok` alone is not proof — the SDK documents this
explicitly. Observations from `agent.subscribe` feed the command history and the context
resolver, so a mouse user's like is visible to the next voice command.

---

## 9. Context and references

```ts
interface UiContext {
  route: "feed" | "post" | "profile" | "notifications" | "search"
  currentPostId?: string
  openOverlay?: { kind: "dialog" | "menu" | "popover"; ref: string }
  lastTarget?: { ref: string; postId?: string }
  visiblePosts: { id: string; author: string; refs: Record<string, string> }[]
  recent: CommandRecord[]
}
```

Resolution order, computed in app code before the model sees anything:

| Utterance | Resolves to |
| --- | --- |
| "this post" / "it" | open post detail → last acted post → post at feed `index` |
| "that post" | last highlighted/last acted post, else ask |
| "next / previous post" | `feed.next` / `feed.previous` |
| "the second post" | `visiblePosts[1]` |
| "the first comment" | first comment in the open detail dialog |
| "my profile" | route intent, not a ref |
| "go back" | previous route from history |

The model receives the resolution as context and still has to name a real ref. If two posts
match, it returns `ask` with the candidates.

---

## 10. Safety

- **Whitelist only.** A step runs only if its ref and action exist in the live snapshot.
  No eval, no `Function`, no `innerHTML`, no synthetic DOM events, no URL fetching.
- **Confirmations.** `data-agent-confirm` on Publish, Submit comment, Discard draft, Delete.
  `allow` shows the sentence and waits. Timeout → refuse.
- **Prompt injection.** Post/comment text is user data. It is delimited, labelled as data, and
  can never widen the action set. The validator is the real boundary, not the prompt.
- **No exfiltration.** The agent cannot navigate to model-supplied URLs; routes are an enum.
- **No secrets.** Nothing sensitive is stored; `data-agent-secret` is unused in the MVP.
- **Voice is not privileged.** Anything voice can do, a keyboard user can do and undo.

---

## 11. UI/UX

- Layout: 240px sidebar, 680px feed column, optional 320px right rail for command history.
- Palette: neutral zinc surfaces, one accent (indigo/emerald), no gradients, no glow.
- Type: one sans (Geist/Inter), 14px base, 13px metadata, tight heading scale.
- Borders: 1px `zinc-200`; one shadow only for popups.
- Motion: 150ms ease for state, 200ms for popups; respect `prefers-reduced-motion`.
- Mic: fixed bottom-right pill on wide screens so it never covers the composer's Publish action,
  centred on narrow screens. Idle = outline, listening = pulsing ring, planning/executing =
  spinner + verb ("Thinking…", "Opening comments…"), error = amber.
- Dictation: the status names the field ("Listening for the title…") and the hint shows the
  text as it grows. The mic label becomes "Stop dictating" while the turn is live.
- Live transcript: interim text in lighter weight, final text in normal weight.
- Command log: each command expands to its steps with ✓/✗ and the model's `say` line.
- Confirmation card (built): the exact `data-agent-confirm` sentence, Cancel / Approve, and a note
  that the request came from an agent. No countdown yet — the bridge's 120s `timeout` aborts the
  request, which resolves the card as a refusal. It is `data-agent-hidden` on purpose.
- Errors: plain language plus a suggestion ("I found two posts by Ada. Which one?").
- Accessibility: the voice panel is a labelled region, status updates are `aria-live="polite"`,
  and the typed fallback is fully keyboard reachable.

The M0 page and the M1 voice pill implement the palette, type, borders and motion above; the
sidebar, right rail, feed, and command log arrive with M2–M4.


---

## 12. Roadmap

### M0 — Bridge + Create Post form (no voice) — **done**

Built: `src/agent/bridge.ts` imported first in `src/main.tsx`, the form from §5.1, a dev-only
`AgentInspector` panel that lists `snapshot()`, runs one `act` step, and shows the raw result.

Verified:

- `bun run lint`, `bun run test` (4 tests), and `bun run build` all pass.
- Every snapshot entry has a label and at least one action, except the empty-draft `Publish post`
  (deliberately `disabled`, `actions: []`).
- `agent.act` fills all five fields in one call; a fresh snapshot shows the same values the page
  renders.
- `press` on `Publish post` is refused without `allow`, then succeeds once the in-app dialog is
  approved, and the published card appears.
- The approval buttons and the inspector do not appear in `snapshot()`.
- Reviewed in headless Chrome at 1440px: the form, the filled state, the approval card, the
  preview dialog, the discard dialog and the published card. Screenshots drove two fixes —
  dialog centring and the preview close button's focus ring.

**Verify this before anything else.** If `act` cannot drive the form, nothing downstream matters.

### M1 — Voice on the form — **done**

Web Speech adapter (`src/voice/transcriber.ts`), a `useVoice` state machine, a compact mic pill
with a typed fallback, a deterministic rule interpreter (`src/agent/interpret.ts`), an executor
with a pre-check and a post-verify (`src/agent/execute.ts`), and the pill's integration in
`App.tsx`.

- The pill is `data-agent-hidden`: an agent can read and drive the composer, but it must never
  drive the thing that drives the agent. The typed box is a disclosure ("Type") so the pill
  stays compact and the composer's Publish button is not covered.
- The adapter is the only Web Speech code: `createWebSpeechTranscriber({ Ctor })` accepts an
  injectable constructor, so a provider stream can replace it without touching the pipeline.
- `interpret` returns a `Plan` shaped like a model's output; the hook, executor and verifier
  do not change when the interpreter does. Case-preserving via `new RegExp(source, "i")`.
- `executePlan` re-reads the snapshot, checks every step, runs `agent.act`, then polls the
  snapshot for up to 500 ms — `ok: true` from the bridge is not enough, a change callback can
  still have cancelled a step.
- The mic pill's error mapping covers `not-allowed`, `no-speech`, `audio-capture`, `network`,
  `aborted`, `unsupported` and a failing `start()`.

Verified: `bun run lint`, `bun run test` (13 tests at the time), `bun run build` all green; headless Chrome
drove the typed path end to end — unknown command → error, "set the title to …" → "Title set."
with the snapshot matching, body, comments off, publish → approval → "Published." with the
published card. The mic click in headless returns "Microphone access is blocked.", mapped from
`not-allowed`. Zero console warnings. The pill's controls (`Start listening`, `Type`, `Command`,
`Run`) do not appear in `agent.snapshot()`.

Status text and hints are kept short so they fit the 320 px pill on wide screens. Voice uses
the browser's speech service, so the header no longer claims nothing leaves the tab.

### M1.1 — Gemini classification, fuzzy values, and dictation — **done**

- `src/agent/gemini.ts` calls the Gemini Decisions API. Its prompt documents every intent with
  use cases, indirect phrasings, negation and STT confusions; the visible controls are passed as
  context (including open menus and their options).
- The grammar gained: open/show community and audience, generic "change to X" that resolves
  against the page's real items (open menu first), audience/community aliases, comment negation,
  indirect publish/preview, and two-command sequences joined by "and"/"then".
- Saying a field name without content starts dictation. The voice session is continuous and
  persistent; dictation text is written straight through `contentPlan()`, never classified.
- `executePlan` verifies state after the fact, so an open menu followed by a selection is
  checked against the final value.

Verified: 18 Vitest tests green (`bun run test`), `bun run build` green. Headless Chrome with the
typed path: "Visibility to followers." → Followers; "Show Community." → menu open; "change to
product" → Product; "open the community menu and change to design" → both steps; dictation into
title and body across chunks; Gemini-only phrasings ("Could you make this visible only to my
followers", "Nobody can reply to this", "Show me who can see this") resolved; "2 followers."
correctly rejected as page text.

### M2 — Feed and posts

Mock data, feed primitive, post cards, like toggle, scroll commands, open details, art direction.

### M3 — Comments, composer, confirmations

Comment list and composer per post, confirm-before-submit by voice, context memory across
commands ("open its comments" → "write a comment saying …" → "submit it"), ambiguity handling.

### M4 — Polish

Search, profile, notifications, command history persistence, undo of the last agent action,
latency tuning, reduced-motion, mobile layout.

---

## 13. Testing

| Layer | Tool | What |
| --- | --- | --- |
| Types | `bun run build` (`tsc -b`) | Strict mode, no `any` in agent modules |
| Components | Vitest + jsdom + Testing Library | Render, naming, callbacks |
| Agent | Vitest + `createAgent()` | The SDK's snapshot/act test, per surface |
| Logic | Vitest | Validator, context resolver, plan parser, verifier |
| Voice | Vitest | Transcriber adapter with a fake, state machine transitions |
| E2E | Playwright (M2+) | Mic mocked by injecting a transcript into the typed path |

Every interface gets the agent test from the SDK docs: assert every entry is named, then `act`
on every control the feature promises.

The agent tests assert against `agent.snapshot()` rather than the DOM, and they run the real
bridge (`src/agent/bridge.ts`), so the permission path is exercised too: the test subscribes to
the confirmation store and answers it like the dialog would.

`jsdom` is pinned to `26.1.0`. jsdom 31 depends on `undici@8`, whose `decompress.js` calls
`zlib.createZstdDecompress()` at import time; that is missing on Node 22.12, so Vitest failed to
start any worker. Keep the pin until Node on this machine ships zstd, or move to happy-dom.

---

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| Beta API churn | Pin `0.1.0-beta.1`; read `node_modules/@ui-sdk/react/docs/` for the installed version |
| Ambiguous labels in repeated rows | Per-row labels generated from data; test for uniqueness |
| `ok: true` but no change | Always verify `changes` / live state |
| Model hallucinating refs/actions | Validator rejects; `ask` is a valid outcome |
| Web Speech API missing | Typed fallback shares the pipeline; adapter swap later |
| Latency (STT 0.3–0.8s + LLM 0.5–1.5s) | Visible status, short plans, no animation blocking |
| Keys exposed in a static build | Bun proxy; no key in client; `.env.local` gitignored |

---

## 15. Non-goals (MVP)

Authentication, real backend, real-time/multi-user, media upload, mobile native, controlling
other sites, WebMCP registration, TTS replies, i18n, offline mode.

---

## 16. Open questions

1. ~~**Decision model provider.**~~ Answered: Gemini Decisions API (`gemini-decision-1`) for intent
   classification. Falls back to grammar when no key is set. Jev (TypeSafe) is a future upgrade.
2. ~~**M0 identity.**~~ Answered: the Create Post form, which becomes the real composer. Built.
3. **Bun proxy.** OK to add `server/` + `bun run dev` running both? Without it, no LLM key can be
   shipped safely. Currently using localStorage + env var for the key.
4. **Feed mechanics.** Snap one post per viewport (strong "scroll one post" semantics) or a
   continuous list where "current post" is the centered one? I recommend snap.
5. **TTS replies.** Speak confirmations back ("Liked") in M3, or text-only for the MVP?

---

## 17. Commands

```bash
bun install
bun add @ui-sdk/react @ui-sdk/core lucide-react
bun run dev        # vite
bun run build      # tsc -b && vite build
bun run lint       # oxlint
bun run test       # vitest run (jsdom)
bun run test:watch # vitest
```

Today `bun run dev` serves the Vite app only; there is no `server/` proxy yet.
