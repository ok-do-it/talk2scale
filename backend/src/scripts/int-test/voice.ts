import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
	assertDatabaseConnection,
	closeDatabaseConnection,
} from '../../db/client.js';
import type { FoodNameSearchHit } from '../../service/embeddingService.js';
import { createEmbeddingService } from '../../service/embeddingService.js';
import { createVoiceService } from '../../service/voiceService.js';
import {
	applyStrictExit,
	buildSummary,
	checkFoodMatch,
	intTestDir,
	normalizeText,
	parseStrictFlag,
} from './common.js';

const voiceTestDir = path.join(intTestDir, 'voice');
const expectationsPath = path.join(voiceTestDir, 'expectations.json');

type VoiceTestExpectation = {
	filename: string;
	expected_text: string;
	expected_food_item_id: number;
};

type ExpectationCheck = {
	expected_text: string;
	expected_food_item_id: number;
	textMatch: boolean;
	foodMatch: boolean;
	passed: boolean;
};

type VoiceTestCaseResult = {
	filename: string;
	transcribe: {
		text: string;
	};
	lookup: {
		hits: FoodNameSearchHit[];
	};
	expectations: ExpectationCheck | null;
	error: string | null;
};

type VoiceTestReport = {
	strict: boolean;
	voiceTestDir: string;
	summary: ReturnType<typeof buildSummary>;
	results: VoiceTestCaseResult[];
};

async function discoverM4aFiles(): Promise<string[]> {
	const entries = await readdir(voiceTestDir, { withFileTypes: true });
	return entries
		.filter(
			(entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.m4a'),
		)
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b));
}

async function loadExpectations(): Promise<Map<string, VoiceTestExpectation>> {
	const raw = await readFile(expectationsPath, 'utf8');
	const parsed = JSON.parse(raw) as VoiceTestExpectation[];
	const map = new Map<string, VoiceTestExpectation>();
	for (const item of parsed) {
		map.set(item.filename, item);
	}
	return map;
}

function checkExpectations(
	expectation: VoiceTestExpectation | undefined,
	text: string,
	food: FoodNameSearchHit | undefined,
): ExpectationCheck | null {
	if (!expectation) {
		return null;
	}

	const textMatch =
		normalizeText(text) === normalizeText(expectation.expected_text);
	const foodMatch = checkFoodMatch(expectation.expected_food_item_id, food);

	return {
		expected_text: expectation.expected_text,
		expected_food_item_id: expectation.expected_food_item_id,
		textMatch,
		foodMatch,
		passed: textMatch && foodMatch,
	};
}

async function main(): Promise<void> {
	const strict = parseStrictFlag();
	const [filenames, expectations] = await Promise.all([
		discoverM4aFiles(),
		loadExpectations(),
	]);

	if (filenames.length === 0) {
		throw new Error(`No .m4a files found in ${voiceTestDir}`);
	}

	const voiceService = await createVoiceService();
	const embeddingService = await createEmbeddingService();
	await assertDatabaseConnection();

	const results: VoiceTestCaseResult[] = [];
	const missingExpectations: string[] = [];

	for (const filename of filenames) {
		if (!expectations.has(filename)) {
			missingExpectations.push(filename);
		}

		try {
			const audioPath = path.join(voiceTestDir, filename);
			const audio = await readFile(audioPath);
			const text = await voiceService.foodNameToText(audio);
			const hits = await embeddingService.searchFoodName(text);
			const expectation = expectations.get(filename);

			results.push({
				filename,
				transcribe: { text },
				lookup: { hits },
				expectations: checkExpectations(expectation, text, hits[0]),
				error: null,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			results.push({
				filename,
				transcribe: { text: '' },
				lookup: { hits: [] },
				expectations: null,
				error: message,
			});
		}
	}

	const summary = buildSummary(results, missingExpectations);

	const report: VoiceTestReport = {
		strict,
		voiceTestDir,
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
