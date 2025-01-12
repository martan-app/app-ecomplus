#!/usr/bin/env node

const { functionName, operatorToken } = require("./__env")

const path = require("path")
const recursiveReadDir = require("./lib/recursive-read-dir")

// Firebase SDKs to setup cloud functions and access Firestore database
const admin = require("firebase-admin")
const functions = require("firebase-functions")
admin.initializeApp()

// web server with Express
const express = require("express")
const bodyParser = require("body-parser")
const server = express()
const router = express.Router()
const routes = "./routes"

// enable/disable some E-Com common routes based on configuration
const { app, procedures } = require("./ecom.config")

// handle app authentication to Store API
// https://github.com/ecomplus/application-sdk
const { ecomServerIps, setup } = require("@ecomplus/application-sdk")

const sendOrdersToMartan = require("./lib/martan-api/sync-order")
const { checkTokensForCloudCommerce } = require("./ecom/cloud-commerce-auth")

// Configure express middleware with limits
server.use(
  bodyParser.urlencoded({
    extended: false,
    limit: "1mb",
  })
)
server.use(
  bodyParser.json({
    limit: "1mb",
  })
)

// Add request timeout
server.use((req, res, next) => {
  req.setTimeout(30000) // 30 seconds timeout
  next()
})

// Add error handling middleware
server.use((err, req, res, next) => {
  functions.logger.error(err.stack)
  res.status(500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "An unexpected error occurred",
  })
})

server.use((req, res, next) => {
  try {
    if (req.url.startsWith("/ecom/")) {
      // get E-Com Plus Store ID from request header
      req.storeId = parseInt(req.get("x-store-id") || req.query.store_id, 10)

      if (!req.storeId) {
        return res.status(400).json({
          error: "Missing store_id",
        })
      }

      if (req.url.startsWith("/ecom/modules/")) {
        // request from Mods API
        // https://github.com/ecomclub/modules-api
        const { body } = req
        if (
          typeof body !== "object" ||
          body === null ||
          !body.params ||
          !body.application
        ) {
          return res.status(406).json({
            error: "Invalid request body",
            message: "Request not coming from Mods API",
          })
        }
      }

      if (process.env.NODE_ENV !== "development") {
        if (req.query.store_access_token) {
          // check authentication access token with Store API
          // GET /(auth).json
        }
        // check for operator token
        if (
          operatorToken !==
          (req.get("x-operator-token") || req.query.operator_token)
        ) {
          // last check for IP address from E-Com Plus servers
          const clientIp =
            req.get("x-forwarded-for") || req.connection.remoteAddress
          if (!clientIp || ecomServerIps.indexOf(clientIp) === -1) {
            return res.status(403).json({
              error: "Unauthorized",
              message: "Invalid IP address",
            })
          }
        }
      }
    }
    next()
  } catch (err) {
    next(err)
  }
})

router.get("/", (req, res) => {
  try {
    // pretty print application body
    server.set("json spaces", 2)
    require(`${routes}/`)(req, res)
  } catch (err) {
    functions.logger.error("Error handling root route:", err)
    res.status(500).json({
      error: "Root route error",
      message:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Failed to handle request",
    })
  }
})

const prepareAppSdk = async () => {
  try {
    // debug ecomAuth processes and ensure enable token updates by default
    process.env.ECOM_AUTH_DEBUG = "true"
    process.env.ECOM_AUTH_UPDATE = "enabled"
    // setup ecomAuth client with Firestore instance
    return await setup(null, true, admin.firestore())
  } catch (err) {
    functions.logger.error("Error preparing AppSdk:", err)
    throw err
  }
}

// base routes for E-Com Plus Store API
const routesDir = path.join(__dirname, routes)
recursiveReadDir(routesDir)
  .filter((filepath) => filepath.endsWith(".js"))
  .forEach((filepath) => {
    try {
      // set filename eg.: '/ecom/auth-callback'
      let filename = filepath.replace(routesDir, "").replace(/\.js$/i, "")
      if (path.sep !== "/") {
        filename = filename.split(path.sep).join("/")
      }
      if (filename.charAt(0) !== "/") {
        filename = `/${filename}`
      }
      // ignore some routes
      switch (filename) {
        case "/index":
          // home already set
          return
        case "/ecom/webhook":
          // don't need webhook endpoint if no procedures configured
          if (!procedures.length) {
            return
          }
          break
        default:
          if (filename.startsWith("/ecom/modules/")) {
            // check if module is enabled
            const modName = filename.split("/").pop().replace(/-/g, "_")
            if (
              !app.modules ||
              !app.modules[modName] ||
              app.modules[modName].enabled === false
            ) {
              return
            }
          }
      }

      // expecting named exports with HTTP methods
      const methods = require(`${routes}${filename}`)
      for (const method in methods) {
        const middleware = methods[method]
        if (middleware) {
          router[method](filename, async (req, res) => {
            functions.logger.info(`${method} ${filename}`)
            try {
              const appSdk = await prepareAppSdk()
              await middleware({ appSdk, admin }, req, res)
            } catch (err) {
              functions.logger.error(
                `Error handling ${method} ${filename}:`,
                err
              )
              res.status(500).json({
                error: "SETUP",
                message:
                  "Can't setup `ecomAuth`, check Firebase console registers",
              })
            }
          })
        }
      }
    } catch (err) {
      functions.logger.error("Error setting up route:", err)
    }
  })

