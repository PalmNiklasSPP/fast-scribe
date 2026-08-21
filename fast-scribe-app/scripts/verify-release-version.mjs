// Guards the release pipeline: the pushed tag must match package.json.
// Kept in a file rather than an inline `node -e` because the release matrix
// runs on both bash and PowerShell, which disagree about quoting.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packagePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
const { version } = JSON.parse(readFileSync(packagePath, 'utf8'))
const expected = 'v' + version
const tag = process.env.GITHUB_REF_NAME

if (!tag) {
  console.error('GITHUB_REF_NAME is not set. This check is meant to run on a tag push.')
  process.exit(1)
}

if (tag !== expected) {
  console.error(
    'Release tag ' + tag + ' does not match package.json version ' + expected + '.\n' +
      'Bump it with: npm version ' + tag.replace(/^v/, '') + ' --no-git-tag-version\n' +
      '(run inside fast-scribe-app/, then commit and re-tag)'
  )
  process.exit(1)
}

console.log('Tag ' + tag + ' matches package.json version ' + expected + '.')
