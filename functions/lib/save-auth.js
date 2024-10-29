'use strict'
const { Firestore, Timestamp } = require('firebase-admin/firestore')

async function saveMartanAuth (db, authData) {
  const { storeId, martanId, accessToken, refreshToken, expiresIn } = authData

  const martanAuthRef = db.collection('martan_app_auth')
  const expiresInIsoDate = Timestamp.fromDate(new Date(Date.now() + expiresIn * 1000))
  try {
    // Consulta para verificar se o documento já existe
    const query = martanAuthRef
      .where('store_id', '==', storeId)
      .where('martan_id', '==', martanId)

    const querySnapshot = await query.get()

    if (querySnapshot.empty) {
      // Se não existir, cria um novo documento
      await martanAuthRef.add({
        store_id: storeId,
        martan_id: martanId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresInIsoDate,
        updated_at: Firestore.FieldValue.serverTimestamp()
      })
    } else {
      // Se existir, atualiza o documento existente
      const docId = querySnapshot.docs[0].id
      await martanAuthRef.doc(docId).update({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresInIsoDate,
        updated_at: Firestore.FieldValue.serverTimestamp()
      })
    }

    return true
  } catch (error) {
    console.error('Erro ao upsert Martan Auth:', error)
    throw error
  }
}

module.exports = { saveMartanAuth }
