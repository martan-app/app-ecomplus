const martan = require('./')
const getAuth = require('../get-auth')
const functions = require('firebase-functions')

async function handler ({ order, context, db }) {
  const storeId = order.store_id
  const data = order
  delete data.created_at
  delete data.store_id
  delete data.synchronized

  const auth = await getAuth({ db, storeId })

  martan({
    method: 'post',
    url: '/orders.json',
    headers: {
      'X-Store-Id': auth.martan_id,
      'X-Token': auth.access_token
    },
    data
  })
    .then((response) => {
      console.log(response)
      functions.logger.log(
        `Pedido enviado com sucesso para Martan: ${context.params.order_id}`,
        { data: response.data, order }
      )
      return db
        .collection('ecomplus_orders_to_sync')
        .doc(context.params.order_id)
        .update({
          synchronized: true
        })
    })
    .catch((error) => {
      console.error(error)
      const erros = [
        db
          .collection('ecomplus_orders_to_sync')
          .doc(context.params.order_id)
          .update({
            failed: true
          }),
        db
          .collection('ecomplus_orders_sync_error')
          .doc(context.params.order_id)
          .set({
            errorDetails: error.message,
            context,
            order
          })
      ]

      return Promise.all(erros)
    })
}

module.exports = handler
