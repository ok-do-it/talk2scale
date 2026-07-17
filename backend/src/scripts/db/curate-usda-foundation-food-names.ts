import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Transaction } from 'kysely';
import { logger } from '../../config/logger.js';
import { closeDatabaseConnection, db } from '../../db/client.js';
import { COLUMN, TABLE } from '../../db/typeIdentifiers.js';
import type { Database } from '../../db/types.js';

const CURATION_JSON = path.resolve(
	process.cwd(),
	'../db/dataset/curate-foundation-food-names.json',
);
const DELETE_CHUNK_SIZE = 500;

type MergeGroup = {
	winnerFdcId: number;
	loserFdcIds: number[];
	reason: string;
};

type AliasName = {
	name: string;
	isDefault: boolean;
	rank: number;
};

type AliasGroup = {
	fdcId: number;
	names: AliasName[];
};

type CurationConfig = {
	mergeGroups: MergeGroup[];
	aliases: AliasGroup[];
};

type ElementRow = {
	id: number;
	name: string;
	external_id: string | null;
};

export type CurateUsdaFoundationFoodNamesSummary = {
	mergeGroups: number;
	losers: number;
	linksMerged: number;
	measuresReassigned: number;
	foodNamesReassigned: number;
	foodNamesDeleted: number;
	foodLogsReassigned: number;
	elementsDeleted: number;
	aliasesInserted: number;
	aliasesUpdated: number;
};

function readPositiveInteger(value: unknown, pathLabel: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		throw new Error(`${pathLabel} must be a positive integer`);
	}
	return value;
}

function readNonEmptyString(value: unknown, pathLabel: string): string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(`${pathLabel} must be a non-empty string`);
	}
	return value.trim();
}

function parseMergeGroups(raw: unknown): MergeGroup[] {
	if (!Array.isArray(raw)) {
		throw new Error(
			'curate-foundation-food-names.json.merge_groups must be an array',
		);
	}

	const seenWinners = new Set<number>();
	const groups: MergeGroup[] = [];
	for (let i = 0; i < raw.length; i++) {
		const row = raw[i];
		if (row === null || typeof row !== 'object') {
			throw new Error(`merge_groups[${i}] must be an object`);
		}

		const winnerFdcId = readPositiveInteger(
			(row as { winner_fdc_id?: unknown }).winner_fdc_id,
			`merge_groups[${i}].winner_fdc_id`,
		);
		if (seenWinners.has(winnerFdcId)) {
			throw new Error(`merge_groups[${i}] duplicates winner_fdc_id`);
		}
		seenWinners.add(winnerFdcId);

		const loserRaw = (row as { loser_fdc_ids?: unknown }).loser_fdc_ids;
		if (!Array.isArray(loserRaw) || loserRaw.length === 0) {
			throw new Error(
				`merge_groups[${i}].loser_fdc_ids must be a non-empty array`,
			);
		}

		const loserFdcIds = loserRaw.map((value, j) =>
			readPositiveInteger(value, `merge_groups[${i}].loser_fdc_ids[${j}]`),
		);
		if (loserFdcIds.includes(winnerFdcId)) {
			throw new Error(`merge_groups[${i}] includes winner_fdc_id as a loser`);
		}

		groups.push({
			winnerFdcId,
			loserFdcIds: [...new Set(loserFdcIds)],
			reason: readNonEmptyString(
				(row as { reason?: unknown }).reason,
				`merge_groups[${i}].reason`,
			),
		});
	}

	return groups;
}

