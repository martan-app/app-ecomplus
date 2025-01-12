const { logger } = require('firebase-functions')
const errorHandling = require('./error-handling')

/**
 * Create metafield on order to track synchronization status
 * @param {object} params - Function parameters
 * @param {object} params.appSdk - E-Com Plus App SDK instance
 * @param {number} params.storeId - Store ID
 * @param {string} orderId - Order ID
 * @param {string} [value=successfully] - Metafield value
 * @returns {Promise<void>}
 */
module.exports = async ({ appSdk, storeId }, orderId, value = 'successfully') => {
  if (!appSdk || !storeId || !orderId) {
    throw new Error('Missing required parameters')
  }

  try {
    const url = `orders/${orderId}/metafields.json`
    const auth = await appSdk.getAuth(storeId)

    await appSdk.apiRequest(
      storeId,
      url,
      'POST',
      {
        namespace: 'martan-app',
        field: 'martan_synchronized_order',
        value
      },
      auth.row
    )

    logger.info(`[Store API] Metafield created successfully: ${orderId}`, {
      storeId,
      value
    })
  } catch (error) {
    const message = error.response?.data || error.message
    logger.error(`[Store API] Error creating metafield: ${orderId}`, {
      storeId,
      value,
      error: message
    })
    errorHandling(error)
  }
}
