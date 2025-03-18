const Sentry = require('../../lib/services/sentry')
const functions = require('firebase-functions')
const sendOrdersToMartan = require('./on-new-order-handler')
const { prepareAppSdk } = require('../../index')
const admin = require('firebase-admin')

const handler = async (snap, context) => {
  const order = snap.data()
  try {
    const appSdk = await prepareAppSdk()
    await sendOrdersToMartan({
      db: admin.firestore(),
      order,
      appSdk,
      context
    })
  } catch (error) {
    functions.logger.error(
      'Error syncing order:',
      context.params.order_id,
      error
    )
    Sentry.captureException(error)
    throw error // Rethrowing to trigger retry
  }
}

exports.onNewOrder = functions.firestore
  .document('ecomplus_orders_to_sync/{order_id}')
  .onCreate(handler)
