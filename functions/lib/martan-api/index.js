const axios = require('axios')
const baseURL = 'https://api.martan.app/v1/'
// const baseURL = 'http://localhost:56186/v1/'
const pkg = require('./../../package.json')

const instance = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'X-Integration-Module': `${pkg.name}@${pkg.version}`,
    'Content-Type': 'application/json'
  }
})

instance.interceptors.response.use(
  (response) => response, // Retorna a resposta normalmente se sucesso
  (error) => {
    // Força um erro para qualquer código >= 400
    if (error.response && error.response.status >= 400) {
      return Promise.reject(error)
    }
    return Promise.reject(error) // Rejeita qualquer outro erro
  }
)

module.exports = instance
