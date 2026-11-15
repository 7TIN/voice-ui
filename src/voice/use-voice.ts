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
  /** Most recent words spoken, including the latest finalized segment. */
  liveTranscript: string
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
const NETWORK_RETRY_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000] as const

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

/**
 * The sentence a person says when they want their draft posted: "post this
 * reply", "post reply to Ada", "submit this", "send it now", "publish the
 * post". Heard during dictation it is a command, never message content.
 */
const POST_COMMAND =
  /^(?:please\s+)?(?:post|submit|send|publish)\b(?:\s+(?:this|it|that|the|my|a|an))?(?:\s+(?:reply|comment|quote|message|response|answer|post|it|this|that))?(?:\s+now)?(?:\s+(?:to|on)\s+[a-z][a-z'’\-]*(?:\s+[a-z][a-z'’\-]*){0,3})?$/i

/**
 * Pull a posting command out of one sentence of a dictation, returning the
 * words that stay message content and the command, if any.
 *
 * A command is accepted when it is the whole sentence ("Post this reply."),
 * when it follows a comma ("we should avoid it, post this reply"), or — for
 * recognizers that emit no punctuation at all — as the tail of the sentence.
 */
function extractPostCommand(
  segment: string,
  loose: boolean,
): { content: string; command: string | null } {
  const stripped = segment.trim().replace(/[.!?]+$/, "").trim()
  if (POST_COMMAND.test(stripped)) return { content: "", command: stripped }

  const words = stripped.split(/\s+/)
  for (let n = Math.min(7, words.length - 1); n >= 1; n -= 1) {
    const tail = words.slice(words.length - n).join(" ")
    if (!POST_COMMAND.test(tail)) continue
    const before = words[words.length - n - 1]
    if (/[,;]$/.test(before) || loose) {
      return {
        content: words.slice(0, words.length - n).join(" "),
        command: tail,
      }
    }
  }
  return { content: segment.trim(), command: null }
}