server.use(router)

exports[functionName] = functions.https.onRequest(server)
functions.logger.info(
  `-- Starting '${app.title}' E-Com Plus app with Function '${functionName}'`
)

// schedule update tokens job
const ecomCron = "25 */3 * * *"
exports.updateTokensEcomplus = functions.pubsub
  .schedule(ecomCron)
  .onRun(async () => {
    functions.logger.info("Starting E-Com Plus tokens update")
    try {
      const appSdk = await prepareAppSdk()
      await appSdk.updateTokens()
      functions.logger.info("E-Com Plus tokens updated successfully")
    } catch (error) {
      functions.logger.error("Error updating E-Com Plus tokens:", error)
      throw error // Rethrowing to trigger retry
    }
  })

const martanCron = "3 */3 * * *"
exports.updateTokensMartan = functions.pubsub
  .schedule(martanCron)
  .onRun(async () => {
    functions.logger.info("Starting Martan tokens update")
    try {
      await require("./lib/update-tokens")(admin)
      functions.logger.info("Martan tokens updated successfully")
    } catch (error) {
      functions.logger.error("Error updating Martan tokens:", error)
      throw error // Rethrowing to trigger retry
    }
  })

const checkOrdersDeliveredCron = "*/30 * * * *"
exports.checkOrdersDelivered = functions.pubsub
  .schedule(checkOrdersDeliveredCron)
  .onRun(async () => {
    functions.logger.info("Starting checkOrdersDelivered")
    try {
      await require("./lib/check-orders-delivered")()
      functions.logger.info("checkOrdersDelivered completed successfully")
    } catch (error) {
      functions.logger.error("Error checking delivered orders:", error)
      throw error // Rethrowing to trigger retry
    }
  })

const checkTokensForCloudCommerceCron = "*/15 * * * *"
exports.checkTokensForCloudCommerce = functions.pubsub
  .schedule(checkTokensForCloudCommerceCron)
  .onRun(async () => {
    functions.logger.info("Starting checkOrdersDelivered for Cloud Commerce")
    try {
      await require("./lib/check-orders-delivered")(true)
      functions.logger.info("checkOrdersDelivered completed successfully")
    } catch (error) {
      functions.logger.error("Error checking delivered orders:", error)
      throw error // Rethrowing to trigger retry
    }
  })

exports.onNewOrder = functions.firestore
  .document("ecomplus_orders_to_sync/{order_id}")
  .onCreate(async (snap, context) => {
    functions.logger.info("Processing new order:", context.params.order_id)
    const order = snap.data()
    try {
      const appSdk = await prepareAppSdk()
      await sendOrdersToMartan({
        db: admin.firestore(),
        order,
        appSdk,
        context,
      })
      functions.logger.info(
        "Order processed successfully:",
        context.params.order_id
      )
    } catch (error) {
      functions.logger.error(
        "Error syncing order:",
        context.params.order_id,
        error
      )
      throw error // Rethrowing to trigger retry
    }
  })

exports.onOrderUpdate = functions.firestore
  .document("ecomplus_orders_to_sync/{order_id}")
  .onUpdate(async (change, context) => {
    functions.logger.info("Processing order update:", context.params.order_id)
    const newData = change.after.data()
    const previousData = change.before.data()

    if (newData.synchronized === true && previousData.synchronized !== true) {
      try {
        if (newData.is_cloud_commerce) {
          await require("./lib/cloudcommerce-api/create-metafield")(
            newData.store_id,
            newData.order_id
          )
        } else {
          const appSdk = await prepareAppSdk()
          await require("./lib/store-api/create-metafield")(
            {
              appSdk,
              storeId: newData.store_id,
            },
            newData.order_id
          )
        }
        functions.logger.info(
          "Metafield created successfully for order:",
          context.params.order_id
        )
        return true
      } catch (error) {
        functions.logger.error(
          "Error creating metafield for order:",
          context.params.order_id,
          error
        )
        throw error // Rethrowing to trigger retry
      }
    }
    return null
  })

exports.checkTokensForCloudCommerce = checkTokensForCloudCommerce

functions.logger.info(`-- Scheduled update E-Com Plus tokens '${ecomCron}'`)
functions.logger.info(`-- Scheduled update Martan tokens '${martanCron}'`)
