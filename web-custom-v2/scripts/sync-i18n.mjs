import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
const LOCALES = ['en', 'zh', 'zh-TW', 'fr', 'ja', 'ru', 'vi']
let expectedKeys

for (const locale of LOCALES) {
  const filePath = path.join(LOCALES_DIR, locale + '.json')
  const json = JSON.parse(await fs.readFile(filePath, 'utf8'))
  const sortedEntries = Object.entries(json.translation).sort(([left], [right]) =>
    left.localeCompare(right)
  )
  const keys = sortedEntries.map(([key]) => key)

  if (expectedKeys === undefined) {
    expectedKeys = keys
  } else if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error(locale + ' does not contain the same translation keys as en')
  }

  await fs.writeFile(
    filePath,
    JSON.stringify({ translation: Object.fromEntries(sortedEntries) }, null, 2) + '\n',
    'utf8'
  )
  console.log(locale + ': ' + keys.length + ' keys')
}
