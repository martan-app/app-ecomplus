const functions = require("firebase-functions")
const { Firestore } = require("firebase-admin/firestore")

const martan = require("./")
const getAuth = require("../get-auth")
const createMetafield = require("../store-api/create-metafield")
const {
  createMetafieldCloudCommerce,
} = require("../cloudcommerce-api/create-metafield")
async function handler({ order, context, db, appSdk }) {
  try {
    if (!order || !order?.store_id || !context?.params?.order_id) {
      throw new Error("Missing required parameters")
    }

    const storeId = order.store_id
    const orderId = context.params.order_id

    // Clean order data
    const data = { ...order }
    delete data.created_at
    delete data.store_id
    delete data.synchronized

    // Get authentication
    const auth = await getAuth({ db, storeId })
    if (!auth?.access_token || !auth?.martan_id) {
      throw new Error("Invalid authentication data")
    }

    // Send order to Martan API
    const response = await martan({
      method: "post",
      url: "/orders.json",
      headers: {
        "X-Store-Id": auth.martan_id,
        "X-Token": auth.access_token,
      },
      data,
    })

    functions.logger.info(`[Martan] Order sent successfully: ${orderId}`, {
      data: response.data,
      order,
    })

    // Update sync status
    await db.collection("ecomplus_orders_to_sync").doc(orderId).update({
      synchronized: true,
      updated_at: Firestore.FieldValue.serverTimestamp(),
    })
  } catch (error) {
    await errorHandler(error, context, db, order, appSdk)
  }
}

async function errorHandler(error, context, db, order, appSdk) {
  const orderId = context?.params?.order_id
  if (!orderId) {
    functions.logger.error("[Martan] Missing order ID in error handler")
    return
  }

  try {
    if (error.response?.status === 400) {
      const { data } = error.response

      // Handle specific error codes
      const criticalErrorCodes = [802030, 520, 81211]
      if (criticalErrorCodes.includes(data?.error_code)) {
        await Promise.all([
          db.collection("ecomplus_orders_to_sync").doc(orderId).update({
            failed: true,
            error_code: data.error_code,
            updated_at: Firestore.FieldValue.serverTimestamp(),
          }),
          db.collection("ecomplus_orders_sync_error").doc(orderId).set({
            timestamp: Firestore.FieldValue.serverTimestamp(),
            context,
            order,
            error: data,
          }),
        ])

        const metafieldReq = order.is_cloud_commerce
          ? createMetafieldCloudCommerce(order.store_id, orderId, "failed")
          : createMetafield({
              appSdk,
              storeId: order.store_id,
              orderId,
              value: "failed",
            })

        await metafieldReq
      }

      // Handle duplicate order
      if (data?.error_code === 103) {
        await db.collection("ecomplus_orders_to_sync").doc(orderId).update({
          synchronized: true,
          updated_at: Firestore.FieldValue.serverTimestamp(),
        })
      }

      functions.logger.error(`[Martan] Error sending order ${orderId}:`, data)
      return
    }

    // Log unexpected errors
    functions.logger.error(
      `[Martan] Unexpected error sending order ${orderId}:`,
      error.response?.data || error.message
    )

    // Save error state
    await db.collection("ecomplus_orders_sync_error").doc(orderId).set({
      timestamp: Firestore.FieldValue.serverTimestamp(),
      context,
      order,
      error: error.message,
    })
  } catch (handlerError) {
    functions.logger.error(
      `[Martan] Error in error handler for order ${orderId}:`,
      handlerError
    )
  }
}

module.exports = handler
