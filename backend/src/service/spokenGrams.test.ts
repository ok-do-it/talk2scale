import { describe, expect, it } from 'vitest';
import { parseSpokenGrams } from './spokenGrams.js';

describe('parseSpokenGrams', () => {
	it('parses leading weight with glued unit', () => {
		expect(parseSpokenGrams('100g chicken')).toEqual({
			foodName: 'chicken',
			grams: 100,
		});
	});

	it('parses leading weight with space and grams', () => {
		expect(parseSpokenGrams('100 grams chicken')).toEqual({
			foodName: 'chicken',
			grams: 100,
		});
	});

	it('parses leading weight with of', () => {
		expect(parseSpokenGrams('150 g of oatmeal')).toEqual({
			foodName: 'oatmeal',
			grams: 150,
		});
	});

	it('parses trailing weight', () => {
		expect(parseSpokenGrams('chicken 50g')).toEqual({
			foodName: 'chicken',
			grams: 50,
		});
		expect(parseSpokenGrams('chicken 50 grams')).toEqual({
			foodName: 'chicken',
			grams: 50,
		});
	});

	it('parses singular gram', () => {
		expect(parseSpokenGrams('1 gram egg')).toEqual({
			foodName: 'egg',
			grams: 1,
		});
	});

	it('rounds fractional grams', () => {
		expect(parseSpokenGrams('12.6 g rice')).toEqual({
			foodName: 'rice',
			grams: 13,
		});
	});

	it('returns null grams when no unit is present', () => {
		expect(parseSpokenGrams('1000 island dressing')).toEqual({
			foodName: '1000 island dressing',
			grams: null,
		});
		expect(parseSpokenGrams('chicken')).toEqual({
			foodName: 'chicken',
			grams: null,
		});
	});

	it('keeps original text when weight-only or invalid', () => {
		expect(parseSpokenGrams('100 grams')).toEqual({
			foodName: '100 grams',
			grams: null,
		});
		expect(parseSpokenGrams('0g chicken')).toEqual({
			foodName: '0g chicken',
			grams: null,
		});
	});

	it('trims whitespace and trailing punctuation on weight', () => {
		expect(parseSpokenGrams('  chicken 80 g.  ')).toEqual({
			foodName: 'chicken',
			grams: 80,
		});
	});
});
