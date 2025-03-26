const admin = require('firebase-admin')
const functions = require('firebase-functions')
const { Firestore } = require('firebase-admin/firestore')
const Sentry = require('../../lib/services/sentry')
const martan = require('../../lib/martan-api')
const getAuth = require('../../lib/auth/get-auth')
const createMetafield = require('../../lib/store-api/create-metafield')
const { createMetafieldCloudCommerce } = require('../../lib/cloudcommerce-api/create-metafield')
const { prepareAppSdk } = require('../../index')

/**
 * Busca pedidos não sincronizados com mais de 12 horas e tenta sincronizá-los novamente
 */
module.exports = async () => {
  const db = admin.firestore()
  const appSdk = await prepareAppSdk()

  try {
    // Calcula timestamp de 48 horas atrás
    const fourtyEightHoursAgo = new Date()
    fourtyEightHoursAgo.setHours(fourtyEightHoursAgo.getHours() - 48)

    functions.logger.info('Buscando pedidos não sincronizados com mais de 48 horas')

    // Busca pedidos não sincronizados com created_at anterior a 48 horas atrás
    const querySnapshot = await db.collection('ecomplus_orders_to_sync')
      .where('synchronized', '==', false)
      .where('created_at', '<', fourtyEightHoursAgo)
      .limit(50)
      .get()

    if (querySnapshot.empty) {
      functions.logger.info('Nenhum pedido não sincronizado encontrado')
      return
    }

    functions.logger.info(`Encontrados ${querySnapshot.size} pedidos não sincronizados para reprocessar`)

    // Processa cada pedido
    for (const doc of querySnapshot.docs) {
      const orderId = doc.id
      const order = doc.data()

      functions.logger.info(`Tentando reprocessar pedido ${orderId} da loja #${order.store_id}`)

      try {
        if (!order || !order.store_id) {
          throw new Error('Dados do pedido incompletos')
        }

        const storeId = parseInt(order.store_id, 10)

        // Limpa dados do pedido
        const data = { ...order }
        // Remover campos internos que não devem ser enviados para a API
        const fieldsToRemove = ['created_at', 'store_id', 'synchronized', 'is_cloud_commerce']
        fieldsToRemove.forEach(field => {
          if (Object.prototype.hasOwnProperty.call(data, field)) {
            delete data[field]
          }
        })

        // Obtém autenticação
        const auth = await getAuth({ db, storeId })
        if (!auth?.access_token || !auth?.martan_id) {
          throw new Error('Dados de autenticação inválidos')
        }

        // Envia pedido para API Martan
        await martan({
          method: 'post',
          url: '/orders.json',
          headers: {
            'X-Store-Id': auth.martan_id,
            'X-Token': auth.access_token
          },
          data
        })

        functions.logger.info(`[#${storeId}] Pedido reprocessado com sucesso: ${order.order_id}`)

        // Atualiza status de sincronização
        await db.collection('ecomplus_orders_to_sync').doc(orderId).update({
          synchronized: true,
          updated_at: Firestore.FieldValue.serverTimestamp()
        })
      } catch (error) {
        functions.logger.error(`Erro ao reprocessar pedido ${orderId}:`, error.message)

        // Atualiza timestamp para evitar processamento repetido imediato
        await db.collection('ecomplus_orders_to_sync').doc(orderId).update({
          updated_at: Firestore.FieldValue.serverTimestamp(),
          retry_count: Firestore.FieldValue.increment(1)
        })

        // Registra erro detalhado
        await db.collection('ecomplus_orders_sync_error').doc(orderId).set({
          timestamp: Firestore.FieldValue.serverTimestamp(),
          order,
          error: error.message,
          retry: true
        })

        // Se for erro 400 com código específico, marca como falha permanente
        if (error.response?.status === 400) {
          const { data } = error.response
          const criticalErrorCodes = [802030, 520, 81211]

          if (criticalErrorCodes.includes(data?.error_code)) {
            await db.collection('ecomplus_orders_to_sync').doc(orderId).update({
              failed: true,
              error_code: data.error_code
            })

            // Cria metafield indicando falha
            try {
              const metafieldReq = order.is_cloud_commerce
                ? createMetafieldCloudCommerce(order.store_id, order.order_id, 'failed')
                : createMetafield({
                  appSdk,
                  storeId: order.store_id,
                  orderId: order.order_id,
                  value: 'failed'
                })

              await metafieldReq
            } catch (metafieldError) {
              functions.logger.error(`Erro ao criar metafield para pedido ${orderId}:`, metafieldError)
            }
          }
        }
      }

      // Aguarda entre processamentos para evitar sobrecarga
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    functions.logger.info('Processamento de pedidos não sincronizados concluído')
  } catch (error) {
    functions.logger.error('Erro ao processar pedidos não sincronizados:', error)
    Sentry.captureException(error)
    throw error
  }
}
