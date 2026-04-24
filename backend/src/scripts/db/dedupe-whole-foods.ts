import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Transaction } from 'kysely';
import { logger } from '../../config/logger.js';
import { closeDatabaseConnection, db } from '../../db/client.js';
import { COLUMN, TABLE } from '../../db/typeIdentifiers.js';
import type { Database, ElementType } from '../../db/types.js';

const DEFAULT_TARGET_TYPES: readonly ElementType[] = ['whole_food'];
const DELETE_CHUNK_SIZE = 500;

type ElementStatsRow = {
	id: number;
	name: string;
	external_id: string | null;
	nutrient_count: number;
};

type GroupPlan = {
	name: string;
	winnerId: number;
	winnerNutrientCount: number;
	loserIds: number[];
};

export type DedupeSummary = {
	groups: number;
	winners: number;
	losers: number;
	linksMerged: number;
	measuresReassigned: number;
	foodNamesReassigned: number;
	foodNamesDeleted: number;
	foodLogsReassigned: number;
	elementsDeleted: number;
};

function parseExternalIdForTiebreak(externalId: string | null): number {
	if (externalId == null) return Number.NEGATIVE_INFINITY;
	const parsed = Number.parseInt(externalId, 10);
	return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function pickWinner(rows: ElementStatsRow[]): ElementStatsRow {
	// A1: max nutrient_count, tie-break by max numeric external_id, final fallback max id.
	return rows.reduce((best, current) => {
		if (current.nutrient_count !== best.nutrient_count) {
			return current.nutrient_count > best.nutrient_count ? current : best;
		}
		const currentExt = parseExternalIdForTiebreak(current.external_id);
		const bestExt = parseExternalIdForTiebreak(best.external_id);
		if (currentExt !== bestExt) {
			return currentExt > bestExt ? current : best;
		}
		return current.id > best.id ? current : best;
	});
}

async function findDuplicateGroups(
	trx: Transaction<Database>,
	types: readonly ElementType[],
): Promise<Array<{ name: string }>> {
	return await trx
		.selectFrom(TABLE.element)
		.select(COLUMN.element.name)
		.where(COLUMN.element.type, 'in', [...types])
		.groupBy(COLUMN.element.name)
		.having(sql<number>`COUNT(*)`, '>', 1)
		.execute();
}

async function loadGroupRows(
	trx: Transaction<Database>,
	types: readonly ElementType[],
	names: string[],
): Promise<ElementStatsRow[]> {
	const rows = await trx
		.selectFrom(`${TABLE.element} as e`)
		.leftJoin(`${TABLE.link} as l`, 'l.parent_id', 'e.id')
		.select([
			'e.id as id',
			'e.name as name',
			'e.external_id as external_id',
			sql<number>`COUNT(l.child_id)::int`.as('nutrient_count'),
		])
		.where('e.type', 'in', [...types])
		.where('e.name', 'in', names)
		.groupBy(['e.id', 'e.name', 'e.external_id'])
		.execute();

	return rows.map((row) => ({
		id: Number(row.id),
		name: row.name,
		external_id: row.external_id ?? null,
		nutrient_count: Number(row.nutrient_count),
	}));
}

function buildGroupPlans(rows: ElementStatsRow[]): GroupPlan[] {
	const byName = new Map<string, ElementStatsRow[]>();
	for (const row of rows) {
		const bucket = byName.get(row.name);
		if (bucket) {
			bucket.push(row);
		} else {
			byName.set(row.name, [row]);
		}
	}

	const plans: GroupPlan[] = [];
	for (const [name, groupRows] of byName) {
		if (groupRows.length < 2) continue;
		const winner = pickWinner(groupRows);
		const loserIds = groupRows
			.filter((row) => row.id !== winner.id)
			.map((row) => row.id);
		plans.push({
			name,
			winnerId: winner.id,
			winnerNutrientCount: winner.nutrient_count,
			loserIds,
		});
	}

	plans.sort((a, b) => a.name.localeCompare(b.name));
	return plans;
}

async function mergeLinksIntoWinner(
	trx: Transaction<Database>,
	winnerId: number,
	loserIds: number[],
): Promise<number> {
	if (loserIds.length === 0) return 0;

	// Copy links the winner does not yet have. Preserves winner's ratio for
	// overlapping nutrients; only contributes nutrients that are missing.
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
	// Remove duplicate (element_id, name, COALESCE(locale, '')) rows that may
	// have accumulated after re-pointing. Keeps the oldest id.
	const result = await sql<{ deleted: number }>`
		WITH deleted AS (
			DELETE FROM ${sql.ref(TABLE.food_name)}
			WHERE id IN (
				SELECT id FROM (
					SELECT id,
					       ROW_NUMBER() OVER (
					         PARTITION BY element_id, name, COALESCE(locale, '')
					         ORDER BY id
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

export async function dedupeWholeFoods(
	targetTypes: readonly ElementType[] = DEFAULT_TARGET_TYPES,
): Promise<DedupeSummary> {
	logger.info(
		{ targetTypes },
		'Dedupe phase starting (A1: max nutrients, tie-break by max external_id)',
	);

	const summary: DedupeSummary = {
		groups: 0,
		winners: 0,
		losers: 0,
		linksMerged: 0,
		measuresReassigned: 0,
		foodNamesReassigned: 0,
		foodNamesDeleted: 0,
		foodLogsReassigned: 0,
		elementsDeleted: 0,
	};

	await db.transaction().execute(async (trx) => {
		const groups = await findDuplicateGroups(trx, targetTypes);
		if (groups.length === 0) {
			logger.info('No duplicate element groups found, nothing to dedupe');
			return;
		}

		const names = groups.map((g) => g.name);
		const rows = await loadGroupRows(trx, targetTypes, names);
		const plans = buildGroupPlans(rows);

		summary.groups = plans.length;
		summary.winners = plans.length;
		summary.losers = plans.reduce((n, p) => n + p.loserIds.length, 0);

		logger.info(
			{ groups: summary.groups, losers: summary.losers },
			'Planned dedupe actions',
		);

		const allLoserIds: number[] = [];

		for (const plan of plans) {
			logger.debug(
				{
					name: plan.name,
					winnerId: plan.winnerId,
					winnerNutrientCount: plan.winnerNutrientCount,
					loserIds: plan.loserIds,
				},
				'Merging group',
			);

			summary.linksMerged += await mergeLinksIntoWinner(
				trx,
				plan.winnerId,
				plan.loserIds,
			);
			summary.measuresReassigned += await reassignMeasures(
				trx,
				plan.winnerId,
				plan.loserIds,
			);
			summary.foodNamesReassigned += await reassignFoodNames(
				trx,
				plan.winnerId,
				plan.loserIds,
			);
			summary.foodNamesDeleted += await deduplicateFoodNamesForWinner(
				trx,
				plan.winnerId,
			);
			summary.foodLogsReassigned += await reassignFoodLogs(
				trx,
				plan.winnerId,
				plan.loserIds,
			);

			allLoserIds.push(...plan.loserIds);
		}

		summary.elementsDeleted = await deleteElementsInChunks(trx, allLoserIds);
	});

	logger.info(summary, 'Dedupe phase complete');
	return summary;
}

function isDirectExecution(): boolean {
	const entryScript = process.argv[1];
	if (!entryScript) return false;
	return path.resolve(entryScript) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
	try {
		await dedupeWholeFoods();
	} catch (error) {
		logger.error({ err: error }, 'Dedupe failed');
		process.exitCode = 1;
	} finally {
		await closeDatabaseConnection();
	}
}
