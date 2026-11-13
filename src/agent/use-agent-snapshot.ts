import { useEffect, useState } from "react"
import type { AgentComponent } from "@ui-sdk/react/agent"
import { agent } from "./bridge"

function readSnapshot() {
  return agent.snapshot().filter((entry) => !entry.offPage)
}

export function useAgentSnapshot(active = true) {
  const [components, setComponents] = useState<AgentComponent[]>([])

  useEffect(() => {
    if (!active) return

    const refresh = () => setComponents(readSnapshot())
    refresh()

    const unsubscribe = agent.subscribe(refresh)
    const interval = window.setInterval(refresh, 1000)

    return () => {
      unsubscribe()
      window.clearInterval(interval)
    }
  }, [active])

  return components
}
