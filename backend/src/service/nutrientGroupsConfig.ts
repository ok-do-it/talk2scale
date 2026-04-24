import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../config/logger.js';
import { db } from '../db/client.js';
import { COLUMN, TABLE } from '../db/typeIdentifiers.js';

const LOOKUP_CHUNK_SIZE = 10000;

const NUTRIENT_GROUPS_JSON_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../data/nutrient_group.json',
);

export type NutrientGroupRow = {
	id: number;
	name: string;
	display_order: number;
	element_ids: number[];
};

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
			throw new Error(
				`nutrient_group.json[${index}].name must be a non-empty string`,
			);
		}
		if (typeof displayOrder !== 'number' || !Number.isInteger(displayOrder)) {
			throw new Error(
				`nutrient_group.json[${index}].display_order must be an integer`,
			);
		}
		if (
			!Array.isArray(usdaIds) ||
			!usdaIds.every((id) => typeof id === 'number' && Number.isInteger(id))
		) {
			throw new Error(
				`nutrient_group.json[${index}].usda_ids must be an array of integers`,
			);
		}

		return {
			name: name.trim(),
			display_order: displayOrder,
			usda_ids: usdaIds as number[],
		};
	});
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
			if (row.external_id == null) continue;
			const parsedExternalId = Number.parseInt(row.external_id, 10);
			if (!Number.isFinite(parsedExternalId)) continue;
			elementByExternalId.set(parsedExternalId, Number(row.id));
		}
	}

	return elementByExternalId;
}

async function loadNutrientGroupsResolved(): Promise<NutrientGroupRow[]> {
	logger.info({ path: NUTRIENT_GROUPS_JSON_PATH }, 'Loading nutrient groups');

	const raw = await readFile(NUTRIENT_GROUPS_JSON_PATH, 'utf8');
	const seeds = parseNutrientGroupsJson(raw);

	const allUsdaIds = Array.from(
		new Set(seeds.flatMap((seed) => seed.usda_ids)),
	);
	const elementByUsdaId = await loadElementIdsByExternalIds(allUsdaIds);

	let unresolvedGroupCount = 0;
	const rows: Omit<NutrientGroupRow, 'id'>[] = [];

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
				'Some USDA ids did not resolve to elements; they will be skipped',
			);
			unresolvedGroupCount += 1;
		}

		rows.push({
			name: seed.name,
			display_order: seed.display_order,
			element_ids: resolvedIds,
		});
	}

	rows.sort((a, b) => {
		if (a.display_order !== b.display_order) {
			return a.display_order - b.display_order;
		}
		return a.name.localeCompare(b.name);
	});

	const withIds: NutrientGroupRow[] = rows.map((row, index) => ({
		id: index + 1,
		...row,
	}));

	logger.info(
		{ groups: withIds.length, unresolvedGroupCount },
		'Nutrient groups loaded',
	);

	return withIds;
}

let cached: Promise<NutrientGroupRow[]> | null = null;

export function getNutrientGroupsResolved(): Promise<NutrientGroupRow[]> {
	if (cached === null) {
		cached = loadNutrientGroupsResolved();
	}
	return cached;
}
