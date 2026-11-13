import { useState } from "react"
import { Button } from "@ui-sdk/react/button"
import { Input } from "@ui-sdk/react/input"
import type { Transcriber } from "../voice/transcriber"
import { useVoice } from "../voice/use-voice"
import { buttonClass, inputClass } from "./button-styles"
import { MicIcon, StopIcon } from "./icons"

const BUSY = new Set(["transcribing", "planning", "executing"])

/**
 * The human input path for voice, and therefore hidden from the bridge: an
 * agent may read and drive the composer, but it must never drive the thing
 * that drives the agent. Everything here funnels into the same `interpret` →
 * `executePlan` pipeline, so a typed command is not a second implementation.
 */
export function VoicePill({ transcriber }: { transcriber?: Transcriber }) {
  const voice = useVoice(transcriber)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState("")

  const listening = voice.phase === "listening"
  const busy = BUSY.has(voice.phase)

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
            aria-label={listening ? "Stop listening" : "Start listening"}
            aria-pressed={listening}
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
            {listening && voice.interim ? (
              <span className="font-normal text-zinc-400"> {voice.interim}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-[12px] leading-4 text-zinc-400">
            {voice.hint ??
              (listening
                ? "Speak normally. Press the square to stop."
                : voice.transcript
                  ? `“${voice.transcript}”`
                  : "Try “turn comments off” or “publish the post”.")}
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
