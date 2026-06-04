import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FoodNameSearchHit } from '../../service/embeddingService.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const backendDir = path.resolve(scriptDir, '..', '..', '..');
export const intTestDir = path.join(backendDir, 'int-test');

export type IntTestSummary = {
	total: number;
	passed: number;
	failed: number;
	errors: number;
	missingExpectations: string[];
};

export function parseStrictFlag(): boolean {
	return process.argv.includes('--strict');
}

export function normalizeText(value: string): string {
	return value.trim().toLowerCase();
}

export function checkFoodMatch(
	expectedFoodItemId: number,
	food: FoodNameSearchHit | undefined,
): boolean {
	return food?.elementId === expectedFoodItemId;
}

export function buildSummary<
	T extends { error: string | null; expectations: { passed: boolean } | null },
>(results: T[], missingExpectations: string[]): IntTestSummary {
	const passed = results.filter(
		(result) =>
			result.error === null &&
			(result.expectations === null || result.expectations.passed),
	).length;
	const failed = results.filter(
		(result) =>
			result.error === null &&
			result.expectations !== null &&
			!result.expectations.passed,
	).length;
	const errors = results.filter((result) => result.error !== null).length;

	return {
		total: results.length,
		passed,
		failed,
		errors,
		missingExpectations,
	};
}

export function applyStrictExit(
	strict: boolean,
	summary: IntTestSummary,
): void {
	if (
		strict &&
		(summary.failed > 0 ||
			summary.errors > 0 ||
			summary.missingExpectations.length > 0)
	) {
		process.exitCode = 1;
	}
}
