'use strict'
const { Firestore, Timestamp } = require('firebase-admin/firestore')
const { refreshToken } = require('./martan-api/auth')

module.exports = async (admin) => {
  const db = admin.firestore()
  const martanAuthRef = db.collection('martan_app_auth')
  let queue = 0
  const maxTokens = 40

  const handleRefreshToken = (snapshot) => {
    const row = snapshot.data()
    queue++
    console.log(`Refresh ${queue}° token for store #${row.store_id}`)

    setTimeout(() => {
      console.log(`Refreshed ${queue}° token for store #${row.store_id}`)
      refreshToken(row.refresh_token)
        .then((data) => {
          const expiresInIsoDate = Timestamp.fromDate(new Date(Date.now() + data.expires_in * 1000))
          return snapshot.ref.update({
            access_token: data.access_token,
            expires_in: expiresInIsoDate,
            updated_at: Firestore.FieldValue.serverTimestamp()
          })
        }).then(() => {
          console.log(`✓ Access token updated with success for store #${row.store_id}`)
        })
        .catch(error => console.error(error))
    }, queue * 1000)
  }

  // Query martan_app_auth collection, ordered by updated_at in descending order
  const querySnapshot = await martanAuthRef
    .orderBy('updated_at', 'asc')
    .limit(maxTokens * 10)
    .get()

  console.log(`Found ${querySnapshot.size} stored tokens`)

  if (querySnapshot.size) {
    const minDate = new Date()
    minDate.setHours(minDate.getHours() + 16)
    console.log(
      `Filter tokens to expire in up to 16h (<= ${minDate.toISOString()})`
    )
    const minTimestamp = minDate.getTime()

    // check each document `expires` date
    querySnapshot.forEach((documentSnapshot) => {
      if (queue < maxTokens) {
        const data = documentSnapshot.data()
        if (
          !data.expires_in ||
          new Date(data.expires_in).getTime() <= minTimestamp
        ) {
          handleRefreshToken(documentSnapshot)
        }
      }
    })

    if (querySnapshot.size >= maxTokens) {
      // clear old not handled tokens
      const filterDate = new Date()
      filterDate.setDate(filterDate.getDate() - 30)
      martanAuthRef
        .where('expires_in', '<', filterDate.toISOString())
        .limit(maxTokens * 2)
        .get()
        .then(async ({ docs }) => {
          for (let i = 0; i < docs.length; i++) {
            try {
              await docs[i].ref.delete()
            } catch (e) {
              console.error(e)
            }
          }
        })
        .catch(console.error)
    }
  }
}