export function useVoice(
  voice: ExampleVoice,
  transcriber?: Transcriber,
): Voice {
  const dictationPrompt = voice.dictation.prompt
  const speech = useMemo(
    () => transcriber ?? createWebSpeechTranscriber(),
    [transcriber],
  )

  const [phase, setPhase] = useState<VoicePhase>("idle")
  const [live, setLive] = useState(false)
  const [dictation, setDictation] = useState<DictationTarget | null>(null)
  const [interim, setInterim] = useState("")
  const [liveTranscript, setLiveTranscript] = useState("")
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
  const finalizedSpeech = useRef("")

  /** Commands are serialized so a long dictation cannot interleave with a plan. */
  const chain = useRef<Promise<void>>(Promise.resolve())
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const networkRetryCount = useRef(0)

  const clearRestart = useCallback(() => {
    if (restartTimer.current) {
      clearTimeout(restartTimer.current)
      restartTimer.current = null
    }
  }, [])

  const keepListening = useCallback((delay = RESTART_MS) => {
    clearRestart()
    if (!active.current) return
    restartTimer.current = setTimeout(() => {
      restartTimer.current = null
      if (active.current) speech.start()
    }, delay)
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

  const runCommandRef = useRef<((raw: string, source: "voice" | "typed") => Promise<void>) | null>(null)

  const appendDictation = useCallback(
    async (raw: string) => {
      const current = dictationRef.current
      if (!current) return

      const text = raw.trim()
      if (!text) return

      const source = current.source
      const timelineComposer =
        voice.id === "timeline" &&
        (current.target.startsWith("Your reply") || current.target.startsWith("Your quote"))
      const composerKind = current.target.startsWith("Your quote") ? "quote" : "reply"
      const commandText = text.replace(/[.!?,;:]+/g, " ").replace(/\s+/g, " ").trim()
      const composerCommand = commandText
        .split(/\s+(?=(?:close|hide|dismiss|cancel|discard)\b)/i)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => ({
          text: part,
          close: /^(?:close|hide|dismiss)(?:\s+(?:(?:the|this|that|my)\s+)?(?:reply|replay|comment|quote|post|draft|composer|box)(?:\s+(?:box|composer|draft))?|\s+(?:this|that|it))?$/i.test(part),
          cancel: /^(?:cancel|discard)(?:\s+(?:(?:the|this|that|my)\s+)?(?:reply|replay|comment|quote|post|draft|composer|box)(?:\s+(?:box|composer|draft))?|\s+(?:this|that|it))?$/i.test(part),
        }))
        .filter((part) => part.close || part.cancel)
        .at(-1)
      if (timelineComposer && composerCommand) {
        cancelDictation()
        const commandKind = /\bquote\b/i.test(composerCommand.text)
          ? "quote"
          : /\b(?:reply|replay|comment)\b/i.test(composerCommand.text)
            ? "reply"
            : composerKind
        await runCommandRef.current?.(
          (composerCommand.cancel ? "cancel " : "close ") + commandKind,
          source,
        )
        return
      }

      const tail = text.match(FINISH_TAIL)
      if (FINISH_EXACT.test(text)) {
        await finishDictation()
        return
      }
      if (tail) {
        const contentTail = tail[1].trim()
        if (contentTail) {
          current.text = current.text ? current.text + " " + contentTail : contentTail
          await writeContent(current.target, current.text)
        }
        await finishDictation()
        return
      }
      if (CANCEL.test(text)) {
        cancelDictation()
        return
      }

      const segments = text.split(/(?<=[.!?])\s+/)
      const contentParts: string[] = []
      let postCommand: string | null = null
      for (const segment of segments) {
        const trimmed = segment.trim()
        if (!trimmed) continue
        const found = extractPostCommand(trimmed, !/[.!?]/.test(trimmed))
        if (found.command) postCommand = found.command
        if (found.content) contentParts.push(found.content)
      }

      const content = contentParts.join(" ").trim()
      if (content) {
        current.text = current.text ? current.text + " " + content : content
        await writeContent(current.target, current.text)
      }

      if (postCommand) {
        await finishDictation()
        await runCommandRef.current?.(postCommand, source)
        return
      }

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
      const interpreted = await interpret(text, snapshot, voice)

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

      setPhase("executing")
      setStatus(plan.say)

      const result = await executePlan(plan)
      if (id !== runId.current) return

      setPhase(result.ok ? "done" : "error")
      setStatus(result.message)
      setHint(null)
    },
    [speech, voice],
  )

  runCommandRef.current = runCommand

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
          setHint(null)
          setStatus((current) =>
            current === "Speech connection lost. Reconnecting…"
              ? dictationRef.current
                ? dictationPrompt(dictationRef.current.target, dictationRef.current.source)
                : "Listening — say what you want."
              : current,
          )
          break

        case "interim":
          if (listening.current) {
            networkRetryCount.current = 0
            setInterim(event.text)
            setLiveTranscript(
              [finalizedSpeech.current, event.text].filter(Boolean).join(" "),
            )
          }
          break

        case "final":
          listening.current = false
          networkRetryCount.current = 0
          setInterim("")
          finalizedSpeech.current = [finalizedSpeech.current, event.text]
            .filter(Boolean)
            .join(" ")
          setLiveTranscript(finalizedSpeech.current)
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

          if (event.code === "network" && active.current) {
            networkRetryCount.current = Math.min(
              networkRetryCount.current + 1,
              NETWORK_RETRY_DELAYS.length,
            )
            const mapped = mapError(event.code)
            setLive(true)
            setPhase("listening")
            setStatus("Speech connection lost. Reconnecting…")
            setHint(mapped.hint)
            break
          }

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
            const retryDelay = networkRetryCount.current
              ? NETWORK_RETRY_DELAYS[networkRetryCount.current - 1]!
              : RESTART_MS
            keepListening(retryDelay)
            break
          }
          setPhase((current) => (current === "listening" ? "idle" : current))
          setStatus((current) =>
            current === "Listening — say what you want." ? IDLE_STATUS : current,
          )
          break
      }
    })
  }, [dictationPrompt, enqueue, keepListening, speech])

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
            ? dictationPrompt(dictationRef.current.target, dictationRef.current.source)
            : "Listening — say what you want.",
        )
      } else {
        setPhase("idle")
        setStatus(IDLE_STATUS)
      }
    }, DONE_RESET_MS)
    return () => clearTimeout(timer)
  }, [dictationPrompt, phase])

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
    networkRetryCount.current = 0
    setLive(true)
    setInterim("")
    finalizedSpeech.current = ""
    setLiveTranscript("")
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
    networkRetryCount.current = 0
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
    liveTranscript,
    transcript,
    status,
    hint,
    start,
    stop,
    submit,
  }
}
