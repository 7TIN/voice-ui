/**
 * What each ui-sdk primitive does, in the words a classifier can use.
 *
 * The voice prompt is written per example, but the primitives it composes are
 * shared. Keeping their behaviour in one place means the classifier is told how
 * a Toggle reports `pressed`, how a Menu exposes its items, and how a Dialog
 * names itself — the same facts a person learns from the screen.
 */
export type PrimitiveBehavior = {
  /** The import and component name the example uses. */
  name: string
  /** What it is for, in one sentence. */
  summary: string
  /** The state the bridge reports, when it reports any. */
  state?: string
  /** The actions the bridge offers. */
  actions?: string
  /** How people and agents use it. */
  behavior: string
}

const PRIMITIVES: Record<string, PrimitiveBehavior> = {
  Button: {
    name: "Button",
    summary: "A one-shot action, like Reply, Post reply or Next post.",
    actions: "press",
    behavior:
      "A button's accessible name is its label. Pressing it runs one action. " +
      "A button that opens a dialog is pressed once; the dialog's own controls appear afterwards.",
  },
  Input: {
    name: "Input",
    summary: "A single-line text field, like a search box or a display name.",
    state: "value",
    actions: "setValue, clear",
    behavior:
      "Its label is its accessible name. An agent writes with setValue and empties it with clear. " +
      "Typing reports value changes as they happen.",
  },
  Textarea: {
    name: "Textarea",
    summary: "A multi-line field, like a reply, a quote or a post body.",
    state: "value",
    actions: "setValue, clear",
    behavior:
      "Its label is its accessible name. setValue replaces the whole text, so voice dictation " +
      "sets the complete accumulated sentence rather than appending through the DOM.",
  },
  Select: {
    name: "Select",
    summary: "A compact list of choices behind a trigger, like a community picker.",
    state: "value, open",
    actions: "setValue, setOpen",
    behavior:
      "The component's label names the control. Its items are choices with a label and a value. " +
      "setValue takes either an item's label or its value. setOpen true shows the list.",
  },
  RadioGroup: {
    name: "RadioGroup",
    summary: "A visible set of choices where exactly one is selected.",
    state: "value",
    actions: "setValue",
    behavior:
      "The group's label names the control. setValue takes an item's label or value. " +
      "There is no popup to open; the choices are already on the page.",
  },
  Switch: {
    name: "Switch",
    summary: "An on/off setting with an immediate effect, like allowing comments.",
    state: "checked",
    actions: "setChecked",
    behavior:
      "Its label names the setting, not its current value. setChecked true turns it on and false turns it off.",
  },
  Toggle: {
    name: "Toggle",
    summary: "A button that stays pressed, like Like, Repost or Follow.",
    state: "pressed",
    actions: "setPressed",
    behavior:
      "Its accessible name says what pressing it does, for example “Like Ada Lovelace's post”. " +
      "setPressed true turns it on; setPressed false turns it off. The label stays the same, " +
      "so the action is the same whether it is on or off.",
  },
  Tabs: {
    name: "Tabs",
    summary: "Sections that share one space, like Home, Explore and Notifications.",
    state: "value",
    actions: "setValue",
    behavior:
      "The tab list has a name, such as Sections. setValue takes the value or label of one tab, " +
      "and that panel appears. Closed panels hide their controls until the tab is selected.",
  },
  Collapsible: {
    name: "Collapsible",
    summary: "A panel shown and hidden by a trigger, like a post's comments.",
    state: "open",
    actions: "setOpen",
    behavior:
      "Its label is the trigger's accessible name, for example “Comments on Ada Lovelace's post”. " +
      "setOpen true expands the panel; setOpen false collapses it.",
  },
  Menu: {
    name: "Menu",
    summary: "A popup list of actions, like the options on a post.",
    state: "open",
    actions: "setOpen, press",
    behavior:
      "Its label is its trigger's accessible name, for example “Options for Ada Lovelace's post”. " +
      "setOpen true opens the menu. Each item is a menuitem with its own text; press with that text " +
      "opens the menu if needed and chooses the item. An item marked data-agent-confirm is consequential.",
  },
  Dialog: {
    name: "Dialog",
    summary: "A modal for focused work, like writing a reply or a quote.",
    state: "open",
    actions: "setOpen",
    behavior:
      "Its accessible name comes from its title, such as “Reply to Ada Lovelace”. A dialog is opened " +
      "by pressing its trigger or with setOpen true. Its fields and buttons join the page only while it is open.",
  },
  AlertDialog: {
    name: "AlertDialog",
    summary: "A modal that asks before something irreversible.",
    state: "open",
    actions: "setOpen",
    behavior:
      "Its title names the question and its description explains the consequence. The confirm and " +
      "cancel buttons are the only ways forward. Use it for discarding or other destructive choices.",
  },
  Avatar: {
    name: "Avatar",
    summary: "A person's picture with initials as a fallback.",
    behavior:
      "The avatar shows the person's face or initials. The visible name beside it carries the identity; " +
      "the avatar itself is not an action unless it is given a button role.",
  },
  Timeline: {
    name: "Timeline",
    summary: "A feed of dated events with one tab stop and arrow keys between posts.",
    state: "none",
    behavior:
      "The feed is a list (or, with feed, a set of articles) named on the page, such as Home feed. " +
      "The feed itself has no agent action. Its posts contain the real controls: Like, Repost, Reply, " +
      "Quote, Comments and Options. Page Down and Page Up move between posts from inside one.",
  },
  Toast: {
    name: "Toast",
    summary: "A short confirmation that fades after an action.",
    behavior:
      "Toast text is for the person. It is hidden from the agent bridge, so it never becomes an action.",
  },
}

export function describePrimitives(names: string[]) {
  const unique = [...new Set(names)]
  return unique
    .map((name) => {
      const primitive = PRIMITIVES[name]
      if (!primitive) return "- " + name + ": a ui-sdk component."
      const facts = [primitive.summary]
      if (primitive.state) facts.push("State: " + primitive.state + ".")
      if (primitive.actions) facts.push("Actions: " + primitive.actions + ".")
      facts.push(primitive.behavior)
      return "- " + primitive.name + ": " + facts.join(" ")
    })
    .join("\n")
}
