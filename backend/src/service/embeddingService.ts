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

export type EmbeddingService = {
	embed(text: string): Promise<number[]>;
	embedAll(opts?: { batchSize?: number }): Promise<{ updated: number }>;
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

	return {
		embed: async (text: string) => {
			const [vec] = await runExtractor(extractor, [text]);
			return vec;
		},
		embedAll: async (opts) => {
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
				const vectors = await runExtractor(extractor, inputs);

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
				logger.info(
					{ batch: rows.length, updated },
					'Embedded food_name batch',
				);

				if (rows.length < batchSize) break;
			}

			return { updated };
		},
	};
}
