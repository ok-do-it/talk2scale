import express from 'express';
import type { ElementType } from '../db/types.js';
import type { FoodTreeService } from '../service/foodTreeService.js';

const ELEMENT_TYPES: ElementType[] = [
	'nutrient',
	'whole_food',
	'recipe',
	'branded_food',
];

function isElementType(value: string): value is ElementType {
	return ELEMENT_TYPES.includes(value as ElementType);
}

function parseElementId(value: unknown): number | null {
	if (typeof value !== 'string') {
		return null;
	}

	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed)) {
		return null;
	}

	return parsed;
}

function parseMass(value: unknown): number | null {
	if (value === undefined) {
		return 1;
	}

	if (typeof value !== 'string') {
		return null;
	}

	const parsed = Number.parseFloat(value);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return null;
	}

	return parsed;
}

export function createFoodTreeRoutes(
	foodTreeService: FoodTreeService,
): express.Router {
	const router = express.Router();

	router.get('/health', (_req, res) => {
		res.status(200).json({ status: true }).end();
	});

	router.get('/elements', async (req, res) => {
		const type = req.query.type as string | undefined;
		const filter = req.query.filter as string | undefined;

		if (type !== undefined && !isElementType(type)) {
			res.status(400).json({
				error:
					'invalid type parameter. expected one of nutrient, whole_food, recipe, branded_food',
			});
			return;
		}

		const elements = await foodTreeService.listElements(type, filter);
		res.json(elements);
	});

	router.get('/nutrient-groups', async (_req, res) => {
		const groups = await foodTreeService.listNutrientGroups();
		res.json(groups);
	});

	router.get('/element/:id/tree', async (req, res) => {
		const elementId = parseElementId(req.params.id);
		if (elementId === null) {
			res.status(400).json({ error: 'invalid id parameter' });
			return;
		}

		const tree = await foodTreeService.treeByElement(elementId);
		if (!tree) {
			res.status(404).json({ error: `element ${elementId} not found` });
			return;
		}

		res.json(tree);
	});

	router.get('/element/:id/nutrients', async (req, res) => {
		const elementId = parseElementId(req.params.id);
		if (elementId === null) {
			res.status(400).json({ error: 'invalid id parameter' });
			return;
		}

		const mass = parseMass(req.query.mass);
		if (mass === null) {
			res
				.status(400)
				.json({ error: 'invalid ?mass= parameter. expected positive number' });
			return;
		}

		const nutrientGroups = await foodTreeService.nutrientsByElement(
			elementId,
			mass,
		);
		if (!nutrientGroups) {
			res.status(404).json({ error: `element ${elementId} not found` });
			return;
		}

		res.json(nutrientGroups);
	});

	const listMeasuresHandler: express.RequestHandler = async (req, res) => {
		const params = req.params as Record<string, string | undefined>;
		const elementIdParam = params.elementId;

		let elementId: number | undefined;
		if (elementIdParam !== undefined) {
			const parsedElementId = parseElementId(elementIdParam);
			if (parsedElementId === null) {
				res.status(400).json({ error: 'invalid elementId parameter' });
				return;
			}
			elementId = parsedElementId;
		}

		const measures = await foodTreeService.listMeasures(elementId);
		res.json(measures);
	};

	router.get('/measures{/:elementId}', listMeasuresHandler);

	return router;
}
