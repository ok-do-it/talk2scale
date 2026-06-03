import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	assertDatabaseConnection,
	closeDatabaseConnection,
} from '../db/client.js';
import type { FoodNameSearchHit } from '../service/embeddingService.js';
import { createEmbeddingService } from '../service/embeddingService.js';
import { createVoiceService } from '../service/voiceService.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, '..', '..');
const voiceTestDir = path.join(backendDir, 'voice-test');
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
		winner: FoodNameSearchHit | null;
		hits: FoodNameSearchHit[];
	};
	expectations: ExpectationCheck | null;
	error: string | null;
};

type VoiceTestReport = {
	strict: boolean;
	voiceTestDir: string;
	summary: {
		total: number;
		passed: number;
		failed: number;
		errors: number;
		missingExpectations: string[];
	};
	results: VoiceTestCaseResult[];
};

function parseArgs(): { strict: boolean } {
	return { strict: process.argv.includes('--strict') };
}

function normalizeText(value: string): string {
	return value.trim().toLowerCase();
}

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
	winner: FoodNameSearchHit | null,
): ExpectationCheck | null {
	if (!expectation) {
		return null;
	}

	const textMatch =
		normalizeText(text) === normalizeText(expectation.expected_text);
	const foodMatch = winner?.elementId === expectation.expected_food_item_id;

	return {
		expected_text: expectation.expected_text,
		expected_food_item_id: expectation.expected_food_item_id,
		textMatch,
		foodMatch,
		passed: textMatch && foodMatch,
	};
}

async function main(): Promise<void> {
	const { strict } = parseArgs();
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
			const lookup = await embeddingService.searchFoodName(text);
			const expectation = expectations.get(filename);

			results.push({
				filename,
				transcribe: { text },
				lookup,
				expectations: checkExpectations(expectation, text, lookup.winner),
				error: null,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			results.push({
				filename,
				transcribe: { text: '' },
				lookup: { winner: null, hits: [] },
				expectations: null,
				error: message,
			});
		}
	}

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

	const report: VoiceTestReport = {
		strict,
		voiceTestDir,
		summary: {
			total: results.length,
			passed,
			failed,
			errors,
			missingExpectations,
		},
		results,
	};

	console.log(JSON.stringify(report, null, 2));

	if (strict && (failed > 0 || errors > 0 || missingExpectations.length > 0)) {
		process.exitCode = 1;
	}
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
