import * as React from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@ui-sdk/react/avatar"
import { Button } from "@ui-sdk/react/button"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/react/collapsible"
import { Input } from "@ui-sdk/react/input"
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@ui-sdk/react/menu"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs"
import { Textarea } from "@ui-sdk/react/textarea"
import { Timeline, TimelineConnector, TimelineDescription, TimelineItem, TimelineMarker, TimelineTime, TimelineTitle } from "@ui-sdk/react/timeline"
import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle"
import { toast } from "@ui-sdk/react/toast"
import { createTimelineController } from "@ui-sdk/react/timeline"
import { buttonClass, inputClass } from "../../components/button-styles"
import {
  SUGGESTED_PEOPLE,
  TIMELINE_POSTS,
  TIMELINE_SECTIONS,
  type TimelineComment,
  type TimelinePost,
} from "./data"

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M8 13.5 2.6 8.2a3.1 3.1 0 0 1 4.4-4.4L8 4.8l1-1a3.1 3.1 0 0 1 4.4 4.4L8 13.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RepeatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M3 6h8.5a2.5 2.5 0 0 1 0 5H9M3 6l2.5-2.5M3 6l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6l-3 2.5V4.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="4" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="12" cy="8" r="1.2" fill="currentColor" />
    </svg>
  )
}

function QuoteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 4.5h3v3H4v-3Zm5 0h3v3H9v-3ZM4 9h3v2.5H4V9Zm5 0h3v2.5H9V9Z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  )
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M3 8.5 13 3l-3.5 10-1.8-3.6L3 8.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TimelinePage() {
  const [posts, setPosts] = React.useState<TimelinePost[]>(TIMELINE_POSTS)
  const [follows, setFollows] = React.useState<Record<string, boolean>>({
    margaret: false,
    alan: false,
    katherine: false,
  })
  const [section, setSection] = React.useState<string>("home")
  const [focusIndex, setFocusIndex] = React.useState(0)
  const [replyTexts, setReplyTexts] = React.useState<Record<string, string>>({})
  const [quoteTexts, setQuoteTexts] = React.useState<Record<string, string>>({})
  const [quoting, setQuoting] = React.useState<Record<string, boolean>>({})
  const [replying, setReplying] = React.useState<Record<string, boolean>>({})
  const controller = React.useMemo(() => createTimelineController(), [])

  function updatePost(id: string, patch: Partial<TimelinePost>) {
    setPosts((current) =>
      current.map((post) => (post.id === id ? { ...post, ...patch } : post)),
    )
  }

  function like(id: string, pressed: boolean) {
    const post = posts.find((item) => item.id === id)
    if (!post) return
    const nextLikes = post.likes + (pressed ? 1 : post.liked ? -1 : 0)
    updatePost(id, { liked: pressed, likes: Math.max(0, nextLikes) })
  }

  function repost(id: string, pressed: boolean) {
    const post = posts.find((item) => item.id === id)
    if (!post) return
    const nextReposts = post.reposts + (pressed ? 1 : post.reposted ? -1 : 0)
    updatePost(id, { reposted: pressed, reposts: Math.max(0, nextReposts) })
    toast(pressed ? "Reposted" : "Repost removed", {
      description: post.author,
    })
  }

  function addComment(id: string, body: string) {
    const trimmed = body.trim()
    if (!trimmed) return
    const comment: TimelineComment = {
      id: "c" + Date.now(),
      author: "You",
      handle: "you",
      body: trimmed,
      time: "now",
      likes: 0,
    }
    const post = posts.find((item) => item.id === id)
    if (!post) return
    updatePost(id, {
      comments: [comment, ...post.comments],
      replies: post.replies + 1,
    })
  }

  function nextPost() {
    const next = Math.min(focusIndex + 1, posts.length - 1)
    setFocusIndex(next)
    controller.focus(posts[next].id)
  }

  function previousPost() {
    const previous = Math.max(focusIndex - 1, 0)
    setFocusIndex(previous)
    controller.focus(posts[previous].id)
  }

  return (
    <Tabs
      value={section}
      onValueChange={(value) => {
        if (value) setSection(value)
      }}
      orientation="vertical"
      className="mx-auto grid max-w-6xl gap-6 px-5 pb-24 pt-6 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)_300px] lg:gap-8 lg:pt-10"
    >
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-4">
          <div className="flex items-center gap-2 px-2">
            <span className="grid size-8 place-items-center rounded-[9px] bg-zinc-900 text-white">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3.5">
                <path
                  d="M8 1.5 9.4 6l4.6 2-4.6 2L8 14.5 6.6 10 2 8l4.6-2L8 1.5Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-zinc-900">
              Murmur
            </span>
          </div>

          <TabsList aria-label="Sections" className="flex flex-col gap-1">
            {TIMELINE_SECTIONS.map((item) => (
              <TabsTab
                key={item.value}
                value={item.value}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] font-medium text-zinc-600 outline-none transition hover:bg-zinc-100 data-[selected]:bg-zinc-100 data-[selected]:text-zinc-900"
              >
                {item.label}
              </TabsTab>
            ))}
          </TabsList>

          <Button
            aria-label="New post"
            className={buttonClass("primary", "w-full justify-center")}
            onClick={() => toast("The composer example has the full editor.")}
          >
            New post
          </Button>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-[12px] leading-5 text-zinc-500">
              Posts stay in this tab. Nothing is sent to a server.
            </p>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <TabsPanel value="home" className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">
              Home
            </h1>
            <div className="flex items-center gap-2">
              <Button
                aria-label="Previous post"
                className={buttonClass("ghost", "h-8 px-2 text-[12px]")}
                onClick={previousPost}
              >
                Previous
              </Button>
              <Button
                aria-label="Next post"
                className={buttonClass("ghost", "h-8 px-2 text-[12px]")}
                onClick={nextPost}
              >
                Next
              </Button>
            </div>
          </div>

          <Timeline
            feed
            aria-label="Home feed"
            controller={controller}
            className="space-y-3"
          >
            {posts.map((post) => (
              <TimelineItem key={post.id} value={post.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <TimelineMarker />
                <TimelineConnector />
                <div className="flex gap-3">
                  <Avatar className="size-10 shrink-0">
                    <AvatarImage alt={post.author} src="" />
                    <AvatarFallback>{post.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <TimelineTitle className="text-[15px] font-semibold text-zinc-900">
                        {post.author}
                      </TimelineTitle>
                      <span className="text-[13px] text-zinc-400">@{post.handle}</span>
                      <TimelineTime dateTime={post.time} className="text-[13px] text-zinc-400">
                        · {post.time}
                      </TimelineTime>
                    </div>
                    {quoting[post.id] ? (
                      <div className="mt-3 flex gap-2">
                        <Textarea
                          aria-label={"Your quote of " + post.author}
                          value={quoteTexts[post.id] ?? ""}
                          onValueChange={(value) =>
                            setQuoteTexts((current) => ({
                              ...current,
                              [post.id]: value,
                            }))
                          }
                          rows={2}
                          placeholder="Add your thoughts…"
                          className="min-h-16 flex-1 resize-y rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[14px] leading-6 text-zinc-900 shadow-[0_1px_1px_rgba(16,24,40,0.03)] outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/[0.04]"
                        />
                        <Button
                          data-agent-confirm={
                            "Posts a public quote of " + post.author
                          }
                          className={buttonClass("primary", "h-auto self-end")}
                          onClick={() => {
                            toast("Quote posted", { description: post.author })
                            setQuoting((current) => ({
                              ...current,
                              [post.id]: false,
                            }))
                            setQuoteTexts((current) => ({
                              ...current,
                              [post.id]: "",
                            }))
                          }}
                        >
                          {"Post quote of " + post.author}
                        </Button>
                      </div>
                    ) : null}

                    <TimelineDescription className="mt-1 whitespace-pre-wrap text-[15px] leading-6 text-zinc-800">
                      {post.body}
                    </TimelineDescription>

                    {post.quoted ? (
                      <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="text-[12px] font-semibold text-zinc-700">
                          {post.quoted.author}{" "}
                          <span className="font-normal text-zinc-400">
                            @{post.quoted.handle}
                          </span>
                        </p>
                        <p className="mt-1 text-[13px] leading-5 text-zinc-600">
                          {post.quoted.body}
                        </p>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-1">
                      <Button
                        aria-label={"Reply to " + post.author + "'s post"}
                        className={buttonClass("ghost", "h-8 gap-1.5 px-2 text-[13px] text-zinc-500")}
                        onClick={() =>
                          setReplying((current) => ({
                            ...current,
                            [post.id]: !current[post.id],
                          }))
                        }
                      >
                        <MessageIcon className="size-4" />
                        <span>{post.replies}</span>
                      </Button>

                      <Toggle
                        aria-label={"Repost " + post.author + "'s post"}
                        pressed={post.reposted}
                        onPressedChange={(pressed) => repost(post.id, pressed)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-zinc-500 outline-none transition hover:bg-zinc-100 data-[pressed]:text-emerald-600"
                      >
                        <ToggleIcon>
                          <RepeatIcon className="size-4" />
                        </ToggleIcon>
                        <span aria-hidden="true">{post.reposts}</span>
                      </Toggle>

                      <Toggle
                        aria-label={"Like " + post.author + "'s post"}
                        pressed={post.liked}
                        onPressedChange={(pressed) => like(post.id, pressed)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-zinc-500 outline-none transition hover:bg-zinc-100 data-[pressed]:text-rose-600"
                      >
                        <ToggleIcon>
                          <HeartIcon className="size-4" />
                        </ToggleIcon>
                        <span aria-hidden="true">{post.likes}</span>
                      </Toggle>

                      <Button
                        aria-label={"Quote " + post.author + "'s post"}
                        className={buttonClass("ghost", "h-8 gap-1.5 px-2 text-[13px] text-zinc-500")}
                        onClick={() =>
                          setQuoting((current) => ({
                            ...current,
                            [post.id]: !current[post.id],
                          }))
                        }
                      >
                        <QuoteIcon className="size-4" />
                      </Button>

                      <Button
                        aria-label={"Share " + post.author + "'s post"}
                        className={buttonClass("ghost", "h-8 gap-1.5 px-2 text-[13px] text-zinc-500")}
                        onClick={() => toast("Link copied", { description: "Share link on your clipboard." })}
                      >
                        <ShareIcon className="size-4" />
                      </Button>

                      <Menu>
                        <MenuTrigger
                          aria-label={"Options for " + post.author + "'s post"}
                          className={buttonClass("ghost", "h-8 w-8 justify-center px-0 text-[13px] text-zinc-500")}
                        >
                          <MoreIcon className="size-4" />
                        </MenuTrigger>
                        <MenuContent
                          container={document.body}
                          className="z-50 min-w-[180px] rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_16px_40px_-16px_rgba(16,24,40,0.25)]"
                        >
                          <MenuItem value="copy" onSelect={() => toast("Link copied")}>
                            Copy link to post
                          </MenuItem>
                          <MenuItem
                            value="follow"
                            onSelect={() =>
                              toast("Following @" + post.handle, { description: post.author })
                            }
                          >
                            {"Follow @" + post.handle}
                          </MenuItem>
                          <MenuItem
                            value="mute"
                            onSelect={() =>
                              toast("Muted @" + post.handle, { description: post.author })
                            }
                          >
                            {"Mute @" + post.handle}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem
                            value="report"
                            data-agent-confirm={"Reports " + post.author + "'s post to the moderators"}
                            onSelect={() => toast("Reported", { description: post.author })}
                          >
                            Report post
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    </div>

                    <Collapsible className="mt-3">
                      <CollapsibleTrigger
                        aria-label={"Comments on " + post.author + "'s post"}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-zinc-500 transition hover:bg-zinc-50"
                      >
                        <MessageIcon className="size-4" />
                        <span>
                          {post.comments.length}{" "}
                          {post.comments.length === 1 ? "comment" : "comments"}
                        </span>
                      </CollapsibleTrigger>
                      <CollapsiblePanel className="mt-2 space-y-2 border-t border-zinc-100 pt-3">
                        {post.comments.length === 0 ? (
                          <p className="px-2 text-[13px] text-zinc-400">
                            No comments yet. Be the first.
                          </p>
                        ) : (
                          post.comments.map((comment) => (
                            <div key={comment.id} className="flex gap-2.5 px-2">
                              <Avatar className="size-7 shrink-0">
                                <AvatarFallback>
                                  {comment.author
                                    .split(" ")
                                    .map((part) => part[0])
                                    .join("")
                                    .slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="text-[13px]">
                                  <span className="font-semibold text-zinc-800">
                                    {comment.author}
                                  </span>{" "}
                                  <span className="text-zinc-400">
                                    @{comment.handle} · {comment.time}
                                  </span>
                                </p>
                                <p className="text-[13px] leading-5 text-zinc-600">
                                  {comment.body}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </CollapsiblePanel>
                    </Collapsible>

                    {replying[post.id] ? (
                    <div className="mt-3 flex gap-2">
                      <Textarea
                        aria-label={"Your reply to " + post.author}
                        value={replyTexts[post.id] ?? ""}
                        onValueChange={(value) =>
                          setReplyTexts((current) => ({
                            ...current,
                            [post.id]: value,
                          }))
                        }
                        rows={2}
                        placeholder="Write a reply…"
                        className="min-h-16 flex-1 resize-y rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[14px] leading-6 text-zinc-900 shadow-[0_1px_1px_rgba(16,24,40,0.03)] outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/[0.04]"
                      />
                      <Button
                        data-agent-confirm={
                          "Posts a public reply to " + post.author
                        }
                        className={buttonClass("primary", "h-auto self-end")}
                        onClick={() => {
                          addComment(post.id, replyTexts[post.id] ?? "")
                          setReplyTexts((current) => ({
                            ...current,
                            [post.id]: "",
                          }))
                        }}
                      >
                        {"Post reply to " + post.author}
                      </Button>
                    </div>
                    ) : null}
                  </div>
                </div>
              </TimelineItem>
            ))}
          </Timeline>
        </TabsPanel>

        <TabsPanel value="explore" className="space-y-4">
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">Explore</h1>
          <Input
            aria-label="Search Murmur"
            placeholder="Search Murmur"
            className={inputClass}
          />
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Trending
            </p>
            <ul className="mt-2 space-y-2 text-[14px] text-zinc-700">
              <li>#analytical engines</li>
              <li>#interface design</li>
              <li>#small ships</li>
            </ul>
          </div>
        </TabsPanel>

        <TabsPanel value="notifications" className="space-y-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">
            Notifications
          </h1>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-[14px] text-zinc-600">
            Grace Hopper liked your post.
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-[14px] text-zinc-600">
            Kofi Mensah reposted your post.
          </div>
        </TabsPanel>

        <TabsPanel value="messages" className="space-y-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">Messages</h1>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-[14px] text-zinc-600">
            No messages yet.
          </div>
        </TabsPanel>

        <TabsPanel value="bookmarks" className="space-y-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">
            Bookmarks
          </h1>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-[14px] text-zinc-600">
            Saved posts appear here.
          </div>
        </TabsPanel>

        <TabsPanel value="profile" className="space-y-4">
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">Profile</h1>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-[15px] font-semibold text-zinc-900">You</p>
            <p className="text-[13px] text-zinc-500">@you · 42 followers</p>
          </div>
        </TabsPanel>
      </main>

      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Who to follow
            </p>
            <div className="mt-3 space-y-3">
              {SUGGESTED_PEOPLE.map((person) => (
                <div key={person.handle} className="flex items-center gap-3">
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback>{person.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-zinc-800">
                      {person.name}
                    </p>
                    <p className="truncate text-[12px] text-zinc-400">
                      @{person.handle}
                    </p>
                  </div>
                  <Toggle
                    aria-label={"Follow " + person.name}
                    pressed={!!follows[person.handle]}
                    onPressedChange={(pressed) =>
                      setFollows((current) => ({
                        ...current,
                        [person.handle]: pressed,
                      }))
                    }
                    className="inline-flex h-8 items-center rounded-lg border border-zinc-200 px-3 text-[12px] font-medium text-zinc-700 outline-none transition hover:bg-zinc-50 data-[pressed]:border-zinc-900 data-[pressed]:bg-zinc-900 data-[pressed]:text-white"
                  >
                    <ToggleIcon>
                      <span aria-hidden="true">
                        {follows[person.handle] ? "Following" : "Follow"}
                      </span>
                    </ToggleIcon>
                  </Toggle>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Trends
            </p>
            <ul className="mt-2 space-y-1.5 text-[13px] text-zinc-700">
              <li>#analytical engines</li>
              <li>#interface design</li>
              <li>#small ships</li>
            </ul>
          </div>
        </div>
      </aside>
    </Tabs>
  )
}
