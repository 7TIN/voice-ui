import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, test } from "vitest"
import { ToastRegion } from "@ui-sdk/react/toast"
import { TimelinePage } from "./timeline-page"

function renderPage() {
  return render(
    <>
      <TimelinePage />
      <ToastRegion data-agent-hidden />
    </>,
  )
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

test("timeline example renders", async () => {
  renderPage()
  await settle()
  expect(screen.getAllByText("Home").length).toBeGreaterThan(0)
  expect(screen.getByText("Ada Lovelace")).toBeTruthy()
  expect(screen.getByLabelText("Like Ada Lovelace's post")).toBeTruthy()
  expect(screen.getByLabelText("Sections")).toBeTruthy()
  expect(screen.getByLabelText("Follow Margaret Hamilton")).toBeTruthy()
})

test("liking a post fills the heart and updates its pressed state", async () => {
  renderPage()
  await settle()

  const likeButton = screen.getByLabelText("Like Ada Lovelace's post")
  fireEvent.click(likeButton)

  expect(likeButton.getAttribute("aria-pressed")).toBe("true")
  expect(likeButton.querySelector("svg path")?.getAttribute("fill")).toBe("currentColor")
})

test("comment count uses the real thread and posting closes the reply composer", async () => {
  renderPage()
  await settle()

  const commentButton = screen.getByLabelText("Comments on Ada Lovelace's post")
  expect(commentButton.textContent).toBe("2")

  fireEvent.click(screen.getByLabelText("Reply to Ada Lovelace's post"))
  const replyField = screen.getByLabelText("Your reply to Ada Lovelace")
  fireEvent.input(replyField, { target: { value: "A real comment from me." } })
  fireEvent.click(screen.getByRole("button", { name: "Post reply to Ada Lovelace" }))

  await waitFor(() => {
    expect(screen.queryByLabelText("Your reply to Ada Lovelace")).toBeNull()
    expect(commentButton.textContent).toBe("3")
  })

  fireEvent.click(commentButton)
  expect(screen.getByText("A real comment from me.")).toBeTruthy()
})

test("quote composer publishes a quoted post and options update visible state", async () => {
  renderPage()
  await settle()

  fireEvent.click(screen.getByLabelText("Quote Ada Lovelace's post"))
  fireEvent.input(screen.getByLabelText("Your quote of Ada Lovelace"), {
    target: { value: "A thoughtful quote." },
  })
  fireEvent.click(screen.getByRole("button", { name: "Post quote of Ada Lovelace" }))
  await waitFor(() => expect(screen.getByText("A thoughtful quote.")).toBeTruthy())

  fireEvent.click(screen.getByLabelText("Options for Ada Lovelace's post"))
  fireEvent.click(screen.getByText("Mute @ada"))
  expect(screen.getByText("You muted @ada.")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Undo" }))
  expect(screen.queryByText("You muted @ada.")).toBeNull()
})
