import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'

export function localOnlyFiles(paths) {
  return paths.filter(file => {
    const parts = file.replaceAll('\\', '/').split('/'), name = parts.at(-1)
    if (parts.some(part => /^(tmp|temp|docs|documentation|reports|research|node_modules|dist|coverage|playwright-report|test-results|__pycache__|\.venv|\.vault-preview)$/i.test(part) || /\.local$/i.test(part))) return true
    if (/^(LICENSE|NOTICE|COPYING)(\.[^.]+)?$/i.test(name)) return false
    if (/\.mdx?$/i.test(name)) return true
    if (/^\.env(?:\.|$)/.test(name) && !/^\.env(?:\.[^.]+)*\.example$/.test(name)) return true
    return /\.(dpapi|tsbuildinfo|pyc|pyo|log)$/i.test(name)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const files = execFileSync('git', ['ls-files', '--cached', '-z'], {encoding:'utf8', maxBuffer:8_000_000}).split('\0').filter(Boolean)
    const rejected = localOnlyFiles(files)
    if (rejected.length) {
      console.error('Local-only files are tracked. Keep them on disk and remove them from the Git index:\n' + rejected.join('\n'))
      process.exitCode = 1
    } else console.log('Repository file policy passed; required license and attribution files are allowed.')
  } catch {
    console.error('Repository file policy could not inspect the Git index.')
    process.exitCode = 1
  }
}
