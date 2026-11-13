const base =
  "inline-flex h-9 select-none items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-45 aria-disabled:opacity-45"

const variants = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-800 active:bg-zinc-950",
  secondary:
    "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
  ghost: "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
  danger: "text-red-600 hover:bg-red-50 hover:text-red-700",
} as const

export type ButtonVariant = keyof typeof variants

export function buttonClass(variant: ButtonVariant = "secondary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`.trim()
}

export const inputClass =
  "h-11 w-full rounded-lg border border-zinc-200 bg-white px-3.5 text-[15px] text-zinc-900 shadow-[0_1px_1px_rgba(16,24,40,0.03)] outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/[0.04] aria-invalid:border-red-400"

export const fieldLabelClass = "text-[13px] font-medium text-zinc-900"

export const fieldDescriptionClass = "text-[12px] leading-5 text-zinc-400"

// A dialog in the top layer: `inset-0` + `m-auto` centres it, which Tailwind's
// preflight otherwise removes by resetting the browser's `margin: auto`.
export const dialogSurfaceClass =
  "fixed inset-0 z-50 m-auto h-fit max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_24px_64px_-24px_rgba(9,9,11,0.35)]"

export const dialogBackdropClass = "fixed inset-0 z-40 bg-zinc-950/25 backdrop-blur-[2px]"
