const axios = require('axios')
const { logger } = require('firebase-functions')
const baseURL = 'https://api.martan.app/v1/'
const pkg = require('./../../package.json')

const instance = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'X-Integration-Module': `${pkg.name}@${pkg.version}`,
    'Content-Type': 'application/json'
  }
})

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log error details
    logger.error('[Martan API Error]', {
      status: error.response?.status,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
      }
    })

    if (error.response) {
      // Handle specific error status codes
      switch (error.response.status) {
        case 401:
          // Token expired or invalid
          error.code = 'UNAUTHORIZED'
          break
        case 429:
          // Rate limit exceeded
          error.code = 'RATE_LIMIT'
          break
        default:
          error.code = 'API_ERROR'
      }
    } else if (error.code === 'ECONNABORTED') {
      error.code = 'TIMEOUT'
    } else {
      error.code = 'NETWORK_ERROR'
    }

    return Promise.reject(error)
  }
)

module.exports = instance
