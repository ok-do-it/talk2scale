import express from 'express';
import { db } from '../db/client.js';
import { createFoodTreeRoutes } from '../routes/foodTreeRoutes.js';
import { createMealRoutes } from '../routes/mealRoutes.js';
import { createUserRoutes } from '../routes/userRoutes.js';
import { createFoodTreeService } from '../service/foodTreeService.js';
import { createMealService } from '../service/mealService.js';
import { createUserService } from '../service/userService.js';

export { db };

export function buildApp() {
	const app = express();
	const foodTreeService = createFoodTreeService();
	const mealService = createMealService(foodTreeService);
	app.use(createFoodTreeRoutes(foodTreeService));
	app.use(createMealRoutes(mealService));
	app.use(createUserRoutes(createUserService(mealService)));
	return app;
}
