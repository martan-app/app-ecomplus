const admin = require('firebase-admin')
const { firestore } = require('firebase-admin')
const { Timestamp } = require('firebase-admin/firestore')
const { setup } = require('@ecomplus/application-sdk')
const logger = require('firebase-functions/logger')

const cloudCommerceApi = require('../../lib/cloudcommerce-api/cloud-api')
const { getAuthFromCloudCommerce } = require('../../lib/auth/get-auth-cc')
const addOrders = require('../../pubsub/orders/add-orders')

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
  'fulfillments,source_name,domain,number,status,financial_status.current,fulfillment_status.current,amount,payment_method_label,shipping_method_label,buyers._id,buyers.main_email,buyers.name,buyers.display_name,buyers.phones,buyers.doc_number,transactions.payment_link,transactions.intermediator.transaction_code,items.product_id,items.sku,items.picture,items.slug,items.name,items.quantity,created_at,updated_at,metafields,store_id'

const fetchDeliveredOrders = async (
  { appSdk, storeId },
  isCloudCommerce = false
) => {
  if (!appSdk || !storeId) {
    logger.warn('Missing required parameters for fetchDeliveredOrders')
    return
  }

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 7)

  const endDate = new Date()
  endDate.setDate(endDate.getDate() - 3)

  const endpoint = '/orders.json' +
    `?fields=${ordersFields}` +
    '&financial_status.current=paid' +
    '&fulfillment_status.current=delivered' +
    `&updated_at>=${startDate.toISOString()}` +
    `&updated_at<=${endDate.toISOString()}` +
    '&metafields.field!=martan_synchronized_order' +
    '&sort=updated_at' +
    '&limit=250'

  try {
    const promises = []
    let cloudCommerceAuth = null
    if (isCloudCommerce) {
      cloudCommerceAuth = await getAuthFromCloudCommerce({
        db: admin.firestore(),
        storeId
      })
      // promises.push(cloudCommerceApi({ url: '/stores/me.json' }, cloudCommerceAuth))
      promises.push(cloudCommerceApi({ url: endpoint }, cloudCommerceAuth))
    } else {
      // promises.push(appSdk.apiRequest(storeId, '/stores/me.json', 'GET'))
      promises.push(appSdk.apiRequest(storeId, endpoint, 'get'))
    }

    const [ordersResponse] = await Promise.all(promises)

    // const store = storeResponse?.response?.data || storeResponse?.data || {}
    const orders =
      ordersResponse?.response?.data?.result ||
      ordersResponse?.data?.result ||
      []

    if (!orders.length) {
      logger.info(
        `-> [Martan/Ecom] No new orders to process for store #${storeId}`
      )
      return
    }

    logger.info(
      `-> [Martan/Ecom] Importing ${orders.length} orders for #${storeId} from ${startDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })} to ${endDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}`
    )
    for (const order of orders) {
      await addOrders({
        order,
        isCloudCommerce: true,
        storeId
      })
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  } catch (error) {
    const errorMessage = error.response
      ? `X [Martan/Ecom] API request failed for store #${storeId}: ${
          error.response.data?.message || JSON.stringify(error.response.data)
        }`
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

    for (const storeId of shuffledStoreIds) {
      await fetchDeliveredOrders({ appSdk, storeId }, isCloudCommerce)
      await new Promise(resolve => setTimeout(resolve, 3000))
    }

    logger.info('Completed processing all stores')
  } catch (error) {
    logger.error('Fatal error in check-orders-delivered:', error)
  }
}
