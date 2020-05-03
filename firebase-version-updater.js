/* eslint-disable */
const { join } = require('path')
const { readFileSync, writeFileSync } = require('fs')

const { version } = require('firebase/package.json')

const pluginPath = join(__dirname, 'src/plugin.ts')
const plugin = readFileSync(pluginPath).toString()

writeFileSync(
  pluginPath,
  plugin.replace(/(DEFAULT_FIREBASE_VERSION\s*=\s*)'[^']+'/, `$1'${version}'`)
)

const readmePath = join(__dirname, 'README.md')
const readme = readFileSync(readmePath).toString()

writeFileSync(
  readmePath,
  readme.replace(
    /(\(Firebase version\)\s*\*{2}Default:\*{2}\s*)`[^`]+`/,
    `$1\`${version}\``
  )
)
/* eslint-enable */
