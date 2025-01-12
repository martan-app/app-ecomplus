const admin = require("firebase-admin")
const { Timestamp } = require("firebase-admin/firestore")
const functions = require("firebase-functions")
const { Firestore } = require("firebase-admin/firestore")

const { getAuthFromApiKey } = require("../lib/store-api/get-auth-cc")

const createOrUpdateAuth = async (docId, authData) => {
  const { store_id, authentication_id, api_key } = authData

  if (!store_id || !authentication_id || !api_key) {
    functions.logger.error(`Missing required auth data for doc ${docId}`, {
      store_id,
      authentication_id,
    })
    return
  }

  functions.logger.info(`Attempting to refresh token for store #${store_id}`)

  try {
    const auth = await getAuthFromApiKey(store_id, authentication_id, api_key)
    if (!auth) {
      functions.logger.error(
        `Failed to authenticate store #${store_id} with CC v2 API - null response`
      )
      return
    }

    delete auth.my_id
    const authDoc = {
      ...auth,
      expires: Timestamp.fromDate(new Date(auth.expires)),
      updated_at: Timestamp.now(),
      last_refresh: Firestore.FieldValue.serverTimestamp(),
    }

    await admin
      .firestore()
      .collection("ecomplus_app_auth_cc")
      .doc(docId)
      .set(authDoc, { merge: true })

    functions.logger.info(
      `Successfully updated auth doc for store #${store_id}`,
      {
        docId,
        tokenExpiration: auth.expires,
      }
    )
  } catch (error) {
    functions.logger.error(
      `Error refreshing token for store #${store_id}:`,
      error.stack
    )
    throw error
  }
}

const checkTokensForCloudCommerce = async () => {
  try {
    functions.logger.info("Starting Cloud Commerce token refresh check")
    const date = new Date()
    date.setHours(date.getHours() - 16)
    functions.logger.info(
      `Checking tokens updated before: ${date.toISOString()}`
    )

    const querySnapshot = await admin
      .firestore()
      .collection("ecomplus_app_auth_cc")
      .where("last_refresh", "<", date.toISOString())
      .limit(100)
      .get()

    const emptyRefreshSnapshot = await admin
      .firestore()
      .collection("ecomplus_app_auth_cc")
      .where("last_refresh", "==", null)
      .limit(100)
      .get()

    const combinedDocs = [
      ...querySnapshot.docs,
      ...emptyRefreshSnapshot.docs
    ]

    functions.logger.info(`Found ${combinedDocs.length} tokens to refresh`)

    const authPromises = []
    combinedDocs.forEach((doc) => {
      authPromises.push(createOrUpdateAuth(doc.id, doc.data()))
    })

    const results = await Promise.allSettled(authPromises)
    const succeeded = results.filter((r) => r.status === "fulfilled").length
    const failed = results.filter((r) => r.status === "rejected").length

    functions.logger.info(
      `Token refresh completed: ${succeeded} succeeded, ${failed} failed`
    )
  } catch (error) {
    functions.logger.error("Error fetching auth docs:", error.stack)
    throw error
  }
}

exports.checkTokensForCloudCommerce = functions.pubsub
  .schedule("*/10 * * * *")
  .onRun(async () => {
    functions.logger.info("Starting checkOrdersDelivered")
    try {
      await checkTokensForCloudCommerce()
      functions.logger.info("checkOrdersDelivered completed successfully")
    } catch (error) {
      functions.logger.error("Error checking delivered orders:", error)
      throw error // Rethrowing to trigger retry
    }
  })
