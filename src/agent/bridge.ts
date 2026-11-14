import { createAgent, registerTools } from "@ui-sdk/react/agent"

export const agent = createAgent({
  // Actions run without a human-approval popup. Consequential controls still
  // carry `data-agent-confirm`, so the snapshot keeps describing which actions
  // are consequential; the app just no longer gates them behind a dialog.
  allow: () => true,
  timeout: 120_000,
})

const unregisterTools = registerTools(agent, {
  allow: () => true,
})

if (import.meta.hot) {
  import.meta.hot.dispose(unregisterTools)
}

if (import.meta.env.DEV) {
  Object.assign(window, { agent })
}
