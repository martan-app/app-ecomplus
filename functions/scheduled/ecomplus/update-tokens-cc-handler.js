const admin = require('firebase-admin')
const functions = require('firebase-functions')
const { Timestamp, Firestore } = require('firebase-admin/firestore')

const { getAuthFromApiKey } = require('../../lib/store-api/get-auth-cc')

const createOrUpdateAuth = async (docId, authData) => {
  const {
    store_id: storeId,
    authentication_id: authenticationId,
    api_key: apiKey
  } = authData

  if (!storeId || !authenticationId || !apiKey) {
    functions.logger.error(`Missing required auth data for doc ${docId}`, {
      storeId,
      authenticationId
    })
    return
  }

  functions.logger.info(`Attempting to refresh token for store #${storeId}`)

  try {
    const auth = await getAuthFromApiKey(storeId, authenticationId, apiKey)
    if (!auth) {
      functions.logger.error(
        `Failed to authenticate store #${storeId} with CC v2 API - null response`
      )
      return
    }

    delete auth.my_id

    const authDoc = {
      ...auth,
      expires: Timestamp.fromDate(new Date(auth.expires)),
      updated_at: Timestamp.now(),
      last_refresh: Firestore.FieldValue.serverTimestamp()
    }

    await admin
      .firestore()
      .collection('ecomplus_app_auth_cc')
      .doc(docId)
      .set(authDoc, { merge: true })

    functions.logger.info(
      `Successfully updated auth doc for store #${storeId}`,
      {
        docId,
        tokenExpiration: auth.expires
      }
    )
  } catch (error) {
    functions.logger.error(
      `Error refreshing token for store #${storeId}:`,
      error.stack
    )
    throw error
  }
}

module.exports = async () => {
  try {
    const db = admin.firestore()
    const query = db.collection('ecomplus_app_auth_cc')
    const queue = 0
    const maxTokens = 40

    const querySnapshot = await query
      .orderBy('updated_at', 'asc')
      .limit(maxTokens * 10)
      .get()

    functions.logger.info(`Found ${querySnapshot.size} stored tokens`)

    if (querySnapshot.size) {
      const minDate = new Date()
      minDate.setHours(minDate.getHours() + 16)
      functions.logger.info(
        `Filtering tokens to expire in up to 16h (<= ${minDate.toISOString()})`
      )
      const minTimestamp = minDate.getTime()

      // Process tokens in batches to avoid overloading
      const promises = []
      querySnapshot.forEach((documentSnapshot) => {
        if (queue < maxTokens) {
          const data = documentSnapshot.data()
          if (
            !data.updated_at ||
            !data.last_refresh ||
            !data.expires ||
            data?.expires?.toDate()?.getTime() <= minTimestamp
          ) {
            promises.push(createOrUpdateAuth(documentSnapshot.id, data))
          }
        }
      })

      const results = await Promise.allSettled(promises)
      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      functions.logger.info(
        `Token refresh completed: ${succeeded} succeeded, ${failed} failed`
      )

      if (querySnapshot.size >= maxTokens) {
        try {
          // Clear old not handled tokens
          const filterDate = new Date()
          filterDate.setDate(filterDate.getDate() - 30)
          const oldTokens = await query
            .where('expires', '<', filterDate.toISOString())
            .limit(maxTokens * 2)
            .get()

          const batch = db.batch()
          oldTokens.docs.forEach((doc) => {
            batch.delete(doc.ref)
          })
          await batch.commit()

          functions.logger.info(
            `[EcomPlus] Cleaned up ${oldTokens.size} expired tokens`
          )
        } catch (error) {
          functions.logger.error(
            '[EcomPlus] Error cleaning up expired tokens:',
            error.stack
          )
        }
      }
    }
  } catch (error) {
    functions.logger.error('Error fetching auth docs:', error.stack)
    throw error
  }
}
