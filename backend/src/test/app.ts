import express from 'express';
import { db } from '../db/client.js';
import { createFoodTreeRoutes } from '../routes/foodTreeRoutes.js';
import { createMealRoutes } from '../routes/mealRoutes.js';
import { createFoodTreeService } from '../service/foodTreeService.js';
import { createMealService } from '../service/mealService.js';

export { db };

export function buildApp() {
	const app = express();
	const foodTreeService = createFoodTreeService();
	app.use(createFoodTreeRoutes(foodTreeService));
	app.use(createMealRoutes(createMealService(foodTreeService)));
	return app;
}
