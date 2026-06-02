#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Cross-platform postinstall: patch native-keymap for C++20, download Electron,
 * rebuild all native modules for Electron's ABI, generate locale files.
 *
 * native-keymap is listed as optionalDependency so pnpm ignores its auto-gyp
 * compile failure on Node v24+. This script restores the source, patches and
 * rebuilds it correctly via @electron/rebuild.
 *
 * Step order matters: native-keymap source must be restored before downloading
 * Electron, because the inner `pnpm add` can disturb devDependency state.
 *
 * Monorepo layout: the Electron desktop app lives in packages/desktop with
 * its own node_modules (workspace-local deps are not hoisted to the root —
 * `shamefully-hoist=true` only flattens transitive deps). All Electron-related
 * lookups (binary, install.js, native-keymap, electron-rebuild, patch-package)
 * therefore resolve under packages/desktop/node_modules. patch-package and
 * electron-rebuild also run with cwd=packages/desktop so that `patches/` and
 * the local package.json are picked up correctly.
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.join(__dirname, '..')
const desktopRoot = path.join(repoRoot, 'packages', 'desktop')

function run(cmd, opts = {}) {
  const { cwd = repoRoot, env = {} } = opts
  execSync(cmd, { stdio: 'inherit', cwd, env: { ...process.env, ...env } })
}

function tryRun(cmd, opts = {}) {
  const { cwd = repoRoot, env = {} } = opts
  try {
    execSync(cmd, { stdio: 'pipe', cwd, env: { ...process.env, ...env } })
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error }
  }
}

function quote(value) {
  return `"${value.replace(/"/g, '\\"')}"`
}

function quotePowerShell(value) {
  return `'${value.replace(/'/g, "''")}'`
}

function applyPatchesWithGit() {
  const patchDir = path.join(desktopRoot, 'patches')
  const patchFiles = fs.existsSync(patchDir)
    ? fs.readdirSync(patchDir)
      .filter(file => file.endsWith('.patch'))
      .sort()
    : []

  for (const patchFile of patchFiles) {
    const patchPath = path.join(patchDir, patchFile)
    const check = tryRun(`git apply --check --ignore-space-change --ignore-whitespace ${quote(patchPath)}`, {
      cwd: desktopRoot
    })

    if (check.ok) {
      run(`git apply --ignore-space-change --ignore-whitespace ${quote(patchPath)}`, { cwd: desktopRoot })
      continue
    }

    const reverseCheck = tryRun(
      `git apply --reverse --check --ignore-space-change --ignore-whitespace ${quote(patchPath)}`,
      { cwd: desktopRoot }
    )

    if (!reverseCheck.ok) {
      throw check.error
    }
  }
}

function patchAppBuilderLib() {
  const nsisTargetPath = require.resolve('app-builder-lib/out/targets/nsis/NsisTarget.js', {
    paths: [desktopRoot]
  })
  const source = fs.readFileSync(nsisTargetPath, 'utf8')

  if (source.includes('failed to launch temporary NSIS installer, retrying...')) {
    return
  }

  const original = '            await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });'
  const replacement = [
    '            let retryCount = 0;',
    '            while (true) {',
    '                try {',
    '                    await ensureNotBusy(installerPath);',
    '                    await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });',
    '                    break;',
    '                }',
    '                catch (error) {',
    '                    if (process.platform !== "win32" || !/spawn UNKNOWN/i.test(error.message) || retryCount >= 2) {',
    '                        throw error;',
    '                    }',
    '                    retryCount++;',
    '                    builder_util_1.log.warn({ attempt: retryCount }, "failed to launch temporary NSIS installer, retrying...");',
    '                    await new Promise(resolve => setTimeout(resolve, 2000));',
    '                }',
    '            }'
  ].join('\n')

  if (!source.includes(original)) {
    throw new Error('app-builder-lib patch target not found in NsisTarget.js')
  }

  fs.writeFileSync(nsisTargetPath, source.replace(original, replacement))
}

