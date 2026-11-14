import { act, render } from "@testing-library/react"
import { expect, test } from "vitest"

import { agent } from "../../agent/bridge"
import { interpret } from "../../agent/interpret"
import { isDictation, isPlan } from "../../agent/plan"
import { TimelinePage } from "./timeline-page"
import { timelineVoice } from "./voice"

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function visibleSnapshot() {
  return agent.snapshot().filter((entry) => !entry.offPage)
}


test("timeline grammar maps voice to components", async () => {
  render(<TimelinePage />)
  await settle()

  const cases: Array<[string, string, string, unknown]> = [
    ["like Ada's post", "Like Ada Lovelace's post", "setPressed", true],
    ["repost Grace Hopper's post", "Repost Grace Hopper's post", "setPressed", true],
    ["show comments on Kofi's post", "Comments on Kofi Mensah's post", "setOpen", true],
    ["open the options for Linus's post", "Options for Linus Park's post", "setOpen", true],
    ["go to explore", "Sections", "setValue", "explore"],
    ["follow Margaret Hamilton", "Follow Margaret Hamilton", "setPressed", true],
    ["next post", "Next post", "press", undefined],
  ]

  for (const [said, ref, action, arg] of cases) {
    const result = await interpret(said, visibleSnapshot(), timelineVoice)
    expect(isPlan(result), said).toBe(true)
    if (!isPlan(result)) continue
    expect(result.steps, said).toEqual([
      action === "press"
        ? { ref, action, args: [] }
        : { ref, action, args: [arg] },
    ])
  }

  const reply = await interpret("reply to Ada's post", visibleSnapshot(), timelineVoice)
  expect(isDictation(reply)).toBe(true)
  if (isDictation(reply)) expect(reply.dictate).toBe("Your reply to Ada Lovelace")

  const unknown = await interpret("make me a sandwich", visibleSnapshot(), timelineVoice)
  expect(isPlan(unknown)).toBe(false)
  expect(isDictation(unknown)).toBe(false)
})
