export type SpokenGramsParse = {
	foodName: string;
	grams: number | null;
};

const AMOUNT = String.raw`(\d+(?:\.\d+)?)`;
/** Longer unit spellings first so "grams" is not matched as "g" + "rams". */
const UNIT = '(?:grams|gram|g)';

const LEADING_WEIGHT = new RegExp(
	`^${AMOUNT}\\s*${UNIT}\\b\\.?\\s*(?:of\\s+)?(.+)$`,
	'i',
);
const TRAILING_WEIGHT = new RegExp(
	`^(.+?)\\s+${AMOUNT}\\s*${UNIT}\\b\\.?$`,
	'i',
);

function toPositiveIntGrams(raw: string): number | null {
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		return null;
	}
	const rounded = Math.round(n);
	return rounded > 0 ? rounded : null;
}

function cleanFoodName(name: string): string {
	return name
		.replace(/^(?:of\s+)/i, '')
		.replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
		.trim();
}

/**
 * Extract an optional spoken weight in grams from a single-food transcript.
 * Requires an explicit unit (g / gram / grams) so bare numbers in names are ignored.
 */
export function parseSpokenGrams(transcript: string): SpokenGramsParse {
	const trimmed = transcript.trim();
	if (!trimmed) {
		return { foodName: '', grams: null };
	}

	const leading = LEADING_WEIGHT.exec(trimmed);
	if (leading) {
		const grams = toPositiveIntGrams(leading[1] ?? '');
		const foodName = cleanFoodName(leading[2] ?? '');
		if (grams !== null && foodName) {
			return { foodName, grams };
		}
	}

	const trailing = TRAILING_WEIGHT.exec(trimmed);
	if (trailing) {
		const foodName = cleanFoodName(trailing[1] ?? '');
		const grams = toPositiveIntGrams(trailing[2] ?? '');
		if (grams !== null && foodName) {
			return { foodName, grams };
		}
	}

	return { foodName: trimmed, grams: null };
}
