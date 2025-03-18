const functions = require('firebase-functions')
const admin = require('firebase-admin')
const Sentry = require('../../lib/services/sentry')

const martanCron = '3 */3 * * *'
exports.martanUpdateTokens = functions.pubsub
  .schedule(martanCron)
  .onRun(async () => {
    functions.logger.info('Starting Martan tokens update')
    try {
      await require('./update-tokens-handler')(admin)
      functions.logger.info('Martan tokens updated successfully')
    } catch (error) {
      functions.logger.error('Error updating Martan tokens:', error)
      Sentry.captureException(error)
      throw error // Rethrowing to trigger retry
    }
  })
