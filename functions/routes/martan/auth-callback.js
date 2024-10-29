const { getAccessToken } = require('../../lib/martan-api/auth')
const { saveMartanAuth } = require('../../lib/save-auth')
const errorHandling = require('./../../lib/store-api/error-handling')

exports.get = ({ admin }, req, res) => {
  const { state, code } = req.query
  let storeId = null
  let martanId = null // store_id in martan
  try {
    // try parse state to retrive storeId`s
    const parse = JSON.parse(decodeURIComponent(state))
    if (!parse.martan_store_id || !parse.ecomplus_store_id) {
      throw new Error('Martan storeId or ecomplus storeId invalid')
    }

    storeId = parseInt(parse.ecomplus_store_id)
    martanId = parseInt(parse.martan_store_id)

    if (
      typeof storeId !== 'number' ||
      isNaN(storeId) ||
      storeId <= 0 ||
      typeof martanId !== 'number' ||
      isNaN(martanId) ||
      martanId <= 0
    ) {
      throw new Error(
        new Error('Undefined or invalid Store ID, must be a positive number')
      )
    }
  } catch (err) {
    const { message, response } = err
    if (response) {
      errorHandling(err)
    } else {
      // Firestore error ?
      console.error(err)
    }
    res.status(500)
    return res.send({
      error: 'auth_callback_error',
      message
    })
  }

  getAccessToken(code, storeId, admin)
    .then((data) => {
      const db = admin.firestore()
      return saveMartanAuth(db, {
        storeId,
        martanId,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in
      })
    })
    .then(() => {
      console.log(`Installed store #${storeId}`)
      res.status(200)
      res.write('<script>window.close()</script>')
      return res.end()
    })
    .catch((err) => {
      const { message, response } = err
      if (response) {
        errorHandling(err)
      } else {
        // Firestore error ?
        console.error(err)
      }
      res.status(500)
      return res.send({
        error: 'auth_callback_error',
        message
      })
    })
}
