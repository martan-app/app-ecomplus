const crypto = require('crypto')

function generateCodeVerifier () {
  return crypto.randomBytes(32).toString('hex')
}

function generateCodeChallenge (verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

module.exports = { generateCodeVerifier, generateCodeChallenge }
