import { sanitizeNoteHtml } from './noteContent'

export type NoteWriteMode = 'replace' | 'append' | 'prepend' | 'insert_section'
export type NoteTargetFormat = 'html' | 'markdown' | 'plain'

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : ''
    })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inlineHtmlToMarkdown(raw: string): string {
  let text = raw
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    const altMatch = tag.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    const src = (srcMatch?.[1] ?? srcMatch?.[2] ?? srcMatch?.[3] ?? '').trim()
    const alt = decodeEntities((altMatch?.[1] ?? altMatch?.[2] ?? altMatch?.[3] ?? '').trim())
    return src ? `![${alt}](${src})` : ''
  })
  text = text.replace(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi, (_, h1, h2, h3, inner) => {
    const href = (h1 ?? h2 ?? h3 ?? '').trim()
    const label = inlineHtmlToMarkdown(inner).trim() || href
    return href ? `[${label}](${href})` : label
  })
  text = text.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) => {
    const content = decodeEntities(inner.replace(/<[^>]+>/g, ''))
    return content ? `\`${content}\`` : ''
  })
  text = text.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const content = inlineHtmlToMarkdown(inner).trim()
    return content ? `**${content}**` : ''
  })
  text = text.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const content = inlineHtmlToMarkdown(inner).trim()
    return content ? `*${content}*` : ''
  })
  text = text.replace(/<(s|strike|del)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const content = inlineHtmlToMarkdown(inner).trim()
    return content ? `~~${content}~~` : ''
  })
  text = text.replace(/<u\b[^>]*>([\s\S]*?)<\/u>/gi, (_, inner) => {
    const content = inlineHtmlToMarkdown(inner).trim()
    return content ? `<u>${content}</u>` : ''
  })
  text = text.replace(/<[^>]+>/g, '')
  return decodeEntities(text)
}

