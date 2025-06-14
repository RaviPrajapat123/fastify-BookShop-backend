// // ESM
// import fastifyPlugin from 'fastify-plugin'
// import fastifyMongo from '@fastify/mongodb'

// /**
//  * @param {FastifyInstance} fastify
//  * @param {Object} options
//  */
// async function dbConnector (fastify, options) {
//   fastify.register(fastifyMongo, {
//     url: 'mongodb://localhost:27017/BookShop'
//   })
// }

// // Wrapping a plugin function with fastify-plugin exposes the decorators
// // and hooks, declared inside the plugin to the parent scope.
// export default fastifyPlugin(dbConnector)



import fastifyPlugin from 'fastify-plugin';
import fastifyMongo from '@fastify/mongodb';

async function dbConnector(fastify, options) {
  const dbUrl = process.env.DB_URL || 'mongodb://localhost:27017';
  const dbName = process.env.DB_NAME || 'BookShop';

  fastify.register(fastifyMongo, {
    url: `${dbUrl}/${dbName}`,
    forceClose: true,
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
}

export default fastifyPlugin(dbConnector);