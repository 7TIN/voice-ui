import { expect, test } from "vitest"
import {
  createWebSpeechTranscriber,
  type Recognition,
  type RecognitionCtor,
  type TranscriberEvent,
} from "./transcriber"

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
  stopped = false
  aborted = false

  start() {
    this.started = true
  }

  stop() {
    this.stopped = true
  }

  abort() {
    this.aborted = true
  }
}

function fakeCtor() {
  const instances: FakeRecognition[] = []
  class Ctor extends FakeRecognition {
    constructor() {
      super()
      instances.push(this)
    }
  }
  return { Ctor: Ctor as RecognitionCtor, instances }
}

function results(entries: Array<{ text: string; final: boolean }>) {
  const list: Record<number, unknown> & { length: number } = { length: entries.length }
  entries.forEach((entry, index) => {
    list[index] = {
      isFinal: entry.final,
      length: 1,
      0: { transcript: entry.text },
    }
  })
  return list as never
}

function collect() {
  const events: TranscriberEvent[] = []
  return { events, listener: (event: TranscriberEvent) => events.push(event) }
}

test("the adapter configures recognition and forwards its events", () => {
  const { Ctor, instances } = fakeCtor()
  const transcriber = createWebSpeechTranscriber({ Ctor })
  const { events, listener } = collect()
  transcriber.subscribe(listener)

  expect(transcriber.supported).toBe(true)
  transcriber.start()

  const recognition = instances[0]
  expect(recognition).toBeTruthy()
  expect(recognition.started).toBe(true)
  expect(recognition.lang).toBe("en-US")
  expect(recognition.continuous).toBe(true)
  expect(recognition.interimResults).toBe(true)

  recognition.onstart?.()
  recognition.onresult?.({
    resultIndex: 0,
    results: results([{ text: "set the ti", final: false }]),
  })
  recognition.onresult?.({
    resultIndex: 0,
    results: results([{ text: "set the title to A quieter web", final: true }]),
  })
  recognition.onerror?.({ error: "no-speech" })
  recognition.onend?.()

  expect(events).toEqual([
    { type: "start" },
    { type: "interim", text: "set the ti" },
    { type: "final", text: "set the title to A quieter web" },
    { type: "error", code: "no-speech", message: "no-speech" },
    { type: "end" },
  ])
})

test("stop and abort reach the live recognition", () => {
  const { Ctor, instances } = fakeCtor()
  const transcriber = createWebSpeechTranscriber({ Ctor })

  transcriber.start()
  transcriber.stop()
  transcriber.abort()

  expect(instances[0].stopped).toBe(true)
  expect(instances[0].aborted).toBe(true)
})

test("no constructor means a clean unsupported error, not a crash", () => {
  const transcriber = createWebSpeechTranscriber({ Ctor: null })
  const { events, listener } = collect()
  transcriber.subscribe(listener)

  expect(transcriber.supported).toBe(false)
  transcriber.start()

  expect(events).toEqual([
    {
      type: "error",
      code: "unsupported",
      message: "This browser has no speech recognition.",
    },
  ])
})

test("a failing start reports it instead of leaving a dead session", () => {
  class FailingRecognition extends FakeRecognition {
    start() {
      throw new Error("denied")
    }
  }

  const transcriber = createWebSpeechTranscriber({
    Ctor: FailingRecognition as RecognitionCtor,
  })
  const { events, listener } = collect()
  transcriber.subscribe(listener)

  transcriber.start()

  expect(events).toEqual([
    {
      type: "error",
      code: "start-failed",
      message: "The microphone could not start.",
    },
  ])
})
