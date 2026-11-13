import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, test } from "vitest"
import type { AgentComponent } from "@ui-sdk/react/agent"
import { agent } from "../agent/bridge"
import { executePlan } from "../agent/execute"
import { interpret } from "../agent/interpret"
import { isPlan } from "../agent/plan"
import {
  createWebSpeechTranscriber,
  type Recognition,
  type RecognitionCtor,
} from "../voice/transcriber"
import { ComposePage } from "./compose-page"
import { VoicePill } from "./voice-pill"

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function renderPage(transcriber?: Parameters<typeof VoicePill>[0]["transcriber"]) {
  return render(
    <>
      <ComposePage componentCount={0} />
      <VoicePill transcriber={transcriber} />
    </>,
  )
}

function find(label: string): AgentComponent {
  const entry = agent
    .snapshot()
    .find((component) => !component.offPage && component.label === label)
  if (!entry) throw new Error(`No component labeled ${label}`)
  return entry
}

function visibleSnapshot() {
  return agent.snapshot().filter((entry) => !entry.offPage)
}

test("the pill is part of the human input path, not the agent's", async () => {
  renderPage()
  await settle()

  const labels = visibleSnapshot().map((entry) => entry.label)
  expect(labels).not.toContain("Start listening")
  expect(labels).not.toContain("Type")

  fireEvent.click(screen.getByRole("button", { name: "Type" }))
  await settle()

  const openLabels = visibleSnapshot().map((entry) => entry.label)
  expect(openLabels).not.toContain("Command")
  expect(openLabels).not.toContain("Run")
})

test("a typed command runs through the same planner and executor", async () => {
  renderPage()
  await settle()

  fireEvent.click(screen.getByRole("button", { name: "Type" }))
  await settle()

  const input = screen.getByLabelText("Command")
  fireEvent.input(input, { target: { value: "set the title to A quieter web" } })
  fireEvent.submit(input.closest("form") as HTMLFormElement)

  await waitFor(() => {
    expect(find("Post title").value).toBe("A quieter web")
  })
  await screen.findByText("Title set.")
})

test("the spoken path lands in the same pipeline", async () => {
  const instances: FakeRecognition[] = []

  class FakeRecognition implements Recognition {
    lang = ""
    continuous = false
    interimResults = false
    maxAlternatives = 1
    onstart: (() => void) | null = null
    onresult: Recognition["onresult"] = null
    onerror: Recognition["onerror"] = null
    onend: (() => void) | null = null
    started = false

    constructor() {
      instances.push(this)
    }

    start() {
      this.started = true
    }

    stop() {}

    abort() {}
  }

  renderPage(createWebSpeechTranscriber({ Ctor: FakeRecognition as RecognitionCtor }))
  await settle()

  fireEvent.click(screen.getByRole("button", { name: "Start listening" }))
  const recognition = instances[0]
  expect(recognition.started).toBe(true)

  act(() => recognition.onstart?.())
  await screen.findByText("Listening — say what you want.")

  act(() =>
    recognition.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        0: {
          isFinal: true,
          length: 1,
          0: { transcript: "turn comments off" },
        },
      },
    }),
  )

  await waitFor(() => {
    expect(find("Allow comments").checked).toBe(false)
  })
  await screen.findByText("Comments are off.")
})

test("the grammar maps words to the page's own labels and values", async () => {
  renderPage()
  await settle()

  const cases: Array<[string, string, string, unknown]> = [
    ["Set the title to Hello world", "Post title", "setValue", "Hello world"],
    ["write the body with Interfaces should be readable.", "Post body", "setValue", "Interfaces should be readable"],
    ["choose community Design", "Community", "setValue", "design"],
    ["switch the audience to Only me", "Who can see this", "setValue", "only-me"],
    ["turn comments off", "Allow comments", "setChecked", false],
    ["enable comments", "Allow comments", "setChecked", true],
    ["preview the post", "Preview post", "press", undefined],
  ]

  for (const [said, ref, action, arg] of cases) {
    const result = await interpret(said, visibleSnapshot())
    expect(isPlan(result), `${said} should be understood`).toBe(true)
    if (!isPlan(result)) continue
    expect(result.steps, said).toEqual([
      action === "press"
        ? { ref, action, args: [] }
        : { ref, action, args: [arg] },
    ])
  }

  const clearing = await interpret("clear the title", visibleSnapshot())
  expect(isPlan(clearing) && clearing.steps[0].action).toBe("clear")

  const unknown = await interpret("make me a sandwich", visibleSnapshot())
  expect(isPlan(unknown)).toBe(false)

  const empty = await interpret("publish the post", visibleSnapshot())
  expect(isPlan(empty)).toBe(false)
  if (!isPlan(empty)) expect(empty.hint).toContain("title")
})

test("the executor refuses a disabled control before it acts", async () => {
  renderPage()
  await settle()

  const result = await executePlan({
    transcript: "publish the post",
    steps: [{ ref: "Publish post", action: "press", args: [] }],
    say: "Publishing.",
    done: "Published.",
  })

  expect(result.ok).toBe(false)
  expect(result.message).toContain("unavailable")
  expect(screen.queryByText("Your post is live")).toBeNull()
})
