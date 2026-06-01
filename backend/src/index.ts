import express from 'express';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import {
	assertDatabaseConnection,
	closeDatabaseConnection,
} from './db/client.js';
import { createFoodTreeRoutes } from './routes/foodTreeRoutes.js';
import { createMealRoutes } from './routes/mealRoutes.js';
import { createSearchRoutes } from './routes/searchRoutes.js';
import { createUserRoutes } from './routes/userRoutes.js';
import { createVoiceRoutes } from './routes/voiceRoutes.js';
import { createEmbeddingService } from './service/embeddingService.js';
import { createFoodTreeService } from './service/foodTreeService.js';
import { createMealService } from './service/mealService.js';
import { createSearchService } from './service/searchService.js';
import { createUserService } from './service/userService.js';
import { createVoiceService } from './service/voiceService.js';

const app = express();

app.use(pinoHttp({ logger }));
app.use(express.static('public'));

await assertDatabaseConnection();
logger.info('Database connection is ready');

const embeddingService = await createEmbeddingService();
const searchService = await createSearchService(embeddingService);
app.use(createSearchRoutes(searchService, embeddingService));

const foodTreeService = createFoodTreeService();
app.use(createFoodTreeRoutes(foodTreeService, embeddingService));

const mealService = createMealService(foodTreeService);
app.use(createMealRoutes(mealService));

const userService = createUserService(mealService);
app.use(createUserRoutes(userService));

const voiceService = await createVoiceService();
app.use(createVoiceRoutes(voiceService, embeddingService));

app.listen({ port: env.port }, () => {
	logger.info({ port: env.port }, 'Server ready');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		void closeDatabaseConnection();
	});
}
