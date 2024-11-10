const axios = require('axios')
const qs = require('querystring')
const { baseUri, martanOAuthUrl, clientId, clientSecret } = require('../../__env')
async function getAccessToken (code, storeId, admin) {
  // const tokenUrl = 'https://authentication.martan.app/oauth/token'
  // Buscar o documento na coleção ecomplus_auth_challenge usando where
  const db = admin.firestore()
  const challengeQuery = await db
    .collection('ecomplus_auth_challenge')
    .doc(storeId.toString())
    .get()

  if (challengeQuery.empty) {
    throw new Error('ecomplus_auth_challenge error, challenge not found')
  }

  const challengeData = challengeQuery.data()
  const tokenUrl = martanOAuthUrl + '/oauth/token'

  const redirectUrl = baseUri + '/martan/auth-callback'

  const data = qs.stringify({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUrl,
    code_verifier: challengeData.code_verifier
  })

  try {
    const response = await axios.post(tokenUrl, data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    // remove chalenge from db
    await challengeQuery.ref.delete()
    return response.data
  } catch (error) {
    console.log(error)
    console.error(
      'Erro ao obter o token de acesso:',
      error.response?.data || error.message
    )
    throw error
  }
}

async function refreshToken (refresh) {
  const tokenUrl = martanOAuthUrl + '/oauth/token'

  const data = qs.stringify({
    grant_type: 'refresh_token',
    refresh_token: refresh
  })

  try {
    const response = await axios.post(tokenUrl, data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  } catch (error) {
    console.error(
      'Erro ao obter o token de acesso:',
      error.response?.data || error.message
    )
    throw error
  }
}

module.exports = { getAccessToken, refreshToken }
