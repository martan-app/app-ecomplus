const { PubSub } = require('@google-cloud/pubsub')

const pubsub = new PubSub()
const topicName = 'process-orders'

async function createIfNotExists () {
  const [topics] = await pubsub.getTopics()
  const topicExists = topics.some(topic => topic.name.includes(topicName))

  if (!topicExists) {
    await pubsub.createTopic(topicName)
  } else {
    return Promise.resolve()
  }
}

async function addOrders (order) {
  await createIfNotExists()
  const topic = pubsub.topic(topicName)
  await topic.publishMessage({ json: order })
}

module.exports = addOrders
