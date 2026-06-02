/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const checker = require('license-checker')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// license-checker keys packages as "<name>@<version>", and excludePackages
// matches that string exactly — name-only entries don't match. Build the
// workspace exclusions at runtime from each package's own package.json so
// version bumps stay in sync automatically. @marktext/file-icons stays
// pinned because it's a published third-party dep that license-checker
// fails to detect (MIT).
const repoRoot = path.resolve(__dirname, '..')
const workspaceExclusions = ['packages/desktop', 'packages/muyajs', 'packages/muya']
  .map((rel) => {
    const { name, version } = require(path.join(repoRoot, rel, 'package.json'))
    return `${name}@${version}`
  })
  .concat('@marktext/file-icons')
  .join(';')

export const getLicenses = (rootDir, callback) => {
  checker.init(
    {
      start: rootDir,
      production: true,
      development: false,
      direct: true,
      excludePackages: workspaceExclusions,
      json: true,
      onlyAllow:
        'Unlicense;WTFPL;ISC;MIT;BSD;Apache-2.0;MIT*;Apache;Apache*;BSD*;CC0-1.0;CC-BY-4.0;CC-BY-3.0'
    },
    function(err, packages) {
      callback(err, packages, checker)
    }
  )
}

// Check that all production dependencies are allowed.
export const validateLicenses = (rootDir) => {
  getLicenses(rootDir, (err, packages, checker) => {
    if (err) {
      console.log(`[ERROR] ${err}`)
      process.exit(1)
    }
    if (!packages || Object.keys(packages).length === 0) {
      console.log('[ERROR] No packages found — check your start path and filters.')
      process.exit(1)
    }
    console.log(checker.asSummary(packages))
  })
}
