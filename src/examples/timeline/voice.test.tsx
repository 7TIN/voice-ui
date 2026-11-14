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

test("post commands press the open composer's button", async () => {
  render(<TimelinePage />)
  await settle()

  const opened = await agent.act({
    steps: [{ ref: "Reply to Ada Lovelace's post", action: "press" }],
  })
  expect(opened.ok, opened.error?.message).toBe(true)

  const cases: Array<[string, string]> = [
    ["post this reply", "Post reply to Ada Lovelace"],
    ["post reply", "Post reply to Ada Lovelace"],
    ["post reply to Ada", "Post reply to Ada Lovelace"],
    ["post reply to Ada Lovelace", "Post reply to Ada Lovelace"],
    ["submit this", "Post reply to Ada Lovelace"],
    ["post it", "Post reply to Ada Lovelace"],
    ["send it now", "Post reply to Ada Lovelace"],
  ]

  for (const [said, ref] of cases) {
    const result = await interpret(said, visibleSnapshot(), timelineVoice)
    expect(isPlan(result), said).toBe(true)
    if (!isPlan(result)) continue
    expect(result.steps, said).toEqual([{ ref, action: "press", args: [] }])
  }

  // A filled quote composer wins when the command names a quote.
  const quote = await agent.act({
    steps: [
      { ref: "Quote Ada Lovelace's post", action: "press" },
      { ref: "Your quote of Ada Lovelace", action: "setValue", args: ["Well said"] },
    ],
  })
  expect(quote.ok, quote.error?.message).toBe(true)

  const quoted = await interpret("post this quote", visibleSnapshot(), timelineVoice)
  expect(isPlan(quoted)).toBe(true)
  if (isPlan(quoted)) {
    expect(quoted.steps).toEqual([
      { ref: "Post quote of Ada Lovelace", action: "press", args: [] },
    ])
  }
})
