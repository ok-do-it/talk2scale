import foods from '../../data/foods_subset.json' with { type: 'json' };
import { logger } from '../config/logger.js';
import type { EmbeddingService } from './embeddingService.js';

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
	return dot; // vectors are normalized, so dot product = cosine similarity
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

export async function createSearchService(
	embeddingService: EmbeddingService,
): Promise<SearchService> {
	const subset = foods.slice(0, 10);
	logger.info({ count: subset.length }, 'Computing embeddings for foods');
	const foodEmbeddings = await embeddingService.embedBatch(
		subset.map((t) => `passage: ${t}`),
	);
	logger.info('Embeddings ready.');

	function search(queryEmbedding: number[], topK: number): SearchResult[] {
		return subset
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
			const queryEmbedding = await embeddingService.embed(prefix + food);
			const [top] = search(queryEmbedding, 1);
			return top;
		},
		searchMany: async (food: string, prefix: string, topK = 10) => {
			const queryEmbedding = await embeddingService.embed(prefix + food);
			return search(queryEmbedding, topK);
		},
	};
}
