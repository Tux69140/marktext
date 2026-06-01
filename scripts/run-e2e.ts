#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = path.resolve(__dirname, '..')
const desktopRoot = path.join(repoRoot, 'packages', 'desktop')
const localE2eRoot = path.join(desktopRoot, 'test', 'e2e', '.local')

const shouldIncludeLocalSpecs = process.env.MARKTEXT_SKIP_LOCAL_E2E !== '1'

const isE2eSpecFile = (filename: string): boolean => {
  return /\.(spec|test)\.(ts|tsx|js|mjs|cjs)$/.test(filename)
}

const collectSpecFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return []

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSpecFiles(fullPath))
      continue
    }

    if (entry.isFile() && isE2eSpecFile(entry.name)) {
      files.push(fullPath)
    }
  }

  return files
}

const toRelativePosixPath = (filePath: string): string => {
  return path.relative(desktopRoot, filePath).split(path.sep).join('/')
}

const localSpecs = shouldIncludeLocalSpecs
  ? collectSpecFiles(localE2eRoot).map(toRelativePosixPath)
  : []

if (localSpecs.length > 0) {
  console.log(`Including ${localSpecs.length} local e2e spec(s) from .local/`)
}

const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const args = ['exec', 'playwright', 'test', 'test/e2e', ...localSpecs, ...process.argv.slice(2)]

const result = spawnSync(pnpmBin, args, {
  cwd: desktopRoot,
  env: process.env,
  stdio: 'inherit'
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
