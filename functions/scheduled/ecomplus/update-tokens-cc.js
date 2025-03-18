const Sentry = require('../../lib/services/sentry')
const functions = require('firebase-functions')

const cron = '0 * * * *'

exports.ecomplusUpdateTokensCC = functions.pubsub
  .schedule(cron)
  .onRun(async () => {
    functions.logger.info('Starting updateTokenForCloudCommerce')
    try {
      await require('./update-tokens-cc-handler')()
      functions.logger.info(
        'updateTokenForCloudCommerce completed successfully'
      )
    } catch (error) {
      functions.logger.error('Error updating token for Cloud Commerce:', error)
      Sentry.captureException(error)
      throw error // Rethrowing to trigger retry
    }
  })
