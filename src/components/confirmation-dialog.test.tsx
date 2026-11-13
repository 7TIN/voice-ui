import { act, fireEvent, render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import { agent } from "../agent/bridge"
import { askForConfirmation } from "../agent/confirmation"
import { ConfirmationDialog } from "./confirmation-dialog"

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

test("a person approves an agent action in the app, not from the page", async () => {
  render(<ConfirmationDialog />)

  const controller = new AbortController()
  const answer = askForConfirmation("Publishes this post to the feed", {
    signal: controller.signal,
  })

  await settle()

  expect(screen.getByText("Publishes this post to the feed")).toBeTruthy()
  expect(
    agent
      .snapshot()
      .filter((entry) => !entry.offPage)
      .map((entry) => entry.label),
  ).not.toContain("Approve")

  fireEvent.click(screen.getByRole("button", { name: "Approve" }))

  await expect(answer).resolves.toBe(true)
})

test("cancelling refuses the action", async () => {
  render(<ConfirmationDialog />)

  const answer = askForConfirmation("Deletes the draft", {
    signal: new AbortController().signal,
  })

  await settle()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

  await expect(answer).resolves.toBe(false)
})
