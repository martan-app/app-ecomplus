const { logger } = require('firebase-functions')

const Sentry = require('../services/sentry')

module.exports = async ({ db, storeId }) => {
  if (!db || !storeId) {
    logger.error('Missing required parameters for getAuth', { storeId })
    throw new Error('Missing required parameters')
  }

  try {
    const martanAuthRef = db.collection('martan_app_auth')

    // Verificando se storeId é uma string ou número
    const storeIdValue = typeof storeId === 'string' ? parseInt(storeId, 10) : storeId

    const query = martanAuthRef
      .where('store_id', '==', storeIdValue)
      // .orderBy('updated_at', 'desc')
      .limit(1)

    const docs = await query.get()
    // Verificando se existem documentos na coleção
    const allDocs = await martanAuthRef.get()

    if (docs.empty) {
      // Listando alguns documentos para verificar o formato dos dados
      if (allDocs.size > 0) {
        const sampleDoc = allDocs.docs[0].data()
        logger.debug('Exemplo de documento na coleção:', {
          store_id: sampleDoc.store_id,
          tipo_store_id: typeof sampleDoc.store_id
        })
      }

      logger.info(`Nenhuma autenticação encontrada para loja #${storeIdValue}`)
      return null
    }

    const authData = docs.docs[0].data()
    return authData
  } catch (error) {
    logger.error(`Erro ao obter autenticação para loja #${storeId}:`, error)
    Sentry.captureException(error)
    throw error
  }
}
