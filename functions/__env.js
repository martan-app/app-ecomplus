const { pkg, server, auth } = require("firebase-functions").config()
// setup server and app options from Functions config (and mocks)
const {
  GCLOUD_PROJECT,
  FIREBASE_CONFIG,
  FUNCTION_REGION,
  CLIENT_ID,
  CLIENT_SECRET,
  MARTAN_OAUTH_URL,
  MARTAN_OAUTH_UI_URL,
} = process.env

let projectId = GCLOUD_PROJECT
if (!projectId && FIREBASE_CONFIG) {
  projectId = JSON.parse(FIREBASE_CONFIG).projectId
}

const region = FUNCTION_REGION || "us-central1"
const functionName = server.functionName || "app"

module.exports = {
  functionName,
  operatorToken: server && server.operator_token,
  baseUri:
    (server && server.base_uri) ||
    `https://${region}-${projectId}.cloudfunctions.net/${functionName}`,
  hostingUri: `https://${projectId}.web.app`,
  pkg: {
    ...pkg,
  },
  clientId: CLIENT_ID || (auth && auth.client_id),
  clientSecret: CLIENT_SECRET || (auth && auth.client_secret),
  martanOAuthUrl: MARTAN_OAUTH_URL || (auth && auth.martan_oauth_url),
  martanOAuthUIUrl: MARTAN_OAUTH_UI_URL || (auth && auth.martan_oauth_ui_url),
}
