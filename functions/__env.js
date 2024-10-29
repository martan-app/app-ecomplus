require('dotenv').config()
// setup server and app options from Functions config (and mocks)
const { GCLOUD_PROJECT, FIREBASE_CONFIG, FUNCTION_REGION, CLIENT_ID, CLIENT_SECRET, MARTAN_OAUTH_URL, MARTAN_OAUTH_UI_URL } = process.env
const { pkg, server } = require('firebase-functions').config()

let projectId = GCLOUD_PROJECT
if (!projectId && FIREBASE_CONFIG) {
  projectId = JSON.parse(FIREBASE_CONFIG).projectId
}
const region = FUNCTION_REGION || 'us-central1'
const functionName = server.functionName || 'app'

module.exports = {
  functionName,
  operatorToken: server && server.operator_token,
  baseUri: (server && server.base_uri) ||
    `https://${region}-${projectId}.cloudfunctions.net/${functionName}`,
  hostingUri: `https://${projectId}.web.app`,
  pkg: {
    ...pkg
  },
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  martanOAuthUrl: MARTAN_OAUTH_URL,
  martanOAuthUIUrl: MARTAN_OAUTH_UI_URL
}
