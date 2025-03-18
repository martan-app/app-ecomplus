const functions = require('firebase-functions')
const Sentry = require('../../lib/services/sentry')

// Este cron executa a cada 30 minutos (*/30)
// Apenas entre 5h e 20h (5-20)
// Todos os dias do mês (*)
// Todos os meses (*)
// Apenas nos dias úteis, de segunda a sexta-feira (1-5)
const cron = '*/30 5-20 * * 1-5'
exports.syncOrders = functions.pubsub.schedule(cron).onRun(async () => {
  functions.logger.info('Starting syncOrders')
  try {
    await require('./sync-orders-handler')()
    functions.logger.info('syncOrders completed successfully')
  } catch (error) {
    functions.logger.error('Error syncing orders:', error)
    Sentry.captureException(error)
    throw error // Rethrowing to trigger retry
  }
})

const syncOrdersCloudCommerceCron = '*/45 5-20 * * 1-5'
exports.syncOrdersCloudCommerce = functions.pubsub
  .schedule(syncOrdersCloudCommerceCron)
  .onRun(async () => {
    functions.logger.info('Starting syncOrdersCloudCommerce')
    try {
      await require('./sync-orders-handler')(true)
      functions.logger.info('syncOrdersCloudCommerce completed successfully')
    } catch (error) {
      functions.logger.error('Error syncing orders:', error)
      Sentry.captureException(error)
      throw error // Rethrowing to trigger retry
    }
  })
