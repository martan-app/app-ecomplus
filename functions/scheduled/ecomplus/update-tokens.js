const functions = require('firebase-functions')
const { prepareAppSdk } = require('../../index')
const Sentry = require('../../lib/services/sentry')

const ecomCron = '25 */3 * * *'
exports.ecomplusUpdateTokens = functions.pubsub
  .schedule(ecomCron)
  .onRun(async () => {
    functions.logger.info('Starting E-Com Plus tokens update')
    try {
      const appSdk = await prepareAppSdk()
      await appSdk.updateTokens()
      functions.logger.info('E-Com Plus tokens updated successfully')
    } catch (error) {
      functions.logger.error('Error updating E-Com Plus tokens:', error)
      Sentry.captureException(error)
      throw error // Rethrowing to trigger retry
    }
  })
