const { DeliveryManager } = require('./DeliveryManager')
const { DeliveryService } = require('./DeliveryService')
const { DelhiveryAdapter } = require('./adapters/DelhiveryAdapter')
const { BlueDartAdapter } = require('./adapters/BlueDartAdapter')
const { DtdcAdapter } = require('./adapters/DtdcAdapter')
const { DHLAdapter } = require('./adapters/DHLAdapter')
const { XpressBeesAdapter } = require('./adapters/XpressBeesAdapter')
const { IndiaPostAdapter } = require('./adapters/IndiaPostAdapter')
const { deliveryConfigFromEnv } = require('./deliveryConfig')

const config = deliveryConfigFromEnv()

const configuredProviders = [
  new DelhiveryAdapter({ config: config.delhivery }),
  // Registered as future placeholders for OCP-friendly extension.
  new BlueDartAdapter(),
  new DtdcAdapter(),
  new DHLAdapter(),
  new XpressBeesAdapter(),
  new IndiaPostAdapter(),
]

const deliveryManager = new DeliveryManager({
  providers: configuredProviders,
  defaultProvider: config.defaultProvider,
})

const deliveryService = new DeliveryService({
  manager: deliveryManager,
  defaultProvider: config.defaultProvider,
})

module.exports = {
  DeliveryManager,
  DeliveryService,
  deliveryManager,
  deliveryService,
  deliveryConfigFromEnv,
}
