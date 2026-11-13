import { useSyncExternalStore } from "react"
import { Button } from "@ui-sdk/react/button"
import {
  Dialog,
  DialogBackdrop,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/react/dialog"
import {
  getConfirmation,
  resolveConfirmation,
  subscribeConfirmation,
} from "../agent/confirmation"
import { buttonClass, dialogBackdropClass, dialogSurfaceClass } from "./button-styles"
import { BoltIcon } from "./icons"

export function ConfirmationDialog() {
  const request = useSyncExternalStore(
    subscribeConfirmation,
    getConfirmation,
    getConfirmation,
  )

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) resolveConfirmation(false)
      }}
    >
      <DialogBackdrop className={dialogBackdropClass} />
      <DialogContent
        data-agent-hidden
        className={`${dialogSurfaceClass} w-[min(92vw,440px)]`}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600">
            <BoltIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-[16px] font-semibold tracking-tight text-zinc-900">
              Approve this action?
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-[14px] leading-6 text-zinc-500">
              {request?.message}
            </DialogDescription>
          </div>
        </div>

        <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-[12px] leading-5 text-zinc-500">
          An agent asked for this. Approving runs it once. Nothing else on the page
          changes.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            className={buttonClass("secondary")}
            onClick={() => resolveConfirmation(false)}
          >
            Cancel
          </Button>
          <Button
            className={buttonClass("primary")}
            onClick={() => resolveConfirmation(true)}
          >
            Approve
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
