const os = require("os")
const fs = require("fs")
const qs = require("querystring")
const util = require("util")
const path = require("path")
const { CookieJar } = require("tough-cookie")
const fetch = require("node-fetch")
const log = require("debug")("cg:client")

const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)

const BASE_URL = "https://admin.quilsoft.com/chef-gourmet/public/ws"
const CHEF_PASS = "e5c720cafc0eb5976128e674c2eac68e"
const STORED_CREDENTIALS_PATH = path.join(os.homedir(), ".cg")

let cookieJar = new CookieJar(undefined, { looseMode: true })

async function callAPI(resource, params = {}) {
  const options = {}
  const uri = `${BASE_URL}${resource}?${qs.stringify(params)}`
  const cookieString = cookieJar.getCookieStringSync(uri, {})
  if (cookieString) {
    options.headers = { cookie: cookieString }
  }
  log("calling api %j", { uri, options })
  return fetch(uri, options)
}

async function login(username, password, company) {
  const params = {
    username,
    password,
    company,
    chef_pass: CHEF_PASS
  }
  const response = await callAPI("/login", params)
  const { result } = await response.json()
  if (result && result.id) {
    await saveCookies(response)
    return {
      id: result.id,
      username: result.username
    }
  }
  throw new Error("Could not login")
}

async function saveCookies(response) {
  const headers = response.headers.raw()
  if (headers["set-cookie"]) {
    headers["set-cookie"].forEach(cookie =>
      cookieJar.setCookieSync(cookie, response.url)
    )
  }
}

async function getOrders(employeeId, dateFrom, dateTo) {
  const params = {
    employee_id: employeeId,
    date_from: dateFrom,
    date_to: dateTo,
    chef_pass: CHEF_PASS
  }
  const response = await callAPI("/get-orders", params)
  const { result } = await response.json()
  log("orders result", JSON.stringify(result, null, 2))
  return result.orders
}

async function getOrder(employeeId, orderId, menuId, date) {
  const params = {
    employee_id: employeeId,
    menu_id: menuId,
    date: date,
    chef_pass: CHEF_PASS
  }
  if (orderId) {
    params.order_id = orderId
  }
  const response = await callAPI("/get-order", params)
  const { result } = await response.json()
  log("order result", JSON.stringify(result, null, 2))
  return result
}

async function makeOrder(
  employeeId,
  orderId,
  menuId,
  date,
  foodSelectionParams
) {
  const params = {
    employee_id: employeeId,
    menu_id: menuId,
    date: date,
    absent: false,
    chef_pass: CHEF_PASS,
    ...foodSelectionParams
  }
  if (orderId) {
    params.order_id = orderId
  }
  const response = await callAPI("/make-order", params)
  const { result } = await response.json()
  log("order result", JSON.stringify(result, null, 2))
  return result
}

async function storeCredentials(profile) {
  const serializedCredentials = JSON.stringify({
    profile,
    cookies: Buffer.from(JSON.stringify(cookieJar.serializeSync())).toString(
      "base64"
    )
  })
  await writeFile(STORED_CREDENTIALS_PATH, serializedCredentials)
  log(`stored credentials in ${STORED_CREDENTIALS_PATH}`)
}

async function loadStoredCredentials() {
  log(`loading credentials from ${STORED_CREDENTIALS_PATH}`)
  const serializedCredentials = await readFile(STORED_CREDENTIALS_PATH)
  const credentials = JSON.parse(serializedCredentials)
  cookieJar = CookieJar.deserializeSync(
    JSON.parse(Buffer.from(credentials.cookies, "base64"))
  )
  return credentials.profile
}

async function hasStoredCredentials() {
  try {
    const serializedCredentials = await readFile(STORED_CREDENTIALS_PATH)
    const credentials = JSON.parse(serializedCredentials)
    return !!(
      credentials.profile &&
      credentials.profile.id &&
      credentials.cookies
    )
  } catch (e) {
    return false
  }
}

module.exports = {
  storeCredentials,
  hasStoredCredentials,
  loadStoredCredentials,
  login,
  getOrders,
  getOrder,
  makeOrder
}
