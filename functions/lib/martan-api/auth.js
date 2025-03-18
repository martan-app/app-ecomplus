const { logger } = require('firebase-functions')
const axios = require('axios')
const qs = require('querystring')

const { baseUri, martanOAuthUrl, clientId, clientSecret } = require('../../__env')

/**
 * Get access token from Martan OAuth API
 * @param {string} code - Authorization code
 * @param {number} storeId - E-Com Plus store ID
 * @param {object} admin - Firebase Admin instance
 * @returns {Promise<object>} Access token response data
 */
async function getAccessToken (code, storeId, admin) {
  const db = admin.firestore()
  const challengeRef = db
    .collection('martan_auth_challenge')
    .doc(storeId.toString())

  const challengeDoc = await challengeRef.get()
  if (!challengeDoc.exists) {
    const err = new Error('Auth challenge not found')
    err.code = 'CHALLENGE_NOT_FOUND'
    throw err
  }

  const challengeData = challengeDoc.data()
  const tokenUrl = `${martanOAuthUrl}/oauth/token`
  const redirectUrl = `${baseUri}/martan/auth-callback`

  try {
    const { data } = await axios.post(tokenUrl,
      qs.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUrl,
        code_verifier: challengeData.code_verifier
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    // Remove used challenge
    await challengeRef.delete()
    return data
  } catch (error) {
    logger.error('[Martan] Failed to get access token:', error.response?.data || error.message)
    const err = new Error('Failed to get Martan access token')
    err.code = 'AUTH_ERROR'
    err.status = error.response?.status
    err.data = error.response?.data
    throw err
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refresh - Refresh token
 * @returns {Promise<object>} New access token response data
 */
async function refreshToken (refresh) {
  const tokenUrl = `${martanOAuthUrl}/oauth/token`

  try {
    const { data } = await axios.post(tokenUrl,
      qs.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )
    return data
  } catch (error) {
    logger.error('[Martan] Failed to refresh token:', error.response?.data || error.message)
    const err = new Error('Failed to refresh Martan access token')
    err.code = 'REFRESH_ERROR'
    err.status = error.response?.status
    err.data = error.response?.data
    throw err
  }
}

module.exports = { getAccessToken, refreshToken }
