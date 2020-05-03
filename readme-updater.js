/* eslint-disable */
module.exports.readVersion = contents => {
  const matches = contents.match(/workbox-plugin-firebase-auth@([^/]+)/)

  return matches[1]
}

module.exports.writeVersion = (contents, version) => {
  return contents.replace(
    /(workbox-plugin-firebase-auth@)[^/]+/g,
    `$1${version}`
  )
}
/* eslint-enable */
