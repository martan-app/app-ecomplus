require('dotenv').config()

const {
  FIREBASE_TOKEN,
  SERVER_OPERATOR_TOKEN,
  SERVER_BASE_URI,
  CLIENT_ID,
  CLIENT_SECRET,
  MARTAN_OAUTH_URL,
  MARTAN_OAUTH_UI_URL,
  SENTRY_DSN
} = process.env

require('./scripts-minification')

const { name, version } = require('../package.json')
const { project, baseUri } = require('./_constants')
const client = require('firebase-tools')

const config = [
  `pkg.version=${version}`,
  `pkg.name=${name}`,
  `server.operator_token=${SERVER_OPERATOR_TOKEN}`,
  `auth.client_id=${CLIENT_ID}`,
  `auth.client_secret=${CLIENT_SECRET}`,
  `auth.martan_oauth_url=${MARTAN_OAUTH_URL}`,
  `auth.martan_oauth_ui_url=${MARTAN_OAUTH_UI_URL}`,
  `sentry.dsn=${SENTRY_DSN}`
]
if (SERVER_BASE_URI) {
  config.push(`server.base_uri=${SERVER_BASE_URI}`)
}

client.functions.config.set(config, { project })
  .then(() => client.deploy({
    project,
    token: FIREBASE_TOKEN,
    force: true
  }))

  .then(() => {
    console.log(
      '\x1b[32m%s\x1b[0m',
      `\nDeployed with success to Firebase project '${project}'`
    )
    console.log(
      '\x1b[35m%s\x1b[0m',
      `\nBase URI: ${baseUri}`
    )
    console.log()
  })

  .catch(err => {
    console.error(err)
    process.exit(1)
  })
