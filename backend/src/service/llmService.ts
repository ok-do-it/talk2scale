import { z } from 'zod';
import { db } from '../db/client.js';
import type { LlmClient, LlmCompleteImage } from './llm/llmClient.js';
import { LlmParseError } from './llm/llmErrors.js';

export type NutrientCatalogEntry = {
	id: number;
	name: string;
};

export type NutritionFactsParse = {
	serving_grams: number;
	nutrients: Array<{
		element_id: number;
		name: string;
		grams: number;
	}>;
};

export type DictationItem = {
	name: string;
	quantity: number;
	unit: string;
	grams: number;
};

export type DictationParse = {
	items: DictationItem[];
};

export type LlmService = {
	parseNutritionFactsImage: (
		image: LlmCompleteImage,
	) => Promise<NutritionFactsParse>;
	parseDictation: (text: string) => Promise<DictationParse>;
};

const nutritionModelSchema = z.object({
	serving_grams: z.coerce.number().positive(),
	nutrients: z
		.array(
			z.object({
				element_id: z.coerce.number().int().positive(),
				grams: z.coerce.number().positive(),
			}),
		)
		.min(1),
});

const dictationModelSchema = z.object({
	items: z
		.array(
			z.object({
				name: z.string().trim().min(1),
				quantity: z.coerce.number().positive(),
				unit: z.string().trim().min(1),
				grams: z.coerce.number().positive(),
			}),
		)
		.min(1),
});

function extractJsonText(raw: string): string {
	const trimmed = raw.trim();
	const fenced = /^```(?:json)?\s*([\s\S]*?)```/im.exec(trimmed);
	if (fenced?.[1]) {
		return fenced[1].trim();
	}
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start >= 0 && end > start) {
		return trimmed.slice(start, end + 1);
	}
	return trimmed;
}

function parseModelJson(raw: string): unknown {
	try {
		return JSON.parse(extractJsonText(raw));
	} catch {
		throw new LlmParseError('model did not return valid JSON');
	}
}

function nutritionSystemPrompt(catalog: NutrientCatalogEntry[]): string {
	return [
		'You extract nutrition-facts panels from packaging photos.',
		'Return JSON only, no markdown.',
		'Schema: {"serving_grams": number, "nutrients": [{"element_id": number, "grams": number}]}',
		'serving_grams is the labeled serving size converted to grams. If the label is per 100g, use 100.',
		'grams on each nutrient is the MASS of that nutrient in the serving, in grams (convert mg, mcg, µg).',
		'Skip calories, kcal, kJ, IU, %DV, and any non-mass quantity.',
		'Only use element_id values from this catalog. Omit nutrients you cannot match.',
		'Catalog:',
		JSON.stringify(catalog),
	].join('\n');
}

const DICTATION_SYSTEM_PROMPT = [
	'You parse a spoken or typed meal description into eaten foods.',
	'Return JSON only, no markdown.',
	'Schema: {"items": [{"name": string, "quantity": number, "unit": string, "grams": number}]}',
	'name is the food (no quantity). quantity is the numeric amount as stated or implied.',
	'unit is a short unit string, e.g. g, ml, cup, tbsp, tsp, slice, piece, egg, large.',
	'grams is estimated edible mass in grams and is the source of truth for logging.',
	'If the speaker already used grams, set quantity to that number, unit to "g", and grams to the same number.',
	'Convert household units and counts using typical weights (two large eggs ≈ 100g).',
	'Omit water and anything with no plausible mass.',
].join('\n');

async function loadNutrientCatalog(): Promise<NutrientCatalogEntry[]> {
	return db
		.selectFrom('element')
		.select(['id', 'name'])
		.where('type', '=', 'nutrient')
		.orderBy('id', 'asc')
		.execute();
}

export async function createLlmService(
	client: LlmClient,
	options?: { nutrients?: NutrientCatalogEntry[] },
): Promise<LlmService> {
	const catalog = options?.nutrients ?? (await loadNutrientCatalog());
	const nutrientsById = new Map(catalog.map((n) => [n.id, n]));
	const nutritionSystem = nutritionSystemPrompt(catalog);

	return {
		async parseNutritionFactsImage(image) {
			const raw = await client.complete({
				system: nutritionSystem,
				user: 'Extract the nutrition facts from this image.',
				image,
			});
			const parsed = nutritionModelSchema.safeParse(parseModelJson(raw));
			if (!parsed.success) {
				throw new LlmParseError('nutrition facts JSON did not match schema');
			}

			const nutrients = parsed.data.nutrients.flatMap((row) => {
				const nutrient = nutrientsById.get(row.element_id);
				if (!nutrient) {
					return [];
				}
				return [
					{
						element_id: nutrient.id,
						name: nutrient.name,
						grams: row.grams,
					},
				];
			});

			if (nutrients.length === 0) {
				throw new LlmParseError(
					'no catalog nutrients could be mapped from the label',
				);
			}

			return {
				serving_grams: parsed.data.serving_grams,
				nutrients,
			};
		},

		async parseDictation(text) {
			const transcript = text.trim();
			if (!transcript) {
				throw new LlmParseError('empty dictation text');
			}

			const raw = await client.complete({
				system: DICTATION_SYSTEM_PROMPT,
				user: transcript,
			});
			const parsed = dictationModelSchema.safeParse(parseModelJson(raw));
			if (!parsed.success) {
				throw new LlmParseError('dictation JSON did not match schema');
			}

			return {
				items: parsed.data.items.map((item) => ({
					name: item.name,
					quantity: item.quantity,
					unit: item.unit,
					grams: item.grams,
				})),
			};
		},
	};
}
