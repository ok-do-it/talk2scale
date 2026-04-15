import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const FOUNDATION_DATASET_URL =
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-12-18.zip';
const BRANDED_DATASET_URL =
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2025-12-18.zip';

// If running from the backend directory, this resolves to <repo>/docs/db.
const OUTPUT_DIR = path.resolve(process.cwd(), '../db/raw_usda_datasets');

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

  await pipeline(Readable.fromWeb(response.body), createWriteStream(targetZipPath));
}

async function extractZip(zipPath: string, destinationDir: string): Promise<void> {
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
