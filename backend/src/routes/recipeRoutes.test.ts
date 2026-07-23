import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, db } from '../test/app.js';

const app = buildApp();

let elementId: number;
const createdElementIds: number[] = [];

beforeAll(async () => {
	const element = await db
		.selectFrom('element')
		.select('id')
		.where('type', '=', 'whole_food')
		.limit(1)
		.executeTakeFirstOrThrow();
	elementId = element.id;
});

afterAll(async () => {
	if (createdElementIds.length) {
		await db
			.deleteFrom('element')
			.where('id', 'in', createdElementIds)
			.execute();
	}
	await db.destroy();
});

describe('POST /recipes', () => {
	it('creates a recipe and returns 201', async () => {
		const res = await request(app)
			.post('/recipes')
			.send({
				name: 'Test Recipe',
				children: [{ element_id: elementId, grams: 200 }],
				serving_grams: 400,
			});
		expect(res.status).toBe(201);
		createdElementIds.push(res.body.id);
		expect(res.body).toMatchObject({
			id: expect.any(Number),
			type: 'recipe',
			name: 'Test Recipe',
		});
		expect(res.body.links).toHaveLength(1);
		expect(res.body.measures.length).toBeGreaterThanOrEqual(1);
	});

	it('returns 400 for nonexistent child element_id', async () => {
		const res = await request(app)
			.post('/recipes')
			.send({
				name: 'Bad Recipe',
				children: [{ element_id: 999999999, grams: 100 }],
			});
		expect(res.status).toBe(400);
	});

	it('returns 400 when name is missing', async () => {
		const res = await request(app)
			.post('/recipes')
			.send({ children: [{ element_id: elementId, grams: 100 }] });
		expect(res.status).toBe(400);
	});

	it('returns 400 when children is empty', async () => {
		const res = await request(app)
			.post('/recipes')
			.send({ name: 'Empty Recipe', children: [] });
		expect(res.status).toBe(400);
	});
});
