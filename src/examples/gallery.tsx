import { Button } from "@ui-sdk/react/button"
import { buttonClass } from "../components/button-styles"

export type ExampleCard = {
  id: "compose" | "timeline"
  title: string
  description: string
  primitives: string[]
}

export const EXAMPLE_CARDS: ExampleCard[] = [
  {
    id: "compose",
    title: "Form example",
    description:
      "A social post composer: title, body, community, audience, comments, preview and publish.",
    primitives: [
      "Input",
      "Textarea",
      "Select",
      "RadioGroup",
      "Switch",
      "Button",
      "Dialog",
      "AlertDialog",
    ],
  },
  {
    id: "timeline",
    title: "Timeline example",
    description:
      "A Twitter-like feed: posts, likes, reposts, quotes, replies, comments, options and side menus.",
    primitives: [
      "Timeline",
      "Tabs",
      "Toggle",
      "Collapsible",
      "Menu",
      "Dialog",
      "Avatar",
      "Button",
      "Input",
      "Textarea",
    ],
  },
]

export function GalleryPage({
  onSelect,
}: {
  onSelect: (id: "compose" | "timeline") => void
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 lg:pt-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">
        Examples
      </p>
      <h1 className="mt-3 max-w-2xl text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-zinc-900 sm:text-[38px]">
        Voice-controlled ui-sdk examples
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-6 text-zinc-500">
        Pick an example. Every control is named for agents, works by mouse and
        keyboard, and can be driven by voice through the same component APIs.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {EXAMPLE_CARDS.map((example) => (
          <Button
            key={example.id}
            aria-label={"Open " + example.title}
            onClick={() => onSelect(example.id)}
            style={{
              height: "auto",
              alignItems: "stretch",
              justifyContent: "flex-start",
            }}
            className="group flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-32px_rgba(16,24,40,0.25)] transition hover:border-zinc-300 hover:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_20px_50px_-28px_rgba(16,24,40,0.35)]"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                {example.id === "compose" ? "01" : "02"}
              </p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-zinc-900">
                {example.title}
              </h2>
              <p className="mt-2 text-[14px] leading-6 text-zinc-500">
                {example.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {example.primitives.map((primitive) => (
                <span
                  key={primitive}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600"
                >
                  {primitive}
                </span>
              ))}
            </div>
            <span className={buttonClass("secondary", "mt-auto w-fit")}>
              Open example
            </span>
          </Button>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-[13px] font-semibold text-zinc-900">Agent bridge</h2>
        <p className="mt-2 text-[12px] leading-5 text-zinc-500">
          Every control in every example reports its label, state and actions to the
          bridge. Open an example, then run{" "}
          <code className="font-mono text-[10px]">window.agent.snapshot()</code> in
          the console.
        </p>
      </div>
    </div>
  )
}
