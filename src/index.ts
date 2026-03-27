export interface Env {
  SLACK_SIGNING_SECRET: string
  ASSETS?: Fetcher
}

const SLACK_SIGNATURE_HEADER = 'x-slack-signature'
const SLACK_TIMESTAMP_HEADER = 'x-slack-request-timestamp'
const MAX_AGE_SECONDS = 60 * 5
const ATTACHMENTS_FLAG = '--attachments'
const MESSAGE_TEXT = 'Ludicrous speed, go!'
const SPACEBALLS_GIF_PATHS = ['/ludicrous.gif', '/spaceballs-ludicrous.gif'] as const

interface SlackBlockPayload {
  response_type: 'in_channel'
  text: string
  blocks: Array<{
    type: 'image'
    image_url: string
    alt_text: string
  }>
}

interface SlackAttachmentPayload {
  response_type: 'in_channel'
  text: string
  attachments: Array<{
    fallback: string
    text: string
    image_url: string
  }>
}

type SlackPayload = SlackBlockPayload | SlackAttachmentPayload

function pickRandomSpaceballsGifPath(): (typeof SPACEBALLS_GIF_PATHS)[number] {
  const randomIndex = Math.floor(Math.random() * SPACEBALLS_GIF_PATHS.length)
  return SPACEBALLS_GIF_PATHS[randomIndex]
}

function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body)
  const out: Record<string, string> = {}
  params.forEach((value, key) => {
    out[key] = value
  })
  return out
}

async function verifySlackSignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  secret: string
): Promise<boolean> {
  if (!signature?.startsWith('v0=') || !timestamp) return false
  const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10))
  if (age > MAX_AGE_SECONDS) return false

  const sigBaseString = `v0:${timestamp}:${body}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(sigBaseString)
  )
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const expected = `v0=${hex}`
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

function buildSlackPayload(imageUrl: string, useAttachments: boolean): SlackPayload {
  if (useAttachments) {
    return {
      response_type: 'in_channel',
      text: MESSAGE_TEXT,
      attachments: [
        {
          fallback: MESSAGE_TEXT,
          text: MESSAGE_TEXT,
          image_url: imageUrl,
        },
      ],
    }
  }
  return {
    response_type: 'in_channel',
    text: MESSAGE_TEXT,
    blocks: [
      {
        type: 'image',
        image_url: imageUrl,
        alt_text: 'Ludicrous speed',
      },
    ],
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (request.method === 'GET' && url.pathname === '/ludicrous.gif') {
      if (!env.ASSETS) {
        return new Response('Assets not configured', { status: 503 })
      }
      const assetResponse = await env.ASSETS.fetch(request)
      if (assetResponse.status === 404) return assetResponse
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    if (request.method !== 'POST' || url.pathname !== '/') {
      if (!env.ASSETS) {
        return new Response('Not Found', { status: 404 })
      }
      return env.ASSETS.fetch(request)
    }

    const rawBody = await request.clone().text()
    const signature = request.headers.get(SLACK_SIGNATURE_HEADER)
    const timestamp = request.headers.get(SLACK_TIMESTAMP_HEADER)
    const secret = env.SLACK_SIGNING_SECRET

    if (!secret) {
      return new Response('Server misconfiguration', { status: 500 })
    }

    const valid = await verifySlackSignature(rawBody, signature, timestamp, secret)
    if (!valid) {
      return new Response('Invalid signature', { status: 401 })
    }

    const form = parseFormBody(rawBody)
    const responseUrl = form.response_url
    if (!responseUrl) {
      return new Response('Missing response_url', { status: 400 })
    }
    const commandText = form.text ?? ''
    const useAttachments = commandText.includes(ATTACHMENTS_FLAG)

    const origin = url.origin
    const imageUrl = `${origin}${pickRandomSpaceballsGifPath()}`
    const payload = buildSlackPayload(imageUrl, useAttachments)

    ctx.waitUntil(
      (async () => {
        try {
          const slackResponse = await fetch(responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const responseBody = await slackResponse.text()
          console.log(
            JSON.stringify({
              event: 'slack_response_url_post',
              mode: useAttachments ? 'attachments' : 'blocks',
              status: slackResponse.status,
              ok: slackResponse.ok,
              responseBody: responseBody.slice(0, 300),
            })
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`slack_response_url_post_failed: ${message}`)
        }
      })()
    )

    return new Response()
  },
}