// Detect which package manager invoked this postinstall so commands work
// regardless of whether the caller is pnpm (primary) or npm (fallback).
const userAgent = process.env.npm_config_user_agent || ''
const isPnpm = userAgent.startsWith('pnpm')
// patch-package and electron-rebuild are locally installed; call their
// node_modules/.bin entries directly (hoisted by shamefully-hoist=true).
const ext = process.platform === 'win32' ? '.cmd' : ''
const patchPackageBin = path.join(desktopRoot, 'node_modules', '.bin', `patch-package${ext}`)
const electronRebuildBin = path.join(desktopRoot, 'node_modules', '.bin', `electron-rebuild${ext}`)

// ── 1. Ensure native-keymap source is present (pm removes it on optional failure) ──
const nativeKeymapDir = path.join(desktopRoot, 'node_modules', 'native-keymap')
if (!fs.existsSync(nativeKeymapDir)) {
  console.log('Installing native-keymap source (skipping compilation)...')
  // native-keymap is already in marktext's optionalDependencies; the add
  // re-installs without changing the version range.
  if (isPnpm) {
    run('pnpm --filter marktext add native-keymap --ignore-scripts')
  } else {
    run('npm install native-keymap --ignore-scripts --no-save', { cwd: desktopRoot })
  }
}

// ── 2. Download + extract Electron binary ────────────────────────────────────
const electronInstall = path.join(desktopRoot, 'node_modules', 'electron', 'install.js')

