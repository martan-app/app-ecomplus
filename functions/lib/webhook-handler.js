const ordersHandler = require("./orders-handler");

const handler = ({ storeId, appSdk, appData, trigger }) => {
  switch (trigger.resource) {
    case "orders":
      const orderId = trigger.resource_id || trigger.inserted_id;
      ordersHandler({ orderId, appSdk, appData, storeId });
      break;
    case "products":
    default:
      break;
  }
};

module.exports = handler;
