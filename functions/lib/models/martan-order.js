/**
 * Parses a product item from an order and retrieves detailed product information
 * from the store's API.
 * @param {Object} appSdk - The application SDK for making API requests
 * @param {Object} item - The order item containing product details
 * @param {Object} store - The store object containing domain information
 * @param {string} storeId - The store ID
 * @returns {Promise<Object>} Product object with detailed information
 */
async function parseProduct (appSdk, item, store, storeId) {
  const { response } = await appSdk.apiRequest(storeId, `products/${item.product_id}.json`)
  const { data } = response

  const product = {
    product_id: data._id,
    sku: data.sku,
    name: data.name,
    price: data.final_price || data.price || 0,
    url: `https://${store.domain}/${data.slug}`
  }

  // Handle GTIN and MPN arrays
  if (Array.isArray(data.gtin)) {
    product.gtin = data.gtin.join(',')
  }
  if (Array.isArray(data.mpn)) {
    product.mpn = data.mpn.join(',')
  }

  // Handle product pictures
  if (item.picture) {
    const pictures = ['normal', 'big']
      .map(size => item.picture[size]?.url)
      .filter(url => typeof url === 'string')

    if (pictures.length) {
      product.pictures = pictures
    }
  }

  return product
}

/**
 * Parses customer information from order buyers
 * @param {Object} buyer - The buyer object from order
 * @returns {Object} Parsed customer data
 */
function parseCustomer (buyer) {
  const customer = {}

  // Parse customer name
  if (buyer.name) {
    const { name } = buyer
    customer.name = [
      name.given_name,
      name.middle_name,
      name.family_name
    ].filter(Boolean).join(' ')
  } else {
    customer.name = buyer.display_name
  }

  // Set email and phone
  customer.email = buyer.main_email
  if (buyer.phones?.[0]?.number) {
    customer.phone = buyer.phones[0].number
  }

  return customer
}

/**
 * Parses an order to Martan format
 * @param {Object} appSdk - The application SDK for making API requests
 * @param {Object} order - The order object
 * @param {Object} store - The store object
 * @param {string} storeId - The store ID
 * @returns {Promise<Object>} Parsed order data
 */
async function parseOrderToMartan (appSdk, order, store, storeId) {
  // Parse products with delay between requests
  const products = []
  for (const item of order.items) {
    const product = await parseProduct(appSdk, item, store, storeId)
    products.push(product)
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  // Parse customers
  const customers = []
  if (order.buyers?.length) {
    const customer = parseCustomer(order.buyers[0])
    customers.push(customer)
  }

  // Get delivery date
  const deliveredData = order.fulfillments?.find(f => f.status === 'delivered')?.date_time || order.updated_at

  return {
    created_at: new Date(),
    order_id: order._id,
    store_id: storeId,
    order_date: order.created_at,
    delivery_date: deliveredData,
    synchronized: false,
    products,
    customers
  }
}

module.exports = parseOrderToMartan
