# Voice UI

A social feed you can operate by voice, built on [ui-sdk](https://ui-sdk.dev) (`@ui-sdk/*`)
with React 19, Vite, TypeScript, Tailwind 4, and Bun.

The agent does not click pixels or inject JavaScript. It reads the UI's exposed component state
through the ui-sdk agent bridge, calls validated component actions, and verifies the result.

## Status

M1 is built, plus the M1.1 voice pass: a Create Post form from ui-sdk components, a single
agent bridge with a human-approval gate for publishing, and a voice panel (Web Speech adapter +
typed fallback) that drives the same bridge. Voice uses a deterministic grammar first and the
Gemini Decisions API for indirect phrasing, and a field name without content starts a
persistent dictation turn. The feed is not started.

```bash
bun install
bun run dev      # http://localhost:5173, then say or type a command in the pill
```

Try, in the pill's **Type** box:

```text
Visibility to followers.
open the community menu
change to product
set the title            → then say/type the title, then "done"
write the body           → then say/type the body, then "done"
turn comments off
review post
publish the post
```

The mic stays open across commands; press Stop to end the session. Without a Gemini key the
deterministic commands still work and indirect phrasings fall back to a suggestion.

## Scripts

```bash
bun install
bun run dev        # Vite dev server
bun run build      # typecheck + production build
bun run lint       # oxlint
bun run test       # Vitest (jsdom)
bun run test:watch # Vitest in watch mode
```

## Try the bridge

With the dev server running, open the console:

```js
await window.agent.act({
  steps: [
    { ref: "Post title", action: "setValue", args: ["A quieter web"] },
    { ref: "Post body", action: "setValue", args: ["Interfaces should be readable."] },
    { ref: "Community", action: "setValue", args: ["Design"] },
  ],
})
await window.agent.act({ steps: [{ ref: "Publish post", action: "press" }] })
```

The last call pauses on the in-app approval dialog. Only a person can answer it: the dialog's
content is `data-agent-hidden`, so it never appears in `snapshot()`.


Read **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the SDK research, architecture,
component contract, safety model, and milestone plan.

## Scripts

```bash
bun install
bun run dev      # Vite dev server
bun run build    # typecheck + production build
bun run lint     # oxlint
```

## Stack notes

- Packages are `@ui-sdk/react` and `@ui-sdk/core` — there is no `@vercel/ui` on npm.
- The SDK is unstyled: Tailwind styles parts through `data-slot` and state attributes.
- shadcn/ui is not used for interactive controls, because its bare `<button>`/`<input>` are
  invisible to the agent bridge.
