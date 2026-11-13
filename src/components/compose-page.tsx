import * as React from "react"
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui-sdk/react/alert-dialog"
import { Button } from "@ui-sdk/react/button"
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { Switch, SwitchThumb } from "@ui-sdk/react/switch"
import { Textarea } from "@ui-sdk/react/textarea"
import { toast } from "@ui-sdk/react/toast"
import {
  buttonClass,
  dialogBackdropClass,
  dialogSurfaceClass,
  fieldDescriptionClass,
  fieldLabelClass,
  inputClass,
} from "./button-styles"
import { CheckIcon, ChevronDownIcon, CloseIcon } from "./icons"

const communities = [
  { value: "ai", label: "AI & ML" },
  { value: "design", label: "Design" },
  { value: "engineering", label: "Engineering" },
  { value: "product", label: "Product" },
  { value: "general", label: "General" },
]

const visibilityOptions = [
  { value: "everyone", label: "Everyone", hint: "Anyone on Murmur" },
  { value: "followers", label: "Followers", hint: "People who follow you" },
  { value: "only-me", label: "Only me", hint: "Just your eyes" },
]

type Visibility = (typeof visibilityOptions)[number]["value"]

type Draft = {
  title: string
  body: string
  community: string
  visibility: Visibility
  allowComments: boolean
}

const initialDraft: Draft = {
  title: "",
  body: "",
  community: "ai",
  visibility: "everyone",
  allowComments: true,
}

function communityLabel(value: string) {
  return communities.find((community) => community.value === value)?.label ?? "General"
}

function visibilityLabel(value: Visibility) {
  return visibilityOptions.find((option) => option.value === value)?.label ?? "Everyone"
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}

const selectTriggerClass =
  "flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-left text-[15px] text-zinc-900 shadow-[0_1px_1px_rgba(16,24,40,0.03)] outline-none transition hover:border-zinc-300 focus-visible:border-zinc-400 focus-visible:ring-4 focus-visible:ring-zinc-900/[0.04] data-[open]:border-zinc-400"

const selectContentClass =
  "z-50 min-w-[var(--anchor-width)] rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_16px_40px_-16px_rgba(16,24,40,0.25)]"

const selectItemClass =
  "flex cursor-default items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[14px] text-zinc-600 outline-none data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900"

