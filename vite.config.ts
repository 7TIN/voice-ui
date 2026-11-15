import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { handleClassifierRequest } from './src/server/classify.ts'

function classifierApi(): Plugin {
  return {
    name: 'murmur-classifier-api',
    configureServer(server) {
      const apiKey = loadEnv(server.config.mode, server.config.root, '').GEMINI_API_KEY
      server.middlewares.use('/api/classify', (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        const chunks: Buffer[] = []
        let bytes = 0
        let tooLarge = false
        request.on('data', (chunk: Buffer) => {
          bytes += chunk.byteLength
          if (bytes > 32_000) {
            tooLarge = true
            chunks.length = 0
          } else if (!tooLarge) {
            chunks.push(chunk)
          }
        })
        request.on('end', async () => {
          if (tooLarge) {
            response.statusCode = 413
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: 'Request too large' }))
            return
          }

          try {
            const headers = new Headers({
              'Content-Type': String(request.headers['content-type'] ?? ''),
            })
            const origin = request.headers.origin
            if (typeof origin === 'string') headers.set('Origin', origin)
            const host = request.headers.host ?? 'localhost'
            const apiRequest = new Request(`http://${host}/api/classify`, {
              method: 'POST',
              headers,
              body: new Uint8Array(Buffer.concat(chunks)),
            })
            const result = await handleClassifierRequest(
              apiRequest,
              apiKey,
              request.socket.remoteAddress ?? 'dev',
            )
            response.statusCode = result.status
            result.headers.forEach((value, name) => response.setHeader(name, value))
            response.end(await result.text())
          } catch {
            response.statusCode = 500
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: 'Classifier request failed' }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), classifierApi()],
})
