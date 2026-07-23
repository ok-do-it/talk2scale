import express from 'express';
import { db } from '../db/client.js';
import { createFoodLogRoutes } from '../routes/foodLogRoutes.js';
import { createFoodTreeRoutes } from '../routes/foodTreeRoutes.js';
import { createRecipeRoutes } from '../routes/recipeRoutes.js';
import { createUserRoutes } from '../routes/userRoutes.js';
import { createFoodLogService } from '../service/foodLogService.js';
import { createFoodTreeService } from '../service/foodTreeService.js';
import { createRecipeService } from '../service/recipeService.js';
import { createUserService } from '../service/userService.js';

export { db };

export function buildApp() {
	const app = express();
	const foodTreeService = createFoodTreeService();
	const foodLogService = createFoodLogService(foodTreeService);
	const recipeService = createRecipeService();
	app.use(createFoodTreeRoutes(foodTreeService));
	app.use(createFoodLogRoutes(foodLogService));
	app.use(createRecipeRoutes(recipeService));
	app.use(createUserRoutes(createUserService(foodLogService)));
	return app;
}