function parseAliases(raw: unknown): AliasGroup[] {
	if (!Array.isArray(raw)) {
		throw new Error(
			'curate-foundation-food-names.json.aliases must be an array',
		);
	}

	const groups: AliasGroup[] = [];
	for (let i = 0; i < raw.length; i++) {
		const row = raw[i];
		if (row === null || typeof row !== 'object') {
			throw new Error(`aliases[${i}] must be an object`);
		}

		const fdcId = readPositiveInteger(
			(row as { fdc_id?: unknown }).fdc_id,
			`aliases[${i}].fdc_id`,
		);
		const namesRaw = (row as { names?: unknown }).names;
		if (!Array.isArray(namesRaw) || namesRaw.length === 0) {
			throw new Error(`aliases[${i}].names must be a non-empty array`);
		}

		let defaultCount = 0;
		const seenNames = new Set<string>();
		const names = namesRaw.map((nameRow, j) => {
			if (nameRow === null || typeof nameRow !== 'object') {
				throw new Error(`aliases[${i}].names[${j}] must be an object`);
			}

			const name = readNonEmptyString(
				(nameRow as { name?: unknown }).name,
				`aliases[${i}].names[${j}].name`,
			);
			const key = name.toLowerCase();
			if (seenNames.has(key)) {
				throw new Error(`aliases[${i}].names[${j}] duplicates name`);
			}
			seenNames.add(key);

			const isDefault =
				(nameRow as { is_default?: unknown }).is_default === true;
			if (isDefault) defaultCount += 1;

			const rankValue = (nameRow as { rank?: unknown }).rank ?? 0;
			if (
				typeof rankValue !== 'number' ||
				!Number.isInteger(rankValue) ||
				rankValue < 0
			) {
				throw new Error(
					`aliases[${i}].names[${j}].rank must be a non-negative integer`,
				);
			}

			return { name, isDefault, rank: rankValue };
		});

		if (defaultCount > 1) {
			throw new Error(`aliases[${i}] has more than one default alias`);
		}

		groups.push({ fdcId, names });
	}

	return groups;
}

function parseCurationConfig(raw: unknown): CurationConfig {
	if (raw === null || typeof raw !== 'object') {
		throw new Error('curate-foundation-food-names.json must be an object');
	}

	return {
		mergeGroups: parseMergeGroups(
			(raw as { merge_groups?: unknown }).merge_groups ?? [],
		),
		aliases: parseAliases((raw as { aliases?: unknown }).aliases ?? []),
	};
}

async function loadCurationConfig(): Promise<CurationConfig> {
	const raw = JSON.parse(await readFile(CURATION_JSON, 'utf8')) as unknown;
	return parseCurationConfig(raw);
}

async function loadElementsByExternalId(
	trx: Transaction<Database>,
	externalIds: number[],
): Promise<Map<number, ElementRow>> {
	const uniqueExternalIds = [...new Set(externalIds)].map(String);
	if (uniqueExternalIds.length === 0) return new Map();

	const rows = await trx
		.selectFrom(TABLE.element)
		.select([
			COLUMN.element.id,
			COLUMN.element.name,
			COLUMN.element.external_id,
		])
		.where(COLUMN.element.source, '=', 'usda')
		.where(COLUMN.element.external_id, 'in', uniqueExternalIds)
		.execute();

	return new Map(
		rows.map((row) => [
			Number(row.external_id),
			{
				id: Number(row.id),
				name: row.name,
				external_id: row.external_id,
			},
		]),
	);
}

async function clearDefaultsForElements(
	trx: Transaction<Database>,
	elementIds: number[],
): Promise<void> {
	if (elementIds.length === 0) return;
	await trx
		.updateTable(TABLE.food_name)
		.set({ is_default: false })
		.where(COLUMN.food_name.element_id, 'in', elementIds)
		.where(COLUMN.food_name.user_id, 'is', null)
		.execute();
}

async function mergeLinksIntoWinner(
	trx: Transaction<Database>,
	winnerId: number,
	loserIds: number[],
): Promise<number> {
	if (loserIds.length === 0) return 0;

	const result = await sql<{ inserted: number }>`
		WITH inserted AS (
			INSERT INTO ${sql.ref(TABLE.link)} (parent_id, child_id, ratio)
			SELECT ${winnerId}::bigint, l.child_id, l.ratio
			FROM ${sql.ref(TABLE.link)} l
			WHERE l.parent_id = ANY(${loserIds}::bigint[])
			  AND NOT EXISTS (
				SELECT 1
				FROM ${sql.ref(TABLE.link)} w
				WHERE w.parent_id = ${winnerId}::bigint
				  AND w.child_id = l.child_id
			  )
			ON CONFLICT (parent_id, child_id) DO NOTHING
			RETURNING 1
		)
		SELECT COUNT(*)::int AS inserted FROM inserted
	`.execute(trx);

	return result.rows[0]?.inserted ?? 0;
}

async function reassignMeasures(
	trx: Transaction<Database>,
	winnerId: number,
	loserIds: number[],
): Promise<number> {
	if (loserIds.length === 0) return 0;
	const res = await trx
		.updateTable(TABLE.measure)
		.set({ element_id: winnerId })
		.where(COLUMN.measure.element_id, 'in', loserIds)
		.executeTakeFirst();
	return Number(res.numUpdatedRows ?? 0);
}

