export type TimelineComment = {
  id: string
  author: string
  handle: string
  body: string
  time: string
  likes: number
}

export type TimelinePost = {
  id: string
  author: string
  handle: string
  initials: string
  time: string
  body: string
  liked: boolean
  likes: number
  reposted: boolean
  reposts: number
  replies: number
  comments: TimelineComment[]
  quoted?: { author: string; handle: string; body: string }
}

export const TIMELINE_POSTS: TimelinePost[] = [
  {
    id: "ada",
    author: "Ada Lovelace",
    handle: "ada",
    initials: "AL",
    time: "2h",
    body:
      "The Analytical Engine has no pretensions whatever to originate anything. " +
      "It can do whatever we know how to order it to perform — which is still quite a lot.",
    liked: false,
    likes: 128,
    reposted: false,
    reposts: 34,
    replies: 12,
    comments: [
      {
        id: "c1",
        author: "Grace Hopper",
        handle: "grace",
        body: "Which is exactly why the ordering matters more than the engine.",
        time: "1h",
        likes: 18,
      },
      {
        id: "c2",
        author: "Kofi Mensah",
        handle: "kofi",
        body: "The first version of this idea is always a sketch. Ship the sketch.",
        time: "45m",
        likes: 7,
      },
    ],
    quoted: {
      author: "Charles Babbage",
      handle: "babbage",
      body: "Errors using inadequate data are much less than those using no data at all.",
    },
  },
  {
    id: "grace",
    author: "Grace Hopper",
    handle: "grace",
    initials: "GH",
    time: "4h",
    body:
      "The most dangerous phrase in the language is, “We've always done it this way.” " +
      "I've made a career out of replacing it.",
    liked: true,
    likes: 412,
    reposted: false,
    reposts: 97,
    replies: 31,
    comments: [
      {
        id: "c3",
        author: "Linus Park",
        handle: "linus",
        body: "Some of the best code I've written was deleting the old way.",
        time: "3h",
        likes: 24,
      },
    ],
  },
  {
    id: "kofi",
    author: "Kofi Mensah",
    handle: "kofi",
    initials: "KM",
    time: "6h",
    body:
      "Shipped a tiny thing today: the feed now remembers where you stopped reading. " +
      "Two lines of state, one less reason to scroll from the top.",
    liked: false,
    likes: 64,
    reposted: true,
    reposts: 11,
    replies: 4,
    comments: [],
  },
  {
    id: "linus",
    author: "Linus Park",
    handle: "linus",
    initials: "LP",
    time: "8h",
    body:
      "Interface design is mostly deciding what not to show. " +
      "The rest is making sure the thing you do show earns its space.",
    liked: false,
    likes: 203,
    reposted: false,
    reposts: 48,
    replies: 9,
    comments: [],
  },
]

export const SUGGESTED_PEOPLE = [
  { name: "Margaret Hamilton", handle: "margaret", initials: "MH" },
  { name: "Alan Turing", handle: "alan", initials: "AT" },
  { name: "Katherine Johnson", handle: "katherine", initials: "KJ" },
]

export const TIMELINE_SECTIONS = [
  { value: "home", label: "Home" },
  { value: "explore", label: "Explore" },
  { value: "notifications", label: "Notifications" },
  { value: "messages", label: "Messages" },
  { value: "bookmarks", label: "Bookmarks" },
  { value: "profile", label: "Profile" },
]

export const POST_AUTHORS = TIMELINE_POSTS.map((post) => post.author)
