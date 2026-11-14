import type { AgentChange, AgentComponent } from "@ui-sdk/react/agent"
import { agent } from "./bridge"
import type { Plan, PlanStep } from "./plan"

export type CommandResult = {
  ok: boolean
  message: string
  changes: AgentChange[]
}

function find(snapshot: AgentComponent[], name: string) {
  const wanted = name.trim().toLowerCase()
  return snapshot.find(
    (component) =>
      !component.offPage &&
      (component.ref === name || (component.label ?? "").trim().toLowerCase() === wanted),
  )
}

function check(step: PlanStep, snapshot: AgentComponent[]): string | null {
  const component = find(snapshot, step.ref)
  if (!component) {
    return `I can't find “${step.ref}” on this page any more.`
  }
  if (component.disabled) {
    return `“${component.label ?? step.ref}” is unavailable right now.`
  }
  if (!component.actions.includes(step.action)) {
    return `“${component.label ?? step.ref}” can't ${step.action} right now.`
  }
  return null
}

/** A refusal is not a crash; say what happened in words a person can act on. */
function describe(error: { message: string } | undefined) {
  const message = error?.message ?? "The action failed."
  if (/said no to/i.test(message)) {
    return "You said no, so nothing changed."
  }
  if (/needs a person/i.test(message)) {
    return "That needs a person to approve it. Press the button yourself."
  }
  if (/can't find|no component/i.test(message)) {
    return "The page changed while I was working. Try that again."
  }
  return message
}

function expectedKey(action: string) {
  if (action === "setValue") return "value" as const
  if (action === "setChecked") return "checked" as const
  if (action === "setOpen") return "open" as const
  if (action === "setPressed") return "pressed" as const
  return null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Re-read the page after the plan runs. `ok: true` only means the bridge ran
 * the steps; a change callback can still have cancelled one of them. React may
 * commit the new state a tick after `act` resolves, so poll instead of reading
 * once — otherwise a correct change looks stale.
 */
async function verify(plan: Plan, refs: string[]) {
  let problem: string | null = null

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const after = agent.snapshot()
    problem = null

    for (const [index, step] of plan.steps.entries()) {
      const key = expectedKey(step.action)
      if (!key) continue

      const target = after.find((component) => component.ref === refs[index])
      if (!target) {
        problem = `“${step.ref}” left the page before I could check it.`
        break
      }
      if (target[key] !== step.args[0]) {
        const shown = target[key] === undefined ? "nothing" : JSON.stringify(target[key])
        problem = `“${target.label ?? step.ref}” still shows ${shown}.`
        break
      }
    }

    if (!problem) return null
    await sleep(25)
  }

  return problem
}

export async function executePlan(plan: Plan): Promise<CommandResult> {
  const snapshot = agent.snapshot().filter((entry) => !entry.offPage)

  // A step may name a component that only appears after an earlier step, for
  // example the fields of a dialog that opens on the first step. Only check
  // the ones that are already on the page; the bridge will report a clear error
  // for anything that is genuinely missing.
  for (const step of plan.steps) {
    const component = find(snapshot, step.ref)
    if (!component) continue
    const problem = check(step, snapshot)
    if (problem) return { ok: false, message: problem, changes: [] }
  }

  const result = await agent.act({ steps: plan.steps })

  if (!result.ok) {
    return { ok: false, message: describe(result.error), changes: [] }
  }

  const changes = result.steps.flatMap((step) => step.changes ?? [])
  const refs = result.steps.map((step) => step.ref)
  const stale = await verify(plan, refs)

  if (stale) {
    return { ok: false, message: stale, changes }
  }

  return { ok: true, message: plan.done, changes }
}
