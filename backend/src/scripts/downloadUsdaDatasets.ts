import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const FOUNDATION_DATASET_URL =
	'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-12-18.zip';
const BRANDED_DATASET_URL =
	'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2025-12-18.zip';

// If running from the backend directory, this resolves to <repo>/db/dataset/usda.
const OUTPUT_DIR = path.resolve(process.cwd(), '../db/dataset/usda');

const execFileAsync = promisify(execFile);

type DatasetToDownload = {
	name: string;
	url: string;
};

const DATASETS: DatasetToDownload[] = [
	{ name: 'foundation', url: FOUNDATION_DATASET_URL },
	{ name: 'branded', url: BRANDED_DATASET_URL },
];

async function downloadZip(url: string, targetZipPath: string): Promise<void> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download "${url}" (HTTP ${response.status})`);
	}

	if (!response.body) {
		throw new Error(`No response body for "${url}"`);
	}

	const output = createWriteStream(targetZipPath);
	const reader = response.body.getReader();

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			if (value && !output.write(value)) {
				await once(output, 'drain');
			}
		}

		output.end();
		await once(output, 'finish');
	} catch (error) {
		output.destroy();
		throw error;
	} finally {
		reader.releaseLock();
	}
}

async function extractZip(
	zipPath: string,
	destinationDir: string,
): Promise<void> {
	await mkdir(destinationDir, { recursive: true });
	await execFileAsync('unzip', ['-o', zipPath, '-d', destinationDir]);
}

async function downloadAndExtract(dataset: DatasetToDownload): Promise<void> {
	const zipPath = path.join(OUTPUT_DIR, `${dataset.name}.zip`);

	console.log(`Downloading ${dataset.name} dataset...`);
	await downloadZip(dataset.url, zipPath);
	console.log(`Downloaded to ${zipPath}`);

	console.log(`Extracting ${dataset.name} dataset...`);
	await extractZip(zipPath, OUTPUT_DIR);
	console.log(`Extracted to ${OUTPUT_DIR}`);

	await rm(zipPath, { force: true });
	console.log(`Removed temporary archive ${zipPath}`);
}

async function main(): Promise<void> {
	await mkdir(OUTPUT_DIR, { recursive: true });
	console.log(`Output directory: ${OUTPUT_DIR}`);

	for (const dataset of DATASETS) {
		await downloadAndExtract(dataset);
	}

	console.log('USDA datasets download and extraction complete.');
}

main().catch((error) => {
	console.error('Failed to download USDA datasets.');
	console.error(error);
	process.exitCode = 1;
});
