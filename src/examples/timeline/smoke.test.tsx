import { act, render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import { TimelinePage } from "./timeline-page"

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

test("timeline example renders", async () => {
  render(<TimelinePage />)
  await settle()
  expect(screen.getAllByText("Home").length).toBeGreaterThan(0)
  expect(screen.getByText("Ada Lovelace")).toBeTruthy()
  expect(screen.getByLabelText("Like Ada Lovelace's post")).toBeTruthy()
  expect(screen.getByLabelText("Sections")).toBeTruthy()
  expect(screen.getByLabelText("Follow Margaret Hamilton")).toBeTruthy()
})
