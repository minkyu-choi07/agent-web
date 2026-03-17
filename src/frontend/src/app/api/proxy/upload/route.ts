import { NextRequest } from 'next/server'

/**
 * Multipart file upload + SSE proxy.
 * Accepts FormData with: host, agentId, message?, file
 * Forwards to backend POST /agents/{agentId}/chat/upload as multipart
 * Streams the SSE response back.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const host = formData.get('host') as string
  const agentId = formData.get('agentId') as string
  const message = (formData.get('message') as string) || ''
  const file = formData.get('file') as File | null

  if (!host || !agentId || !file) {
    return new Response(
      JSON.stringify({ error: 'Missing host, agentId, or file' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const url = `${host.replace(/\/+$/, '')}/agents/${agentId}/chat/upload`

  // Convert browser File to a Blob the Node fetch can send
  const bytes = await file.arrayBuffer()
  const blob = new Blob([bytes], { type: file.type || 'application/octet-stream' })

  const upstream = new FormData()
  upstream.append('file', blob, file.name)
  upstream.append('message', message)

  console.log(`[proxy/upload] POST ${url} file=${file.name} (${bytes.byteLength} bytes)`)

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: upstream,
    })

    if (!res.ok) {
      const text = await res.text()
      return new Response(
        JSON.stringify({ error: `Backend ${res.status}: ${text}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Stream SSE through
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch {
    return new Response(
      JSON.stringify({ error: 'Backend unreachable' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
