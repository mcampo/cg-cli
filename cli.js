#!/usr/bin/env node

const inquirer = require("inquirer")
const process = require("process")
const moment = require("moment")
const log = require("debug")("cg:cli")
const client = require("./client")

const DATE_FORMAT = "YYYY-MM-DD"

async function run() {
  const profile = await getProfile()
  log("user profile %o", profile)

  const orders = await getOrders(profile)
  const orderSelection = await selectOrder(orders)
  const order = await getOrder(profile, orderSelection)
  const foodSelection = await selectFood(order)
  await makeOrder(profile, orderSelection, foodSelection)
}

async function getProfile() {
  const hasCredentials = await client.hasStoredCredentials()
  let profile
  if (hasCredentials) {
    log("using stored credentials")
    profile = await client.loadStoredCredentials()
  } else {
    log("logging in...")
    const credentials = await inquirer.prompt([
      { name: "company", message: "Empresa" },
      { name: "username", message: "Usuario" },
      { name: "password", message: "Contraseña", type: "password", mask: true }
    ])
    profile = await client.login(
      credentials.username,
      credentials.password,
      credentials.company
    )
    await client.storeCredentials(profile)
    log("credentials stored")
  }
  return profile
}

async function getOrders(profile) {
  const startMoment = moment().add(1, "days")
  const endMoment = startMoment.clone().add(30, "days")
  const orders = await client.getOrders(
    profile.id,
    startMoment.format(DATE_FORMAT),
    endMoment.format(DATE_FORMAT)
  )

  const enabledOrders = orders.filter(order => order.enabled)
  return enabledOrders
}

async function selectOrder(orders) {
  const answer = await inquirer.prompt([
    {
      name: "order-selection",
      message: "Orden",
      type: "list",
      choices: orders.map(order => ({
        name: `${order.date} - [${order.status}]`,
        value: order
      }))
    }
  ])
  log(answer)
  return answer["order-selection"]
}

async function getOrder(profile, orderSelection) {
  const order = await client.getOrder(
    profile.id,
    orderSelection.order_id,
    orderSelection.menu_id,
    orderSelection.date
  )
  return order
}

async function selectFoodCategory(order) {
  const answer = await inquirer.prompt([
    {
      name: "food-category-selection",
      message: "Categoría",
      type: "list",
      choices: order.foods.map(foodCategory => ({
        name: foodCategory.category_name,
        value: foodCategory
      }))
    }
  ])
  log(answer)
  return answer["food-category-selection"]
}

async function selectFood(order) {
  const answer = await inquirer.prompt(
    order.foods.map(foodCategory => ({
      name: foodCategory.category_column,
      message: foodCategory.category_name,
      type: "list",
      choices: foods(foodCategory).map(food => ({
        name: food.food_name,
        value: food
      })),
      pageSize: 20
    }))
  )
  log(answer)
  return answer
}

function foods(foodCategory) {
  return Object.keys(foodCategory.food_types).reduce(
    (accum, foodTypeKey) => accum.concat(foodCategory.food_types[foodTypeKey]),
    []
  )
}

async function makeOrder(profile, orderSelection, foodSelection) {
  const foodSelectionParams = Object.keys(foodSelection).reduce(
    (accum, foodSelectionKey) => ({
      ...accum,
      [foodSelectionKey]: foodSelection[foodSelectionKey].food_id
    }),
    {}
  )
  client.makeOrder(
    profile.id,
    orderSelection.order_id,
    orderSelection.menu_id,
    orderSelection.date,
    foodSelectionParams
  )
}

;(async () => {
  try {
    await run()
  } catch (error) {
    log(error)
    console.log(error.message || error)
    process.exit(1)
  }
})()
