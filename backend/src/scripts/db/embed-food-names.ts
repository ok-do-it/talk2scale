import { closeDatabaseConnection } from '../../db/client.js';
import { createEmbeddingService } from '../../service/embeddingService.js';

async function main(): Promise<void> {
	const service = await createEmbeddingService();
	const result = await service.embedAll();
	console.log(JSON.stringify(result));
}

try {
	await main();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
} finally {
	await closeDatabaseConnection();
}
