import express from 'express';
import { z } from 'zod';
import type { FoodTreeService } from '../service/foodTreeService.js';

const elementIdSchema = z.coerce.number().int().positive();
const massSchema = z.coerce.number().positive().default(1);
const elementTypeSchema = z
	.enum(['nutrient', 'whole_food', 'recipe', 'branded_food'])
	.optional();

export function createFoodTreeRoutes(
	foodTreeService: FoodTreeService,
): express.Router {
	const router = express.Router();

	router.get('/health', (_req, res) => {
		res.status(200).json({ status: true }).end();
	});

	router.get('/elements', async (req, res) => {
		const type = elementTypeSchema.safeParse(req.query.type);
		if (!type.success) {
			res.status(400).json({
				error:
					'invalid type parameter. expected one of nutrient, whole_food, recipe, branded_food',
			});
			return;
		}
		const elements = await foodTreeService.listElements(
			type.data,
			req.query.filter as string | undefined,
		);
		res.json(elements);
	});

	router.get('/nutrient-groups', async (_req, res) => {
		res.json(await foodTreeService.listNutrientGroups());
	});

	router.get('/element/:id/tree', async (req, res) => {
		const id = elementIdSchema.safeParse(req.params.id);
		if (!id.success) {
			res.status(400).json({ error: 'invalid id parameter' });
			return;
		}
		const tree = await foodTreeService.treeByElement(id.data);
		if (!tree) {
			res.status(404).json({ error: `element ${id.data} not found` });
			return;
		}
		res.json(tree);
	});

	router.get('/element/:id/nutrients', async (req, res) => {
		const id = elementIdSchema.safeParse(req.params.id);
		if (!id.success) {
			res.status(400).json({ error: 'invalid id parameter' });
			return;
		}
		const mass = massSchema.safeParse(req.query.mass);
		if (!mass.success) {
			res
				.status(400)
				.json({ error: 'invalid ?mass= parameter. expected positive number' });
			return;
		}
		const nutrientGroups = await foodTreeService.nutrientsByElement(
			id.data,
			mass.data,
		);
		if (!nutrientGroups) {
			res.status(404).json({ error: `element ${id.data} not found` });
			return;
		}
		res.json(nutrientGroups);
	});

	router.get('/measures{/:elementId}', async (req, res) => {
		const params = req.params as Record<string, string | undefined>;
		const elementId = elementIdSchema
			.optional()
			.safeParse(params.elementId);
		if (!elementId.success) {
			res.status(400).json({ error: 'invalid elementId parameter' });
			return;
		}
		res.json(await foodTreeService.listMeasures(elementId.data));
	});

	return router;
}
