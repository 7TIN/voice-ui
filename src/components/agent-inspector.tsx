import { useState } from "react"
import type { AgentComponent } from "@ui-sdk/react/agent"
import { agent } from "../agent/bridge"
import { useAgentSnapshot } from "../agent/use-agent-snapshot"
import { buttonClass } from "./button-styles"
import { CloseIcon } from "./icons"

const hiddenKeys = new Set([
  "ref",
  "component",
  "label",
  "row",
  "actions",
  "items",
  "source",
  "buttons",
  "text",
  "more",
  "use",
])

function defaultArgs(action: string) {
  if (action.startsWith("set") && action !== "setOpen") return '[""]'
  if (action === "setOpen") return "[true]"
  return "[]"
}

function stateSummary(entry: AgentComponent) {
  return Object.entries(entry)
    .filter(([key]) => !hiddenKeys.has(key))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("  ")
}

export function AgentInspector({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const components = useAgentSnapshot(open)
  const [selectedRef, setSelectedRef] = useState("")
  const [action, setAction] = useState("")
  const [args, setArgs] = useState("[]")
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = components.find((entry) => entry.ref === selectedRef) ?? null

  function select(entry: AgentComponent) {
    setSelectedRef(entry.ref)
    const nextAction = entry.actions[0] ?? ""
    setAction(nextAction)
    setArgs(defaultArgs(nextAction))
    setResult(null)
    setError(null)
  }

  function pickAction(nextAction: string) {
    setAction(nextAction)
    setArgs(defaultArgs(nextAction))
    setResult(null)
    setError(null)
  }

  async function run() {
    if (!selected || !action) return
    setError(null)
    setResult(null)

    let parsed: unknown
    try {
      parsed = JSON.parse(args)
    } catch {
      setError("Arguments must be valid JSON.")
      return
    }
    if (!Array.isArray(parsed)) {
      setError("Arguments must be a JSON array.")
      return
    }

    const response = await agent.act({
      steps: [{ ref: selected.ref, action, args: parsed }],
    })
    setResult(JSON.stringify(response, null, 2))
  }

  if (!open) {
    return (
      <div data-agent-hidden className="fixed bottom-4 right-4 z-[60]">
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="group flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 py-2 pl-3 pr-4 text-[12px] font-medium text-zinc-100 shadow-lg transition hover:bg-zinc-800"
        >
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Agent
        </button>
      </div>
    )
  }

  return (
    <div
      data-agent-hidden
      className="fixed bottom-4 right-4 z-[60] flex max-h-[min(78vh,680px)] w-[min(94vw,400px)] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.65)]"
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        <h2 className="text-[12px] font-semibold tracking-wide text-zinc-200">
          Agent inspector
        </h2>
        <span className="ml-auto font-mono text-[10px] text-zinc-500">
          {components.length} on page
        </span>
        <button
          type="button"
          aria-label="Close agent inspector"
          onClick={() => onOpenChange(false)}
          className="grid size-6 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          <CloseIcon className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-zinc-800/80 px-2 py-2">
          {components.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-zinc-500">
              No components registered yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {components.map((entry) => (
                <li key={entry.ref}>
                  <button
                    type="button"
                    onClick={() => select(entry)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                      entry.ref === selectedRef
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[11px]">
                      {entry.label ?? <span className="text-amber-400">(unnamed)</span>}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                      {entry.component}
                    </span>
                    <span className="w-7 shrink-0 text-right font-mono text-[10px] text-zinc-600">
                      {entry.ref}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 px-4 py-3">
          {selected ? (
            <>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-zinc-200">
                  {selected.label ?? "(unnamed)"}
                </p>
                <p className="break-words font-mono text-[10px] leading-4 text-zinc-500">
                  {stateSummary(selected) || "no exposed state"}
                </p>
                {selected.items && selected.items.length > 0 ? (
                  <p className="font-mono text-[10px] leading-4 text-zinc-600">
                    items: {selected.items.map((item) => item.label).join(", ")}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-1">
                {selected.actions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => pickAction(name)}
                    className={`rounded-md border px-2 py-1 font-mono text-[10px] transition ${
                      name === action
                        ? "border-indigo-500 bg-indigo-500/15 text-indigo-300"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>

              <div className="flex gap-1.5">
                <input
                  aria-label="Action arguments as JSON"
                  value={args}
                  onChange={(event) => setArgs(event.target.value)}
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-zinc-600"
                />
                <button
                  type="button"
                  onClick={run}
                  disabled={!action}
                  className="rounded-md bg-zinc-100 px-3 py-1.5 text-[11px] font-semibold text-zinc-900 transition hover:bg-white disabled:opacity-40"
                >
                  Run
                </button>
              </div>

              {error ? (
                <p className="rounded-md bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
                  {error}
                </p>
              ) : null}

              {result ? (
                <pre className="max-h-44 overflow-auto rounded-md border border-zinc-800 bg-zinc-900 p-2 font-mono text-[10px] leading-4 text-zinc-400">
                  {result}
                </pre>
              ) : null}
            </>
          ) : (
            <p className="text-[11px] leading-5 text-zinc-500">
              Pick a component to read its state and run one of its actions. Presses
              that need a person open the approval card.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-800 px-4 py-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className={buttonClass("ghost", "!h-7 !px-2 !text-[11px] !text-zinc-500 hover:!bg-zinc-900 hover:!text-zinc-300")}
        >
          Hide inspector
        </button>
      </div>
    </div>
  )
}
