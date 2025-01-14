const { logger } = require("firebase-functions")
const { getAuthFromCloudCommerce } = require("../get-auth-cc")
const admin = require("firebase-admin")
const cloudCommerceApi = require("./cloud-api")
const errorHandling = require("./../store-api/error-handling")

/**
 * Create metafield on order to track synchronization status
 * @param {object} params - Function parameters
 * @param {object} params.appSdk - E-Com Plus App SDK instance
 * @param {number} params.storeId - Store ID
 * @param {string} orderId - Order ID
 * @param {string} [value=successfully] - Metafield value
 * @returns {Promise<void>}
 */
const createMetafieldCloudCommerce = async (
  storeId,
  orderId,
  value = "successfully"
) => {
  if (!storeId || !orderId) {
    throw new Error("Missing required parameters")
  }

  try {
    const url = `orders/${orderId}/metafields.json`
    const auth = await getAuthFromCloudCommerce({
      db: admin.firestore(),
      storeId,
    })

    await cloudCommerceApi(
      {
        url,
        method: "POST",
        data: {
          namespace: "martan-app",
          field: "martan_synchronized_order",
          value,
        },
      },
      auth
    )

    logger.info(`[Store API] Metafield created successfully: ${orderId}`, {
      storeId,
      value,
    })
  } catch (error) {
    const message = error.response?.data || error.message
    logger.error(`[Store API] Error creating metafield: ${orderId}`, {
      storeId,
      value,
      error: message,
    })
    errorHandling(error)
  }
}

module.exports = { createMetafieldCloudCommerce }
