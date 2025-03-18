const SKIP_TRIGGER_NAME = 'SkipTrigger'
const { logger } = require('firebase-functions')

const cloudCommerceApi = require('./cloudcommerce-api/cloud-api')
const {
  createMetafieldCloudCommerce
} = require('./cloudcommerce-api/create-metafield')
const createMetafield = require('./store-api/create-metafield')

const Sentry = require('./../lib/services/sentry')

module.exports = async ({
  appSdk,
  storeId,
  trigger,
  admin,
  orderBody,
  isCloudCommerce,
  cloudCommerceAuth
}) => {
  try {
    // Validate required parameters
    if (!appSdk || !storeId || !admin) {
      throw new Error('Missing required parameters')
    }

    const orderId =
      trigger?.resource_id || trigger?.inserted_id || orderBody?._id

    if (!orderId) {
      throw new Error('Missing order ID')
    }

    const db = admin.firestore()

    // Check if order already exists
    const existingOrderQuery = await db
      .collection('ecomplus_orders_to_sync')
      .where('order_id', '==', orderId)
      .limit(1)
      .get()
      .catch((error) => {
        logger.error(
          `[Martan/Ecom] Error checking existing order: ${error.message}`,
          {
            orderId,
            storeId,
            error
          }
        )
        throw error
      })

    if (!existingOrderQuery.empty) {
      logger.info(`[Martan/Ecom] Order ${orderId} already exists, skipping`, {
        storeId
      })

      if (existingOrderQuery.docs[0].data().synchronized) {
        try {
          ;(await isCloudCommerce)
            ? createMetafieldCloudCommerce(storeId, orderId, 'successfully')
            : createMetafield({
              appSdk,
              storeId,
              orderId,
              value: 'successfully'
            })
        } catch (error) {
          Sentry.captureException(error)
          logger.error(
            `[Martan/Ecom] Error creating metafield: ${error.message}`,
            { error }
          )
        }
      }
      return Promise.resolve(SKIP_TRIGGER_NAME)
    }

    let order = null
    if (!orderBody && trigger) {
      // Get order data
      const orderRequest = isCloudCommerce
        ? cloudCommerceApi(
          { url: `/orders/${orderId}.json` },
          cloudCommerceAuth
        )
        : appSdk.apiRequest(storeId, `orders/${orderId}.json`)

      order = await orderRequest
        .then((response) => {
          return response.data || response.response.data
        })
        .catch((error) => {
          logger.error(
            `[Martan/Ecom] Error getting order data: ${error.message}`,
            {
              orderId,
              storeId,
              error
            }
          )
          throw error
        })
    } else {
      order = orderBody
    }

    // Check fulfillment status
    if (
      !order?.fulfillment_status ||
      order?.fulfillment_status?.current !== 'delivered'
    ) {
      logger.info(`[Martan/Ecom] Order ${orderId} not delivered, skipping`, {
        storeId,
        status: order.fulfillment_status?.current
      })
      return Promise.resolve(SKIP_TRIGGER_NAME)
    }

    const { items, domain } = order
    if (!items || !Array.isArray(items)) {
      throw new Error('Invalid order items')
    }

    const products = []

    // Get products data with retry mechanism
    const getProducts = async (itemIndex = 0) => {
      if (itemIndex >= items.length) {
        return Promise.resolve()
      }

      const item = items[itemIndex]
      let retries = 0
      const maxRetries = 3

      const fetchProduct = async () => {
        try {
          const url = `/products/${item.product_id}.json`
          const productRequest = isCloudCommerce
            ? cloudCommerceApi({ url }, cloudCommerceAuth)
            : appSdk.apiRequest(storeId, url)

          const data = await productRequest
            .then((response) => response.data || response.response.data)
            .catch((error) => {
              // Verifica se é erro de rate limit (429)
              if (error.response && error.response.status === 429) {
                const err = new Error(
                  'Rate limit exceeded... wait 2s before retry'
                )
                err.isRateLimit = true
                throw err
              }

              logger.error(
                `[Martan/Ecom] Error getting product data: ${error.message}`,
                {
                  storeId,
                  error
                }
              )
              throw error
            })

          const product = {
            product_id: data._id,
            sku: data.sku,
            name: data.name,
            price: data.final_price || data.price || 0,
            url: `https://${domain}/${data.slug}`
          }

          if (data.gtin && Array.isArray(data.gtin)) {
            product.gtin = data.gtin.toString()
          }

          if (data.mpn && Array.isArray(data.mpn)) {
            product.mpn = data.mpn.toString()
          }

          if (item.picture) {
            const pictures = ['normal', 'big']
              .map((size) => item.picture[size]?.url)
              .filter((url) => url)

            if (pictures.length) {
              product.pictures = pictures
            }
          }

          products.push(product)

          // Chama recursivamente para o próximo item
          return getProducts(itemIndex + 1)
        } catch (error) {
          if (error.isRateLimit) {
            // Espera 2 segundos em caso de rate limit
            logger.info(
              `[Martan/Ecom] Rate limit reached for product ${item.product_id}, waiting 2s before retry`,
              { storeId }
            )
            await new Promise((resolve) => setTimeout(resolve, 2000))
            return fetchProduct()
          }

          retries++
          logger.error(
            `[Martan/Ecom] Error getting product ${item.product_id} (attempt ${retries}): ${error.message}`,
            {
              storeId,
              error
            }
          )

          if (retries === maxRetries) {
            logger.error(
              `[Martan/Ecom] Max retries reached for product ${item.product_id}`,
              { storeId }
            )
            // Continua para o próximo item mesmo com falha
            return getProducts(itemIndex + 1)
          } else {
            await new Promise((resolve) => setTimeout(resolve, 1000 * retries))
            return fetchProduct()
          }
        }
      }

      return fetchProduct()
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
    await getProducts()

    // Process customers data
    const customers = []
    const { buyers } = order

    if (buyers && Array.isArray(buyers) && buyers.length) {
      const buyer = buyers[0] // Only first buyer supported
      if (buyer) {
        const customer = {
          name: buyer.display_name,
          email: buyer.main_email
        }

        if (buyer.name) {
          const { name } = buyer
          customer.name = [name.given_name, name.middle_name, name.family_name]
            .filter((n) => n)
            .join(' ')
        }

        if (buyer.phones && buyer.phones[0]) {
          customer.phone = buyer.phones[0].number
        }

        customers.push(customer)
      }
    }

    // Get delivery date
    const deliveredData =
      order.fulfillments?.find((ful) => ful.status === 'delivered')
        ?.date_time || order.updated_at

    // Prepare order data
    const data = {
      created_at: new Date(),
      order_id: order._id,
      store_id: storeId,
      order_date: order.created_at,
      delivery_date: deliveredData,
      synchronized: false,
      products,
      customers,
      is_cloud_commerce: isCloudCommerce
    }

    // Save to Firestore
    await db
      .collection('ecomplus_orders_to_sync')
      .add(data)
      .catch((error) => {
        logger.error(
          `[Martan/Ecom] Error saving order to Firestore: ${error.message}`,
          {
            orderId,
            storeId,
            error
          }
        )
        throw error
      })
  } catch (error) {
    logger.error(`[Martan/Ecom] Unhandled error: ${error.message}`, {
      error,
      storeId
    })
    throw error
  }
}
