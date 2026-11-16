const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function loadTs(filePath, deps = {}) {
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports = {}
  const module = { exports }
  vm.runInNewContext(transpiled, {
    exports,
    module,
    require: (name) => {
      if (deps[name]) return deps[name]
      return require(name)
    },
    console,
  })
  return module.exports
}

const { JSDOM } = require('jsdom')
const dom = new JSDOM('')
const purifier = require('dompurify')(dom.window)

const noteContent = loadTs('src/lib/noteContent.ts', {
  dompurify: { default: purifier },
})
const aiNoteFormat = loadTs('src/lib/aiNoteFormat.ts', {
  './noteContent': noteContent,
})

test('htmlToStructuredMarkdown converts Tiptap HTML headings, lists, task items, tables, and code blocks cleanly', () => {
  const html = [
    '<h1>Haftalık Plan</h1>',
    '<p>Bu hafta <strong>yapay zeka</strong> ve <em>veritabanı</em> entegrasyonu tamamlanacak.</p>',
    '<ul data-type="taskList">',
    '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Analiz dokümanı</p></div></li>',
    '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>SQL RPC katmanı</p></div></li>',
    '</ul>',
    '<table><tbody><tr><th><p>Modül</p></th><th><p>Durum</p></th></tr><tr><td><p>Notlar</p></td><td><p>Hazır</p></td></tr></tbody></table>',
    '<pre><code class="language-sql">SELECT * FROM plans;</code></pre>',
  ].join('')

  const md = aiNoteFormat.htmlToStructuredMarkdown(html)
  assert.match(md, /^# Haftalık Plan/m)
  assert.match(md, /\*\*yapay zeka\*\*/)
  assert.match(md, /\*veritabanı\*/)
  assert.match(md, /- \[x\] Analiz dokümanı/)
  assert.match(md, /- \[ \] SQL RPC katmanı/)
  assert.match(md, /\| Modül \| Durum \|/)
  assert.match(md, /```sql\nSELECT \* FROM plans;\n```/)
})

test('structuredMarkdownToSafeHtml converts AI Markdown back into sanitized Tiptap HTML', () => {
  const md = [
    '## Toplantı Özeti',
    '',
    'Önemli maddeler ve **aksiyonlar**:',
    '',
    '- [x] Tasarım onayı alındı',
    '- [ ] Test senaryoları yazılacak',
    '',
    '| Görev | Sorumlu |',
    '| --- | --- |',
    '| Backend | Ekip A |',
    '',
    '> Kritik not: MFA kontrolü zorunludur.',
  ].join('\n')

  const html = aiNoteFormat.structuredMarkdownToSafeHtml(md)
  assert.match(html, /<h2>Toplantı Özeti<\/h2>/)
  assert.match(html, /<strong>aksiyonlar<\/strong>/)
  assert.match(html, /<ul data-type="taskList">/)
  assert.match(html, /data-checked="true"/)
  assert.match(html, /data-checked="false"/)
  assert.match(html, /<table><tbody><tr><th><p>Görev<\/p><\/th><th><p>Sorumlu<\/p><\/th><\/tr>/)
  assert.match(html, /<blockquote><p>Kritik not: MFA kontrolü zorunludur\.<\/p><\/blockquote>/)
  assert.ok(!html.includes('<script'))
})

test('notePlainTextPreview and applyNoteWriteMode support replace, append, prepend, and insert_section across formats', () => {
  const existingHtml = '<p>Mevcut içerik satırı.</p>'
  const appendedHtml = aiNoteFormat.applyNoteWriteMode(existingHtml, '- Yeni madde 1\n- Yeni madde 2', 'append', 'html')
  assert.match(appendedHtml, /<p>Mevcut içerik satırı\.<\/p>/)
  assert.match(appendedHtml, /<ul><li><p>Yeni madde 1<\/p><\/li><li><p>Yeni madde 2<\/p><\/li><\/ul>/)

  const sectionMd = aiNoteFormat.applyNoteWriteMode('İlk not', 'Bölüm detayı', 'insert_section', 'markdown', 'AI Önerileri')
  assert.equal(sectionMd, 'İlk not\n\n## AI Önerileri\n\nBölüm detayı')

  const preview = aiNoteFormat.notePlainTextPreview('<h2>Başlık</h2><p>Detaylı <strong>açıklama</strong> metni.</p>', 50)
  assert.equal(preview, 'Başlık Detaylı açıklama metni.')
  assert.equal(aiNoteFormat.isNoteEmpty('<p>   </p>'), true)
  assert.equal(aiNoteFormat.isNoteEmpty('<p><img src="https://example.com/a.png"></p>'), false)
})
