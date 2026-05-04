import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, db } from '../test/app.js';

const app = buildApp();

let nutrientId: number;
let wholeFoodId: number;
let measureWithElementId: number;
let measureElementId: number;

beforeAll(async () => {
	const nutrient = await db
		.selectFrom('element')
		.select('id')
		.where('type', '=', 'nutrient')
		.limit(1)
		.executeTakeFirstOrThrow();
	nutrientId = nutrient.id;

	const wholeFood = await db
		.selectFrom('element')
		.select('id')
		.where('type', '=', 'whole_food')
		.limit(1)
		.executeTakeFirstOrThrow();
	wholeFoodId = wholeFood.id;

	const measure = await db
		.selectFrom('measure')
		.select(['id', 'element_id'])
		.where('element_id', 'is not', null)
		.limit(1)
		.executeTakeFirstOrThrow();
	measureWithElementId = measure.id;
	measureElementId = measure.element_id as number;
});

afterAll(async () => {
	await db.destroy();
});

describe('GET /elements', () => {
	it('returns 200 with an array', async () => {
		const res = await request(app).get('/elements');
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.length).toBeGreaterThan(0);
	});

	it('filters by type=nutrient', async () => {
		const res = await request(app).get('/elements?type=nutrient');
		expect(res.status).toBe(200);
		expect(
			res.body.every((e: { type: string }) => e.type === 'nutrient'),
		).toBe(true);
	});

	it('filters by name with ?filter=', async () => {
		const res = await request(app).get('/elements?filter=water');
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});

	it('returns 400 for invalid type', async () => {
		const res = await request(app).get('/elements?type=garbage');
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/invalid type/);
	});
});

describe('GET /nutrient-groups', () => {
	it('returns 200 with non-empty array', async () => {
		const res = await request(app).get('/nutrient-groups');
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.length).toBeGreaterThan(0);
		const group = res.body[0];
		expect(group).toHaveProperty('id');
		expect(group).toHaveProperty('name');
		expect(group).toHaveProperty('display_order');
	});
});

describe('GET /element/:id/tree', () => {
	it('returns tree for a real element', async () => {
		const res = await request(app).get(`/element/${wholeFoodId}/tree`);
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			id: wholeFoodId,
			type: expect.any(String),
			name: expect.any(String),
			ratio: 1,
			children: expect.any(Array),
		});
	});

	it('returns 404 for nonexistent element', async () => {
		const res = await request(app).get('/element/999999999/tree');
		expect(res.status).toBe(404);
	});

	it('returns 400 for non-numeric id', async () => {
		const res = await request(app).get('/element/abc/tree');
		expect(res.status).toBe(400);
	});
});

describe('GET /element/:id/nutrients', () => {
	it('returns nutrient groups for a real element', async () => {
		const res = await request(app).get(`/element/${wholeFoodId}/nutrients`);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		const group = res.body[0];
		expect(group).toHaveProperty('nutrients');
		expect(Array.isArray(group.nutrients)).toBe(true);
	});

	it('scales amounts with ?mass=100', async () => {
		const [base, scaled] = await Promise.all([
			request(app).get(`/element/${wholeFoodId}/nutrients`),
			request(app).get(`/element/${wholeFoodId}/nutrients?mass=100`),
		]);
		expect(base.status).toBe(200);
		expect(scaled.status).toBe(200);
		const baseAmount: number = base.body[0]?.nutrients[0]?.amount;
		const scaledAmount: number = scaled.body[0]?.nutrients[0]?.amount;
		if (baseAmount !== undefined && scaledAmount !== undefined) {
			expect(scaledAmount).toBeCloseTo(baseAmount * 100, 5);
		}
	});

	it('returns 400 for negative mass', async () => {
		const res = await request(app).get(
			`/element/${wholeFoodId}/nutrients?mass=-1`,
		);
		expect(res.status).toBe(400);
	});

	it('returns 400 for zero mass', async () => {
		const res = await request(app).get(
			`/element/${wholeFoodId}/nutrients?mass=0`,
		);
		expect(res.status).toBe(400);
	});

	it('returns 404 for nonexistent element', async () => {
		const res = await request(app).get('/element/999999999/nutrients');
		expect(res.status).toBe(404);
	});
});

describe('GET /measures', () => {
	it('returns global measures (element_id is null)', async () => {
		const res = await request(app).get('/measures');
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.length).toBeGreaterThan(0);
		expect(
			res.body.every((m: { element_id: unknown }) => m.element_id === null),
		).toBe(true);
	});
});

describe('GET /measures/:elementId', () => {
	it('returns global + element-specific measures', async () => {
		const res = await request(app).get(`/measures/${measureElementId}`);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		const ids = res.body.map((m: { id: number }) => m.id);
		expect(ids).toContain(measureWithElementId);
	});

	it('returns only global measures for element with no custom measures', async () => {
		const res = await request(app).get(`/measures/${nutrientId}`);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});

	it('returns 400 for non-numeric elementId', async () => {
		const res = await request(app).get('/measures/abc');
		expect(res.status).toBe(400);
	});
});
