const martanApi = require("./martan-api");
const functions = require("firebase-functions");
const SKIP_TRIGGER_NAME = "SkipTrigger";

module.exports = async ({ appSdk, appData, storeId, orderId }) => {
  appSdk
    .apiRequest(storeId, `orders/${orderId}.json`)
    .then(async ({ response }) => {
      const order = response.data;
      if (
        !order.fulfillment_status ||
        (order.fulfillment_status &&
          order.fulfillment_status.current &&
          order.fulfillment_status.current !== "delivered")
      ) {
        // ignore current trigger
        const err = new Error();
        err.name = SKIP_TRIGGER_NAME;
        throw err;
      }

      const store = await appSdk
        .apiRequest(storeId, "/stores/me.json", "GET")
        .then((store) => store.response.data);

      const { items } = order;

      const products = items.map((item) => {
        const pictures = ["normal"].map((size) => {
          if (item.picture && item.picture[size]) {
            return item.picture[size].url;
          }
        });

        const product = {
          product_id: item.product_id,
          sku: item.sku,
          name: item.name,
          price: item.final_price || item.price || 10,
          url: item.permalink || `https://${store.domain}/${item.sku}`,
        };

        if (pictures.find((p) => p !== null)) {
          product.pictures = pictures.filter((pp) => typeof pp === "string");
        }

        return product;
      });

      const customers = [];

      const { buyers } = order;
      if (buyers && Array.isArray(buyers) && buyers.length) {
        // only the first buyer is supported by now :/
        const customer = {};
        for (let b = 0; b <= 0; b++) {
          const buyer = buyers[b];
          if (buyer.name) {
            const { name } = buyer;
            if (name.given_name) {
              customer.name = name.given_name;
            }

            if (name.middle_name) {
              customer.name = `${customer.name} ${name.middle_name}`;
            }

            if (name.family_name) {
              customer.name = `${customer.name} ${name.family_name}`;
            }
          } else {
            customer.name = buyer.display_name;
          }

          customer.email = buyer.main_email;

          if (
            buyer.phones &&
            Array.isArray(buyer.phones) &&
            buyer.phones.length
          ) {
            const { phones } = buyer;
            for (let p = 0; p <= 0; p++) {
              const phone = phones[p];
              customer.phone = phone.number;
            }
          }
        }

        customers.push(customer);
      }

      let deliveredData = order.updated_at;

      if (order.fulfillments) {
        const fulfillment = order.fulfillments.find(
          (ful) => ful.status === "delivered"
        );
        if (fulfillment && fulfillment.date_time) {
          deliveredData = fulfillment.date_time;
        }
      }

      const data = {
        products,
        customers,
        order_id: order._id,
        order_date: order.created_at,
        delivery_date: deliveredData,
      };

      return martanApi({
        method: "post",
        url: "/orders.json",
        headers: {
          "X-Store-Id": appData.integration_store_id,
          "X-Token": appData.integration_token,
        },
        data,
      });
    })
    .then(({ data }) => {
      functions.logger.log(
        `Pedido ${orderId} enviado com sucesso para Martan: ${data.id}`
      );
    })
    .catch((error) => {
      if (error.name === SKIP_TRIGGER_NAME) {
        return;
      }

      functions.logger.error(
        `Erro ao tentar enviar pedido ${orderId} para Martan`,
        error
      );

      functions.logger.error(error.response.data);
      functions.logger.error(JSON.stringify(error.response.data));
    });
};
