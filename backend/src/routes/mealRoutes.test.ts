import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, db } from '../test/app.js';

const app = buildApp();

let userId: number;
let elementId: number;
let unitId: number;

const createdMealIds: number[] = [];
const createdElementIds: number[] = [];

beforeAll(async () => {
	const user = await db
		.selectFrom('users')
		.select('id')
		.limit(1)
		.executeTakeFirstOrThrow();
	userId = user.id;

	const element = await db
		.selectFrom('element')
		.select('id')
		.where('type', '=', 'whole_food')
		.limit(1)
		.executeTakeFirstOrThrow();
	elementId = element.id;

	const unit = await db
		.selectFrom('measure')
		.select('id')
		.where('element_id', 'is', null)
		.limit(1)
		.executeTakeFirstOrThrow();
	unitId = unit.id;
});

afterAll(async () => {
	if (createdMealIds.length) {
		await db.deleteFrom('meal').where('id', 'in', createdMealIds).execute();
	}
	if (createdElementIds.length) {
		await db
			.deleteFrom('element')
			.where('id', 'in', createdElementIds)
			.execute();
	}
	await db.destroy();
});

function mealPayload(overrides?: Record<string, unknown>) {
	return {
		user_id: userId,
		food_logs: [
			{
				element_id: elementId,
				raw_name: 'test food',
				amount: 100,
				unit_id: unitId,
			},
		],
		...overrides,
	};
}

async function createMeal() {
	const res = await request(app).post('/meals').send(mealPayload());
	expect(res.status).toBe(201);
	createdMealIds.push(res.body.id);
	return res.body as { id: number; user_id: number; food_logs: { id: number }[] };
}

describe('POST /meals', () => {
	it('creates a meal and returns 201', async () => {
		const res = await request(app).post('/meals').send(mealPayload());
		expect(res.status).toBe(201);
		createdMealIds.push(res.body.id);
		expect(res.body).toMatchObject({
			id: expect.any(Number),
			user_id: userId,
			food_logs: expect.any(Array),
		});
		expect(res.body.food_logs.length).toBe(1);
	});

	it('returns 400 when food_logs is missing', async () => {
		const res = await request(app)
			.post('/meals')
			.send({ user_id: userId });
		expect(res.status).toBe(400);
	});

	it('returns 400 when food_logs is empty', async () => {
		const res = await request(app)
			.post('/meals')
			.send({ user_id: userId, food_logs: [] });
		expect(res.status).toBe(400);
	});

	it('returns 400 when user_id is missing', async () => {
		const res = await request(app)
			.post('/meals')
			.send({ food_logs: [{ element_id: elementId, raw_name: 'x', amount: 1, unit_id: unitId }] });
		expect(res.status).toBe(400);
	});
});

describe('GET /meals/:id', () => {
	it('returns meal with food_logs', async () => {
		const meal = await createMeal();
		const res = await request(app).get(`/meals/${meal.id}`);
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			id: meal.id,
			user_id: userId,
			food_logs: expect.any(Array),
		});
	});

	it('returns 404 for nonexistent meal', async () => {
		const res = await request(app).get('/meals/999999999');
		expect(res.status).toBe(404);
	});

	it('returns 400 for non-numeric id', async () => {
		const res = await request(app).get('/meals/abc');
		expect(res.status).toBe(400);
	});
});

describe('PATCH /meals/:id/name', () => {
	it('updates meal name', async () => {
		const meal = await createMeal();
		const res = await request(app)
			.patch(`/meals/${meal.id}/name`)
			.send({ name: 'Updated Name' });
		expect(res.status).toBe(200);
		expect(res.body.name).toBe('Updated Name');
	});

	it('returns 400 when name is missing', async () => {
		const meal = await createMeal();
		const res = await request(app)
			.patch(`/meals/${meal.id}/name`)
			.send({});
		expect(res.status).toBe(400);
	});

	it('returns 400 when name is empty string', async () => {
		const meal = await createMeal();
		const res = await request(app)
			.patch(`/meals/${meal.id}/name`)
			.send({ name: '' });
		expect(res.status).toBe(400);
	});

	it('returns 404 for nonexistent meal', async () => {
		const res = await request(app)
			.patch('/meals/999999999/name')
			.send({ name: 'x' });
		expect(res.status).toBe(404);
	});
});

describe('POST /meals/:id/food-logs', () => {
	it('adds a food log to an existing meal', async () => {
		const meal = await createMeal();
		const res = await request(app)
			.post(`/meals/${meal.id}/food-logs`)
			.send({
				element_id: elementId,
				raw_name: 'extra food',
				amount: 50,
				unit_id: unitId,
			});
		expect(res.status).toBe(201);
		expect(res.body).toMatchObject({
			id: expect.any(Number),
			meal_id: meal.id,
			raw_name: 'extra food',
		});
	});

	it('returns 404 for nonexistent meal', async () => {
		const res = await request(app)
			.post('/meals/999999999/food-logs')
			.send({
				element_id: elementId,
				raw_name: 'x',
				amount: 1,
				unit_id: unitId,
			});
		expect(res.status).toBe(404);
	});

	it('returns 400 when amount is missing', async () => {
		const meal = await createMeal();
		const res = await request(app)
			.post(`/meals/${meal.id}/food-logs`)
			.send({ element_id: elementId, raw_name: 'x', unit_id: unitId });
		expect(res.status).toBe(400);
	});
});

describe('DELETE /meals/:id/food-logs/:logId', () => {
	it('deletes a food log and returns 204', async () => {
		const meal = await createMeal();
		const logId = meal.food_logs[0].id;
		const res = await request(app).delete(
			`/meals/${meal.id}/food-logs/${logId}`,
		);
		expect(res.status).toBe(204);
	});

	it('returns 404 when log does not exist', async () => {
		const meal = await createMeal();
		const res = await request(app).delete(
			`/meals/${meal.id}/food-logs/999999999`,
		);
		expect(res.status).toBe(404);
	});
});

describe('GET /meals/:id/nutrients', () => {
	it('returns nutrient groups for a meal', async () => {
		const meal = await createMeal();
		const res = await request(app).get(`/meals/${meal.id}/nutrients`);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});

	it('returns 404 for nonexistent meal', async () => {
		const res = await request(app).get('/meals/999999999/nutrients');
		expect(res.status).toBe(404);
	});
});

describe('GET /users/:userId/meals', () => {
	it('returns meals for a user', async () => {
		const res = await request(app).get(`/users/${userId}/meals`);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});

	it('accepts date range params', async () => {
		const res = await request(app).get(
			`/users/${userId}/meals?from=2024-01-01&to=2026-12-31`,
		);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});

	it('returns 400 for invalid date', async () => {
		const res = await request(app).get(
			`/users/${userId}/meals?from=not-a-date`,
		);
		expect(res.status).toBe(400);
	});
});

describe('GET /users/:userId/meals/nutrients', () => {
	it('returns nutrient groups across meals', async () => {
		const res = await request(app).get(`/users/${userId}/meals/nutrients`);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});

	it('accepts date range params', async () => {
		const res = await request(app).get(
			`/users/${userId}/meals/nutrients?from=2024-01-01&to=2026-12-31`,
		);
		expect(res.status).toBe(200);
	});
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
