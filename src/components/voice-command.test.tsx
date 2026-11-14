import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, test } from "vitest"
import type { AgentComponent } from "@ui-sdk/react/agent"
import { agent } from "../agent/bridge"
import { executePlan } from "../agent/execute"
import { interpret } from "../agent/interpret"
import { isDictation, isPlan } from "../agent/plan"
import {
  createWebSpeechTranscriber,
  type Recognition,
  type RecognitionCtor,
} from "../voice/transcriber"
import { ComposePage } from "../examples/compose/compose-page"
import { composeVoice } from "../examples/compose/voice"
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
      <VoicePill voice={composeVoice} transcriber={transcriber} />
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

  start() {
    this.started = true
  }

  stop() {}

  abort() {}
}

function fakeRecognition() {
  const instances: FakeRecognition[] = []
  class Ctor extends FakeRecognition {
    constructor() {
      super()
      instances.push(this)
    }
  }
  return {
    instances,
    transcriber: createWebSpeechTranscriber({ Ctor: Ctor as RecognitionCtor }),
  }
}

function heard(text: string) {
  return {
    resultIndex: 0,
    results: {
      length: 1,
      0: {
        isFinal: true,
        length: 1,
        0: { transcript: text },
      },
    },
  } as never
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
  const { instances, transcriber } = fakeRecognition()

  renderPage(transcriber)
  await settle()

  fireEvent.click(screen.getByRole("button", { name: "Start listening" }))
  const recognition = instances[0]
  expect(recognition.started).toBe(true)

  act(() => recognition.onstart?.())
  await screen.findByText("Listening — say what you want.")

  act(() => recognition.onresult?.(heard("turn comments off")))

  await waitFor(() => {
    expect(find("Allow comments").checked).toBe(false)
  })
  await screen.findByText("Comments are off.")

  // The session stays open for the next command instead of hanging up.
  expect(screen.getByRole("button", { name: "Stop listening" })).toBeTruthy()
})

test("the grammar maps words to the page's own labels and values", async () => {
  renderPage()
  await settle()

  const cases: Array<[string, string, string, unknown]> = [
    ["Set the title to Hello world", "Post title", "setValue", "Hello world"],
    ["write the body with Interfaces should be readable.", "Post body", "setValue", "Interfaces should be readable"],
    ["choose community Design", "Community", "setValue", "design"],
    ["change to product", "Community", "setValue", "product"],
    ["Show Community.", "Community", "setOpen", true],
    ["open the community menu", "Community", "setOpen", true],
    ["switch the audience to Only me", "Who can see this", "setValue", "only-me"],
    ["Visibility to followers.", "Who can see this", "setValue", "followers"],
    ["make it public", "Who can see this", "setValue", "everyone"],
    ["just for me", "Who can see this", "setValue", "only-me"],
    ["Change Who can see these two followers?", "Who can see this", "setValue", "followers"],
    ["turn comments off", "Allow comments", "setChecked", false],
    ["Disable allow comments", "Allow comments", "setChecked", false],
    ["Don't allow comments.", "Allow comments", "setChecked", false],
    ["turn comments of", "Allow comments", "setChecked", false],
    ["enable comments", "Allow comments", "setChecked", true],
    ["Review post", "Preview post", "press", undefined],
    ["preview the post", "Preview post", "press", undefined],
  ]

  for (const [said, ref, action, arg] of cases) {
    const result = await interpret(said, visibleSnapshot(), composeVoice)
    expect(isPlan(result), `${said} should be understood`).toBe(true)
    if (!isPlan(result)) continue
    expect(result.steps, said).toEqual([
      action === "press"
        ? { ref, action, args: [] }
        : { ref, action, args: [arg] },
    ])
  }

  const clearing = await interpret("clear the title", visibleSnapshot(), composeVoice)
  expect(isPlan(clearing) && clearing.steps[0].action).toBe("clear")

  const unknown = await interpret("make me a sandwich", visibleSnapshot(), composeVoice)
  expect(isPlan(unknown)).toBe(false)

  const empty = await interpret("publish the post", visibleSnapshot(), composeVoice)
  expect(isPlan(empty)).toBe(false)
  if (!isPlan(empty) && !isDictation(empty)) expect(empty.hint).toContain("title")
})