export function ComposePage({
  componentCount,
  onOpenInspector,
}: {
  componentCount: number
  onOpenInspector: () => void
}) {
  const [draft, setDraft] = React.useState<Draft>(initialDraft)
  const [published, setPublished] = React.useState<Draft | null>(null)
  const hintId = React.useId()

  const canPublish = draft.title.trim().length > 0 && draft.body.trim().length > 0
  const words = wordCount(draft.body)

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function publish() {
    if (!canPublish) return

    setPublished(draft)
    toast("Post published", {
      description: `${communityLabel(draft.community)} · ${visibilityLabel(
        draft.visibility,
      )}`,
    })
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    publish()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast("Link copied", { description: "A share link is on your clipboard." })
    } catch {
      toast("Couldn't copy the link", {
        description: "Your browser blocked clipboard access.",
      })
    }
  }

  function discard() {
    setDraft(initialDraft)
    toast("Draft discarded", { description: "Nothing was published." })
  }

  function writeAnother() {
    setDraft(initialDraft)
    setPublished(null)
  }

  const checks = [
    {
      label: "Post title",
      done: draft.title.trim().length > 0,
      meta: `${draft.title.length}/90`,
    },
    {
      label: "Post body",
      done: draft.body.trim().length > 0,
      meta: `${words} ${words === 1 ? "word" : "words"}`,
    },
    {
      label: "Community",
      done: true,
      meta: communityLabel(draft.community),
    },
    {
      label: "Audience",
      done: true,
      meta: visibilityLabel(draft.visibility),
    },
  ]

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-24 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_296px] lg:gap-14 lg:pt-14">
      <section className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">
          New post
        </p>
        <h1 className="mt-3 max-w-xl text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-zinc-900 sm:text-[38px]">
          Share something worth reading.
        </h1>
        <p className="mt-3 max-w-lg text-[15px] leading-6 text-zinc-500">
          Write it yourself, or let an agent fill it in. Every control here is a ui-sdk
          component, with its state and actions exposed to the bridge.
        </p>

        {published ? (
          <PublishedPost
            draft={published}
            onWriteAnother={writeAnother}
            onCopyLink={copyLink}
          />
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit}
            className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-32px_rgba(16,24,40,0.25)]"
          >
            <div className="grid gap-6 p-6 sm:p-8">
              <Field name="title" className="gap-2">
                <div className="flex items-baseline justify-between gap-4">
                  <FieldLabel className={fieldLabelClass}>Post title</FieldLabel>
                  <span className="font-mono text-[11px] tabular-nums text-zinc-400">
                    {draft.title.length}/90
                  </span>
                </div>
                <Input
                  name="title"
                  value={draft.title}
                  onValueChange={(value) => update({ title: value })}
                  maxLength={90}
                  placeholder="A quiet corner of the internet"
                  autoComplete="off"
                  className={inputClass}
                />
                <FieldDescription className={fieldDescriptionClass}>
                  A clear title helps people find this post later.
                </FieldDescription>
              </Field>

              <Field name="body" className="gap-2">
                <div className="flex items-baseline justify-between gap-4">
                  <FieldLabel className={fieldLabelClass}>Post body</FieldLabel>
                  <span className="font-mono text-[11px] tabular-nums text-zinc-400">
                    {words} {words === 1 ? "word" : "words"}
                  </span>
                </div>
                <Textarea
                  name="body"
                  value={draft.body}
                  onValueChange={(value) => update({ body: value })}
                  rows={7}
                  placeholder="Say the thing you keep meaning to say."
                  className="min-h-40 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3.5 py-3 text-[15px] leading-7 text-zinc-900 shadow-[0_1px_1px_rgba(16,24,40,0.03)] outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/[0.04] aria-invalid:border-red-400"
                />
                <FieldDescription className={fieldDescriptionClass}>
                  Plain text. Markdown arrives with the editor.
                </FieldDescription>
              </Field>

              <div className="grid gap-6 sm:grid-cols-2">
                <Field name="community" className="gap-2">
                  <FieldLabel className={fieldLabelClass}>Community</FieldLabel>
                  <Select
                    name="community"
                    items={communities}
                    value={draft.community}
                    onValueChange={(value) => {
                      if (typeof value === "string") update({ community: value })
                    }}
                  >
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue />
                      <ChevronDownIcon className="size-4 shrink-0 text-zinc-400" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClass}>
                      {communities.map((community) => (
                        <SelectItem
                          key={community.value}
                          value={community.value}
                          className={selectItemClass}
                        >
                          {community.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription className={fieldDescriptionClass}>
                    Where this post shows up.
                  </FieldDescription>
                </Field>

                <Field name="visibility" className="gap-2">
                  <FieldLabel className={fieldLabelClass}>Who can see this</FieldLabel>
                  <RadioGroup
                    name="visibility"
                    value={draft.visibility}
                    onValueChange={(value) => {
                      if (value) update({ visibility: value as Visibility })
                    }}
                    className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-1.5"
                  >
                    {visibilityOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-[14px] text-zinc-600 transition hover:bg-zinc-50 has-[[data-checked]]:text-zinc-900"
                      >
                        <Radio
                          value={option.value}
                          className="grid size-[18px] shrink-0 place-items-center rounded-full border border-zinc-300 bg-white transition data-[checked]:border-indigo-600 data-[checked]:bg-indigo-600"
                        >
                          <RadioIndicator className="size-[7px] rounded-full bg-white" />
                        </Radio>
                        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                          <span className="font-medium">{option.label}</span>
                          <span
                            aria-hidden="true"
                            className="truncate text-[12px] text-zinc-400"
                          >
                            {option.hint}
                          </span>
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                </Field>
              </div>

              <Field name="comments" className="gap-1">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 px-4 py-3">
                  <div className="min-w-0">
                    <FieldLabel className={fieldLabelClass}>Allow comments</FieldLabel>
                    <FieldDescription className={fieldDescriptionClass}>
                      People can reply in the thread.
                    </FieldDescription>
                  </div>
                  <Switch
                    name="comments"
                    checked={draft.allowComments}
                    onCheckedChange={(checked) => update({ allowComments: checked })}
                    className="relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full bg-zinc-200 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900/15 focus-visible:ring-offset-2 data-[checked]:bg-indigo-600"
                  >
                    <SwitchThumb className="block size-4 translate-x-[3px] rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-[19px]" />
                  </Switch>
                </div>
              </Field>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-zinc-100 bg-zinc-50/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <AlertDialog>
                <AlertDialogTrigger className={buttonClass("danger", "!px-2.5")}>
                  Discard draft
                </AlertDialogTrigger>
                <AlertDialogBackdrop className={dialogBackdropClass} />
                <AlertDialogContent className={`${dialogSurfaceClass} w-[min(92vw,420px)]`}>
                  <AlertDialogTitle className="text-[16px] font-semibold tracking-tight text-zinc-900">
                    Discard this draft?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="mt-1.5 text-[14px] leading-6 text-zinc-500">
                    Your title and body will be deleted. This can&apos;t be undone.
                  </AlertDialogDescription>
                  <div className="mt-5 flex justify-end gap-2">
                    <AlertDialogClose className={buttonClass("secondary")}>
                      Keep writing
                    </AlertDialogClose>
                    <AlertDialogClose
                      value="confirm"
                      onClick={discard}
                      className={buttonClass("danger")}
                    >
                      Delete draft
                    </AlertDialogClose>
                  </div>
                </AlertDialogContent>
              </AlertDialog>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <p
                  id={hintId}
                  className="mr-auto hidden text-[12px] text-zinc-400 sm:block"
                >
                  {canPublish
                    ? "Ready to publish."
                    : "Add a title and body to publish."}
                </p>

                <Dialog>
                  <DialogTrigger className={buttonClass("secondary")}>
                    Preview post
                  </DialogTrigger>
                  <DialogBackdrop className={dialogBackdropClass} />
                  <DialogContent className={`${dialogSurfaceClass} w-[min(92vw,560px)]`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <DialogTitle className="text-[16px] font-semibold tracking-tight text-zinc-900">
                          Post preview
                        </DialogTitle>
                        <DialogDescription className="mt-1 text-[13px] text-zinc-500">
                          How this will read in {communityLabel(draft.community)}.
                        </DialogDescription>
                      </div>
                      <DialogClose
                        aria-label="Close preview"
                        className="grid size-8 place-items-center rounded-lg text-zinc-400 outline-none transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-zinc-900/15 focus-visible:ring-offset-2"
                      >
                        <CloseIcon className="size-4" />
                      </DialogClose>
                    </div>

                    <div className="mt-5 rounded-xl border border-zinc-200 p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                        {communityLabel(draft.community)} ·{" "}
                        {visibilityLabel(draft.visibility)}
                      </p>
                      <h3 className="mt-2 text-[18px] font-semibold leading-6 tracking-tight text-zinc-900">
                        {draft.title.trim() || "Untitled draft"}
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-zinc-600">
                        {draft.body.trim() || "Nothing to preview yet."}
                      </p>
                      <p className="mt-4 text-[12px] text-zinc-400">
                        {draft.allowComments
                          ? "Comments are open."
                          : "Comments are closed."}
                      </p>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button
                  type="submit"
                  disabled={!canPublish}
                  focusableWhenDisabled
                  aria-describedby={hintId}
                  data-agent-confirm="Publishes this post to the feed"
                  className={buttonClass("primary")}
                >
                  Publish post
                </Button>
              </div>
            </div>
          </form>
        )}
      </section>

      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-4">
          {published ? null : (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h2 className="text-[13px] font-semibold text-zinc-900">
                Ready to publish
              </h2>
              <ul className="mt-4 space-y-3">
                {checks.map((check) => (
                  <li key={check.label} className="flex items-center gap-2.5">
                    <span
                      className={`grid size-4 shrink-0 place-items-center rounded-full border transition-colors ${
                        check.done
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-zinc-300 bg-white text-transparent"
                      }`}
                    >
                      <CheckIcon className="size-2.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-600">
                      {check.label}
                    </span>
                    <span className="shrink-0 text-[11px] text-zinc-400">{check.meta}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <h2 className="text-[13px] font-semibold text-zinc-900">Agent bridge</h2>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-zinc-500">
              {componentCount} components report their label, state and actions. A model
              can call them without touching the DOM.
            </p>
            <Button
              className={buttonClass("secondary", "mt-3 w-full")}
              onClick={onOpenInspector}
            >
              Open agent inspector
            </Button>
            <p className="mt-2.5 text-[11px] leading-4 text-zinc-400">
              Or run <code className="font-mono text-[10px]">window.agent.snapshot()</code>{" "}
              in the console.
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}

function PublishedPost({
  draft,
  onWriteAnother,
  onCopyLink,
}: {
  draft: Draft
  onWriteAnother: () => void
  onCopyLink: () => void
}) {
  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-32px_rgba(16,24,40,0.25)]">
      <div className="flex flex-col items-center px-6 py-12 text-center sm:px-10">
        <div className="grid size-11 place-items-center rounded-full bg-indigo-50 text-indigo-600">
          <CheckIcon className="size-5" />
        </div>
        <h2 className="mt-4 text-[20px] font-semibold tracking-tight text-zinc-900">
          Your post is live
        </h2>
        <p className="mt-1.5 max-w-sm text-[14px] leading-6 text-zinc-500">
          Published to {communityLabel(draft.community)} ·{" "}
          {visibilityLabel(draft.visibility)}. Comments are{" "}
          {draft.allowComments ? "on" : "off"}.
        </p>

        <div className="mt-7 w-full rounded-xl border border-zinc-200 bg-zinc-50/70 p-5 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            {communityLabel(draft.community)}
          </p>
          <h3 className="mt-2 text-[17px] font-semibold leading-6 tracking-tight text-zinc-900">
            {draft.title}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-zinc-600">
            {draft.body}
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <Button className={buttonClass("primary")} onClick={onWriteAnother}>
            Write another post
          </Button>
          <Button
            className={buttonClass("ghost")}
            onClick={onCopyLink}
          >
            Copy link
          </Button>
        </div>
      </div>
    </div>
  )
}
