import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side proxy for backend requests.
 * The browser sends { host, path, method, body } and this route
 * makes the actual request from the Next.js server — so it works
 * both in port-forwarded dev and in production.
 */
export async function POST(req: NextRequest) {
  const {
    host,
    path,
    method = 'GET',
    body,
    headers: extraHeaders,
  } = await req.json()

  if (!host || typeof host !== 'string') {
    return NextResponse.json(
      { error: 'Missing host' },
      { status: 400 },
    )
  }

  const url = `${host.replace(/\/+$/, '')}${path}`

  try {
    const fetchHeaders: Record<string, string> = {
      ...(extraHeaders || {}),
    }
    if (body) {
      fetchHeaders['Content-Type'] = 'application/json'
    }

    const res = await fetch(url, {
      method,
      headers:
        Object.keys(fetchHeaders).length > 0
          ? fetchHeaders
          : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    })

    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `Server responded ${res.status}`, data },
        { status: 502 },
      )
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'Server unreachable' },
      { status: 502 },
    )
  }
}
