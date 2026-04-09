import express from 'express';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createSearchRoutes } from './routes/searchRoutes.js';
import { createSearchService } from './service/searchService.js';

const app = express();

app.use(pinoHttp({ logger }));

const searchService = await createSearchService();
app.use(createSearchRoutes(searchService));

app.listen({ port: env.port }, () => {
  logger.info({ port: env.port }, 'Server ready');
});
