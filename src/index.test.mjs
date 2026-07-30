import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildSlackPayload, parseFormBody, verifySlackSignature } from './index.ts'

test('parses URL-encoded form bodies', () => {
  assert.deepEqual(parseFormBody('text=go+fast&response_url=https%3A%2F%2Fexample.com'), {
    text: 'text',
    response_url: 'response_url',
  })
})

test('builds both supported response formats', () => {
  const blocks = buildSlackPayload('https://example.com/ludicrous.gif', false)
  assert.equal(blocks.response_type, 'in_channel')
  assert.equal(blocks.blocks[0].image_url, 'https://example.com/ludicrous.gif')

  const attachments = buildSlackPayload('https://example.com/ludicrous.gif', true)
  assert.equal(attachments.response_type, 'in_channel')
  assert.equal(attachments.attachments[0].image_url, 'https://example.com/ludicrous.gif')
})

test('accepts a current valid Slack signature and rejects a modified one', async () => {
  const body = 'text=ludicrous&response_url=https%3A%2F%2Fexample.com'
  const secret = 'fixture-secret'
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`v0:${timestamp}:${body}`)
  )
  const signature = `v0=${Array.from(new Uint8Array(signatureBytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`

  assert.equal(await verifySlackSignature(body, signature, timestamp, secret), true)
  assert.equal(await verifySlackSignature(`${body}x`, signature, timestamp, secret), false)
})
