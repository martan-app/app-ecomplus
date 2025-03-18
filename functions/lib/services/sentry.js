// Import with `import * as Sentry from "@sentry/node"` if you are using ESM
const Sentry = require('@sentry/node')
const { sentryDsn } = require('../../__env')

Sentry.init({
  dsn: sentryDsn
})

module.exports = Sentry
