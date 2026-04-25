import {
	type FeatureExtractionPipeline,
	pipeline,
} from '@huggingface/transformers';
import { sql } from 'kysely';
import { logger } from '../config/logger.js';
import { db } from '../db/client.js';

const MODEL_ID = 'Xenova/multilingual-e5-base';
const DEFAULT_BATCH_SIZE = 64;
const PASSAGE_PREFIX = 'passage: ';
const QUERY_PREFIX = 'query: ';
const SEARCH_TOP_K = 10;
// Over-fetch raw food_name rows so collapsing by element still yields enough hits.
const SEARCH_RAW_FETCH = SEARCH_TOP_K * 3;

// TODO: calibrate against a labeled query set.
// Cosine distances on multilingual-e5-base are typically 0..0.6 for related text.
const WINNER_ABS_MAX = 0.2;
const WINNER_RATIO_MAX = 0.75;
const WINNER_COLLAPSE_DEPTH = 3;

export type FoodNameSearchHit = {
	foodNameId: number;
	elementId: number;
	elementName: string;
	name: string;
	distance: number;
	aliasCount: number;
};

export type FoodNameSearchResponse = {
	winner: FoodNameSearchHit | null;
	hits: FoodNameSearchHit[];
};

export type EmbeddingService = {
	embed(text: string): Promise<number[]>;
	embedBatch(texts: string[]): Promise<number[][]>;
	embedAll(opts?: { batchSize?: number }): Promise<{ updated: number }>;
	searchFoodName(query: string): Promise<FoodNameSearchResponse>;
};

function toPgVector(vec: number[]): string {
	return `[${vec.join(',')}]`;
}

function pickWinner(hits: FoodNameSearchHit[]): FoodNameSearchHit | null {
	if (hits.length === 0) return null;
	const top = hits[0];
	if (top.distance > WINNER_ABS_MAX) return null;
	if (hits.length === 1) return top;

	const runnerUp = hits[1];
	const ratio = top.distance / Math.max(runnerUp.distance, 1e-6);
	if (ratio <= WINNER_RATIO_MAX) return top;

	// Strong winner if multiple aliases of the top element crowd the raw top-N.
	if (top.aliasCount >= 2) return top;

	return null;
}

async function runExtractor(
	extractor: FeatureExtractionPipeline,
	texts: string[],
): Promise<number[][]> {
	const output = await extractor(texts, {
		pooling: 'mean',
		normalize: true,
	});
	const dim = output.dims[1];
	const data = output.data as Float32Array;
	const results: number[][] = [];
	for (let i = 0; i < texts.length; i++) {
		results.push(Array.from(data.slice(i * dim, (i + 1) * dim)));
	}
	return results;
}

export async function createEmbeddingService(): Promise<EmbeddingService> {
	logger.info({ model: MODEL_ID }, 'Loading embedding model');
	const extractor = await pipeline('feature-extraction', MODEL_ID, {
		dtype: 'fp16',
	});
	logger.info('Embedding model ready');

	const embedBatch = (texts: string[]): Promise<number[][]> =>
		runExtractor(extractor, texts);

	const embed = async (text: string): Promise<number[]> => {
		const [vec] = await embedBatch([text]);
		return vec;
	};

	const embedAll = async (opts?: {
		batchSize?: number;
	}): Promise<{ updated: number }> => {
		const batchSize = opts?.batchSize ?? DEFAULT_BATCH_SIZE;
		let updated = 0;

		while (true) {
			const rows = await db
				.selectFrom('food_name')
				.select(['id', 'name'])
				.where('embedding', 'is', null)
				.orderBy('id')
				.limit(batchSize)
				.execute();

			if (rows.length === 0) break;

			const inputs = rows.map((r) => `${PASSAGE_PREFIX}${r.name}`);
			const vectors = await embedBatch(inputs);

			const ids = rows.map((r) => r.id);
			const vecs = vectors.map(toPgVector);

			await sql`
				UPDATE food_name AS fn
				SET embedding = data.vec::vector
				FROM (
					SELECT * FROM unnest(${ids}::bigint[], ${vecs}::text[]) AS t(id, vec)
				) AS data
				WHERE fn.id = data.id
			`.execute(db);

			updated += rows.length;
			logger.info({ batch: rows.length, updated }, 'Embedded food_name batch');

			if (rows.length < batchSize) break;
		}

		return { updated };
	};

	const searchFoodName = async (
		query: string,
	): Promise<FoodNameSearchResponse> => {
		const vec = await embed(`${QUERY_PREFIX}${query}`);
		const vecText = toPgVector(vec);

		const result = await sql<{
			id: number;
			element_id: number;
			element_name: string;
			name: string;
			distance: number;
		}>`
			SELECT
				fn.id,
				fn.element_id,
				e.name AS element_name,
				fn.name,
				fn.embedding <=> ${vecText}::vector AS distance
			FROM food_name fn
			JOIN element e ON e.id = fn.element_id
			ORDER BY fn.embedding <=> ${vecText}::vector
			LIMIT ${SEARCH_RAW_FETCH}
		`.execute(db);

		// Count alias occurrences within the raw top-N before collapsing,
		// so the winner heuristic can still see "many aliases of the same element".
		const aliasCounts = new Map<number, number>();
		for (const row of result.rows.slice(0, WINNER_COLLAPSE_DEPTH)) {
			aliasCounts.set(
				row.element_id,
				(aliasCounts.get(row.element_id) ?? 0) + 1,
			);
		}

		const seen = new Set<number>();
		const hits: FoodNameSearchHit[] = [];
		for (const row of result.rows) {
			if (seen.has(row.element_id)) continue;
			seen.add(row.element_id);
			hits.push({
				foodNameId: row.id,
				elementId: row.element_id,
				elementName: row.element_name,
				name: row.name,
				distance: Number(row.distance),
				aliasCount: aliasCounts.get(row.element_id) ?? 0,
			});
			if (hits.length >= SEARCH_TOP_K) break;
		}

		return { winner: pickWinner(hits), hits };
	};

	return { embed, embedBatch, embedAll, searchFoodName };
}
