const functions = require('firebase-functions')
const Sentry = require('../../lib/services/sentry')

const cron = '0 */12 * * *'
exports.syncOrdersFailed = functions.pubsub.schedule(cron).onRun(async () => {
  functions.logger.info('Starting Sync Orders Failed')
  try {
    await require('./sync-orders-failed-handler')()
    functions.logger.info('Sync Orders Failed completed successfully')
  } catch (error) {
    functions.logger.error('Error syncing orders Failed:', error)
    Sentry.captureException(error)
    throw error // Rethrowing to trigger retry
  }
})
