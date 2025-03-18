'use strict'
const { logger } = require('firebase-functions')
const { Firestore, Timestamp } = require('firebase-admin/firestore')

const { refreshToken } = require('../../lib/martan-api/auth')

module.exports = async (admin) => {
  if (!admin) {
    logger.error('[Martan] Missing admin parameter')
    return
  }

  try {
    const db = admin.firestore()
    const martanAuthRef = db.collection('martan_app_auth')
    let queue = 0
    const maxTokens = 40

    const handleRefreshToken = async (snapshot) => {
      try {
        const row = snapshot.data()
        if (!row?.store_id || !row?.refresh_token) {
          logger.error('[Martan] Invalid auth data:', row)
          return
        }

        queue++
        logger.info(`[Martan] Refresh ${queue}° token for store #${row.store_id}`)

        await new Promise(resolve => setTimeout(resolve, queue * 1000))

        logger.info(`[Martan] Refreshing ${queue}° token for store #${row.store_id}`)
        const data = await refreshToken(row.refresh_token)

        if (!data?.access_token || !data?.expires_in) {
          throw new Error('Invalid token response')
        }

        const expiresInIsoDate = Timestamp.fromDate(new Date(Date.now() + data.expires_in * 1000))
        await snapshot.ref.update({
          access_token: data.access_token,
          expires_in: expiresInIsoDate,
          updated_at: Firestore.FieldValue.serverTimestamp()
        })

        logger.info(`✓ [Martan] Access token updated successfully for store #${row.store_id}`)
      } catch (error) {
        logger.error(`[Martan] Failed to refresh token:`, {
          error: error.message,
          storeId: snapshot.data()?.store_id
        })
      }
    }

    // Query martan_app_auth collection, ordered by updated_at in ascending order
    const querySnapshot = await martanAuthRef
      .orderBy('updated_at', 'asc')
      .limit(maxTokens * 10)
      .get()

    logger.info(`[Martan] Found ${querySnapshot.size} stored tokens`)

    if (querySnapshot.size) {
      const minDate = new Date()
      minDate.setHours(minDate.getHours() + 16)
      logger.info(
        `[Martan] Filtering tokens to expire in up to 16h (<= ${minDate.toISOString()})`
      )
      const minTimestamp = minDate.getTime()

      // Process tokens in batches to avoid overloading
      const promises = []
      querySnapshot.forEach((documentSnapshot) => {
        if (queue < maxTokens) {
          const data = documentSnapshot.data()
          if (
            !data.expires_in ||
            data.expires_in.toDate().getTime() <= minTimestamp
          ) {
            promises.push(handleRefreshToken(documentSnapshot))
          }
        }
      })

      await Promise.allSettled(promises)

      if (querySnapshot.size >= maxTokens) {
        try {
          // Clear old not handled tokens
          const filterDate = new Date()
          filterDate.setDate(filterDate.getDate() - 30)
          const oldTokens = await martanAuthRef
            .where('expires_in', '<', filterDate.toISOString())
            .limit(maxTokens * 2)
            .get()

          const batch = db.batch()
          oldTokens.docs.forEach(doc => {
            batch.delete(doc.ref)
          })
          await batch.commit()

          logger.info(`[Martan] Cleaned up ${oldTokens.size} expired tokens`)
        } catch (error) {
          logger.error('[Martan] Failed to cleanup old tokens:', error)
        }
      }
    }
  } catch (error) {
    logger.error('[Martan] Failed to update tokens:', error)
  }
}
