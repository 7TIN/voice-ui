import { cleanup, configure } from "@testing-library/react"
import { afterEach } from "vitest"

declare global {
  // eslint-disable-next-line no-var
  var __UI_SDK_STRICT__: boolean | undefined
}

// The suite runs several heavy DOM files in parallel; the default one-second
// poll timeout is not enough for a plan that runs under that load.
configure({ asyncUtilTimeout: 4000 })

Object.assign(HTMLElement.prototype, {
  showPopover() {},
  hidePopover() {},
})
Object.assign(Element.prototype, {
  getAnimations: () => [],
  scrollIntoView() {},
  checkVisibility: () => true,
  getClientRects: () => [] as unknown as DOMRectList,
})
Object.assign(document, {
  elementFromPoint: () => null,
  elementsFromPoint: () => [],
})
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

document.head.append(
  Object.assign(document.createElement("style"), {
    textContent: "[popover] { display: block !important }",
  }),
)

globalThis.__UI_SDK_STRICT__ = true

afterEach(() => {
  cleanup()
})
