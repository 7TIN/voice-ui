import { createAgent, registerTools } from "@ui-sdk/react/agent"
import { askForConfirmation } from "./confirmation"

export const agent = createAgent({
  allow: (step, { signal }) =>
    step.confirm ? askForConfirmation(step.confirm, { signal }) : true,
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
