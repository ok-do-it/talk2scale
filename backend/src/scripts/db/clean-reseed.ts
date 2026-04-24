import { createReadStream, constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse';
import { logger } from '../../config/logger.js';
import { closeDatabaseConnection, db } from '../../db/client.js';
import { COLUMN, TABLE } from '../../db/typeIdentifiers.js';
import { recreateDatabase } from './clean-db.js';
import { dedupeWholeFoods } from './dedupe-whole-foods.js';

type CsvRow = Record<string, string>;
type CsvRowWithNumber = {
	row: CsvRow;
	rowNumber: number;
};

const FOOD_BATCH_SIZE = 5000;
const LINK_BATCH_SIZE = 5000;
const ALIAS_BATCH_SIZE = 5000;
const UNIT_BATCH_SIZE = 5000;
const LOOKUP_CHUNK_SIZE = 10000;
const LOG_EVERY_ROWS = 10000;
const EXPECTED_DATA_TYPE = 'foundation_food';
const FOUNDATION_DATASET_DIR = path.resolve(
	process.cwd(),
	'../db/dataset/usda/FoodData_Central_foundation_food_csv_2025-12-18',
);

function toNumber(value: number | string): number {
	return typeof value === 'number' ? value : Number(value);
}

function parseInteger(value: string | undefined): number | null {
	if (!value) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveNumber(value: string | undefined): number | null {
	if (!value) return null;
	const parsed = Number.parseFloat(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return null;
	return parsed;
}

function normalizeMassUnit(unitName: string | undefined): string | null {
	if (!unitName) return null;
	const normalized = unitName.trim().toLowerCase();
	if (normalized === 'g' || normalized === 'gram' || normalized === 'grams')
		return 'g';
	if (
		normalized === 'mg' ||
		normalized === 'milligram' ||
		normalized === 'milligrams'
	)
		return 'mg';
	if (
		normalized === 'ug' ||
		normalized === 'mcg' ||
		normalized === 'µg' ||
		normalized === 'microgram' ||
		normalized === 'micrograms'
	) {
		return 'ug';
	}
	return null;
}

function unitMultiplierInGrams(unitName: string | undefined): number | null {
	const normalized = normalizeMassUnit(unitName);
	if (normalized === 'g') return 1;
	if (normalized === 'mg') return 0.001;
	if (normalized === 'ug') return 0.000001;
	return null;
}

const SKIP_LOG_LIMIT = 10;

class SkipCounter {
	private counts = new Map<string, number>();
	private fileName: string;

	constructor(fileName: string) {
		this.fileName = fileName;
	}

	add(reason: string, rowNumber: number, csvLine: CsvRow): void {
		const prev = this.counts.get(reason) ?? 0;
		this.counts.set(reason, prev + 1);
		if (prev < SKIP_LOG_LIMIT) {
			logger.warn(
				{ file: this.fileName, row: rowNumber, reason, csvLine },
				'Skipped row',
			);
		}
	}

	countOnly(reason: string): void {
		this.counts.set(reason, (this.counts.get(reason) ?? 0) + 1);
	}

	get total(): number {
		let sum = 0;
		for (const c of this.counts.values()) sum += c;
		return sum;
	}

	toSummary(): Record<string, number> {
		return Object.fromEntries(this.counts);
	}
}

async function ensureReadableFile(filePath: string): Promise<void> {
	await access(filePath, fsConstants.R_OK);
}

async function* readCsvRows(
	filePath: string,
): AsyncGenerator<CsvRowWithNumber> {
	const parser = parse({
		columns: true,
		bom: true,
		trim: true,
		skip_empty_lines: true,
		relax_column_count: true,
	});

	createReadStream(filePath).pipe(parser);
	let rowNumber = 1;
	for await (const row of parser) {
		rowNumber += 1;
		yield { row: row as CsvRow, rowNumber };
	}
}

async function loadElementIdsByExternalIds(
	externalIds: number[],
): Promise<Map<number, number>> {
	const elementByExternalId = new Map<number, number>();
	if (externalIds.length === 0) return elementByExternalId;

	for (
		let offset = 0;
		offset < externalIds.length;
		offset += LOOKUP_CHUNK_SIZE
	) {
		const chunk = externalIds
			.slice(offset, offset + LOOKUP_CHUNK_SIZE)
			.map((externalId) => String(externalId));
		const rows = await db
			.selectFrom(TABLE.element)
			.select([COLUMN.element.id, COLUMN.element.external_id])
			.where(COLUMN.element.external_id, 'in', chunk)
			.execute();

		for (const row of rows) {
			const parsedExternalId = parseInteger(row.external_id ?? undefined);
			if (parsedExternalId == null) continue;
			elementByExternalId.set(parsedExternalId, toNumber(row.id));
		}
	}

	return elementByExternalId;
}

async function importNutrients(datasetDir: string): Promise<{
	nutrientElementByUsdaId: Map<number, number>;
	nutrientMultiplierByUsdaId: Map<number, number>;
}> {
	const nutrientFilePath = path.join(datasetDir, 'nutrient.csv');
	logger.info({ nutrientFilePath }, 'Phase 1: importing nutrients');

	const nutrientRows: Array<{
		type: 'nutrient';
		name: string;
		source: 'usda';
		external_id: string;
	}> = [];
	const nutrientMultiplierByUsdaId = new Map<number, number>();

	let totalRows = 0;
	const skipped = new SkipCounter('nutrient.csv');

	for await (const { row, rowNumber } of readCsvRows(nutrientFilePath)) {
		totalRows += 1;

		const nutrientId = parseInteger(row.id);
		if (nutrientId == null) {
			skipped.add('missing nutrient id', rowNumber, row);
			continue;
		}

		const multiplier = unitMultiplierInGrams(row.unit_name);
		if (multiplier == null) {
			skipped.add(
				`unsupported unit (not mass): ${(row.unit_name ?? '').trim() || '<empty>'}`,
				rowNumber,
				row,
			);
			continue;
		}

		nutrientMultiplierByUsdaId.set(nutrientId, multiplier);
		nutrientRows.push({
			type: 'nutrient',
			name: (row.name ?? '').trim() || `USDA nutrient ${nutrientId}`,
			source: 'usda',
			external_id: String(nutrientId),
		});
	}

	if (nutrientRows.length > 0) {
		await db
			.insertInto(TABLE.element)
			.values(nutrientRows)
			.onConflict((oc) =>
				oc
					.columns([COLUMN.element.source, COLUMN.element.external_id])
					.where(COLUMN.element.external_id, 'is not', null)
					.doNothing(),
			)
			.execute();
	}

	const nutrientElementByUsdaId = await loadElementIdsByExternalIds([
		...nutrientMultiplierByUsdaId.keys(),
	]);

	logger.info(
		{
			totalRows,
			importedOrExisting: nutrientElementByUsdaId.size,
			skipped: skipped.toSummary(),
		},
		'Phase 1 complete',
	);

	return { nutrientElementByUsdaId, nutrientMultiplierByUsdaId };
}

async function importFoods(datasetDir: string): Promise<Map<number, number>> {
	const foodFilePath = path.join(datasetDir, 'food.csv');
	logger.info(
		{ foodFilePath, expectedDataType: EXPECTED_DATA_TYPE },
		'Phase 2: importing foods',
	);

	const foodElementByFdcId = new Map<number, number>();
	const pendingElements: Array<{
		type: 'whole_food';
		name: string;
		source: 'usda';
		external_id: string;
	}> = [];
	let pendingFdcIds: number[] = [];

	let totalRows = 0;
	let matchedRows = 0;
	let insertedRows = 0;
	const skipped = new SkipCounter('food.csv');

	const flush = async (): Promise<void> => {
		if (pendingElements.length === 0) return;

		await db
			.insertInto(TABLE.element)
			.values(pendingElements)
			.onConflict((oc) =>
				oc
					.columns([COLUMN.element.source, COLUMN.element.external_id])
					.where(COLUMN.element.external_id, 'is not', null)
					.doNothing(),
			)
			.execute();

		insertedRows += pendingElements.length;

		const loaded = await loadElementIdsByExternalIds(pendingFdcIds);
		for (const [usdaId, elementId] of loaded) {
			foodElementByFdcId.set(usdaId, elementId);
		}

		pendingElements.length = 0;
		pendingFdcIds = [];
	};

	for await (const { row, rowNumber } of readCsvRows(foodFilePath)) {
		totalRows += 1;

		const dataType = (row.data_type ?? '').trim();
		if (dataType !== EXPECTED_DATA_TYPE) {
			skipped.countOnly(`non-foundation data_type: ${dataType || '<empty>'}`);
			continue;
		}

		matchedRows += 1;
		const fdcId = parseInteger(row.fdc_id);
		if (fdcId == null) {
			skipped.add('missing fdc_id', rowNumber, row);
			continue;
		}

		pendingElements.push({
			type: 'whole_food',
			name: (row.description ?? '').trim() || `USDA food ${fdcId}`,
			source: 'usda',
			external_id: String(fdcId),
		});
		pendingFdcIds.push(fdcId);

		if (pendingElements.length >= FOOD_BATCH_SIZE) {
			await flush();
		}

		if (matchedRows % LOG_EVERY_ROWS === 0) {
			logger.info(
				{ matchedRows, knownFoods: foodElementByFdcId.size },
				'Phase 2 progress',
			);
		}
	}

	await flush();

	logger.info(
		{
			totalRows,
			matchedRows,
			insertedRows,
			mappedFoodRows: foodElementByFdcId.size,
			skipped: skipped.toSummary(),
		},
		'Phase 2 complete',
	);

	return foodElementByFdcId;
}

async function importLinks(
	datasetDir: string,
	foodElementByFdcId: Map<number, number>,
	nutrientElementByUsdaId: Map<number, number>,
	nutrientMultiplierByUsdaId: Map<number, number>,
): Promise<void> {
	const foodNutrientFilePath = path.join(datasetDir, 'food_nutrient.csv');
	logger.info({ foodNutrientFilePath }, 'Phase 3: importing links');

	const pendingLinks: Array<{
		parent_id: number;
		child_id: number;
		ratio: number;
	}> = [];

	let totalRows = 0;
	let insertedRows = 0;
	const skipped = new SkipCounter('food_nutrient.csv');

	const flush = async (): Promise<void> => {
		if (pendingLinks.length === 0) return;
		await db
			.insertInto(TABLE.link)
			.values(pendingLinks)
			.onConflict((oc) =>
				oc.columns([COLUMN.link.parent_id, COLUMN.link.child_id]).doNothing(),
			)
			.execute();
		insertedRows += pendingLinks.length;
		pendingLinks.length = 0;
	};

	for await (const { row, rowNumber } of readCsvRows(foodNutrientFilePath)) {
		totalRows += 1;

		const fdcId = parseInteger(row.fdc_id);
		const nutrientId = parseInteger(row.nutrient_id);
		const amount = parsePositiveNumber(row.amount);
		if (fdcId == null || nutrientId == null || amount == null) {
			skipped.add('missing fdc_id/nutrient_id/amount', rowNumber, row);
			continue;
		}

		const parentElementId = foodElementByFdcId.get(fdcId);
		if (parentElementId == null) {
			skipped.add('unknown food fdc_id', rowNumber, row);
			continue;
		}

		const childElementId = nutrientElementByUsdaId.get(nutrientId);
		const multiplier = nutrientMultiplierByUsdaId.get(nutrientId);
		if (childElementId == null || multiplier == null) {
			skipped.add('unknown nutrient id', rowNumber, row);
			continue;
		}

		const ratio = (amount * multiplier) / 100;
		if (!Number.isFinite(ratio) || ratio <= 0) {
			skipped.add('invalid ratio (zero or non-finite)', rowNumber, row);
			continue;
		}

		pendingLinks.push({
			parent_id: parentElementId,
			child_id: childElementId,
			ratio,
		});

		if (pendingLinks.length >= LINK_BATCH_SIZE) {
			await flush();
		}

		if (totalRows % LOG_EVERY_ROWS === 0) {
			logger.info(
				{ totalRows, insertedRows, skipped: skipped.total },
				'Phase 3 progress',
			);
		}
	}

	await flush();
	logger.info(
		{ totalRows, insertedRows, skipped: skipped.toSummary() },
		'Phase 3 complete',
	);
}

async function importBaseAliases(
	datasetDir: string,
	foodElementByFdcId: Map<number, number>,
): Promise<void> {
	const foodFilePath = path.join(datasetDir, 'food.csv');
	logger.info({ foodFilePath }, 'Phase 4A: importing food description aliases');

	const pendingAliases: Array<{
		element_id: number;
		name: string;
		locale: string | null;
	}> = [];

	let totalRows = 0;
	let insertedRows = 0;
	const skipped = new SkipCounter('food.csv');

	const flush = async (): Promise<void> => {
		if (pendingAliases.length === 0) return;
		await db.insertInto(TABLE.food_name).values(pendingAliases).execute();
		insertedRows += pendingAliases.length;
		pendingAliases.length = 0;
	};

	for await (const { row, rowNumber } of readCsvRows(foodFilePath)) {
		totalRows += 1;

		const dataType = (row.data_type ?? '').trim();
		if (dataType !== EXPECTED_DATA_TYPE) {
			skipped.countOnly(`non-foundation data_type: ${dataType || '<empty>'}`);
			continue;
		}

		const fdcId = parseInteger(row.fdc_id);
		if (fdcId == null) {
			skipped.add('missing fdc_id', rowNumber, row);
			continue;
		}

		const elementId = foodElementByFdcId.get(fdcId);
		if (elementId == null) {
			skipped.add('unknown food fdc_id', rowNumber, row);
			continue;
		}

		const name = (row.description ?? '').trim();
		if (!name) {
			skipped.add('empty description', rowNumber, row);
			continue;
		}

		pendingAliases.push({
			element_id: elementId,
			name,
			locale: 'en',
		});

		if (pendingAliases.length >= ALIAS_BATCH_SIZE) {
			await flush();
		}
	}

	await flush();
	logger.info(
		{ totalRows, insertedRows, skipped: skipped.toSummary() },
		'Phase 4A complete',
	);
}

async function importFoundationUnits(
	datasetDir: string,
	foodElementByFdcId: Map<number, number>,
): Promise<void> {
	const foodPortionFilePath = path.join(datasetDir, 'food_portion.csv');
	logger.info(
		{ foodPortionFilePath },
		'Phase 5: importing foundation portions',
	);

	const pendingUnits: Array<{
		element_id: number | null;
		name: string;
		grams: number;
	}> = [];

	let totalRows = 0;
	let insertedRows = 0;
	const skipped = new SkipCounter('food_portion.csv');

	const flush = async (): Promise<void> => {
		if (pendingUnits.length === 0) return;
		await db.insertInto(TABLE.measure).values(pendingUnits).execute();
		insertedRows += pendingUnits.length;
		pendingUnits.length = 0;
	};

	for await (const { row, rowNumber } of readCsvRows(foodPortionFilePath)) {
		totalRows += 1;

		const fdcId = parseInteger(row.fdc_id);
		const grams = parsePositiveNumber(row.gram_weight);
		if (fdcId == null || grams == null) {
			skipped.add('missing fdc_id or gram_weight', rowNumber, row);
			continue;
		}

		const elementId = foodElementByFdcId.get(fdcId);
		if (elementId == null) {
			skipped.add('unknown food fdc_id', rowNumber, row);
			continue;
		}

		const rawName =
			(row.portion_description ?? '').trim() || (row.modifier ?? '').trim();
		if (!rawName) {
			skipped.add('empty portion name', rowNumber, row);
			continue;
		}

		pendingUnits.push({
			element_id: elementId,
			name: rawName,
			grams,
		});

		if (pendingUnits.length >= UNIT_BATCH_SIZE) {
			await flush();
		}
	}

	await flush();
	logger.info(
		{ totalRows, insertedRows, skipped: skipped.toSummary() },
		'Phase 5 complete',
	);
}

async function main(): Promise<void> {
	const shouldSkipRecreate = process.argv.includes('--skip-recreate');
	if (shouldSkipRecreate) {
		logger.info(
			'Skipping DB recreation before import (--skip-recreate provided)',
		);
	} else {
		logger.info('Recreating DB before USDA import');
		await recreateDatabase();
	}

	const datasetDir = FOUNDATION_DATASET_DIR;

	const requiredFiles = [
		path.join(datasetDir, 'nutrient.csv'),
		path.join(datasetDir, 'food.csv'),
		path.join(datasetDir, 'food_nutrient.csv'),
		path.join(datasetDir, 'food_portion.csv'),
	];

	for (const filePath of requiredFiles) {
		await ensureReadableFile(filePath);
	}

	logger.info({ datasetDir, foodType: 'whole_food' }, 'Starting USDA import');

	const { nutrientElementByUsdaId, nutrientMultiplierByUsdaId } =
		await importNutrients(datasetDir);
	const foodElementByFdcId = await importFoods(datasetDir);

	await importLinks(
		datasetDir,
		foodElementByFdcId,
		nutrientElementByUsdaId,
		nutrientMultiplierByUsdaId,
	);

	await importBaseAliases(datasetDir, foodElementByFdcId);
	await importFoundationUnits(datasetDir, foodElementByFdcId);

	await dedupeWholeFoods();

	logger.info(
		{
			importedFoods: foodElementByFdcId.size,
			importedNutrients: nutrientElementByUsdaId.size,
		},
		'USDA import finished',
	);
}

try {
	await main();
} catch (error) {
	logger.error({ err: error }, 'USDA import failed');
	process.exitCode = 1;
} finally {
	await closeDatabaseConnection();
}
