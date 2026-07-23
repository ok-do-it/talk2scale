import type { Selectable } from 'kysely';
import { z } from 'zod';
import { db } from '../db/client.js';
import type { Element, Link, Measure } from '../db/types.js';

export const recipeChildSchema = z.object({
	element_id: z.number().int().positive(),
	grams: z.number().positive(),
});

export const newRecipeSchema = z.object({
	name: z.string().min(1),
	children: z.array(recipeChildSchema).min(1),
	serving_grams: z.number().positive().optional(),
	user_id: z.number().int().positive().optional(),
});

export type RecipeChild = z.infer<typeof recipeChildSchema>;
export type NewRecipe = z.infer<typeof newRecipeSchema>;

export type RecipeWithDetails = Selectable<Element> & {
	links: Selectable<Link>[];
	measures: Selectable<Measure>[];
};

export type RecipeService = ReturnType<typeof createRecipeService>;

export function createRecipeService() {
	return {
		async createRecipe(input: NewRecipe): Promise<RecipeWithDetails> {
			return db.transaction().execute(async (trx) => {
				const element = await trx
					.insertInto('element')
					.values({
						type: 'recipe',
						source: 'user',
						name: input.name,
						external_id: input.user_id ? String(input.user_id) : null,
					})
					.returningAll()
					.executeTakeFirstOrThrow();

				const wholeBatchGrams = input.children.reduce(
					(sum, c) => sum + c.grams,
					0,
				);

				const links = await trx
					.insertInto('link')
					.values(
						input.children.map((c) => ({
							parent_id: element.id,
							child_id: c.element_id,
							ratio: c.grams / wholeBatchGrams,
						})),
					)
					.returningAll()
					.execute();

				const measureValues: Array<{
					element_id: number;
					name: string;
					grams: number;
				}> = [
					{
						element_id: element.id,
						name: 'whole batch',
						grams: wholeBatchGrams,
					},
				];

				if (input.serving_grams !== undefined) {
					measureValues.push({
						element_id: element.id,
						name: 'serving',
						grams: input.serving_grams,
					});
				}

				const measures = await trx
					.insertInto('measure')
					.values(measureValues)
					.returningAll()
					.execute();

				return { ...element, links, measures };
			});
		},
	};
}
