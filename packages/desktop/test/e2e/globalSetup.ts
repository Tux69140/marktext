import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { FullConfig } from '@playwright/test'

const projectRoot = path.resolve(__dirname, '../..')
const workspaceRoot = path.resolve(projectRoot, '../..')

const requiredBuildOutputs = [
  'out/main/index.js',
  'out/preload/index.js',
  'out/renderer/index.html'
]

const hasE2eBuild = (): boolean => {
  return requiredBuildOutputs.every((relativePath) =>
    fs.existsSync(path.join(projectRoot, relativePath))
  )
}

const buildForE2e = (): void => {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const result = spawnSync('pnpm', ['exec', 'electron-vite', 'build'], {
    cwd: projectRoot,
    env,
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    throw new Error(`electron-vite build failed with exit code ${result.status ?? 'unknown'}`)
  }
}

const ensureToolingResolution = (): void => {
  const workspaceNodeModules = path.join(workspaceRoot, 'node_modules')
  const desktopNodeModules = path.join(projectRoot, 'node_modules')
  const symlinkType: fs.symlink.Type = process.platform === 'win32' ? 'junction' : 'dir'

  for (const depName of ['electron', 'pathe']) {
    const rootLinkPath = path.join(workspaceNodeModules, depName)
    if (fs.existsSync(rootLinkPath)) continue

    const desktopDepPath = path.join(desktopNodeModules, depName)
    if (!fs.existsSync(desktopDepPath)) continue

    const realDesktopDepPath = fs.realpathSync(desktopDepPath)
    const relativeTarget = path.relative(workspaceNodeModules, realDesktopDepPath)
    const linkTarget = symlinkType === 'junction' ? realDesktopDepPath : relativeTarget
    fs.symlinkSync(linkTarget, rootLinkPath, symlinkType)
  }
}

const globalSetup = async(_config: FullConfig): Promise<void> => {
  ensureToolingResolution()
  if (hasE2eBuild()) return
  buildForE2e()
}

export default globalSetup
