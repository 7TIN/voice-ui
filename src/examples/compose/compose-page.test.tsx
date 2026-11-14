import { act, render, screen, waitFor } from "@testing-library/react"
import { expect, test } from "vitest"
import type { AgentComponent } from "@ui-sdk/react/agent"
import { agent } from "../../agent/bridge"
import { ComposePage } from "./compose-page"

function renderPage() {
  return render(<ComposePage componentCount={0} onOpenInspector={() => {}} />)
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function find(label: string): AgentComponent {
  const entry = agent
    .snapshot()
    .find((component) => !component.offPage && component.label === label)
  if (!entry) throw new Error(`No component labeled ${label}`)
  return entry
}

test("every control is named and exposes its actions", async () => {
  renderPage()
  await settle()

  const components = agent
    .snapshot()
    .filter((entry) => !entry.offPage && entry.component !== "more")

  for (const entry of components) {
    expect(
      entry.label,
      `${entry.component} ${entry.ref} has no name`,
    ).toBeTruthy()
  }

  const labels = components.map((entry) => entry.label)
  for (const label of [
    "Post title",
    "Post body",
    "Community",
    "Who can see this",
    "Allow comments",
    "Discard draft",
    "Preview post",
    "Publish post",
  ]) {
    expect(labels, `${label} is missing from the snapshot`).toContain(label)
  }

  expect(find("Post title").actions).toContain("setValue")
  expect(find("Post body").actions).toContain("setValue")
  expect(find("Community").items?.map((item) => item.label)).toContain("AI & ML")
  expect(find("Community").actions).toContain("setValue")
  expect(find("Who can see this").actions).toContain("setValue")
  expect(
    find("Who can see this").items?.map((item) => item.label),
    "an item's label must not swallow its hint text",
  ).toEqual(["Everyone", "Followers", "Only me"])
  expect(find("Allow comments").actions).toContain("setChecked")

  const emptyPublish = find("Publish post")
  expect(emptyPublish.disabled).toBe(true)
  expect(emptyPublish.actions, "an empty post cannot be published").toEqual([])
  expect(emptyPublish.confirm).toBe("Publishes this post to the feed")
})

test("an agent fills the form and publishes without a popup", async () => {
  renderPage()
  await settle()

  const filled = await agent.act({
    steps: [
      { ref: "Post title", action: "setValue", args: ["A quieter web"] },
      {
        ref: "Post body",
        action: "setValue",
        args: ["Interfaces should be readable by people and by agents."],
      },
      { ref: "Community", action: "setValue", args: ["Design"] },
      { ref: "Who can see this", action: "setValue", args: ["Followers"] },
      { ref: "Allow comments", action: "setChecked", args: [false] },
    ],
  })

  expect(filled.ok, filled.error?.message).toBe(true)
  expect(find("Post title").value).toBe("A quieter web")
  expect(find("Post body").value).toBe(
    "Interfaces should be readable by people and by agents.",
  )
  expect(find("Community").value).toBe("design")
  expect(find("Who can see this").value).toBe("followers")
  expect(find("Allow comments").checked).toBe(false)
  expect(find("Publish post").disabled).not.toBe(true)
  expect(find("Publish post").actions).toContain("press")

  const published = await agent.act({
    steps: [{ ref: "Publish post", action: "press" }],
  })

  expect(published.ok, published.error?.message).toBe(true)
  await waitFor(() => {
    expect(screen.getByText("Your post is live")).toBeTruthy()
  })
  expect(screen.getByText("A quieter web")).toBeTruthy()
})
