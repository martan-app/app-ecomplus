const axios = require("axios");
const baseURL = "http://api.martan.app/v1/";
const pkg = require('./../../package.json')

const instance = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    "X-Integration-Module": `${pkg.name}@${pkg.version}`,
    "Content-Type": "application/json",
  },
});

module.exports = instance;
