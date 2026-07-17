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
const SEARCH_CANDIDATE_FETCH = SEARCH_TOP_K * 5;
const TRIGRAM_SIMILARITY_THRESHOLD = 0.45;

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

function normalizeFoodSearchQuery(query: string): string {
	return query
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
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
		const normalizedQuery = normalizeFoodSearchQuery(query);
		if (!normalizedQuery) return [];
		const queryTerms = normalizedQuery.split(' ');
		const reversedQuery =
			queryTerms.length > 1
				? [...queryTerms].reverse().join(' ')
				: normalizedQuery;

		const vec = await embed(`${QUERY_PREFIX}${query}`);
		const vecText = toPgVector(vec);

		const result = await sql<{
			id: number;
			element_id: number;
			element_name: string;
			name: string;
			distance: number;
		}>`
			WITH params AS (
				SELECT
					${normalizedQuery}::text AS query,
					${reversedQuery}::text AS reversed_query,
					${vecText}::vector AS query_vector
			),
			base_names AS (
				SELECT
					fn.id,
					fn.element_id,
					e.name AS element_name,
					fn.name,
					fn.embedding,
					fn.is_default,
					fn.rank,
					btrim(
						regexp_replace(
							regexp_replace(lower(fn.name), '[^[:alnum:]]+', ' ', 'g'),
							'[[:space:]]+',
							' ',
							'g'
						)
					) AS normalized_name,
					btrim(
						regexp_replace(
							regexp_replace(lower(e.name), '[^[:alnum:]]+', ' ', 'g'),
							'[[:space:]]+',
							' ',
							'g'
						)
					) AS normalized_element_name,
					CASE e.type
						WHEN 'whole_food' THEN 0
						WHEN 'recipe' THEN 1
						WHEN 'branded_food' THEN 2
						ELSE 3
					END AS element_rank
				FROM food_name fn
				JOIN element e ON e.id = fn.element_id
			),
			lexical_candidates AS (
				SELECT bn.id
				FROM base_names bn
				CROSS JOIN params p
				WHERE
					bn.normalized_name = p.query
					OR bn.normalized_element_name = p.query
					OR bn.normalized_name IN (
						'whole ' || p.query,
						p.query || ' whole'
					)
					OR bn.normalized_name LIKE p.query || ' %'
					OR bn.normalized_name LIKE p.query || 's %'
					OR bn.normalized_name LIKE '% ' || p.query || ' %'
					OR bn.normalized_name LIKE '% ' || p.query || 's %'
					OR bn.normalized_name LIKE '% ' || p.query
					OR bn.normalized_name LIKE '% ' || p.query || 's'
					OR (
						p.reversed_query <> p.query
						AND (
							bn.normalized_name LIKE p.reversed_query || ' %'
							OR bn.normalized_name LIKE '% ' || p.reversed_query || ' %'
							OR bn.normalized_name LIKE '% ' || p.reversed_query
						)
					)
				ORDER BY
					CASE
						WHEN bn.normalized_name = p.query THEN 0
						WHEN bn.normalized_element_name = p.query THEN 0
						WHEN bn.normalized_name IN (
							'whole ' || p.query,
							p.query || ' whole'
						) THEN 1
						WHEN bn.normalized_name LIKE p.query || ' %' THEN 2
						WHEN bn.normalized_name LIKE p.query || 's %' THEN 2
						WHEN bn.normalized_name LIKE '% ' || p.query || ' %' THEN 3
						WHEN bn.normalized_name LIKE '% ' || p.query || 's %' THEN 3
						WHEN bn.normalized_name LIKE '% ' || p.query THEN 3
						WHEN bn.normalized_name LIKE '% ' || p.query || 's' THEN 3
						WHEN bn.normalized_name LIKE p.reversed_query || ' %' THEN 3
						WHEN bn.normalized_name LIKE '% ' || p.reversed_query || ' %' THEN 3
						WHEN bn.normalized_name LIKE '% ' || p.reversed_query THEN 3
						ELSE 4
					END,
					bn.rank DESC,
					bn.is_default DESC,
					bn.element_rank,
					COALESCE(bn.embedding <=> p.query_vector, 1),
					bn.id
				LIMIT ${SEARCH_CANDIDATE_FETCH}
			),
			trigram_candidates AS (
				SELECT bn.id
				FROM base_names bn
				CROSS JOIN params p
				WHERE
					length(p.query) >= 3
					AND similarity(bn.normalized_name, p.query) >= ${TRIGRAM_SIMILARITY_THRESHOLD}
				ORDER BY
					similarity(bn.normalized_name, p.query) DESC,
					bn.rank DESC,
					bn.is_default DESC,
					bn.id
				LIMIT ${SEARCH_CANDIDATE_FETCH}
			),
			vector_candidates AS (
				SELECT bn.id
				FROM base_names bn
				CROSS JOIN params p
				WHERE bn.embedding IS NOT NULL
				ORDER BY
					bn.embedding <=> p.query_vector,
					bn.rank DESC,
					bn.is_default DESC
				LIMIT ${SEARCH_CANDIDATE_FETCH}
			),
			candidate_ids AS (
				SELECT id FROM lexical_candidates
				UNION
				SELECT id FROM trigram_candidates
				UNION
				SELECT id FROM vector_candidates
			),
			scored_candidates AS (
				SELECT
					bn.id,
					bn.element_id,
					bn.element_name,
					bn.name,
					bn.rank,
					bn.is_default,
					bn.element_rank,
					CASE
						WHEN bn.normalized_name = p.query THEN 0
						WHEN bn.normalized_element_name = p.query THEN 0
						WHEN bn.normalized_name IN (
							'whole ' || p.query,
							p.query || ' whole'
						) THEN 1
						WHEN bn.normalized_name LIKE p.query || ' %' THEN 2
						WHEN bn.normalized_name LIKE p.query || 's %' THEN 2
						WHEN bn.normalized_name LIKE '% ' || p.query || ' %' THEN 3
						WHEN bn.normalized_name LIKE '% ' || p.query || 's %' THEN 3
						WHEN bn.normalized_name LIKE '% ' || p.query THEN 3
						WHEN bn.normalized_name LIKE '% ' || p.query || 's' THEN 3
						WHEN bn.normalized_name LIKE p.reversed_query || ' %' THEN 3
						WHEN bn.normalized_name LIKE '% ' || p.reversed_query || ' %' THEN 3
						WHEN bn.normalized_name LIKE '% ' || p.reversed_query THEN 3
						ELSE 4
					END AS text_rank,
					COALESCE(bn.embedding <=> p.query_vector, 1) AS distance,
					similarity(bn.normalized_name, p.query) AS trigram_similarity
				FROM candidate_ids c
				JOIN base_names bn ON bn.id = c.id
				CROSS JOIN params p
			),
			ranked_candidates AS (
				SELECT
					sc.*,
					MIN(sc.text_rank) OVER (PARTITION BY sc.element_id) AS best_text_rank,
					MAX(sc.rank) OVER (PARTITION BY sc.element_id) AS best_rank,
					BOOL_OR(sc.is_default) OVER (PARTITION BY sc.element_id) AS has_default,
					ROW_NUMBER() OVER (
						PARTITION BY sc.element_id
						ORDER BY
							sc.rank DESC,
							sc.is_default DESC,
							sc.text_rank,
							sc.distance,
							sc.trigram_similarity DESC,
							sc.id
					) AS element_row_number
				FROM scored_candidates sc
			)
			SELECT
				rc.id,
				rc.element_id,
				rc.element_name,
				rc.name,
				rc.distance
			FROM ranked_candidates rc
			WHERE rc.element_row_number = 1
			ORDER BY
				rc.best_text_rank,
				rc.best_rank DESC,
				rc.has_default DESC,
				rc.element_rank,
				rc.distance,
				rc.trigram_similarity DESC,
				rc.element_id,
				rc.id
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
