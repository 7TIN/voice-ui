type ConfirmationRequest = {
  message: string
  resolve: (approved: boolean) => void
}

let current: ConfirmationRequest | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function askForConfirmation(
  message: string,
  { signal }: { signal: AbortSignal },
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false

    const finish = (approved: boolean) => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      if (current?.resolve === finish) {
        current = null
        emit()
      }
      resolve(approved)
    }

    const onAbort = () => finish(false)

    current = { message, resolve: finish }
    emit()
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

export function subscribeConfirmation(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getConfirmation() {
  return current
}

export function resolveConfirmation(approved: boolean) {
  current?.resolve(approved)
}
