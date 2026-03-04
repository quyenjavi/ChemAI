import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'logo', 'chemAI.png')
    const buf = await readFile(filePath)
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable'
      }
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