async function reassignFoodNames(
	trx: Transaction<Database>,
	winnerId: number,
	loserIds: number[],
): Promise<number> {
	if (loserIds.length === 0) return 0;
	const res = await trx
		.updateTable(TABLE.food_name)
		.set({ element_id: winnerId })
		.where(COLUMN.food_name.element_id, 'in', loserIds)
		.executeTakeFirst();
	return Number(res.numUpdatedRows ?? 0);
}

async function deduplicateFoodNamesForWinner(
	trx: Transaction<Database>,
	winnerId: number,
): Promise<number> {
	const result = await sql<{ deleted: number }>`
		WITH deleted AS (
			DELETE FROM ${sql.ref(TABLE.food_name)}
			WHERE id IN (
				SELECT id FROM (
					SELECT id,
					       ROW_NUMBER() OVER (
					         PARTITION BY element_id, user_id, name, COALESCE(locale, '')
					         ORDER BY is_default DESC, rank DESC, id
					       ) AS rn
					FROM ${sql.ref(TABLE.food_name)}
					WHERE element_id = ${winnerId}::bigint
				) ranked
				WHERE ranked.rn > 1
			)
			RETURNING 1
		)
		SELECT COUNT(*)::int AS deleted FROM deleted
	`.execute(trx);

	return result.rows[0]?.deleted ?? 0;
}

async function reassignFoodLogs(
	trx: Transaction<Database>,
	winnerId: number,
	loserIds: number[],
): Promise<number> {
	if (loserIds.length === 0) return 0;
	const res = await trx
		.updateTable(TABLE.food_log)
		.set({ element_id: winnerId })
		.where(COLUMN.food_log.element_id, 'in', loserIds)
		.executeTakeFirst();
	return Number(res.numUpdatedRows ?? 0);
}

async function deleteElementsInChunks(
	trx: Transaction<Database>,
	ids: number[],
): Promise<number> {
	let totalDeleted = 0;
	for (let offset = 0; offset < ids.length; offset += DELETE_CHUNK_SIZE) {
		const chunk = ids.slice(offset, offset + DELETE_CHUNK_SIZE);
		const res = await trx
			.deleteFrom(TABLE.element)
			.where(COLUMN.element.id, 'in', chunk)
			.executeTakeFirst();
		totalDeleted += Number(res.numDeletedRows ?? 0);
	}
	return totalDeleted;
}

async function applyMergeGroups(
	trx: Transaction<Database>,
	config: CurationConfig,
	summary: CurateUsdaFoundationFoodNamesSummary,
): Promise<Map<number, number>> {
	const allFdcIds = config.mergeGroups.flatMap((group) => [
		group.winnerFdcId,
		...group.loserFdcIds,
	]);
	const elementsByExternalId = await loadElementsByExternalId(trx, allFdcIds);
	const mergedElementIdByLoserFdcId = new Map<number, number>();

	for (const group of config.mergeGroups) {
		const winner = elementsByExternalId.get(group.winnerFdcId);
		if (!winner) {
			throw new Error(`Missing merge winner fdc_id ${group.winnerFdcId}`);
		}

		const losers = group.loserFdcIds
			.map((fdcId) => ({ fdcId, element: elementsByExternalId.get(fdcId) }))
			.filter(
				(row): row is { fdcId: number; element: ElementRow } =>
					row.element != null,
			);
		const loserIds = losers.map((row) => row.element.id);

		if (loserIds.length === 0) {
			logger.info(
				{ winnerFdcId: group.winnerFdcId, reason: group.reason },
				'Curated merge already applied',
			);
			continue;
		}

		logger.info(
			{
				winnerFdcId: group.winnerFdcId,
				winnerId: winner.id,
				loserFdcIds: losers.map((row) => row.fdcId),
				loserIds,
				reason: group.reason,
			},
			'Merging curated foundation food group',
		);

		await clearDefaultsForElements(trx, [winner.id, ...loserIds]);
		summary.mergeGroups += 1;
		summary.losers += loserIds.length;
		summary.linksMerged += await mergeLinksIntoWinner(trx, winner.id, loserIds);
		summary.measuresReassigned += await reassignMeasures(
			trx,
			winner.id,
			loserIds,
		);
		summary.foodNamesReassigned += await reassignFoodNames(
			trx,
			winner.id,
			loserIds,
		);
		summary.foodNamesDeleted += await deduplicateFoodNamesForWinner(
			trx,
			winner.id,
		);
		summary.foodLogsReassigned += await reassignFoodLogs(
			trx,
			winner.id,
			loserIds,
		);
		summary.elementsDeleted += await deleteElementsInChunks(trx, loserIds);

		for (const loser of losers) {
			mergedElementIdByLoserFdcId.set(loser.fdcId, winner.id);
		}
	}

	return mergedElementIdByLoserFdcId;
}