if (!fs.existsSync(electronInstall)) {
  console.error('electron/install.js not found — skipping Electron download')
} else {
  const os = require('os')
  const plat =
    process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || os.platform()
  const platformBinary =
    plat === 'win32'
      ? 'electron.exe'
      : plat === 'darwin' || plat === 'mas'
        ? 'Electron.app/Contents/MacOS/Electron'
        : 'electron'

  const pathTxt = path.join(desktopRoot, 'node_modules', 'electron', 'path.txt')
  const distDir = path.join(desktopRoot, 'node_modules', 'electron', 'dist')

  // On macOS we also require Frameworks/ — yauzl v2.10.0 hangs on Node v26+ and
  // silently produces an incomplete dist/ without Frameworks.
  const isComplete = () => {
    if (!fs.existsSync(pathTxt)) return false
    const rel = fs.readFileSync(pathTxt, 'utf8').trim()
    if (!fs.existsSync(path.join(desktopRoot, 'node_modules', 'electron', rel))) return false
    if (plat === 'darwin' || plat === 'mas') {
      return fs.existsSync(path.join(distDir, 'Electron.app', 'Contents', 'Frameworks'))
    }
    return true
  }

  if (!isComplete()) {
    // Remove any partial dist so install.js always runs extraction fresh
    if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true })
    if (fs.existsSync(pathTxt)) fs.unlinkSync(pathTxt)

    console.log('Downloading Electron binary...')
    try {
      run(`node "${electronInstall}"`)
    } catch {
      const mirror = process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/'
      console.log(`Direct download failed, retrying with mirror: ${mirror}`)
      run(`node "${electronInstall}"`, { env: { ELECTRON_MIRROR: mirror } })
    }

    // On Windows, extract-zip can sometimes leave an incomplete dist/ on newer
    // Node versions (for example only locales/ gets written, without
    // electron.exe). Re-extract the cached zip with PowerShell's
    // Expand-Archive so the binary is restored deterministically.
    if (plat === 'win32' && !fs.existsSync(path.join(distDir, 'electron.exe'))) {
      const { version } = require(path.join(desktopRoot, 'node_modules', 'electron', 'package.json'))
      const arch = process.env.npm_config_arch || os.arch()
      const zipName = `electron-v${version}-win32-${arch === 'arm64' ? 'arm64' : 'x64'}.zip`
      const cacheRoot =
        process.env.electron_config_cache ||
        path.join(os.homedir(), 'AppData', 'Local', 'electron', 'Cache')

      const findZip = (dir) => {
        if (!fs.existsSync(dir)) return ''
        const entries = fs.readdirSync(dir, { withFileTypes: true })
          .sort((a, b) => a.name.localeCompare(b.name))

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isFile() && entry.name === zipName) return fullPath
          if (entry.isDirectory()) {
            const nested = findZip(fullPath)
            if (nested) return nested
          }
        }

        return ''
      }

      const zipPath = findZip(cacheRoot)

      if (!zipPath) {
        throw new Error(
          'Electron zip not found in cache after download. ' +
            'Try rerunning install with ELECTRON_MIRROR set.'
        )
      }

      console.log('Electron dist incomplete on Windows, re-extracting with PowerShell...')
      if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true })
      fs.mkdirSync(distDir, { recursive: true })
      run(
        `powershell.exe -NoProfile -Command ` +
          `"Expand-Archive -LiteralPath ${quotePowerShell(zipPath)} -DestinationPath ${quotePowerShell(distDir)} -Force"`
      )
      fs.writeFileSync(pathTxt, platformBinary)
      fs.writeFileSync(path.join(distDir, 'version'), version)
    }

    // yauzl v2.10.0 + Node v26+: openReadStream callback never fires for
    // compressed entries → extract-zip exits silently with incomplete dist/.
    // Re-extract using system unzip which handles the zip correctly.
    if (
      (plat === 'darwin' || plat === 'mas') &&
      !fs.existsSync(path.join(distDir, 'Electron.app', 'Contents', 'Frameworks'))
    ) {
      const { version } = require(path.join(desktopRoot, 'node_modules', 'electron', 'package.json'))
      const arch = process.env.npm_config_arch || os.arch()
      const zipName = `electron-v${version}-darwin-${arch === 'arm64' ? 'arm64' : 'x64'}.zip`
      const cacheRoot =
        process.env.electron_config_cache ||
        path.join(os.homedir(), 'Library', 'Caches', 'electron')

      let zipPath = ''
      try {
        zipPath = execSync(`find "${cacheRoot}" -name "${zipName}" 2>/dev/null | head -1`)
          .toString()
          .trim()
      } catch {
        /* ignore */
      }

      if (!zipPath) {
        throw new Error(
          'Electron zip not in cache after download. ' +
            'Try: ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install'
        )
      }

      console.log(
        `Re-extracting with system unzip (yauzl incompatible with Node ${process.version})...`
      )
      if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true })
      run(`unzip -q "${zipPath}" -d "${distDir}"`)
      fs.writeFileSync(pathTxt, platformBinary)
      fs.writeFileSync(path.join(distDir, 'version'), version)
    }

    // Ensure path.txt exists (install.js may skip it on a cache hit)
    if (!fs.existsSync(pathTxt)) {
      fs.writeFileSync(pathTxt, platformBinary)
    }
  }
}

// ── 3. Apply C++20 patch to native-keymap (patches/ lives in packages/desktop) ──
console.log('Applying patches...')
try {
  run(`"${patchPackageBin}"`, { cwd: desktopRoot })
  patchAppBuilderLib()
} catch (error) {
  const output = `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`
  if (!/No package-lock\.json, npm-shrinkwrap\.json, or yarn\.lock file/i.test(output)) {
    throw error
  }

  console.log('patch-package skipped: applying patches with git instead...')
  applyPatchesWithGit()
  patchAppBuilderLib()
}

// ── 4. Rebuild native modules for Electron ABI ──────────────────────────────
console.log('Rebuilding native modules for Electron...')
run(`"${electronRebuildBin}" -f`, { cwd: desktopRoot })

// ── 5. Generate minified locale files ───────────────────────────────────────
console.log('Minifying locales...')
run('pnpm tsx scripts/minify-locales.ts')
