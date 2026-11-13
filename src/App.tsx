import { useState } from "react"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastRegion,
  ToastTitle,
} from "@ui-sdk/react/toast"
import { useAgentSnapshot } from "./agent/use-agent-snapshot"
import { AgentInspector } from "./components/agent-inspector"
import { ComposePage } from "./components/compose-page"
import { ConfirmationDialog } from "./components/confirmation-dialog"
import { CloseIcon, SparkIcon } from "./components/icons"

export default function App() {
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const components = useAgentSnapshot()

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-[#fafafa]/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-5 sm:px-8">
          <span className="grid size-7 place-items-center rounded-[9px] bg-zinc-900 text-white shadow-sm">
            <SparkIcon className="size-3.5" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-zinc-900">
            Murmur
          </span>
          <span className="ml-1 hidden rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-500 sm:inline">
            Beta
          </span>
          <span className="ml-auto hidden text-[12px] text-zinc-400 sm:inline">
            Local demo · nothing leaves this tab
          </span>
          <div
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-full bg-zinc-200 text-[11px] font-semibold text-zinc-600"
          >
            AK
          </div>
        </div>
      </header>

      <main>
        <ComposePage
          componentCount={components.length}
          onOpenInspector={() => setInspectorOpen(true)}
        />
      </main>

      <footer className="border-t border-zinc-200/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-6 text-[12px] text-zinc-400 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>Murmur · a quieter social network</p>
          <p>Built with ui-sdk. Every control is agent-readable.</p>
        </div>
      </footer>

      <ConfirmationDialog />
      <AgentInspector open={inspectorOpen} onOpenChange={setInspectorOpen} />

      <ToastRegion
        data-agent-hidden
        className="fixed bottom-4 left-1/2 z-[55] flex w-[min(92vw,380px)] -translate-x-1/2 flex-col gap-2"
      >
        {() => (
          <Toast className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white shadow-[0_16px_40px_-16px_rgba(9,9,11,0.5)]">
            <div className="min-w-0 flex-1">
              <ToastTitle className="text-[13px] font-semibold" />
              <ToastDescription className="mt-0.5 text-[12px] leading-5 text-zinc-400" />
            </div>
            <ToastClose
              aria-label="Dismiss notification"
              className="grid size-6 shrink-0 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
            >
              <CloseIcon className="size-3.5" />
            </ToastClose>
          </Toast>
        )}
      </ToastRegion>
    </div>
  )
}