async function upsertAlias(
	trx: Transaction<Database>,
	elementId: number,
	alias: AliasName,
): Promise<'inserted' | 'updated'> {
	const existing = await trx
		.selectFrom(TABLE.food_name)
		.select(COLUMN.food_name.id)
		.where(COLUMN.food_name.element_id, '=', elementId)
		.where(COLUMN.food_name.user_id, 'is', null)
		.where(COLUMN.food_name.name, '=', alias.name)
		.where(COLUMN.food_name.locale, '=', 'en')
		.executeTakeFirst();

	if (existing) {
		await trx
			.updateTable(TABLE.food_name)
			.set({
				is_default: alias.isDefault,
				rank: alias.rank,
			})
			.where(COLUMN.food_name.id, '=', existing.id)
			.execute();
		return 'updated';
	}

	await trx
		.insertInto(TABLE.food_name)
		.values({
			element_id: elementId,
			user_id: null,
			name: alias.name,
			embedding: null,
			locale: 'en',
			is_default: alias.isDefault,
			rank: alias.rank,
		})
		.execute();
	return 'inserted';
}

async function applyAliases(
	trx: Transaction<Database>,
	config: CurationConfig,
	mergedElementIdByLoserFdcId: Map<number, number>,
	summary: CurateUsdaFoundationFoodNamesSummary,
): Promise<void> {
	const elementsByExternalId = await loadElementsByExternalId(
		trx,
		config.aliases.map((group) => group.fdcId),
	);

	for (const group of config.aliases) {
		const elementId =
			mergedElementIdByLoserFdcId.get(group.fdcId) ??
			elementsByExternalId.get(group.fdcId)?.id;

		if (elementId == null) {
			throw new Error(`Missing alias target fdc_id ${group.fdcId}`);
		}

		if (group.names.some((alias) => alias.isDefault)) {
			await clearDefaultsForElements(trx, [elementId]);
		}

		for (const alias of group.names) {
			const action = await upsertAlias(trx, elementId, alias);
			if (action === 'inserted') {
				summary.aliasesInserted += 1;
			} else {
				summary.aliasesUpdated += 1;
			}
		}
	}
}

export async function curateUsdaFoundationFoodNames(): Promise<CurateUsdaFoundationFoodNamesSummary> {
	const config = await loadCurationConfig();
	const summary: CurateUsdaFoundationFoodNamesSummary = {
		mergeGroups: 0,
		losers: 0,
		linksMerged: 0,
		measuresReassigned: 0,
		foodNamesReassigned: 0,
		foodNamesDeleted: 0,
		foodLogsReassigned: 0,
		elementsDeleted: 0,
		aliasesInserted: 0,
		aliasesUpdated: 0,
	};

	logger.info(
		{
			mergeGroups: config.mergeGroups.length,
			aliasGroups: config.aliases.length,
		},
		'Curated USDA foundation food names phase starting',
	);

	await db.transaction().execute(async (trx) => {
		const mergedElementIdByLoserFdcId = await applyMergeGroups(
			trx,
			config,
			summary,
		);
		await applyAliases(trx, config, mergedElementIdByLoserFdcId, summary);
	});

	logger.info(summary, 'Curated USDA foundation food names phase complete');
	return summary;
}

function isDirectExecution(): boolean {
	const entryScript = process.argv[1];
	if (!entryScript) return false;
	return path.resolve(entryScript) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
	try {
		await curateUsdaFoundationFoodNames();
	} catch (error) {
		logger.error({ err: error }, 'Curated USDA foundation food names failed');
		process.exitCode = 1;
	} finally {
		await closeDatabaseConnection();
	}
}
