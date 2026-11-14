import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, test } from "vitest"
import { agent } from "../../agent/bridge"
import {
  createWebSpeechTranscriber,
  type Recognition,
  type RecognitionCtor,
} from "../../voice/transcriber"
import { VoicePill } from "../../components/voice-pill"
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

test("a spoken post command inside dictation posts the reply", async () => {
  const { instances, transcriber } = fakeRecognition()
  render(
    <>
      <TimelinePage />
      <VoicePill voice={timelineVoice} transcriber={transcriber} />
    </>,
  )
  await settle()

  fireEvent.click(screen.getByRole("button", { name: "Start listening" }))
  const recognition = instances[0]
  expect(recognition.started).toBe(true)
  act(() => recognition.onstart?.())

  act(() => recognition.onresult?.(heard("reply to Ada's post")))
  await screen.findByText(/Listening for your reply/)

  // The exact transcript from the bug report: content, then the command,
  // repeated, then a command that names an author that is not on the page.
  act(() =>
    recognition.onresult?.(
      heard(
        "Yeah, it's really dangerous. We should avoid it. " +
          "Post this reply. Post this reply. Post reply to Grey Super.",
      ),
    ),
  )

  // The composer keeps only the content; the commands were never message text.
  await waitFor(() => {
    const reply = visibleSnapshot().find(
      (entry) => entry.label === "Your reply to Ada Lovelace",
    )
    expect(reply?.value ?? "").toBe("")
  })

  // The reply was posted once: opening the comments shows it.
  await agent.act({
    steps: [
      { ref: "Comments on Ada Lovelace's post", action: "setOpen", args: [true] },
    ],
  })
  expect(
    screen.getByText("Yeah, it's really dangerous. We should avoid it."),
  ).toBeTruthy()

  // The microphone never had to be reopened.
  expect(screen.getByRole("button", { name: "Stop listening" })).toBeTruthy()
})

test("an unpunctuated transcript still splits content from the command", async () => {
  const { instances, transcriber } = fakeRecognition()
  render(
    <>
      <TimelinePage />
      <VoicePill voice={timelineVoice} transcriber={transcriber} />
    </>,
  )
  await settle()

  fireEvent.click(screen.getByRole("button", { name: "Start listening" }))
  const recognition = instances[0]
  act(() => recognition.onstart?.())

  act(() => recognition.onresult?.(heard("reply to Ada's post")))
  await screen.findByText(/Listening for your reply/)

  // Some recognizers emit no punctuation at all.
  act(() =>
    recognition.onresult?.(
      heard("yeah it's really dangerous we should avoid it post this reply"),
    ),
  )

  await waitFor(() => {
    const reply = visibleSnapshot().find(
      (entry) => entry.label === "Your reply to Ada Lovelace",
    )
    expect(reply?.value ?? "").toBe("")
  })

  await agent.act({
    steps: [
      { ref: "Comments on Ada Lovelace's post", action: "setOpen", args: [true] },
    ],
  })
  expect(
    screen.getByText("yeah it's really dangerous we should avoid it"),
  ).toBeTruthy()
})
