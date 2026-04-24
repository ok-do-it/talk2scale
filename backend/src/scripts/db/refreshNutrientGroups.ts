import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../config/logger.js';
import { closeDatabaseConnection, db } from '../../db/client.js';
import { COLUMN, TABLE } from '../../db/typeIdentifiers.js';

const NUTRIENT_GROUPS_JSON_PATH = path.resolve(
  process.cwd(),
  '../db/dataset/nutrient_group.json'
);

const LOOKUP_CHUNK_SIZE = 10000;

type NutrientGroupSeed = {
  name: string;
  display_order: number;
  usda_ids: number[];
};

function parseNutrientGroupsJson(raw: string): NutrientGroupSeed[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('nutrient_group.json must be a JSON array');
  }

  return parsed.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`nutrient_group.json[${index}] is not an object`);
    }
    const record = entry as Record<string, unknown>;
    const name = record.name;
    const displayOrder = record.display_order;
    const usdaIds = record.usda_ids;

    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error(`nutrient_group.json[${index}].name must be a non-empty string`);
    }
    if (typeof displayOrder !== 'number' || !Number.isInteger(displayOrder)) {
      throw new Error(`nutrient_group.json[${index}].display_order must be an integer`);
    }
    if (!Array.isArray(usdaIds) || !usdaIds.every((id) => typeof id === 'number' && Number.isInteger(id))) {
      throw new Error(`nutrient_group.json[${index}].usda_ids must be an array of integers`);
    }

    return {
      name: name.trim(),
      display_order: displayOrder,
      usda_ids: usdaIds as number[],
    };
  });
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
      if (row.external_id == null) continue;
      const parsedExternalId = Number.parseInt(row.external_id, 10);
      if (!Number.isFinite(parsedExternalId)) continue;
      elementByExternalId.set(parsedExternalId, Number(row.id));
    }
  }

  return elementByExternalId;
}

export async function importNutrientGroups(): Promise<void> {
  logger.info({ path: NUTRIENT_GROUPS_JSON_PATH }, 'Importing nutrient groups');

  const raw = await readFile(NUTRIENT_GROUPS_JSON_PATH, 'utf8');
  const seeds = parseNutrientGroupsJson(raw);

  const allUsdaIds = Array.from(new Set(seeds.flatMap((seed) => seed.usda_ids)));
  const elementByUsdaId = await loadElementIdsByExternalIds(allUsdaIds);

  for (const seed of seeds) {
    const resolvedIds: number[] = [];
    const unresolvedUsdaIds: number[] = [];
    for (const usdaId of seed.usda_ids) {
      const elementId = elementByUsdaId.get(usdaId);
      if (elementId == null) {
        unresolvedUsdaIds.push(usdaId);
        continue;
      }
      resolvedIds.push(elementId);
    }

    if (unresolvedUsdaIds.length > 0) {
      logger.warn(
        {
          group: seed.name,
          unresolvedCount: unresolvedUsdaIds.length,
          unresolvedUsdaIds: unresolvedUsdaIds.slice(0, 10),
          expected: seed.usda_ids.length,
        },
        'Some USDA ids did not resolve to elements; they will be skipped'
      );
    }

    await db
      .insertInto(TABLE.nutrient_group)
      .values({
        name: seed.name,
        display_order: seed.display_order,
        element_ids: resolvedIds,
      })
      .onConflict((oc) =>
        oc.column(COLUMN.nutrient_group.name).doUpdateSet({
          display_order: seed.display_order,
          element_ids: resolvedIds,
        })
      )
      .execute();

    logger.info(
      {
        group: seed.name,
        display_order: seed.display_order,
        resolved: resolvedIds.length,
        requested: seed.usda_ids.length,
      },
      'Nutrient group upserted'
    );
  }

  logger.info({ groups: seeds.length }, 'Nutrient groups import complete');
}

function isDirectExecution(): boolean {
  const entryScript = process.argv[1];
  if (!entryScript) {
    return false;
  }
  return path.resolve(entryScript) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  try {
    await importNutrientGroups();
  } catch (error) {
    logger.error({ err: error }, 'Nutrient groups refresh failed');
    process.exitCode = 1;
  } finally {
    await closeDatabaseConnection();
  }
}
