const Sentry = require('../../lib/services/sentry')
const functions = require('firebase-functions')

const { prepareAppSdk } = require('../../index')

const {
  createMetafieldCloudCommerce
} = require('../../lib/cloudcommerce-api/create-metafield')

const handler = async (change, context) => {
  const newData = change.after.data()
  const previousData = change.before.data()

  if (newData.synchronized === true && previousData.synchronized !== true) {
    try {
      if (newData.is_cloud_commerce) {
        await createMetafieldCloudCommerce(newData.store_id, newData.order_id)
      } else {
        const appSdk = await prepareAppSdk()
        await require('../../lib/store-api/create-metafield')(
          {
            appSdk,
            storeId: newData.store_id
          },
          newData.order_id
        )
      }
      return true
    } catch (error) {
      functions.logger.error(
        'Error creating metafield for order:',
        context.params.order_id,
        error
      )
      Sentry.captureException(error)
      throw error // Rethrowing to trigger retry
    }
  }
  return null
}

exports.onOrderUpdate = functions.firestore
  .document('ecomplus_orders_to_sync/{order_id}')
  .onUpdate(handler)
