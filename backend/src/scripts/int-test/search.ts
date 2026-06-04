import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
	assertDatabaseConnection,
	closeDatabaseConnection,
} from '../../db/client.js';
import type { FoodNameSearchHit } from '../../service/embeddingService.js';
import { createEmbeddingService } from '../../service/embeddingService.js';
import {
	applyStrictExit,
	buildSummary,
	checkFoodMatch,
	intTestDir,
	parseStrictFlag,
} from './common.js';

const searchTestDir = path.join(intTestDir, 'search');
const expectationsPath = path.join(searchTestDir, 'expectations.json');

type SearchTestExpectation = {
	query: string;
	expected_food_item_id: number;
};

type ExpectationCheck = {
	expected_food_item_id: number;
	foodMatch: boolean;
	passed: boolean;
};

type SearchTestCaseResult = {
	query: string;
	lookup: {
		hits: FoodNameSearchHit[];
	};
	expectations: ExpectationCheck | null;
	error: string | null;
};

type SearchTestReport = {
	strict: boolean;
	searchTestDir: string;
	summary: ReturnType<typeof buildSummary>;
	results: SearchTestCaseResult[];
};

async function loadExpectations(): Promise<SearchTestExpectation[]> {
	const raw = await readFile(expectationsPath, 'utf8');
	return JSON.parse(raw) as SearchTestExpectation[];
}

function checkExpectations(
	expectation: SearchTestExpectation,
	food: FoodNameSearchHit | undefined,
): ExpectationCheck {
	const foodMatch = checkFoodMatch(expectation.expected_food_item_id, food);

	return {
		expected_food_item_id: expectation.expected_food_item_id,
		foodMatch,
		passed: foodMatch,
	};
}

async function main(): Promise<void> {
	const strict = parseStrictFlag();
	const expectations = await loadExpectations();

	if (expectations.length === 0) {
		throw new Error(`No cases found in ${expectationsPath}`);
	}

	const embeddingService = await createEmbeddingService();
	await assertDatabaseConnection();

	const results: SearchTestCaseResult[] = [];

	for (const expectation of expectations) {
		try {
			const hits = await embeddingService.searchFoodName(expectation.query);

			results.push({
				query: expectation.query,
				lookup: { hits },
				expectations: checkExpectations(expectation, hits[0]),
				error: null,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			results.push({
				query: expectation.query,
				lookup: { hits: [] },
				expectations: null,
				error: message,
			});
		}
	}

	const summary = buildSummary(results, []);

	const report: SearchTestReport = {
		strict,
		searchTestDir,
		summary,
		results,
	};

	console.log(JSON.stringify(report, null, 2));
	applyStrictExit(strict, summary);
}

try {
	await main();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
} finally {
	await closeDatabaseConnection();
}
