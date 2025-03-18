const { logger } = require('firebase-functions')
// read configured E-Com Plus app data
const getAppData = require('./../../lib/store-api/get-app-data')
// const saveOrder = require('./../../lib/save-order')
const getAuth = require('../../lib/auth/get-auth')
const addOrders = require('../../pubsub/orders/add-orders')

const SKIP_TRIGGER_NAME = 'SkipTrigger'
const ECHO_SUCCESS = 'SUCCESS'
const ECHO_SKIP = 'SKIP'
const ECHO_API_ERROR = 'STORE_API_ERR'

exports.post = ({ appSdk, admin }, req, res) => {
  // receiving notification from Store API
  const { storeId } = req

  /**
   * Treat E-Com Plus trigger body here
   * Ref.: https://developers.e-com.plus/docs/api/#/store/triggers/
   */
  const trigger = req.body

  // get app configured options
  getAppData({ appSdk, storeId })
    .then(async (appData) => {
      if (
        Array.isArray(appData.ignore_triggers) &&
        appData.ignore_triggers.indexOf(trigger.resource) > -1
      ) {
        // ignore current trigger
        const err = new Error()
        err.name = SKIP_TRIGGER_NAME
        throw err
      }

      const auth = await getAuth({ db: admin.firestore(), storeId })
        .catch((err) => {
          logger.error(`Error getting auth for store ${storeId}`, err)
          return null
        })

      /* DO YOUR CUSTOM STUFF HERE */
      if (!auth || !auth.access_token || !auth.martan_id) {
        const err = new Error()
        err.name = SKIP_TRIGGER_NAME
        throw err
      }

      switch (trigger.resource) {
        case 'orders': {
          logger.info(`[#${storeId}][Webhook] Recebendo pedido: ${trigger.resource_id}`)
          // return saveOrder({ appSdk, storeId, trigger, admin })
          return await addOrders({ trigger, isCloudCommerce: false, storeId })
          // return Promise.resolve()
        }
        case 'products':
          return Promise.resolve()
        default:
          break
      }
      // all done
    })
    .then(() => res.send(ECHO_SUCCESS))
    .catch((err) => {
      if (err.name === SKIP_TRIGGER_NAME) {
        // trigger ignored by app configuration
        res.send(ECHO_SKIP)
      } else if (err.appWithoutAuth === true) {
        const msg = `Webhook for ${storeId} unhandled with no authentication found`
        const error = new Error(msg)
        error.trigger = JSON.stringify(trigger)
        logger.error(error)
        res.status(412).send(msg)
      } else {
        logger.error(err)
        // request to Store API with error response
        // return error status code
        res.status(500)
        const { message } = err
        res.send({
          error: ECHO_API_ERROR,
          message
        })
      }
    })
}
