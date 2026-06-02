/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateLicenses } from './thirdPartyChecker.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '..', 'packages/desktop')

validateLicenses(desktopRoot)
