module.exports = async ({ db, storeId }) => {
  const martanAuthRef = db.collection('martan_app_auth')
  const query = martanAuthRef
    .where('store_id', '==', storeId)
    .orderBy('updated_at', 'desc')
    .limit(1)

  const docs = await query.get()
  if (docs.empty) {
    return null
  } else {
    return docs.docs[0].data()
  }
}
