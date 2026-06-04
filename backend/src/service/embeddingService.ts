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

export type FoodNameSearchHit = {
	foodNameId: number;
	elementId: number;
	elementName: string;
	name: string;
	distance: number;
};

export type EmbeddingService = {
	embed(text: string): Promise<number[]>;
	embedBatch(texts: string[]): Promise<number[][]>;
	embedName(name: string): Promise<number[]>;
	embedAll(opts?: { batchSize?: number }): Promise<{ updated: number }>;
	searchFoodName(query: string): Promise<FoodNameSearchHit[]>;
};

function toPgVector(vec: number[]): string {
	return `[${vec.join(',')}]`;
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
	): Promise<FoodNameSearchHit[]> => {
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
			});
			if (hits.length >= SEARCH_TOP_K) break;
		}

		return hits;
	};

	const embedName = (name: string): Promise<number[]> =>
		embed(`${PASSAGE_PREFIX}${name}`);

	return { embed, embedBatch, embedName, embedAll, searchFoodName };
}
