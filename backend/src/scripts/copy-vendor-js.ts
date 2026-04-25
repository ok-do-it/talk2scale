import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vendorDir = join(backendRoot, 'public', 'vendor');

const copies: [string, string][] = [
	[
		join(
			backendRoot,
			'node_modules',
			'react',
			'umd',
			'react.production.min.js',
		),
		join(vendorDir, 'react.production.min.js'),
	],
	[
		join(
			backendRoot,
			'node_modules',
			'react-dom',
			'umd',
			'react-dom.production.min.js',
		),
		join(vendorDir, 'react-dom.production.min.js'),
	],
	[
		join(backendRoot, 'node_modules', '@babel', 'standalone', 'babel.min.js'),
		join(vendorDir, 'babel.min.js'),
	],
];

mkdirSync(vendorDir, { recursive: true });
for (const [from, to] of copies) {
	copyFileSync(from, to);
}
console.log('Vendored explore.html JS to public/vendor/');
