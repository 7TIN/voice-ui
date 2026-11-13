# Voice UI

A social feed you can operate by voice, built on [ui-sdk](https://ui-sdk.dev) (`@ui-sdk/*`)
with React 19, Vite, TypeScript, Tailwind 4, and Bun.

The agent does not click pixels or inject JavaScript. It reads the UI's exposed component state
through the ui-sdk agent bridge, calls validated component actions, and verifies the result.

## Status

Planning. The first slice is a Create Post form built only from ui-sdk components, used to prove
agent-to-component control before voice or the feed is built.

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
