const { logger } = require("firebase-functions")
const { Firestore } = require("firebase-admin/firestore")

const { getAccessToken } = require("../../lib/martan-api/auth")
const { saveMartanAuth } = require("../../lib/save-auth")
const martan = require("../../lib/martan-api")

exports.get = async ({ admin, appSdk }, req, res) => {
  try {
    const { state, code } = req.query
    if (!state || !code) {
      throw new Error("Missing required query parameters: state and code")
    }

    // Parse state to retrieve store IDs
    const parsedState = JSON.parse(decodeURIComponent(state))
    const { martan_store_id, ecomplus_store_id } = parsedState

    if (!martan_store_id || !ecomplus_store_id) {
      throw new Error("Missing required store IDs in state")
    }

    const storeId = parseInt(ecomplus_store_id)
    const martanId = parseInt(martan_store_id)

    // Validate store IDs
    if (!Number.isInteger(storeId) || storeId <= 0) {
      throw new Error("E-Com Plus Store ID must be a positive integer")
    }
    if (!Number.isInteger(martanId) || martanId <= 0) {
      throw new Error("Martan Store ID must be a positive integer")
    }

    // Get access token from Martan API
    const authData = await getAccessToken(code, storeId, admin)

    // Save auth data to Firestore
    const db = admin.firestore()
    await saveMartanAuth(db, {
      storeId,
      martanId,
      accessToken: authData.access_token,
      refreshToken: authData.refresh_token,
      expiresIn: authData.expires_in,
      updatedAt: Firestore.FieldValue.serverTimestamp(),
    })

    logger.info(`Successfully installed app for store #${storeId}`)
    const ecomAuth = await appSdk.getAuth(storeId)

    await martan({
      method: "post",
      url: "/integrations.json",
      headers: {
        "X-Store-Id": martanId,
        "X-Token": authData.access_token,
      },
      data: {
        application_id: ecomAuth.row.application_id,
        source: "ecomplus",
        authentication_id: ecomAuth.row.authentication_id,
        integration_store_id: ecomAuth.row.store_id,
      },
    }).then(() => {
      logger.info(`Integration created for store #${storeId}`)
    }).catch((error) => {
      logger.error("Error creating integration:", error)
      return null
    })
    // Close popup window
    const fs = require('fs')
    const path = require('path')
    const htmlContent = fs.readFileSync(path.join(__dirname, '../../assets/callback.html'), 'utf8')
    res.status(200).send(htmlContent)
  } catch (error) {
    logger.error("Error in auth callback:", error)
    res.status(500).json({
      error: "auth_callback_error",
      message:
        error.message || "Unexpected error during authentication callback",
    })
  }
}