function parseTableToMarkdown(tableHtml: string): string {
  const rowMatches = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
  if (!rowMatches.length) return ''
  const rows: string[][] = []
  for (const rowMatch of rowMatches) {
    const cellMatches = [...rowMatch[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    if (!cellMatches.length) continue
    rows.push(cellMatches.map((cell) => inlineHtmlToMarkdown(cell[2]).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim()))
  }
  if (!rows.length) return ''
  const colCount = Math.max(...rows.map((r) => r.length), 1)
  const normalizeRow = (row: string[]) => Array.from({ length: colCount }, (_, i) => row[i] ?? '')
  const header = normalizeRow(rows[0]!)
  const divider = Array.from({ length: colCount }, () => '---')
  const body = rows.slice(1).map((r) => `| ${normalizeRow(r).join(' | ')} |`)
  return [`| ${header.join(' | ')} |`, `| ${divider.join(' | ')} |`, ...body].join('\n')
}

function parseListToMarkdown(listHtml: string, ordered: boolean): string {
  const items = [...listHtml.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)]
  if (!items.length) return ''
  return items
    .map((match, idx) => {
      const attrs = match[1] || ''
      const inner = match[2] || ''
      const isTask = /data-type\s*=\s*["']?taskItem["']?/i.test(attrs) || /<input\b[^>]*type\s*=\s*["']?checkbox["']?/i.test(inner)
      const isChecked =
        /data-checked\s*=\s*["']?true["']?/i.test(attrs) ||
        /<input\b[^>]*checked[^>]*>/i.test(inner)
      const cleanedInner = inner.replace(/<label\b[^>]*>[\s\S]*?<\/label>/gi, (lbl) => {
        const spanMatch = lbl.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)
        return spanMatch ? spanMatch[1] : ''
      })
      const text = inlineHtmlToMarkdown(cleanedInner).replace(/\s*\n+\s*/g, ' ').trim()
      if (isTask) return `- [${isChecked ? 'x' : ' '}] ${text}`
      return ordered ? `${idx + 1}. ${text}` : `- ${text}`
    })
    .join('\n')
}

export function looksLikeHtml(value: string): boolean {
  return /<\/?(?:p|div|h[1-6]|ul|ol|li|blockquote|pre|code|table|tr|td|th|strong|b|em|i|u|s|strike|del|a|img|hr|br)\b[^>]*>/i.test(value)
}

/**
 * Converts Tiptap HTML or mixed note text into clean, token-efficient Structured Markdown for LLM context & editing.
 */
export function htmlToStructuredMarkdown(input: string | null | undefined): string {
  const raw = String(input ?? '').trim()
  if (!raw) return ''
  if (!looksLikeHtml(raw)) {
    return raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  let working = raw
    .replace(/\r\n/g, '\n')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')

  // Code blocks first
  working = working.replace(/<pre\b[^>]*>\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, attrs, code) => {
    const langMatch = String(attrs || '').match(/language-([a-z0-9_+-]+)/i)
    const lang = langMatch?.[1] || ''
    const content = decodeEntities(String(code || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\n+$/, '')
    return `\n\n\`\`\`${lang}\n${content}\n\`\`\`\n\n`
  })
  working = working.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    const content = decodeEntities(String(code || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\n+$/, '')
    return `\n\n\`\`\`\n${content}\n\`\`\`\n\n`
  })

  // Tables
  working = working.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => {
    const md = parseTableToMarkdown(inner)
    return md ? `\n\n${md}\n\n` : '\n\n'
  })

  // Lists (task lists, ul, ol)
  working = working.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    const md = parseListToMarkdown(inner, false)
    return md ? `\n\n${md}\n\n` : '\n\n'
  })
  working = working.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    const md = parseListToMarkdown(inner, true)
    return md ? `\n\n${md}\n\n` : '\n\n'
  })

  // Blockquotes
  working = working.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const content = htmlToStructuredMarkdown(inner)
    if (!content) return '\n\n'
    const quoted = content
      .split('\n')
      .map((line) => (line.trim() ? `> ${line}` : '>'))
      .join('\n')
    return `\n\n${quoted}\n\n`
  })

  // Headings
  working = working.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, inner) => {
    const hashes = '#'.repeat(Math.min(Math.max(Number(level) || 1, 1), 6))
    const text = inlineHtmlToMarkdown(inner).replace(/\s*\n+\s*/g, ' ').trim()
    return text ? `\n\n${hashes} ${text}\n\n` : '\n\n'
  })

  // Horizontal rule
  working = working.replace(/<hr\b[^>]*\/?>/gi, '\n\n---\n\n')

  // Paragraphs and divs
  working = working.replace(/<(p|div)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const text = inlineHtmlToMarkdown(inner).trim()
    return text ? `\n\n${text}\n\n` : '\n\n'
  })

  // Remaining inline HTML
  working = inlineHtmlToMarkdown(working)

  return working
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function renderInlineMarkdownToHtml(text: string): string {
  const codeSpans: string[] = []
  let working = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const token = `\u0000CODE${codeSpans.length}\u0000`
    codeSpans.push(`<code>${escapeHtml(code)}</code>`)
    return token
  })

  // Preserve safe <u>...</u> if present before escaping
  const underlineSpans: string[] = []
  working = working.replace(/<u>([\s\S]*?)<\/u>/gi, (_, inner) => {
    const token = `\u0000UNDERLINE${underlineSpans.length}\u0000`
    underlineSpans.push(`<u>${escapeHtml(inner)}</u>`)
    return token
  })

  working = escapeHtml(working)

  // Images: ![alt](src)
  working = working.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+|note:\/\/image\/[^\s)]+|data:image\/(?:png|jpeg|webp);base64,[^\s)]+)\)/gi, (_, alt, src) => {
    return `<img src="${src}" alt="${alt}">`
  })

  // Links: [label](href)
  working = working.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/gi, (_, label, href) => {
    return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`
  })

  // Bold, italic, strikethrough
  working = working.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  working = working.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  working = working.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  working = working.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')

  working = working.replace(/\u0000UNDERLINE(\d+)\u0000/g, (_, idx) => underlineSpans[Number(idx)] || '')
  working = working.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => codeSpans[Number(idx)] || '')
  return working
}

/**
 * Converts AI-generated Structured Markdown into sanitized Tiptap-compatible HTML.
 */
export function structuredMarkdownToSafeHtml(input: string | null | undefined): string {
  const raw = String(input ?? '').trim()
  if (!raw) return ''
  // If input is already pure HTML without markdown markers, sanitize directly
  if (looksLikeHtml(raw) && !/^(?:#{1,6}\s|[-*]\s|\d+\.\s|>\s|```|\|.+\|)/m.test(raw)) {
    return sanitizeNoteHtml(raw)
  }

  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const blocks: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!
    const trimmed = line.trim()

    if (!trimmed) {
      i++
      continue
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) {
        codeLines.push(lines[i]!)
        i++
      }
      if (i < lines.length) i++
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }

    // Horizontal rule
    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      blocks.push('<hr>')
      i++
      continue
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = Math.min(Math.max(headingMatch[1]!.length, 1), 3)
      blocks.push(`<h${level}>${renderInlineMarkdownToHtml(headingMatch[2]!.trim())}</h${level}>`)
      i++
      continue
    }

    // Table
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length && /^\|\s*[-:]+/.test(lines[i + 1]!.trim())) {
      const parseCells = (rowLine: string) =>
        rowLine
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim())
      const headerCells = parseCells(trimmed)
      i += 2 // skip header and separator
      const bodyRows: string[][] = []
      while (i < lines.length && lines[i]!.trim().startsWith('|') && lines[i]!.trim().endsWith('|')) {
        bodyRows.push(parseCells(lines[i]!))
        i++
      }
      const thHtml = `<tr>${headerCells.map((c) => `<th><p>${renderInlineMarkdownToHtml(c)}</p></th>`).join('')}</tr>`
      const tbHtml = bodyRows
        .map((r) => `<tr>${headerCells.map((_, idx) => `<td><p>${renderInlineMarkdownToHtml(r[idx] ?? '')}</p></td>`).join('')}</tr>`)
        .join('')
      blocks.push(`<table><tbody>${thHtml}${tbHtml}</tbody></table>`)
      continue
    }

    // Task list (- [ ] or - [x])
    if (/^[-*]\s+\[([ xX])\]\s+/.test(trimmed)) {
      const taskItems: string[] = []
      while (i < lines.length) {
        const m = lines[i]!.trim().match(/^[-*]\s+\[([ xX])\]\s+(.*)$/)
        if (!m) break
        const checked = m[1]!.toLowerCase() === 'x'
        const content = renderInlineMarkdownToHtml(m[2]!.trim())
        taskItems.push(
          `<li data-type="taskItem" data-checked="${checked ? 'true' : 'false'}"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}><span></span></label><div><p>${content}</p></div></li>`
        )
        i++
      }
      blocks.push(`<ul data-type="taskList">${taskItems.join('')}</ul>`)
      continue
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const ulItems: string[] = []
      while (i < lines.length) {
        const m = lines[i]!.trim().match(/^[-*+]\s+(.*)$/)
        if (!m || /^\[([ xX])\]\s+/.test(m[1]!)) break
        ulItems.push(`<li><p>${renderInlineMarkdownToHtml(m[1]!.trim())}</p></li>`)
        i++
      }
      blocks.push(`<ul>${ulItems.join('')}</ul>`)
      continue
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const olItems: string[] = []
      while (i < lines.length) {
        const m = lines[i]!.trim().match(/^\d+\.\s+(.*)$/)
        if (!m) break
        olItems.push(`<li><p>${renderInlineMarkdownToHtml(m[1]!.trim())}</p></li>`)
        i++
      }
      blocks.push(`<ol>${olItems.join('')}</ol>`)
      continue
    }

    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i]!.trim())) {
        quoteLines.push(lines[i]!.trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push(`<blockquote><p>${quoteLines.map((l) => renderInlineMarkdownToHtml(l)).join('<br>')}</p></blockquote>`)
      continue
    }

    // Paragraph (collect consecutive non-special lines)
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !/^(?:```|#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|---|\*\*\*|___|\|.+\|)/.test(lines[i]!.trim())
    ) {
      paraLines.push(renderInlineMarkdownToHtml(lines[i]!.trim()))
      i++
    }
    if (paraLines.length) {
      blocks.push(`<p>${paraLines.join('<br>')}</p>`)
    } else {
      blocks.push(`<p>${renderInlineMarkdownToHtml(trimmed)}</p>`)
      i++
    }
  }

  return sanitizeNoteHtml(blocks.join(''))
}

/**
 * Produces a single-line or compact plain-text preview for cards, lists, and search results,
 * stripping both HTML tags and Markdown syntax cleanly.
 */
export function notePlainTextPreview(input: string | null | undefined, maxLength = 180): string {
  const md = htmlToStructuredMarkdown(input)
  if (!md) return ''
  const plain = md
    .replace(/```[a-z0-9_+-]*\n([\s\S]*?)```/gi, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, (_, alt) => (alt ? `[Görsel: ${alt}]` : '[Görsel]'))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+\[([ xX])\]\s+/gm, (_, c) => (String(c).toLowerCase() === 'x' ? '☑ ' : '☐ '))
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<\/?u>/gi, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (maxLength > 0 && plain.length > maxLength) {
    return `${plain.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
  }
  return plain
}

export function isNoteEmpty(input: string | null | undefined): boolean {
  const raw = String(input ?? '').trim()
  if (!raw) return true
  if (/<img\b/i.test(raw) || /!\[[^\]]*\]\([^)]+\)/.test(raw)) return false
  return notePlainTextPreview(raw, 0).length === 0
}

