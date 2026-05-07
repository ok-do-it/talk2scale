import express from 'express';
import { z } from 'zod';
import type { EmbeddingService } from '../service/embeddingService.js';
import type { FoodTreeService } from '../service/foodTreeService.js';

const elementIdSchema = z.coerce.number().int().positive();
const massSchema = z.coerce.number().positive().default(1);
const addNameBodySchema = z.object({
	user_id: z.number().int().positive(),
	name: z.string().min(1),
});
const elementTypeSchema = z
	.enum(['nutrient', 'whole_food', 'recipe', 'branded_food'])
	.optional();

export function createFoodTreeRoutes(
	foodTreeService: FoodTreeService,
	embeddingService?: EmbeddingService,
): express.Router {
	const router = express.Router();
	router.use(express.json());

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

		const userId = req.query.user_id !== undefined ? String(req.query.user_id) : undefined;
		const elements = await foodTreeService.listElements(
			type.data,
			req.query.filter as string | undefined,
			userId,
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

	router.post('/element/:id/names', async (req, res) => {
		const id = elementIdSchema.safeParse(req.params.id);
		if (!id.success) {
			res.status(400).json({ error: 'invalid id parameter' });
			return;
		}
		const body = addNameBodySchema.safeParse(req.body);
		if (!body.success) {
			res.status(400).json({ error: 'invalid body', details: body.error.flatten() });
			return;
		}
		const embedding = embeddingService
			? await embeddingService.embedName(body.data.name)
			: undefined;
		const result = await foodTreeService.addElementName(id.data, body.data.user_id, body.data.name, embedding);
		if (result === 'element_not_found') {
			res.status(404).json({ error: `element ${id.data} not found` });
			return;
		}
		if (result === 'user_not_found') {
			res.status(400).json({ error: 'user not found' });
			return;
		}
		res.status(201).json(result);
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
