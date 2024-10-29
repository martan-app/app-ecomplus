'use strict'
const { Firestore } = require('firebase-admin/firestore')
const {
  clientId,
  martanOAuthUIUrl,
  baseUri
} = require('../../__env')
const {
  generateCodeVerifier,
  generateCodeChallenge
} = require('../../utils/pkce')
const getAppData = require('../../lib/store-api/get-app-data')
exports.get = async ({ admin, appSdk }, req, res) => {
  const { query } = req
  const storeId =
    query.x_store_id ||
    query.storeId ||
    parseInt(req.get('x-store-id') || req.get('store'), 10)

  if (!storeId) {
    return res.status(400).send('X-Store-Id not found at request.')
  }

  const appData = await getAppData({ appSdk, storeId }).catch(() => null)
  if (!appData) {
    return res.status(400).send('Você precisa instalar o app Martan na sua loja. https://app.e-com.plus/#/apps')
  }
  const redirectUrl = baseUri + '/martan/auth-callback'
  const state = {
    ecomplus_store_id: storeId
  }
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const db = admin.firestore()
  const authChallengeRef = db
    .collection('ecomplus_auth_challenge')
    .doc(storeId.toString())

  try {
    const now = Firestore.FieldValue.serverTimestamp()
    const inserted = await authChallengeRef.set(
      {
        store_id: storeId,
        code_verifier: codeVerifier,
        code_challenge: codeChallenge,
        updated_at: now,
        created_at: now
      },
      { merge: true }
    )
    console.log(inserted)
  } catch (error) {
    console.error('Error saving auth challenge:', error)
    return res.status(500).send('Internal server error')
  }

  const url = `${martanOAuthUIUrl}/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUrl
  )}&state=${encodeURIComponent(JSON.stringify(state))}&code_challenge=${codeChallenge}&code_challenge_method=S256`
  res.redirect(301, url)
}
