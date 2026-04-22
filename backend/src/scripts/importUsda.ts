import { constants as fsConstants } from 'node:fs';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse';
import { closeDatabaseConnection, db } from '../db/client.js';
import type { ElementType } from '../db/types.js';
import { COLUMN, TABLE } from '../db/typeIdentifiers.js';
import { logger } from '../config/logger.js';

type SupportedFoodType = Extract<ElementType, 'whole_food' | 'branded_food'>;

type CsvRow = Record<string, string>;

const FOOD_BATCH_SIZE = 5000;
const LINK_BATCH_SIZE = 5000;
const ALIAS_BATCH_SIZE = 5000;
const UNIT_BATCH_SIZE = 5000;
const LOOKUP_CHUNK_SIZE = 10000;
const LOG_EVERY_ROWS = 10000;

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
  if (normalized === 'g' || normalized === 'gram' || normalized === 'grams') return 'g';
  if (normalized === 'mg' || normalized === 'milligram' || normalized === 'milligrams') return 'mg';
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

function normalizeServingUnit(unitName: string | undefined): string | null {
  if (!unitName) return null;
  const normalized = unitName.trim().toLowerCase();
  if (normalized === 'g' || normalized === 'gram' || normalized === 'grams') return 'g';
  return null;
}

function targetFoodDataType(foodType: SupportedFoodType): string {
  return foodType === 'whole_food' ? 'foundation_food' : 'branded_food';
}

async function ensureReadableFile(filePath: string): Promise<void> {
  await access(filePath, fsConstants.R_OK);
}

