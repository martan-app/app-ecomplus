const functions = require('firebase-functions')
const Sentry = require('./../../lib/services/sentry')
const saveOrder = require('./../../lib/save-order')
const admin = require('firebase-admin')
const { setup } = require('@ecomplus/application-sdk')
const { getAuthFromCloudCommerce } = require('../../lib/auth/get-auth-cc')
const { logger } = require('firebase-functions')
const getAppSdk = () => {
  return new Promise((resolve) => {
    setup(null, true, admin.firestore()).then((appSdk) => resolve(appSdk))
  })
}

exports.processOrders = functions
  .runWith({
    failurePolicy: true
  })
  .pubsub
  .topic('process-orders')
  .onPublish(async (message) => {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const { order, isCloudCommerce, storeId: storeIdString, trigger } = message.json
    const storeId = parseInt(storeIdString)
    logger.info(`[#${storeId}] Processando pedido: ${order.number}`)
    let cloudCommerceAuth = null
    if (isCloudCommerce) {
      cloudCommerceAuth = await getAuthFromCloudCommerce({
        db: admin.firestore(),
        storeId
      })
    }
    // console.log('isCloudCommerce', cloudCommerceAuth)
    try {
      const appSdk = await getAppSdk()
      await saveOrder({
        appSdk,
        storeId,
        trigger,
        orderBody: order,
        admin,
        isCloudCommerce,
        cloudCommerceAuth
      })
    } catch (error) {
      Sentry.captureException(error)
    }
    return null
  })
