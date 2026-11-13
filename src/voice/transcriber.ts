/**
 * A thin adapter over the Web Speech API. The hook only sees events, so a
 * provider-backed stream can replace this file without touching the pipeline.
 */
export type TranscriberEvent =
  | { type: "start" }
  | { type: "interim"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; code: string; message: string }
  | { type: "end" }

export type Transcriber = {
  supported: boolean
  start: () => void
  stop: () => void
  abort: () => void
  subscribe: (listener: (event: TranscriberEvent) => void) => () => void
}

type RecognitionAlternative = { transcript: string }
type RecognitionResult = { isFinal: boolean; length: number; [index: number]: RecognitionAlternative }
type RecognitionResultList = {
  length: number
  [index: number]: RecognitionResult
}

export type RecognitionEvent = {
  resultIndex: number
  results: RecognitionResultList
}

export type RecognitionError = {
  error: string
  message?: string
}

/** The parts of `SpeechRecognition` this adapter uses. */
export type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionError) => void) | null
  onend: (() => void) | null
}

export type RecognitionCtor = new () => Recognition

function browserCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

export function createWebSpeechTranscriber(
  options: { Ctor?: RecognitionCtor | null; lang?: string } = {},
): Transcriber {
  const Ctor = options.Ctor === undefined ? browserCtor() : options.Ctor
  const lang = options.lang ?? "en-US"
  const listeners = new Set<(event: TranscriberEvent) => void>()

  let recognition: Recognition | null = null

  function emit(event: TranscriberEvent) {
    for (const listener of listeners) listener(event)
  }

  function start() {
    if (!Ctor) {
      emit({
        type: "error",
        code: "unsupported",
        message: "This browser has no speech recognition.",
      })
      return
    }
    if (recognition) return

    const next = new Ctor()
    next.lang = lang
    next.continuous = false
    next.interimResults = true
    next.maxAlternatives = 1

    next.onstart = () => emit({ type: "start" })
    next.onresult = (event) => {
      let final = ""
      let interim = ""
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = result[0]?.transcript ?? ""
        if (result.isFinal) final += text
        else interim += text
      }
      if (final.trim()) emit({ type: "final", text: final.trim() })
      else if (interim.trim()) emit({ type: "interim", text: interim.trim() })
    }
    next.onerror = (event) =>
      emit({
        type: "error",
        code: event.error,
        message: event.message || event.error,
      })
    next.onend = () => {
      recognition = null
      emit({ type: "end" })
    }

    recognition = next
    try {
      next.start()
    } catch {
      recognition = null
      emit({
        type: "error",
        code: "start-failed",
        message: "The microphone could not start.",
      })
    }
  }

  return {
    supported: Ctor !== null,
    start,
    stop: () => recognition?.stop(),
    abort: () => recognition?.abort(),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