async function* readCsvRows(filePath: string): AsyncGenerator<CsvRow> {
  const parser = parse({
    columns: true,
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  createReadStream(filePath).pipe(parser);
  for await (const row of parser) {
    yield row as CsvRow;
  }
}

async function loadElementIdsByExternalIds(externalIds: number[]): Promise<Map<number, number>> {
  const elementByExternalId = new Map<number, number>();
  if (externalIds.length === 0) return elementByExternalId;

  for (let offset = 0; offset < externalIds.length; offset += LOOKUP_CHUNK_SIZE) {
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
    type: ElementType;
    name: string;
    source: 'usda';
    external_id: string;
  }> = [];
  const nutrientMultiplierByUsdaId = new Map<number, number>();

  let totalRows = 0;
  let skippedNonMassRows = 0;

  for await (const row of readCsvRows(nutrientFilePath)) {
    totalRows += 1;

    const nutrientId = parseInteger(row.id);
    if (nutrientId == null) continue;

    const multiplier = unitMultiplierInGrams(row.unit_name);
    if (multiplier == null) {
      skippedNonMassRows += 1;
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
          .doNothing()
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
      skippedNonMassRows,
    },
    'Phase 1 complete'
  );

  return { nutrientElementByUsdaId, nutrientMultiplierByUsdaId };
}

async function importFoods(
  datasetDir: string,
  foodType: SupportedFoodType
): Promise<Map<number, number>> {
  const foodFilePath = path.join(datasetDir, 'food.csv');
  const expectedDataType = targetFoodDataType(foodType);
  logger.info({ foodFilePath, expectedDataType }, 'Phase 2: importing foods');

  const foodElementByFdcId = new Map<number, number>();
  const pendingElements: Array<{
    type: ElementType;
    name: string;
    source: 'usda';
    external_id: string;
  }> = [];
  let pendingFdcIds: number[] = [];

  let totalRows = 0;
  let matchedRows = 0;
  let insertedRows = 0;

  const flush = async (): Promise<void> => {
    if (pendingElements.length === 0) return;

    await db
      .insertInto(TABLE.element)
      .values(pendingElements)
      .onConflict((oc) =>
        oc
          .columns([COLUMN.element.source, COLUMN.element.external_id])
          .where(COLUMN.element.external_id, 'is not', null)
          .doNothing()
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

  for await (const row of readCsvRows(foodFilePath)) {
    totalRows += 1;

    if ((row.data_type ?? '').trim() !== expectedDataType) {
      continue;
    }

    matchedRows += 1;
    const fdcId = parseInteger(row.fdc_id);
    if (fdcId == null) continue;

    pendingElements.push({
      type: foodType,
      name: (row.description ?? '').trim() || `USDA food ${fdcId}`,
      source: 'usda',
      external_id: String(fdcId),
    });
    pendingFdcIds.push(fdcId);

    if (pendingElements.length >= FOOD_BATCH_SIZE) {
      await flush();
    }

    if (matchedRows % LOG_EVERY_ROWS === 0) {
      logger.info({ matchedRows, knownFoods: foodElementByFdcId.size }, 'Phase 2 progress');
    }
  }

  await flush();

  logger.info(
    {
      totalRows,
      matchedRows,
      insertedRows,
      mappedFoodRows: foodElementByFdcId.size,
    },
    'Phase 2 complete'
  );

  return foodElementByFdcId;
}

async function importLinks(
  datasetDir: string,
  foodElementByFdcId: Map<number, number>,
  nutrientElementByUsdaId: Map<number, number>,
  nutrientMultiplierByUsdaId: Map<number, number>
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
  let skippedRows = 0;

  const flush = async (): Promise<void> => {
    if (pendingLinks.length === 0) return;
    await db
      .insertInto(TABLE.link)
      .values(pendingLinks)
      .onConflict((oc) =>
        oc.columns([COLUMN.link.parent_id, COLUMN.link.child_id]).doNothing()
      )
      .execute();
    insertedRows += pendingLinks.length;
    pendingLinks.length = 0;
  };

  for await (const row of readCsvRows(foodNutrientFilePath)) {
    totalRows += 1;

    const fdcId = parseInteger(row.fdc_id);
    const nutrientId = parseInteger(row.nutrient_id);
    const amount = parsePositiveNumber(row.amount);
    if (fdcId == null || nutrientId == null || amount == null) {
      skippedRows += 1;
      continue;
    }

    const parentElementId = foodElementByFdcId.get(fdcId);
    const childElementId = nutrientElementByUsdaId.get(nutrientId);
    const multiplier = nutrientMultiplierByUsdaId.get(nutrientId);
    if (parentElementId == null || childElementId == null || multiplier == null) {
      skippedRows += 1;
      continue;
    }

    const ratio = (amount * multiplier) / 100;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      skippedRows += 1;
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
      logger.info({ totalRows, insertedRows, skippedRows }, 'Phase 3 progress');
    }
  }

  await flush();
  logger.info({ totalRows, insertedRows, skippedRows }, 'Phase 3 complete');
}

async function importBaseAliases(
  datasetDir: string,
  foodType: SupportedFoodType,
  foodElementByFdcId: Map<number, number>
): Promise<void> {
  const foodFilePath = path.join(datasetDir, 'food.csv');
  const expectedDataType = targetFoodDataType(foodType);
  logger.info({ foodFilePath }, 'Phase 4A: importing food description aliases');

  const pendingAliases: Array<{
    element_id: number;
    name: string;
    locale: string | null;
  }> = [];

  let totalRows = 0;
  let insertedRows = 0;

  const flush = async (): Promise<void> => {
    if (pendingAliases.length === 0) return;
    await db.insertInto(TABLE.food_name).values(pendingAliases).execute();
    insertedRows += pendingAliases.length;
    pendingAliases.length = 0;
  };

  for await (const row of readCsvRows(foodFilePath)) {
    totalRows += 1;
    if ((row.data_type ?? '').trim() !== expectedDataType) continue;

    const fdcId = parseInteger(row.fdc_id);
    if (fdcId == null) continue;

    const elementId = foodElementByFdcId.get(fdcId);
    if (elementId == null) continue;

    const name = (row.description ?? '').trim();
    if (!name) continue;

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
  logger.info({ totalRows, insertedRows }, 'Phase 4A complete');
}

async function importBrandedAliases(
  datasetDir: string,
  foodElementByFdcId: Map<number, number>
): Promise<void> {
  const brandedFoodFilePath = path.join(datasetDir, 'branded_food.csv');
  logger.info({ brandedFoodFilePath }, 'Phase 4B: importing branded aliases');

  const pendingAliases: Array<{
    element_id: number;
    name: string;
    locale: string | null;
  }> = [];

  let totalRows = 0;
  let insertedRows = 0;

  const flush = async (): Promise<void> => {
    if (pendingAliases.length === 0) return;
    await db.insertInto(TABLE.food_name).values(pendingAliases).execute();
    insertedRows += pendingAliases.length;
    pendingAliases.length = 0;
  };

  for await (const row of readCsvRows(brandedFoodFilePath)) {
    totalRows += 1;
    const fdcId = parseInteger(row.fdc_id);
    if (fdcId == null) continue;

    const elementId = foodElementByFdcId.get(fdcId);
    if (elementId == null) continue;

    const brandOwner = (row.brand_owner ?? '').trim();
    const brandName = (row.brand_name ?? '').trim();
    const joined = [brandOwner, brandName].filter(Boolean).join(' ');
    if (!joined) continue;

    pendingAliases.push({
      element_id: elementId,
      name: joined,
      locale: 'en',
    });

    if (pendingAliases.length >= ALIAS_BATCH_SIZE) {
      await flush();
    }
  }

  await flush();
  logger.info({ totalRows, insertedRows }, 'Phase 4B complete');
}

async function importFoundationUnits(
  datasetDir: string,
  foodElementByFdcId: Map<number, number>
): Promise<void> {
  const foodPortionFilePath = path.join(datasetDir, 'food_portion.csv');
  logger.info({ foodPortionFilePath }, 'Phase 5: importing foundation units');

  const pendingUnits: Array<{
    element_id: number | null;
    name: string;
    grams: number;
  }> = [];

  let totalRows = 0;
  let insertedRows = 0;
  let skippedRows = 0;

  const flush = async (): Promise<void> => {
    if (pendingUnits.length === 0) return;
    await db.insertInto(TABLE.measure).values(pendingUnits).execute();
    insertedRows += pendingUnits.length;
    pendingUnits.length = 0;
  };

  for await (const row of readCsvRows(foodPortionFilePath)) {
    totalRows += 1;

    const fdcId = parseInteger(row.fdc_id);
    const grams = parsePositiveNumber(row.gram_weight);
    if (fdcId == null || grams == null) {
      skippedRows += 1;
      continue;
    }

    const elementId = foodElementByFdcId.get(fdcId);
    if (elementId == null) {
      skippedRows += 1;
      continue;
    }

    const rawName = (row.portion_description ?? '').trim() || (row.modifier ?? '').trim() || 'portion';
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
  logger.info({ totalRows, insertedRows, skippedRows }, 'Phase 5 complete');
}

async function importBrandedUnits(
  datasetDir: string,
  foodElementByFdcId: Map<number, number>
): Promise<void> {
  const brandedFoodFilePath = path.join(datasetDir, 'branded_food.csv');
  logger.info({ brandedFoodFilePath }, 'Phase 5: importing branded units');

  const pendingUnits: Array<{
    element_id: number | null;
    name: string;
    grams: number;
  }> = [];

  let totalRows = 0;
  let insertedRows = 0;
  let skippedRows = 0;

  const flush = async (): Promise<void> => {
    if (pendingUnits.length === 0) return;
    await db.insertInto(TABLE.measure).values(pendingUnits).execute();
    insertedRows += pendingUnits.length;
    pendingUnits.length = 0;
  };

  for await (const row of readCsvRows(brandedFoodFilePath)) {
    totalRows += 1;

    const fdcId = parseInteger(row.fdc_id);
    const servingSize = parsePositiveNumber(row.serving_size);
    if (fdcId == null || servingSize == null) {
      skippedRows += 1;
      continue;
    }

    const elementId = foodElementByFdcId.get(fdcId);
    if (elementId == null) {
      skippedRows += 1;
      continue;
    }

    const servingUnit = normalizeServingUnit(row.serving_size_unit);
    if (servingUnit == null) {
      skippedRows += 1;
      continue;
    }

    const servingSizeUnitName = (row.serving_size_unit ?? '').trim() || servingUnit;
    const householdServing = (row.household_serving_fulltext ?? '').trim();

    pendingUnits.push({
      element_id: elementId,
      name: `${servingSizeUnitName} serving`,
      grams: servingSize,
    });

    if (householdServing && householdServing.toLowerCase() !== `${servingSizeUnitName} serving`.toLowerCase()) {
      pendingUnits.push({
        element_id: elementId,
        name: householdServing,
        grams: servingSize,
      });
    }

    if (pendingUnits.length >= UNIT_BATCH_SIZE) {
      await flush();
    }
  }

  await flush();
  logger.info({ totalRows, insertedRows, skippedRows }, 'Phase 5 complete');
}

async function main(): Promise<void> {
  const datasetDirArg = process.argv[2];
  const foodTypeArg = process.argv[3];

  if (!datasetDirArg || !foodTypeArg) {
    logger.error(
      'Usage: npx tsx src/scripts/importUsda.ts <dataset_dir> <whole_food|branded_food>'
    );
    process.exitCode = 1;
    return;
  }

  if (foodTypeArg !== 'whole_food' && foodTypeArg !== 'branded_food') {
    logger.error({ foodTypeArg }, 'Invalid food type argument');
    process.exitCode = 1;
    return;
  }

  const foodType = foodTypeArg as SupportedFoodType;
  const datasetDir = path.resolve(process.cwd(), datasetDirArg);

  const requiredFiles = [
    path.join(datasetDir, 'nutrient.csv'),
    path.join(datasetDir, 'food.csv'),
    path.join(datasetDir, 'food_nutrient.csv'),
    foodType === 'branded_food'
      ? path.join(datasetDir, 'branded_food.csv')
      : path.join(datasetDir, 'food_portion.csv'),
  ];

  for (const filePath of requiredFiles) {
    await ensureReadableFile(filePath);
  }

  logger.info({ datasetDir, foodType }, 'Starting USDA import');

  const { nutrientElementByUsdaId, nutrientMultiplierByUsdaId } = await importNutrients(datasetDir);
  const foodElementByFdcId = await importFoods(datasetDir, foodType);

  await importLinks(
    datasetDir,
    foodElementByFdcId,
    nutrientElementByUsdaId,
    nutrientMultiplierByUsdaId
  );

  await importBaseAliases(datasetDir, foodType, foodElementByFdcId);
  if (foodType === 'branded_food') {
    await importBrandedAliases(datasetDir, foodElementByFdcId);
  }

  if (foodType === 'branded_food') {
    await importBrandedUnits(datasetDir, foodElementByFdcId);
  } else {
    await importFoundationUnits(datasetDir, foodElementByFdcId);
  }

  logger.info(
    {
      importedFoods: foodElementByFdcId.size,
      importedNutrients: nutrientElementByUsdaId.size,
    },
    'USDA import finished'
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
