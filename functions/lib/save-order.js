const SKIP_TRIGGER_NAME = 'SkipTrigger'

module.exports = async ({ appSdk, appData, storeId, trigger, admin }) => {
  const orderId = trigger.resource_id || trigger.inserted_id
  const db = admin.firestore()
  const existingOrderQuery = await db.collection('ecomplus_orders_to_sync')
    .where('order_id', '==', orderId)
    .limit(1)
    .get()

  if (!existingOrderQuery.empty) {
    return Promise.resolve(SKIP_TRIGGER_NAME)
  }

  const order = await appSdk
    .apiRequest(storeId, `orders/${orderId}.json`)
    .then(async ({ response }) => response.data)

  if (
    !order.fulfillment_status ||
    (order.fulfillment_status &&
      order.fulfillment_status.current &&
      order.fulfillment_status.current !== 'delivered')
  ) {
    // ignore current trigger
    return Promise.resolve(SKIP_TRIGGER_NAME)
  }

  const store = await appSdk
    .apiRequest(storeId, '/stores/me.json', 'GET')
    .then(({ response }) => response.data)

  const { items } = order
  const products = []
  // const products = items.map((item) => {
  //   const product = {
  //     product_id: item.product_id,
  //     sku: item.sku,
  //     name: item.name,
  //     price: item.final_price || item.price || 10,
  //     url: item.permalink || `https://${store.domain}/${item.sku}`,
  //   };

  //   if (item.picture) {
  //     const pictures = ["normal", "big"].map((size) => {
  //       if (item?.picture[size]) {
  //         return item.picture[size].url;
  //       }
  //     });

  //     if (pictures.find((p) => p !== null)) {
  //       product.pictures = pictures.filter((pp) => typeof pp === "string");
  //     }
  //   }

  //   return product;
  // });
  async function getProducts () {
    return new Promise((resolve) => {
      let productIndex = 0

      const start = async function () {
        if (items[productIndex]) {
          // const { data, error, status } = await fetchProductBody({
          //   appState,
          //   _id: items[productIndex].product_id,
          // });
          const { data, status } = await appSdk
            .apiRequest(
              storeId,
              `products/${items[productIndex].product_id}.json`
            )
            .then(async ({ response }) => response)

          if (data) {
            const product = {
              product_id: data._id,
              sku: data.sku,
              name: data.name,
              price: data.final_price || data.price || 0,
              url: `https://${store.domain}/${data.slug}`
            }

            if (data.gtin && Array.isArray(data.gtin)) {
              product.gtin = data.gtin.toString()
            }

            if (data.mpn && Array.isArray(data.mpn)) {
              product.mpn = data.mpn.toString()
            }

            if (items[productIndex] && items[productIndex].picture) {
              const pictures = ['normal', 'big'].map((size) => {
                if (items[productIndex].picture[size]) {
                  return items[productIndex].picture[size].url
                }
              })

              if (pictures.find((p) => p !== null)) {
                product.pictures = pictures.filter(
                  (pp) => typeof pp === 'string'
                )
              }
            }

            products.push(product)
            productIndex++
            setTimeout(async () => {
              await start()
            }, 100)
          } else if (error && status >= 500) {
            setTimeout(async () => {
              await start()
            }, 1500)
          }
        } else {
          return resolve(true)
        }
      }

      start()
    })
  }

  await getProducts()
  const customers = []

  const { buyers } = order
  if (buyers && Array.isArray(buyers) && buyers.length) {
    // only the first buyer is supported by now :/
    const customer = {}
    for (let b = 0; b <= 0; b++) {
      const buyer = buyers[b]
      if (buyer.name) {
        const { name } = buyer
        if (name.given_name) {
          customer.name = name.given_name
        }

        if (name.middle_name) {
          customer.name = `${customer.name} ${name.middle_name}`
        }

        if (name.family_name) {
          customer.name = `${customer.name} ${name.family_name}`
        }
      } else {
        customer.name = buyer.display_name
      }

      customer.email = buyer.main_email

      if (buyer.phones && Array.isArray(buyer.phones) && buyer.phones.length) {
        const { phones } = buyer
        for (let p = 0; p <= 0; p++) {
          const phone = phones[p]
          customer.phone = phone.number
        }
      }
    }

    customers.push(customer)
  }

  let deliveredData = order.updated_at

  if (order.fulfillments) {
    const fulfillment = order.fulfillments.find(
      (ful) => ful.status === 'delivered'
    )
    if (fulfillment && fulfillment.date_time) {
      deliveredData = fulfillment.date_time
    }
  }

  const data = {
    created_at: new Date(),
    order_id: order._id,
    store_id: storeId,
    order_date: order.created_at,
    delivery_date: deliveredData,
    synchronized: false,
    products,
    customers
  }
  await db.collection('ecomplus_orders_to_sync').add(data)
}
