import { describe, expect, it, vi } from 'vitest';
import type { LlmClient } from './llm/llmClient.js';
import { LlmParseError } from './llm/llmErrors.js';
import { createLlmService } from './llmService.js';

const catalog = [
	{ id: 3, name: 'Protein' },
	{ id: 4, name: 'Total lipid (fat)' },
	{ id: 5, name: 'Carbohydrate, by difference' },
];

function mockClient(complete: LlmClient['complete']): LlmClient {
	return { complete };
}

describe('createLlmService', () => {
	it('maps nutrition facts onto catalog nutrients and drops unknown ids', async () => {
		const complete = vi.fn().mockResolvedValue(
			JSON.stringify({
				serving_grams: 40,
				nutrients: [
					{ element_id: 3, grams: 10 },
					{ element_id: 999, grams: 1 },
					{ element_id: 4, grams: 2.5 },
				],
			}),
		);
		const service = await createLlmService(mockClient(complete), {
			nutrients: catalog,
		});

		const result = await service.parseNutritionFactsImage({
			mimeType: 'image/jpeg',
			data: Buffer.from([0xff, 0xd8, 0xff]),
		});

		expect(result).toEqual({
			serving_grams: 40,
			nutrients: [
				{ element_id: 3, name: 'Protein', grams: 10 },
				{ element_id: 4, name: 'Total lipid (fat)', grams: 2.5 },
			],
		});
		expect(complete).toHaveBeenCalledOnce();
		expect(complete.mock.calls[0]?.[0].image?.mimeType).toBe('image/jpeg');
	});

	it('throws when nutrition JSON is invalid', async () => {
		const service = await createLlmService(
			mockClient(vi.fn().mockResolvedValue('not json')),
			{ nutrients: catalog },
		);

		await expect(
			service.parseNutritionFactsImage({
				mimeType: 'image/png',
				data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
			}),
		).rejects.toBeInstanceOf(LlmParseError);
	});

	it('throws when serving size is missing', async () => {
		const service = await createLlmService(
			mockClient(
				vi.fn().mockResolvedValue(
					JSON.stringify({
						nutrients: [{ element_id: 3, grams: 10 }],
					}),
				),
			),
			{ nutrients: catalog },
		);

		await expect(
			service.parseNutritionFactsImage({
				mimeType: 'image/png',
				data: Buffer.from([0x89]),
			}),
		).rejects.toThrow(/schema/);
	});

	it('parses dictation with quantity, unit, and grams', async () => {
		const service = await createLlmService(
			mockClient(
				vi.fn().mockResolvedValue(
					JSON.stringify({
						items: [
							{ name: 'chicken', quantity: 120, unit: 'g', grams: 120 },
							{ name: 'egg', quantity: 2, unit: 'large', grams: 100 },
						],
					}),
				),
			),
			{ nutrients: catalog },
		);

		await expect(
			service.parseDictation('120 grams of chicken and two large eggs'),
		).resolves.toEqual({
			items: [
				{ name: 'chicken', quantity: 120, unit: 'g', grams: 120 },
				{ name: 'egg', quantity: 2, unit: 'large', grams: 100 },
			],
		});
	});

	it('throws when dictation returns no items', async () => {
		const service = await createLlmService(
			mockClient(vi.fn().mockResolvedValue(JSON.stringify({ items: [] }))),
			{ nutrients: catalog },
		);

		await expect(service.parseDictation('nothing really')).rejects.toThrow(
			/schema/,
		);
	});

	it('throws on empty dictation text before calling the model', async () => {
		const complete = vi.fn();
		const service = await createLlmService(mockClient(complete), {
			nutrients: catalog,
		});

		await expect(service.parseDictation('   ')).rejects.toBeInstanceOf(
			LlmParseError,
		);
		expect(complete).not.toHaveBeenCalled();
	});
});
