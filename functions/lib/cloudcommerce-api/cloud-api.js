const { default: axios } = require('axios')

const cloudCommerceApi = async ({ url, method = 'get', data, headers }, auth) => {
  return axios({
    baseURL: 'https://ecomplus.io/v2',
    url,
    method,
    data,
    headers: {
      ...headers,
      'X-Store-Id': auth.store_id,
      'X-Access-Token': auth.access_token,
      'X-My-Id': auth.authentication_id
    }
  })
}

module.exports = cloudCommerceApi
