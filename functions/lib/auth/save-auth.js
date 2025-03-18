'use strict'
const { Firestore, Timestamp } = require('firebase-admin/firestore')
const { logger } = require('firebase-functions')

async function saveMartanAuth (db, authData) {
  // Validate required parameters
  if (!db || !authData) {
    throw new Error('Missing required parameters')
  }

  const { storeId, martanId, accessToken, refreshToken, expiresIn } = authData

  // Validate required auth data
  if (!storeId || !martanId || !accessToken || !refreshToken || !expiresIn) {
    throw new Error('Missing required auth data fields')
  }

  // Validate numeric values
  if (!Number.isInteger(storeId) || storeId <= 0) {
    throw new Error('Invalid store ID')
  }
  if (!Number.isInteger(martanId) || martanId <= 0) {
    throw new Error('Invalid Martan ID')
  }
  if (!Number.isInteger(expiresIn) || expiresIn <= 0) {
    throw new Error('Invalid expires_in value')
  }

  const martanAuthRef = db.collection('martan_app_auth')
  const expiresInIsoDate = Timestamp.fromDate(new Date(Date.now() + expiresIn * 1000))

  try {
    // Query to check if document exists
    const query = martanAuthRef
      .where('store_id', '==', storeId)
      .where('martan_id', '==', martanId)
      .limit(1)

    const querySnapshot = await query.get()
    const authDoc = {
      store_id: storeId,
      martan_id: martanId,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresInIsoDate,
      updated_at: Firestore.FieldValue.serverTimestamp()
    }

    if (querySnapshot.empty) {
      // Create new document if it doesn't exist
      authDoc.created_at = Firestore.FieldValue.serverTimestamp()
      const docRef = await martanAuthRef.add(authDoc)
      logger.info(`Created new auth document for store #${storeId}`, { docId: docRef.id })
    } else {
      // Update existing document
      const docRef = querySnapshot.docs[0].ref
      await docRef.update(authDoc)
      logger.info(`Updated auth document for store #${storeId}`, { docId: docRef.id })
    }

    return true
  } catch (error) {
    logger.error('Error saving Martan auth:', {
      error: error.message,
      storeId,
      martanId
    })
    throw error
  }
}

module.exports = { saveMartanAuth }
