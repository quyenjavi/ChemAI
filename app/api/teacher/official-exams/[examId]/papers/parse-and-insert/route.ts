import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'
import zlib from 'node:zlib'

export const maxDuration = 300

function decodeXmlEntities(s: string) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16)
      if (!isFinite(code)) return ''
      return String.fromCodePoint(code)
    })
    .replace(/&#([0-9]+);/g, (_, dec) => {
      const code = parseInt(dec, 10)
      if (!isFinite(code)) return ''
      return String.fromCodePoint(code)
    })
}

function findZipEntry(buf: Buffer, filename: string) {
  const EOCD_SIG = 0x06054b50
  let eocdOffset = -1
  const minOffset = Math.max(0, buf.length - 65557)
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) return null

  const centralDirSize = buf.readUInt32LE(eocdOffset + 12)
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16)
  let p = centralDirOffset

  const CEN_SIG = 0x02014b50
  const LOC_SIG = 0x04034b50

  while (p < centralDirOffset + centralDirSize) {
    if (buf.readUInt32LE(p) !== CEN_SIG) break
    const compression = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const fileNameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localHeaderOffset = buf.readUInt32LE(p + 42)
    const nameStart = p + 46
    const name = buf.slice(nameStart, nameStart + fileNameLen).toString('utf8')
    p = nameStart + fileNameLen + extraLen + commentLen

    if (name !== filename) continue

    if (buf.readUInt32LE(localHeaderOffset) !== LOC_SIG) return null
    const locFileNameLen = buf.readUInt16LE(localHeaderOffset + 26)
    const locExtraLen = buf.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + locFileNameLen + locExtraLen
    const compressed = buf.slice(dataStart, dataStart + compressedSize)

    if (compression === 0) return compressed
    if (compression === 8) return zlib.inflateRawSync(compressed)
    return null
  }
  return null
}

function extractDocxPlainText(docxBytes: Uint8Array) {
  const buf = Buffer.from(docxBytes)
  const xmlBuf = findZipEntry(buf, 'word/document.xml')
  if (!xmlBuf) return ''
  const xml = xmlBuf.toString('utf8')

  const paras = xml.match(/<w:p[\s\S]*?<\/w:p>/g) || []
  const lines: string[] = []
  for (const p of paras) {
    const runs = Array.from(p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => decodeXmlEntities(m[1] || ''))
    const line = runs.join('')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim()
    if (line) lines.push(line)
  }
  return lines.join('\n')
}

function stripHeaderLines(text: string) {
  const lines = String(text || '').split(/\r?\n/)
  const filtered = lines.filter(l => {
    const s = l.trim()
    if (!s) return false
    if (/^họ\s+và\s+tên\b/i.test(s)) return false
    if (/^số\s+báo\s+danh\b/i.test(s)) return false
    if (/^mã\s+đề\b/i.test(s)) return false
    return true
  })
  return filtered.join('\n')
}

type ParsedQuestion = {
  question_no: number
  content: string
  options: Record<'A' | 'B' | 'C' | 'D', string>
}

