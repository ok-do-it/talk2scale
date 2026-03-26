import express from 'express';
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import foods from './foods.json' with { type: 'json' };
import process from 'process';

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are normalized, so dot product = cosine similarity
}

console.log('Loading model...');
const extractor = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5');

async function embed(texts: string[], prefix = ''): Promise<number[][]> {
  const prefixed = prefix ? texts.map(t => prefix + t) : texts;
  const output = await extractor(prefixed, { pooling: 'mean', normalize: true });
  const dim = output.dims[1];
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    results.push(Array.from(output.data.slice(i * dim, (i + 1) * dim) as Float32Array));
  }
  return results;
}

console.log(`Computing embeddings for ${foods.length} foods...`);
const foodEmbeddings = await embed(foods);
console.log('Embeddings ready.');

function search(queryEmbedding: number[], topK: number) {
  return foods
    .map((food, i) => ({
      food,
      distance: 1 - cosineSimilarity(queryEmbedding, foodEmbeddings[i]),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, topK);
}

const app = express();
const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({ ok: true }).end();
});

router.get('/all', (req, res) => {
  res.json(foods).end();
});

router.get('/search', async (req, res) => {
  const food = req.query.food as string;
  if (!food) { res.status(400).json({ error: 'missing ?food= parameter' }); return; }
  const [queryEmbedding] = await embed([food], 'Represent this sentence for searching relevant passages: ');
  const [top] = search(queryEmbedding, 1);
  res.json(top);
});

router.get('/searchMany', async (req, res) => {
  const food = req.query.food as string;
  if (!food) { res.status(400).json({ error: 'missing ?food= parameter' }); return; }
  const [queryEmbedding] = await embed([food], 'Represent this sentence for searching relevant passages: ');
  const results = search(queryEmbedding, 10);
  res.json(results);
});

app.use(router);

const port = parseInt(process.env.PORT) || 8888;

app.listen({ port }, () => {
  console.log(`ready on :${port}`);
});
