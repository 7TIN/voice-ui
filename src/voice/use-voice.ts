import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { agent } from "../agent/bridge"
import { executePlan } from "../agent/execute"
import type { ExampleVoice } from "../examples/types"
import { interpret } from "../agent/interpret"
import { isDictation, isPlan } from "../agent/plan"
import { createWebSpeechTranscriber, type Transcriber } from "./transcriber"

export type VoicePhase =
  | "idle"
  | "listening"
  | "transcribing"
  | "planning"
  | "executing"
  | "done"
  | "error"

export type DictationTarget = string

/** The voice contract for the example currently on screen. */
export type VoiceSpec = ExampleVoice

export type Voice = {
  phase: VoicePhase
  supported: boolean
  /** True while the microphone session is open, including between commands. */
  live: boolean
  /** The field currently being dictated, if any. */
  dictation: DictationTarget | null
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
const RESTART_MS = 250

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

const FINISH_EXACT = /^(?:done|finish|finished|that'?s it|thats it|end|stop|i'?m done)$/i
const FINISH_TAIL = /^(.*?)[,.!?]\s*(?:done|finish(?:ed)?|that'?s it)\.?$/i
const CANCEL = /^(?:cancel|never\s*mind|nevermind|discard|forget\s+it|start\s+over)$/i

export function useVoice(
  voice: ExampleVoice,
  transcriber?: Transcriber,
  apiKey?: string | null,
): Voice {
  const speech = useMemo(
    () => transcriber ?? createWebSpeechTranscriber(),
    [transcriber],
  )

  const [phase, setPhase] = useState<VoicePhase>("idle")
  const [live, setLive] = useState(false)
  const [dictation, setDictation] = useState<DictationTarget | null>(null)
  const [interim, setInterim] = useState("")
  const [transcript, setTranscript] = useState("")
  const [status, setStatus] = useState(IDLE_STATUS)
  const [hint, setHint] = useState<string | null>(null)

  /** True while the recognizer may still emit results for this session. */
  const listening = useRef(false)
  /** True while the person wants the microphone on, across commands. */
  const active = useRef(false)
  const dictationRef = useRef<{
    target: DictationTarget
    text: string
    source: "voice" | "typed"
  } | null>(null)
  const runId = useRef(0)
  const apiKeyRef = useRef(apiKey ?? null)

  useEffect(() => {
    if (apiKey) apiKeyRef.current = apiKey
  }, [apiKey])

  /** Commands are serialized so a long dictation cannot interleave with a plan. */
  const chain = useRef<Promise<void>>(Promise.resolve())
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearRestart = useCallback(() => {
    if (restartTimer.current) {
      clearTimeout(restartTimer.current)
      restartTimer.current = null
    }
  }, [])

  const keepListening = useCallback(() => {
    clearRestart()
    if (!active.current) return
    restartTimer.current = setTimeout(() => {
      restartTimer.current = null
      if (active.current) speech.start()
    }, RESTART_MS)
  }, [clearRestart, speech])

  const writeContent = useCallback(
    async (target: DictationTarget, text: string) => {
      const result = await executePlan(voice.dictation.contentPlan(target, text))
      if (!result.ok) {
        setPhase("error")
        setStatus(result.message)
        setHint('Say "cancel" to discard, or keep going.')
        return false
      }
      return true
    },
    [voice],
  )

  const finishDictation = useCallback(async () => {
    const current = dictationRef.current
    dictationRef.current = null
    setDictation(null)
    setHint(null)

    if (!current || !current.text.trim()) {
      setPhase("idle")
      setStatus(IDLE_STATUS)
      if (active.current) setPhase("listening")
      return
    }

    setPhase("executing")
    setStatus("Saving the " + voice.dictation.noun(current.target) + "…")
    const written = await writeContent(current.target, current.text)
    if (!written) return

    setPhase("done")
    setStatus(
      voice.dictation.label(current.target) +
        " set." +
        (active.current ? " I'm still listening if you want to say more." : ""),
    )
    setHint(null)
  }, [writeContent, voice])

  const cancelDictation = useCallback(() => {
    dictationRef.current = null
    setDictation(null)
    setHint(null)
    setTranscript("")
    setPhase(active.current ? "listening" : "idle")
    setStatus(active.current ? "Dictation cancelled. Listening." : "Dictation cancelled.")
  }, [])

  const appendDictation = useCallback(
    async (raw: string) => {
      const current = dictationRef.current
      if (!current) return

      const text = raw.trim()
      if (!text) return

      const tail = text.match(FINISH_TAIL)
      if (FINISH_EXACT.test(text)) {
        await finishDictation()
        return
      }
      if (tail) {
        const content = tail[1].trim()
        if (content) {
          current.text = current.text ? current.text + " " + content : content
          await writeContent(current.target, current.text)
        }
        await finishDictation()
        return
      }
      if (CANCEL.test(text)) {
        cancelDictation()
        return
      }

      // Everything except an explicit finish/cancel is content, never a command.
      current.text = current.text ? current.text + " " + text : text
      await writeContent(current.target, current.text)
      setStatus(voice.dictation.prompt(current.target, current.source))
      setHint("“" + current.text + "” — say \"done\" when you finish.")
      setTranscript("")
    },
    [cancelDictation, finishDictation, writeContent, voice],
  )

  const runCommand = useCallback(
    async (raw: string, source: "voice" | "typed") => {
      const text = raw.trim()
      if (!text) return

      const id = (runId.current += 1)
      setTranscript(text)
      setInterim("")
      setHint(null)
      setPhase("planning")
      setStatus("Working out what to do…")

      const snapshot = agent.snapshot().filter((entry) => !entry.offPage)
      const interpreted = await interpret(text, snapshot, voice, { apiKey: apiKeyRef.current })

      if (id !== runId.current) return

      if (isDictation(interpreted)) {
        if (interpreted.steps?.length) {
          const prep = await executePlan({
            transcript: "",
            steps: interpreted.steps,
            say: "Opening…",
            done: "",
          })
          if (id !== runId.current) return
          if (!prep.ok) {
            setPhase("error")
            setStatus(prep.message)
            setHint("Try again, or type it.")
            return
          }
        }
        dictationRef.current = {
          target: interpreted.dictate,
          text: "",
          source,
        }
        setDictation(interpreted.dictate)
        setTranscript("")
        setPhase("listening")
        setStatus(
          source === "voice" && speech.supported
            ? interpreted.prompt
            : 'Type the ' +
                voice.dictation.noun(interpreted.dictate) +
                ' in the command box, then type "done".',
        )
        setHint(
          source === "voice" && speech.supported
            ? "Speak naturally. Pauses are fine; the words are kept until you say \"done\"."
            : "The next line you type is the " +
                voice.dictation.noun(interpreted.dictate) +
                '. Type "done" on its own to finish.',
        )
        if (source === "voice" && !active.current) {
          active.current = true
          setLive(true)
          speech.start()
        }
        return
      }

      if (!isPlan(interpreted)) {
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
    },
    [speech, voice],
  )

  const enqueue = useCallback(
    (text: string, source: "voice" | "typed") => {
      chain.current = chain.current
        .then(() =>
          dictationRef.current ? appendDictation(text) : runCommand(text, source),
        )
        .catch(() => {
          setPhase("error")
          setStatus("Something went wrong with that command.")
          setHint("Try again, or type it.")
        })
    },
    [appendDictation, runCommand],
  )

  useEffect(() => {
    return speech.subscribe((event) => {
      switch (event.type) {
        case "start":
          listening.current = true
          active.current = true
          setLive(true)
          break

        case "interim":
          if (listening.current) setInterim(event.text)
          break

        case "final":
          listening.current = false
          setInterim("")
          if (!dictationRef.current) {
            setPhase("transcribing")
            setStatus("Heard you.")
          }
          enqueue(event.text, "voice")
          break

        case "error": {
          // An `aborted` error is our own cancel; never turn it into a failure.
          if (event.code === "aborted") break
          listening.current = false

          // Silence is normal in a persistent session: restart quietly.
          if (event.code === "no-speech" && active.current) break

          active.current = false
          setLive(false)
          const mapped = mapError(event.code)
          setPhase("error")
          setStatus(mapped.status)
          setHint(mapped.hint)
          break
        }

        case "end":
          listening.current = false
          if (active.current) {
            // Chrome ends a continuous session after long silence. Keep the
            // microphone available for the next command or dictation chunk.
            keepListening()
            break
          }
          setPhase((current) => (current === "listening" ? "idle" : current))
          setStatus((current) =>
            current === "Listening — say what you want." ? IDLE_STATUS : current,
          )
          break
      }
    })
  }, [enqueue, keepListening, speech])

  useEffect(
    () => () => {
      active.current = false
      clearRestart()
      speech.abort()
    },
    [clearRestart, speech],
  )

  useEffect(() => {
    if (phase !== "done") return
    const timer = setTimeout(() => {
      if (active.current) {
        setPhase("listening")
        setStatus(
          dictationRef.current
            ? voice.dictation.prompt(dictationRef.current.target, dictationRef.current.source)
            : "Listening — say what you want.",
        )
      } else {
        setPhase("idle")
        setStatus(IDLE_STATUS)
      }
    }, DONE_RESET_MS)
    return () => clearTimeout(timer)
  }, [phase])

  const start = useCallback(() => {
    if (!speech.supported) {
      active.current = false
      setLive(false)
      const mapped = mapError("unsupported")
      setPhase("error")
      setStatus(mapped.status)
      setHint(mapped.hint)
      return
    }

    runId.current += 1
    active.current = true
    setLive(true)
    setInterim("")
    setTranscript("")
    setHint(null)
    setPhase("listening")
    if (dictationRef.current) {
      // Dictation continues across input modes: the mic is now the source.
      dictationRef.current.source = "voice"
    }
    setStatus(
      dictationRef.current
        ? voice.dictation.prompt(dictationRef.current.target, "voice")
        : "Listening — say what you want.",
    )
    speech.start()
  }, [speech, voice])

  const stop = useCallback(() => {
    active.current = false
    setLive(false)
    clearRestart()
    dictationRef.current = null
    setDictation(null)
    speech.stop()
    setPhase("idle")
    setStatus(IDLE_STATUS)
    setHint(null)
  }, [clearRestart, speech])

  const submit = useCallback(
    (text: string) => {
      // A typed command wins over the microphone, but dictation accepts typed
      // content as well, so the person can finish without speaking.
      listening.current = false
      if (dictationRef.current) {
        dictationRef.current.source = "typed"
      } else {
        active.current = false
        setLive(false)
        clearRestart()
      }
      speech.abort()
      enqueue(text, "typed")
    },
    [clearRestart, enqueue, speech],
  )

  return {
    phase,
    supported: speech.supported,
    live,
    dictation,
    interim,
    transcript,
    status,
    hint,
    start,
    stop,
    submit,
  }
}
