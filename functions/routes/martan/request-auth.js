'use strict'
const { Firestore } = require('firebase-admin/firestore')
const { logger } = require('firebase-functions')

const { clientId, martanOAuthUIUrl, baseUri } = require('../../__env')
const Sentry = require('../../lib/services/sentry')

const {
  generateCodeVerifier,
  generateCodeChallenge
} = require('../../utils/pkce')

exports.get = async ({ admin }, req, res) => {
  try {
    // Get store ID from query params or headers
    const { query } = req
    const storeId = parseInt(
      query.x_store_id ||
        query.storeId ||
        query.store ||
        req.get('x-store-id') ||
        req.get('store'),
      10
    )

    if (!storeId || isNaN(storeId) || storeId <= 0) {
      logger.warn('Invalid store ID:', storeId)
      return res.status(400).json({
        error: 'STORE_ID_REQUIRED',
        message: 'Store ID is required and must be a positive number'
      })
    }

    // Generate PKCE challenge
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    // Save auth challenge to Firestore
    const db = admin.firestore()
    const authChallengeRef = db
      .collection('martan_auth_challenge')
      .doc(storeId.toString())

    const now = Firestore.FieldValue.serverTimestamp()
    await authChallengeRef.set(
      {
        store_id: storeId,
        code_verifier: codeVerifier,
        code_challenge: codeChallenge,
        created_at: now
      },
      { merge: true }
    )
    // Build OAuth redirect URL
    const redirectUrl = `${baseUri}/martan/auth-callback`
    const state = {
      ecomplus_store_id: storeId
    }

    const url = new URL('/authorize', martanOAuthUIUrl)
    url.searchParams.append('response_type', 'code')
    url.searchParams.append('client_id', clientId)
    url.searchParams.append('redirect_uri', redirectUrl)
    url.searchParams.append('state', JSON.stringify(state))
    url.searchParams.append('code_challenge', codeChallenge)
    url.searchParams.append('code_challenge_method', 'S256')

    // Redirect to OAuth consent screen
    res.redirect(301, url)
  } catch (error) {
    logger.error('Error in request-auth:', error)
    Sentry.captureException(error)
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Unexpected error, please try again'
    })
  }
}
