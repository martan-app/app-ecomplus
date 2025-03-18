const logger = require('firebase-functions/logger')
const axios = require('axios')

const getAuthFromApiKey = async (storeId, authId, apiKey) => {
  if (!storeId || !authId || !apiKey) {
    throw new Error('Missing required parameters for authentication')
  }

  const options = {
    method: 'POST',
    url: 'https://ecomplus.io/v2/authenticate',
    headers: { 'content-type': 'application/json', 'X-Store-Id': storeId },
    data: {
      _id: authId,
      api_key: apiKey
    }
  }

  try {
    const { data } = await axios.request(options)
    logger.info(`Successfully authenticated store #${storeId} with CC v2 API`)
    return data
  } catch (error) {
    logger.error(`Authentication failed for store #${storeId} with CC v2 API:`, error.message)
    if (error.response) {
      logger.error('Response data:', error.response.data)
    }
    return null
  }
}

module.exports = { getAuthFromApiKey }
