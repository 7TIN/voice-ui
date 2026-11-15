import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@ui-sdk/react/button"
import { Input } from "@ui-sdk/react/input"
import type { Transcriber } from "../voice/transcriber"
import type { ExampleVoice } from "../examples/types"
import { useVoice } from "../voice/use-voice"
import { buttonClass, inputClass } from "./button-styles"
import { MicIcon, StopIcon } from "./icons"

const BUSY = new Set(["transcribing", "planning", "executing"])
type TranscriptWord = { id: number; text: string; delay: number }

/**
 * The human input path for voice, and therefore hidden from the bridge: an
 * agent may read and drive the composer, but it must never drive the thing
 * that drives the agent. Everything here funnels into the same `interpret` →
 * `executePlan` pipeline, so a typed command is not a second implementation.
 */
export function VoicePill({
  voice: voiceSpec,
  transcriber,
}: {
  voice: ExampleVoice
  transcriber?: Transcriber
}) {
  const voice = useVoice(voiceSpec, transcriber)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState("")

  const listening = voice.live
  const startListening = voice.start
  const stopListening = voice.stop
  const busy = BUSY.has(voice.phase)
  const dictating = voice.dictation !== null
  const spokenLine = listening ? voice.liveTranscript : ""
  const [transcriptWords, setTranscriptWords] = useState<TranscriptWord[]>([])
  const transcriptWordId = useRef(0)
  const transcriptTrack = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.removeItem("gemini-api-key")
    } catch {
      // Storage can be unavailable in private browsing contexts.
    }
  }, [])

  useEffect(() => {
    const nextWords = spokenLine.trim().split(/\s+/).filter(Boolean)
    setTranscriptWords((current) => {
      let shared = 0
      while (shared < current.length && current[shared]?.text === nextWords[shared]) {
        shared += 1
      }

      const updated = current.slice(0, shared)
      for (let index = shared; index < nextWords.length; index += 1) {
        updated.push({
          id: ++transcriptWordId.current,
          text: nextWords[index]!,
          delay: Math.min(index - shared, 8) * 45,
        })
      }
      return updated
    })
  }, [spokenLine])

  useLayoutEffect(() => {
    const track = transcriptTrack.current
    const viewport = track?.parentElement
    if (!track || !viewport) return
    const offset = Math.max(0, track.scrollWidth - viewport.clientWidth)
    track.style.transform = `translateX(-${offset}px)`
  }, [transcriptWords])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.key.toLowerCase() !== "m" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        busy
      ) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [role='textbox']"))
      ) {
        return
      }

      event.preventDefault()
      if (listening) stopListening()
      else startListening()
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [busy, listening, startListening, stopListening])

  function submitText(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    setText("")
    voice.submit(value)
  }

  return (
    <section
      data-agent-hidden
      aria-label="Voice commands"
      className="fixed bottom-4 left-1/2 z-[56] w-[min(92vw,440px)] -translate-x-1/2 lg:left-auto lg:right-6 lg:w-[320px] lg:translate-x-0"
    >
      {typing ? (
        <form
          onSubmit={submitText}
          className="mb-2 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-2 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_50px_-28px_rgba(16,24,40,0.45)] backdrop-blur"
        >
          <Input
            autoFocus
            id="voice-command-input"
            aria-label="Command"
            value={text}
            onValueChange={setText}
            placeholder="Type a command…"
            autoComplete="off"
            className={`${inputClass} h-9 text-[13px]`}
          />
          <Button
            type="submit"
            disabled={busy || text.trim().length === 0}
            className={buttonClass("secondary", "h-9 shrink-0")}
          >
            Run
          </Button>
        </form>
      ) : null}

      {listening && spokenLine ? (
        <div
          role="status"
          aria-label="Live transcript"
          className="mb-2 h-7 w-full min-w-0 overflow-hidden px-1 text-[13px] leading-6 text-zinc-600"
        >
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {spokenLine}
          </span>
          <div
            aria-hidden="true"
            className="h-full overflow-hidden whitespace-nowrap"
          >
            <div
              ref={transcriptTrack}
              className="voice-transcript-track flex h-full w-max min-w-full items-center gap-1 whitespace-nowrap"
            >
              {transcriptWords.map((word) => (
                <span
                  key={word.id}
                  data-transcript-word={word.text}
                  className="voice-transcript-word voice-transcript-word-enter"
                  style={{ animationDelay: `${word.delay}ms` }}
                >
                  {word.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white/95 py-2.5 pl-2.5 pr-2 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_50px_-28px_rgba(16,24,40,0.45)] backdrop-blur">
        <span className="relative grid size-11 shrink-0 place-items-center">
          {listening ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-ping rounded-full bg-red-500/20 motion-reduce:animate-none"
            />
          ) : null}
          <Button
            type="button"
            aria-label={
              dictating && listening
                ? "Stop dictating"
                : listening
                  ? "Stop listening"
                  : "Start listening"
            }
            aria-pressed={listening}
            aria-keyshortcuts="M"
            title="Press M to start or stop the microphone"
            disabled={busy}
            onClick={() => (listening ? voice.stop() : voice.start())}
            className={`relative grid size-11 place-items-center rounded-full text-white outline-none transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 ${
              listening
                ? "bg-red-600 hover:bg-red-700"
                : busy
                  ? "bg-zinc-400"
                  : "bg-zinc-900 hover:bg-zinc-800"
            }`}
          >
            {busy ? (
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
              />
            ) : listening ? (
              <StopIcon className="size-4" />
            ) : (
              <MicIcon className="size-[18px]" />
            )}
          </Button>
          <kbd className="absolute -right-1 -top-1 z-10 grid size-4 place-items-center rounded bg-white text-[9px] font-semibold leading-none text-zinc-500 shadow-sm ring-1 ring-zinc-200">
            M
          </kbd>
        </span>

        <div className="min-w-0 flex-1">
          <p
            aria-live="polite"
            title={voice.status}
            className={`truncate text-[13px] font-medium ${
              voice.phase === "error" ? "text-amber-700" : "text-zinc-900"
            }`}
          >
            {voice.status}
          </p>
          <p
            title={voice.hint ?? undefined}
            className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-zinc-400"
          >
            {voice.hint ??
              (listening
                ? "Speak normally. Press the square to stop."
                : voice.transcript
                  ? `“${voice.transcript}”`
                  : voiceSpec.suggestions.map((item) => "“" + item + "”").join(" · "))}
            {voice.hint && voice.transcript
              ? ` I heard: “${voice.transcript}”.`
              : null}
          </p>
        </div>

        <Button
          type="button"
          aria-expanded={typing}
          aria-controls={typing ? "voice-command-input" : undefined}
          onClick={() => setTyping((current) => !current)}
          className={buttonClass("ghost", "h-8 shrink-0 px-2 text-[12px]")}
        >
          Type
        </Button>
      </div>
    </section>
  )
}