test("naming a field without content starts dictation instead of failing", async () => {
  renderPage()
  await settle()

  const primers: Array<[string, "title" | "body"]> = [
    ["set the title", "title"],
    ["change the title", "title"],
    ["write the body", "body"],
    ["I want to write a long post", "body"],
  ]

  for (const [said, target] of primers) {
    const result = await interpret(said, visibleSnapshot(), composeVoice)
    expect(isDictation(result), said).toBe(true)
    if (isDictation(result))
      expect(result.dictate).toBe(target === "title" ? "Post title" : "Post body")
  }
})

test("two commands in one breath become one ordered plan", async () => {
  renderPage()
  await settle()

  const result = await interpret(
    "open the community menu and change to product",
    visibleSnapshot(),
    composeVoice,
  )

  expect(isPlan(result)).toBe(true)
  if (!isPlan(result)) return
  expect(result.steps).toEqual([
    { ref: "Community", action: "setOpen", args: [true] },
    { ref: "Community", action: "setValue", args: ["product"] },
  ])
})

test("a title primer treats the next words as content across pauses", async () => {
  const { instances, transcriber } = fakeRecognition()
  renderPage(transcriber)
  await settle()

  fireEvent.click(screen.getByRole("button", { name: "Start listening" }))
  const recognition = instances[0]
  act(() => recognition.onstart?.())

  act(() => recognition.onresult?.(heard("set the title")))
  await screen.findByText(/Listening for the title/)

  act(() => recognition.onresult?.(heard("A quieter")))
  await waitFor(() => {
    expect(find("Post title").value).toBe("A quieter")
  })

  act(() => recognition.onresult?.(heard("web for everyone")))
  await waitFor(() => {
    expect(find("Post title").value).toBe("A quieter web for everyone")
  })

  act(() => recognition.onresult?.(heard("done")))
  await screen.findByText(/Title set\./)
  expect(find("Post title").value).toBe("A quieter web for everyone")
  expect(screen.getByRole("button", { name: "Stop listening" })).toBeTruthy()
})

test("the session stays open after a dictation commit", async () => {
  const { instances, transcriber } = fakeRecognition()
  renderPage(transcriber)
  await settle()

  fireEvent.click(screen.getByRole("button", { name: "Start listening" }))
  const recognition = instances[0]
  act(() => recognition.onstart?.())

  act(() => recognition.onresult?.(heard("write the body")))
  await screen.findByText(/Listening for the body/)

  act(() => recognition.onresult?.(heard("Keep the microphone open.")))
  await waitFor(() => {
    expect(find("Post body").value).toBe("Keep the microphone open.")
  })

  act(() => recognition.onresult?.(heard("done")))
  await screen.findByText(/Body set\./)

  // No second click: the next sentence is a normal command again.
  act(() => recognition.onresult?.(heard("turn comments off")))
  await waitFor(() => {
    expect(find("Allow comments").checked).toBe(false)
  })
  await screen.findByText(/Comments are off\./)
  expect(find("Post body").value).toBe("Keep the microphone open.")
  expect(screen.getByRole("button", { name: "Stop listening" })).toBeTruthy()
})

test("typed dictation finishes without a microphone", async () => {
  renderPage()
  await settle()

  fireEvent.click(screen.getByRole("button", { name: "Type" }))
  await settle()
  const input = screen.getByLabelText("Command")

  fireEvent.input(input, { target: { value: "write the body" } })
  fireEvent.submit(input.closest("form") as HTMLFormElement)
  await screen.findByText(/Type the body in the command box/)

  fireEvent.input(input, {
    target: { value: "Interfaces should be readable by people and agents." },
  })
  fireEvent.submit(input.closest("form") as HTMLFormElement)
  await waitFor(() => {
    expect(find("Post body").value).toBe(
      "Interfaces should be readable by people and agents.",
    )
  })
  await screen.findByText(/Adding to the body/)

  fireEvent.input(input, { target: { value: "done" } })
  fireEvent.submit(input.closest("form") as HTMLFormElement)
  await screen.findByText(/Body set\./)
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
