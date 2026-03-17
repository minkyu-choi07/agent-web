import { NextRequest } from 'next/server'

/**
 * SSE proxy — streams POST /agents/{id}/chat from the backend
 * through the Next.js server so the browser never needs direct
 * access to the backend host.
 */
export async function POST(req: NextRequest) {
  const { host, agentId, message } = await req.json()

  if (!host || !agentId) {
    return new Response(
      JSON.stringify({ error: 'Missing host or agentId' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const url = `${host.replace(/\/+$/, '')}/agents/${agentId}/chat`

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })

    if (!upstream.ok) {
      const text = await upstream.text()
      return new Response(
        JSON.stringify({ error: `Backend ${upstream.status}: ${text}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Pipe the SSE stream through
    return new Response(upstream.body, {
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