function parseQuestionsFromText(text: string): ParsedQuestion[] {
  const cleaned = stripHeaderLines(text)
  const re = /^\s*Câu\s+(\d{1,3})\s*[\.:]\s*/gmi
  const starts: Array<{ idx: number, no: number, prefixLen: number }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned)) !== null) {
    const no = parseInt(m[1], 10)
    if (!no) continue
    starts.push({ idx: m.index, no, prefixLen: m[0].length })
  }
  if (!starts.length) return []

  const blocks: Array<{ no: number, body: string }> = []
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1].idx : cleaned.length
    const raw = cleaned.slice(s.idx + s.prefixLen, end).trim()
    blocks.push({ no: s.no, body: raw })
  }

  const out: ParsedQuestion[] = []
  const optRe = /^\s*([A-D])\.\s*/gm
  for (const b of blocks) {
    const blockText = b.body.replace(/\n{3,}/g, '\n\n').trim()
    const matches = Array.from(blockText.matchAll(optRe))
    if (!matches.length) {
      out.push({
        question_no: b.no,
        content: blockText,
        options: { A: '', B: '', C: '', D: '' },
      })
      continue
    }

    const first = matches[0]
    const stem = blockText.slice(0, first.index || 0).trim()
    const options: any = { A: '', B: '', C: '', D: '' }
    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i]
      const key = String(cur[1] || '').toUpperCase()
      const start = (cur.index || 0) + cur[0].length
      const end = i + 1 < matches.length ? (matches[i + 1].index || blockText.length) : blockText.length
      const val = blockText.slice(start, end).trim()
      if (key && options[key] != null) options[key] = val
    }

    out.push({
      question_no: b.no,
      content: stem || blockText,
      options,
    })
  }

  return out
}

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const paper_id = String(body.paper_id || '').trim()
    if (!paper_id) return NextResponse.json({ error: 'paper_id is required' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam,school_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exam } = await svc.from('official_exams').select('id,school_id').eq('id', params.examId).maybeSingle()
    if (!exam || exam.school_id !== teacher.school_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const nowIso = new Date().toISOString()
    const { data: paper } = await svc
      .from('official_exam_papers')
      .select('id,official_exam_id,paper_code,process_status,total_questions,metadata')
      .eq('id', paper_id)
      .eq('official_exam_id', params.examId)
      .maybeSingle()
    if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

    const meta = (paper as any).metadata || {}
    const storage_bucket = String(meta.storage_bucket || '').trim()
    const storage_path = String(meta.storage_path || '').trim()
    if (!storage_bucket || storage_bucket !== 'chemai-official-exams') {
      return NextResponse.json({ error: 'Invalid storage metadata bucket' }, { status: 400 })
    }
    if (!storage_path || !storage_path.startsWith(`official_exams/${params.examId}/papers/`)) {
      return NextResponse.json({ error: 'Invalid storage metadata path' }, { status: 400 })
    }

    await svc
      .from('official_exam_papers')
      .update({ process_status: 'verifying', updated_at: nowIso } as any)
      .eq('id', paper_id)
      .eq('official_exam_id', params.examId)

    await svc
      .from('official_exam_processing_logs')
      .insert({
        official_exam_id: params.examId,
        paper_id,
        status: 'paper_verifying',
        message: `Verifying paper ${(paper as any).paper_code || ''}`,
        created_at: nowIso,
      } as any)

    const download = await svc.storage.from(storage_bucket).download(storage_path)
    if (download.error) {
      await svc
        .from('official_exam_papers')
        .update({ process_status: 'failed', verification_note: download.error.message, updated_at: new Date().toISOString() } as any)
        .eq('id', paper_id)
        .eq('official_exam_id', params.examId)
      return NextResponse.json({ error: download.error.message }, { status: 500 })
    }

    const bytes = new Uint8Array(await download.data.arrayBuffer())
    const mime = String(meta.mime_type || '').toLowerCase()
    const isDocx = mime.includes('officedocument.wordprocessingml.document') || storage_path.toLowerCase().endsWith('.docx')
    const isPdf = mime.includes('pdf') || storage_path.toLowerCase().endsWith('.pdf')

    if (isPdf) {
      const msg = 'PDF chưa hỗ trợ phân tích theo rule-based parser. Hãy upload DOCX.'
      await svc
        .from('official_exam_papers')
        .update({ process_status: 'failed', verification_note: msg, updated_at: new Date().toISOString() } as any)
        .eq('id', paper_id)
        .eq('official_exam_id', params.examId)
      await svc
        .from('official_exam_processing_logs')
        .insert({ official_exam_id: params.examId, paper_id, status: 'paper_failed', message: msg, created_at: new Date().toISOString() } as any)
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const rawText = isDocx ? extractDocxPlainText(bytes) : new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    const questions = parseQuestionsFromText(rawText)
    const parsedTotal = questions.length
    if (!parsedTotal) {
      const msg = 'Phân tích thất bại: không tìm thấy block câu hỏi theo định dạng "Câu n."'
      await svc
        .from('official_exam_papers')
        .update({ process_status: 'failed', verification_note: msg, updated_at: new Date().toISOString() } as any)
        .eq('id', paper_id)
        .eq('official_exam_id', params.examId)
      await svc
        .from('official_exam_processing_logs')
        .insert({ official_exam_id: params.examId, paper_id, status: 'paper_failed', message: msg, created_at: new Date().toISOString() } as any)
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const nextMeta = {
      ...meta,
      analysis: {
        total_questions: parsedTotal,
        questions: questions.slice(0, 200),
        analyzed_at: new Date().toISOString(),
      },
    }

    const { data: updated, error: updErr } = await svc
      .from('official_exam_papers')
      .update({
        process_status: 'verified',
        verification_note: null,
        total_questions: parsedTotal,
        metadata: nextMeta,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', paper_id)
      .eq('official_exam_id', params.examId)
      .select('*')
      .single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    await svc
      .from('official_exam_processing_logs')
      .insert({
        official_exam_id: params.examId,
        paper_id,
        status: 'paper_verified',
        message: `Verified paper ${(paper as any).paper_code || ''} (total_questions=${parsedTotal})`,
        created_at: new Date().toISOString(),
      } as any)

    return NextResponse.json({ paper: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
