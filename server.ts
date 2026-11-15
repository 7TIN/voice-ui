import { extname, isAbsolute, relative, resolve } from "node:path"
import { handleClassifierRequest } from "./src/server/classify.ts"

type BunServer = {
  requestIP(request: Request): { address: string } | null
}

declare const Bun: {
  serve(options: {
    port: number
    fetch(request: Request, server: BunServer): Response | Promise<Response>
  }): { port: number }
  file(path: string): Blob & { exists(): Promise<boolean> }
}

const port = Number(process.env.PORT ?? 3000)
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port")
}

const dist = resolve("dist")
const index = resolve(dist, "index.html")
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
}

const server = Bun.serve({
  port,
  async fetch(request, bunServer) {
    const url = new URL(request.url)
    if (url.pathname === "/api/classify") {
      const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      const clientId = forwardedFor || bunServer.requestIP(request)?.address || "unknown"
      return handleClassifierRequest(request, process.env.GEMINI_API_KEY, clientId)
    }
    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 })
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 })
    }

    let pathname: string
    try {
      pathname = decodeURIComponent(url.pathname)
    } catch {
      return new Response("Bad path", { status: 400 })
    }
    const filePath = resolve(dist, "." + pathname)
    const relativePath = relative(dist, filePath)
    if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith("..\\") || relativePath.startsWith("../")) {
      return new Response("Forbidden", { status: 403 })
    }

    const requestedFile = pathname.endsWith("/") ? resolve(filePath, "index.html") : filePath
    const exists = await Bun.file(requestedFile).exists()
    const isAsset = Boolean(extname(pathname))
    if (!exists && isAsset) return new Response("Not found", { status: 404 })
    const file = Bun.file(exists ? requestedFile : index)
    if (!exists && !(await Bun.file(index).exists())) {
      return new Response("Production build not found. Run `bun run build` first.", { status: 503 })
    }

    const extension = extname(exists ? requestedFile : index).toLowerCase()
    const headers = new Headers({
      "Content-Type": contentTypes[extension] ?? "application/octet-stream",
      "Cache-Control": exists && extension !== ".html"
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    })
    return new Response(request.method === "HEAD" ? null : file, { headers })
  },
})

console.log(`Murmur listening on port ${server.port}`)
