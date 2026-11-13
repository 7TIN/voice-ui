import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { agent } from "../agent/bridge"
import { executePlan } from "../agent/execute"
import { interpret } from "../agent/interpret"
import { isPlan } from "../agent/plan"
import { createWebSpeechTranscriber, type Transcriber } from "./transcriber"

export type VoicePhase =
  | "idle"
  | "listening"
  | "transcribing"
  | "planning"
  | "executing"
  | "done"
  | "error"

export type Voice = {
  phase: VoicePhase
  supported: boolean
  /** Live words from the recognizer, before they are final. */
  interim: string
  /** The last command, whether it was spoken or typed. */
  transcript: string
  status: string
  hint: string | null
  start: () => void
  stop: () => void
  submit: (text: string) => void
}

export const IDLE_STATUS = "Say or type a command."

const DONE_RESET_MS = 5_000

const ERRORS: Record<string, { status: string; hint: string }> = {
  "not-allowed": {
    status: "Microphone access is blocked.",
    hint: "Allow the mic in your browser's site settings, or type the command.",
  },
  "service-not-allowed": {
    status: "Speech recognition is turned off.",
    hint: "Allow it in your browser's site settings, or type the command.",
  },
  "no-speech": {
    status: "I didn't hear anything.",
    hint: "Press the mic and try again, a little closer to it.",
  },
  "audio-capture": {
    status: "No microphone was found.",
    hint: "Plug one in, or type the command.",
  },
  network: {
    status: "Speech recognition needs a connection.",
    hint: "Check your network, or type the command.",
  },
  unsupported: {
    status: "This browser can't listen.",
    hint: "Type the command instead.",
  },
  "start-failed": {
    status: "The microphone didn't start.",
    hint: "Try again, or type the command.",
  },
}

function mapError(code: string) {
  return (
    ERRORS[code] ?? {
      status: "Speech recognition stopped.",
      hint: "Try again, or type the command.",
    }
  )
}

export function useVoice(transcriber?: Transcriber): Voice {
  const speech = useMemo(
    () => transcriber ?? createWebSpeechTranscriber(),
    [transcriber],
  )

  const [phase, setPhase] = useState<VoicePhase>("idle")
  const [interim, setInterim] = useState("")
  const [transcript, setTranscript] = useState("")
  const [status, setStatus] = useState(IDLE_STATUS)
  const [hint, setHint] = useState<string | null>(null)

  /** True from `start` until a result arrives, so late events cannot clobber a new run. */
  const listening = useRef(false)
  const runId = useRef(0)

  const run = useCallback(async (raw: string) => {
    const text = raw.trim()
    if (!text) return

    const id = (runId.current += 1)
    setTranscript(text)
    setInterim("")
    setHint(null)
    setPhase("planning")
    setStatus("Working out what to do…")

    const snapshot = agent.snapshot().filter((entry) => !entry.offPage)
    const interpreted = interpret(text, snapshot)

    if (!isPlan(interpreted)) {
      if (id !== runId.current) return
      setPhase("error")
      setStatus(interpreted.error)
      setHint(interpreted.hint)
      return
    }

    const plan = interpreted
    const needsApproval = plan.steps.some((step) => {
      const target = snapshot.find(
        (entry) => entry.ref === step.ref || entry.label === step.ref,
      )
      return Boolean(target?.confirm)
    })

    setPhase("executing")
    setStatus(needsApproval ? "Waiting for your approval…" : plan.say)

    const result = await executePlan(plan)
    if (id !== runId.current) return

    setPhase(result.ok ? "done" : "error")
    setStatus(result.message)
    setHint(null)
  }, [])

  useEffect(() => {
    return speech.subscribe((event) => {
      switch (event.type) {
        case "start":
          listening.current = true
          break

        case "interim":
          if (listening.current) setInterim(event.text)
          break

        case "final":
          listening.current = false
          setInterim("")
          setPhase("transcribing")
          setStatus("Heard you.")
          void run(event.text)
          break

        case "error": {
          // An `aborted` error is our own cancel; never turn it into a failure.
          if (event.code === "aborted" && !listening.current) break
          listening.current = false
          const mapped = mapError(event.code)
          setPhase("error")
          setStatus(mapped.status)
          setHint(mapped.hint)
          break
        }

        case "end":
          listening.current = false
          // No words arrived: return to rest instead of leaving a dead "Listening".
          setPhase((current) => (current === "listening" ? "idle" : current))
          setStatus((current) => (current === "Listening — say what you want." ? IDLE_STATUS : current))
          break
      }
    })
  }, [speech, run])

  useEffect(() => () => speech.abort(), [speech])

  useEffect(() => {
    if (phase !== "done") return
    const timer = setTimeout(() => {
      setPhase("idle")
      setStatus(IDLE_STATUS)
    }, DONE_RESET_MS)
    return () => clearTimeout(timer)
  }, [phase])

  const start = useCallback(() => {
    if (!speech.supported) {
      const mapped = mapError("unsupported")
      setPhase("error")
      setStatus(mapped.status)
      setHint(mapped.hint)
      return
    }

    runId.current += 1
    setInterim("")
    setTranscript("")
    setHint(null)
    setPhase("listening")
    setStatus("Listening — say what you want.")
    speech.start()
  }, [speech])

  const stop = useCallback(() => {
    speech.stop()
  }, [speech])

  const submit = useCallback(
    (text: string) => {
      // A typed command wins: cancel any listening session before planning.
      listening.current = false
      speech.abort()
      void run(text)
    },
    [run, speech],
  )

  return {
    phase,
    supported: speech.supported,
    interim,
    transcript,
    status,
    hint,
    start,
    stop,
    submit,
  }
}
