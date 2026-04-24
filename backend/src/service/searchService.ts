import {
	type FeatureExtractionPipeline,
	pipeline,
} from '@huggingface/transformers';
import foods from '../../data/foods_subset.json' with { type: 'json' };
import { logger } from '../config/logger.js';

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
	return dot; // vectors are normalized, so dot product = cosine similarity
}

async function embed(
	extractor: FeatureExtractionPipeline,
	texts: string[],
	prefix = '',
): Promise<number[][]> {
	const prefixed = prefix ? texts.map((t) => prefix + t) : texts;
	const output = await extractor(prefixed, {
		pooling: 'mean',
		normalize: true,
	});
	const dim = output.dims[1];
	const results: number[][] = [];
	for (let i = 0; i < texts.length; i++) {
		results.push(
			Array.from(output.data.slice(i * dim, (i + 1) * dim) as Float32Array),
		);
	}
	return results;
}

export type SearchResult = {
	food: string;
	distance: number;
};

export type SearchService = {
	getAllFoods: () => string[];
	searchOne: (food: string, prefix: string) => Promise<SearchResult>;
	searchMany: (
		food: string,
		prefix: string,
		topK?: number,
	) => Promise<SearchResult[]>;
};

export async function createSearchService(): Promise<SearchService> {
	logger.info('Loading model...');
	const extractor = await pipeline(
		'feature-extraction',
		'Xenova/multilingual-e5-base',
		{ dtype: 'fp16' },
	);
	logger.info({ count: foods.length }, 'Computing embeddings for foods');
	const foodEmbeddings = await embed(
		extractor,
		foods.slice(0, 10),
		'passage: ',
	);
	logger.info('Embeddings ready.');

	function search(queryEmbedding: number[], topK: number): SearchResult[] {
		return foods
			.map((food, i) => ({
				food,
				distance: 1 - cosineSimilarity(queryEmbedding, foodEmbeddings[i]),
			}))
			.sort((a, b) => a.distance - b.distance)
			.slice(0, topK);
	}

	return {
		getAllFoods: () => foods,
		searchOne: async (food: string, prefix: string) => {
			const [queryEmbedding] = await embed(extractor, [food], prefix);
			const [top] = search(queryEmbedding, 1);
			return top;
		},
		searchMany: async (food: string, prefix: string, topK = 10) => {
			const [queryEmbedding] = await embed(extractor, [food], prefix);
			return search(queryEmbedding, topK);
		},
	};
}

/* in postgres:
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE foods (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  embedding vector(768) -- use your model's dim
);
-- cosine index (for approximate fast search)
CREATE INDEX foods_embedding_idx
ON foods USING hnsw (embedding vector_cosine_ops);
Then query:

SELECT id, name, embedding <=> $1 AS distance
FROM foods
ORDER BY embedding <=> $1
LIMIT 10;
*/
