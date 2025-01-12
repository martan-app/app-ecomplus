const { logger } = require('firebase-functions')

const getAuthFromCloudCommerce = async ({ db, storeId }) => {
  if (!db || !storeId) {
    logger.error('Missing required parameters for getAuth', { storeId })
    throw new Error('Missing required parameters')
  }

  try {
    const martanAuthRef = db.collection('ecomplus_app_auth_cc')
    const query = martanAuthRef
      .where('store_id', '==', storeId)
      .orderBy('updated_at', 'desc')
      .limit(1)

    const docs = await query.get()
    if (docs.empty) {
      logger.info(`No auth found for store #${storeId}`)
      return null
    }

    const authData = docs.docs[0].data()
    logger.debug(`Auth retrieved for store #${storeId}`, {
      updatedAt: authData.updated_at
    })
    return authData
  } catch (error) {
    logger.error(`Error getting auth for store #${storeId}:`, error)
    throw error
  }
}

module.exports = { getAuthFromCloudCommerce }
