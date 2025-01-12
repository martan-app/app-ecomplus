const admin = require('firebase-admin')
const { firestore } = require('firebase-admin')
const { Timestamp } = require('firebase-admin/firestore')
const { setup } = require('@ecomplus/application-sdk')
const logger = require('firebase-functions/logger')

const saveOrder = require('./save-order')
const cloudCommerceApi = require('./cloudcommerce-api/cloud-api')
const getAuth = require('./get-auth')

const listStoreIds = async (isCloudCommerce = false) => {
  try {
    const storeIds = []
    const date = new Date()
    date.setHours(date.getHours() - 48)

    const querySnapshot = await firestore()
      .collection(isCloudCommerce ? 'ecomplus_app_auth_cc' : 'martan_app_auth')
      .where('updated_at', '>', Timestamp.fromDate(date))
      .get()

    querySnapshot.forEach((documentSnapshot) => {
      const storeId = documentSnapshot.get('store_id')
      if (storeId && !storeIds.includes(storeId)) {
        storeIds.push(storeId)
      }
    })
    return storeIds
  } catch (error) {
    logger.error('Error listing store IDs:', error)
    return []
  }
}

const ordersFields =
  'fulfillments,source_name,domain,number,status,financial_status.current,fulfillment_status.current,amount,payment_method_label,shipping_method_label,buyers._id,buyers.main_email,buyers.name,buyers.display_name,buyers.phones,buyers.doc_number,transactions.payment_link,transactions.intermediator.transaction_code,items.product_id,items.sku,items.picture,items.slug,items.name,items.quantity,created_at,updated_at,metafields'

const fetchDeliveredOrders = async ({ appSdk, storeId }, isCloudCommerce = false) => {
  if (!appSdk || !storeId) {
    logger.warn('Missing required parameters for fetchDeliveredOrders')
    return
  }

  const d1 = new Date()
  d1.setDate(d1.getDate() - 3)
  const d2 = new Date()
  d2.setHours(d2.getHours() - 2)

  const endpoint =
    '/orders.json' +
    `?fields=${ordersFields}` +
    '&financial_status.current=paid' +
    '&fulfillment_status.current=delivered' +
    `&updated_at>=${d1.toISOString()}` +
    `&updated_at<=${d2.toISOString()}` +
    '&metafields.field!=martan_synchronized_order' +
    '&sort=updated_at' +
    '&limit=100'

  try {
    let promises = [
      appSdk.apiRequest(storeId, '/stores/me.json', 'GET'),
      appSdk.apiRequest(storeId, endpoint, 'get')
    ]

    let cloudCommerceAuth = null
    if (isCloudCommerce) {
      cloudCommerceAuth = await getAuth({ db: admin.firestore(), storeId })
      promises = [
        cloudCommerceApi({ url: '/stores/me.json' }, cloudCommerceAuth),
        cloudCommerceApi({ url: endpoint }, cloudCommerceAuth)
      ]
    }
    const [storeResponse, ordersResponse] = await Promise.all(promises)

    const store = storeResponse?.response?.data || {}
    const orders = ordersResponse?.response?.data?.result || []

    if (!orders.length) {
      logger.info(`-> [Martan/Ecom] No new orders to process for store #${storeId}`)
      return
    }

    logger.info(
      `-> [Martan/Ecom] Importing ${orders.length} orders for #${storeId}`
    )

    const results = await Promise.allSettled(
      orders.map(async (order) => {
        const trigger = {
          resource_id: order._id,
          inserted_id: order._id
        }

        try {
          await saveOrder({
            appSdk,
            storeId,
            trigger,
            admin,
            store,
            isCloudCommerce,
            cloudCommerceAuth
          })
          return { success: true, orderId: order._id }
        } catch (error) {
          logger.error(
            `X [Martan/Ecom] Error saving order ${order._id}:`,
            error
          )
          return { success: false, orderId: order._id, error }
        }
      })
    )

    const failures = results.filter(r => r.value?.success === false)
    if (failures.length) {
      logger.warn(`X [Martan/Ecom] Failed to process ${failures.length} orders for store #${storeId}`)
    }
  } catch (error) {
    const errorMessage = error.response
      ? `X [Martan/Ecom] API request failed for store #${storeId}: ${error.response.data?.message || JSON.stringify(error.response.data)}`
      : `X [Martan/Ecom] Unexpected error for store #${storeId}: ${error.message}`

    logger.error(errorMessage, {
      storeId,
      error: error.stack
    })
  }
}

module.exports = async (isCloudCommerce = false) => {
  try {
    const appSdk = await setup(null, true, firestore())
    const storeIds = await listStoreIds(isCloudCommerce)

    if (!storeIds.length) {
      logger.warn('No active stores found')
      return
    }

    // Shuffle store IDs for better load distribution
    const shuffledStoreIds = storeIds.sort(() => Math.random() - 0.5)

    await Promise.allSettled(
      shuffledStoreIds.map((storeId) =>
        fetchDeliveredOrders({ appSdk, storeId })
      )
    )

    logger.info('Completed processing all stores')
  } catch (error) {
    logger.error('Fatal error in check-orders-delivered:', error)
  }
}
