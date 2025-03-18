#!/usr/bin/env node
const Sentry = require('./lib/services/sentry')

const { functionName, operatorToken } = require('./__env')

const path = require('path')
const recursiveReadDir = require('./lib/recursive-read-dir')

// Firebase SDKs to setup cloud functions and access Firestore database
const admin = require('firebase-admin')
const functions = require('firebase-functions')

admin.initializeApp()

// web server with Express
const express = require('express')
const bodyParser = require('body-parser')
const server = express()
const router = express.Router()
const routes = './routes'

// enable/disable some E-Com common routes based on configuration
const { app, procedures } = require('./ecom.config')

// handle app authentication to Store API
// https://github.com/ecomplus/application-sdk
const { ecomServerIps, setup } = require('@ecomplus/application-sdk')

// Configure express middleware with limits
server.use(
  bodyParser.urlencoded({
    extended: false,
    limit: '1mb'
  })
)

server.use(
  bodyParser.json({
    limit: '1mb'
  })
)

// Add request timeout
server.use((req, _res, next) => {
  req.setTimeout(30000) // 30 seconds timeout
  next()
})

// Add error handling middleware
server.use((err, _req, res, _next) => {
  functions.logger.error(err.stack)
  Sentry.captureException(err)
  res.status(500).json({
    error: 'Internal server error',
    message:
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'An unexpected error occurred'
  })
})

server.use((req, res, next) => {
  try {
    if (req.url.startsWith('/ecom/')) {
      // get E-Com Plus Store ID from request header
      req.storeId = parseInt(req.get('x-store-id') || req.query.store_id, 10)

      if (!req.storeId) {
        return res.status(400).json({
          error: 'Missing store_id'
        })
      }

      if (req.url.startsWith('/ecom/modules/')) {
        // request from Mods API
        // https://github.com/ecomclub/modules-api
        const { body } = req
        if (
          typeof body !== 'object' ||
          body === null ||
          !body.params ||
          !body.application
        ) {
          return res.status(406).json({
            error: 'Invalid request body',
            message: 'Request not coming from Mods API'
          })
        }
      }

      if (process.env.NODE_ENV !== 'development') {
        if (req.query.store_access_token) {
          // check authentication access token with Store API
          // GET /(auth).json
        }
        // check for operator token
        if (
          operatorToken !==
          (req.get('x-operator-token') || req.query.operator_token)
        ) {
          // last check for IP address from E-Com Plus servers
          const clientIp =
            req.get('x-forwarded-for') || req.connection.remoteAddress
          if (!clientIp || ecomServerIps.indexOf(clientIp) === -1) {
            return res.status(403).json({
              error: 'Unauthorized',
              message: 'Invalid IP address'
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

router.get('/', (req, res) => {
  try {
    // pretty print application body
    server.set('json spaces', 2)
    require(`${routes}/`)(req, res)
  } catch (err) {
    functions.logger.error('Error handling root route:', err)
    res.status(500).json({
      error: 'Root route error',
      message:
        process.env.NODE_ENV === 'development'
          ? err.message
          : 'Failed to handle request'
    })
  }
})

const prepareAppSdk = async () => {
  try {
    // debug ecomAuth processes and ensure enable token updates by default
    process.env.ECOM_AUTH_DEBUG = 'true'
    process.env.ECOM_AUTH_UPDATE = 'enabled'
    // setup ecomAuth client with Firestore instance
    return await setup(null, true, admin.firestore())
  } catch (err) {
    functions.logger.error('Error preparing AppSdk:', err)
    Sentry.captureException(err)
    throw err
  }
}

exports.prepareAppSdk = prepareAppSdk

// base routes for E-Com Plus Store API
const routesDir = path.join(__dirname, routes)
recursiveReadDir(routesDir)
  .filter((filepath) => filepath.endsWith('.js'))
  .forEach((filepath) => {
    try {
      // set filename eg.: '/ecom/auth-callback'
      let filename = filepath.replace(routesDir, '').replace(/\.js$/i, '')
      if (path.sep !== '/') {
        filename = filename.split(path.sep).join('/')
      }
      if (filename.charAt(0) !== '/') {
        filename = `/${filename}`
      }
      // ignore some routes
      switch (filename) {
        case '/index':
          // home already set
          return
        case '/ecom/webhook':
          // don't need webhook endpoint if no procedures configured
          if (!procedures.length) {
            return
          }
          break
        default:
          if (filename.startsWith('/ecom/modules/')) {
            // check if module is enabled
            const modName = filename.split('/').pop().replace(/-/g, '_')
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
                error: 'SETUP',
                message:
                  "Can't setup `ecomAuth`, check Firebase console registers"
              })
            }
          })
        }
      }
    } catch (err) {
      functions.logger.error('Error setting up route:', err)
    }
  })

server.use(router)

exports[functionName] = functions.https.onRequest(server)

functions.logger.info(
  `-- Starting '${app.title}' E-Com Plus app with Function '${functionName}'`
)

const { ecomplusUpdateTokens } = require('./scheduled/ecomplus/update-tokens')
const { ecomplusUpdateTokensCC } = require('./scheduled/ecomplus/update-tokens-cc')
const { martanUpdateTokens } = require('./scheduled/martan/update-tokens')
const { onNewOrder } = require('./events/ecomplus/on-new-order')
const { onOrderUpdate } = require('./events/ecomplus/on-update-order')
const { syncOrders, syncOrdersCloudCommerce } = require('./scheduled/ecomplus/sync-orders')
const { processOrders } = require('./pubsub/orders/process-orders')

exports.ecomplusUpdateTokens = ecomplusUpdateTokens
exports.ecomplusUpdateTokensCC = ecomplusUpdateTokensCC
exports.martanUpdateTokens = martanUpdateTokens
exports.onNewOrder = onNewOrder
exports.onOrderUpdate = onOrderUpdate
exports.syncOrders = syncOrders
exports.syncOrdersCloudCommerce = syncOrdersCloudCommerce
exports.processOrders = processOrders
// exports.processOrders = functions
//   .pubsub
//   .topic('process-orders')
//   .onPublish((message) => {
//     const data = message.json
//     console.log('Recebi um pedido:', data)
//     return null
//   })