export function ensureRichNoteHtml(input: string | null | undefined): string {
  const raw = String(input ?? '').trim()
  if (!raw) return ''
  if (looksLikeHtml(raw)) return sanitizeNoteHtml(raw)
  return structuredMarkdownToSafeHtml(raw)
}

/**
 * Applies replace / append / prepend / insert_section write mode to a note field
 * and returns the normalized string in the target format ('html' | 'markdown' | 'plain').
 */
export function applyNoteWriteMode(
  existing: string | null | undefined,
  incoming: string | null | undefined,
  mode: NoteWriteMode = 'replace',
  targetFormat: NoteTargetFormat = 'html',
  sectionTitle?: string
): string {
  const currentMd = htmlToStructuredMarkdown(existing)
  const nextMd = htmlToStructuredMarkdown(incoming)

  let mergedMd = nextMd
  if (mode === 'append') {
    mergedMd = currentMd && nextMd ? `${currentMd}\n\n${nextMd}` : currentMd || nextMd
  } else if (mode === 'prepend') {
    mergedMd = currentMd && nextMd ? `${nextMd}\n\n${currentMd}` : nextMd || currentMd
  } else if (mode === 'insert_section') {
    const heading = sectionTitle?.trim() ? `## ${sectionTitle.trim()}\n\n${nextMd}` : nextMd
    mergedMd = currentMd ? `${currentMd}\n\n${heading}` : heading
  }

  if (targetFormat === 'html') return structuredMarkdownToSafeHtml(mergedMd)
  if (targetFormat === 'plain') return notePlainTextPreview(mergedMd, 0)
  return mergedMd
}
