import { closeDatabaseConnection, db } from '../../db/client.js';

type FoodPick = {
	id: number;
	name: string;
};

type LogClusterSpec = {
	label: string;
	hour: number;
	minute: number;
	items: Array<{
		search: string;
		amount: number;
	}>;
};

type SelectedCluster = Omit<LogClusterSpec, 'items'> & {
	items: Array<{
		search: string;
		amount: number;
		food: FoodPick;
	}>;
};

const DEFAULT_USER_ID = 1;
const LOG_CLUSTER_SPECS: LogClusterSpec[] = [
	{
		label: 'Test Breakfast',
		hour: 8,
		minute: 15,
		items: [
			{ search: 'oat', amount: 80 },
			{ search: 'banana', amount: 120 },
		],
	},
	{
		label: 'Test Lunch',
		hour: 12,
		minute: 30,
		items: [
			{ search: 'chicken', amount: 150 },
			{ search: 'rice', amount: 180 },
			{ search: 'broccoli', amount: 90 },
		],
	},
];

function getUserId(): number {
	const raw = process.argv[2] ?? process.env.TEST_USER_ID;
	if (raw === undefined) return DEFAULT_USER_ID;

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`Invalid user id: ${raw}`);
	}
	return parsed;
}

function getTodayAt(hour: number, minute: number, offsetSeconds = 0): Date {
	const now = new Date();
	return new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		hour,
		minute,
		offsetSeconds,
		0,
	);
}

function getTodayRange(): { from: Date; to: Date } {
	const now = new Date();
	return {
		from: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
		to: new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
			23,
			59,
			59,
			999,
		),
	};
}

async function findPreferredFood(
	search: string,
	usedIds: Set<number>,
): Promise<FoodPick | null> {
	let query = db
		.selectFrom('element')
		.select(['id', 'name'])
		.where('type', '=', 'whole_food')
		.where('name', 'ilike', `%${search}%`)
		.orderBy('name', 'asc')
		.limit(1);

	if (usedIds.size > 0) {
		query = query.where('id', 'not in', [...usedIds]);
	}

	return (await query.executeTakeFirst()) ?? null;
}

async function findFallbackFood(usedIds: Set<number>): Promise<FoodPick> {
	let query = db
		.selectFrom('element')
		.select(['id', 'name'])
		.where('type', '=', 'whole_food')
		.orderBy('name', 'asc')
		.limit(1);

	if (usedIds.size > 0) {
		query = query.where('id', 'not in', [...usedIds]);
	}

	const food = await query.executeTakeFirst();
	if (!food) {
		throw new Error('No whole_food elements found. Seed the database first.');
	}
	return food;
}

async function pickFood(
	search: string,
	usedIds: Set<number>,
): Promise<FoodPick> {
	const preferred = await findPreferredFood(search, usedIds);
	const food = preferred ?? (await findFallbackFood(usedIds));
	usedIds.add(food.id);
	return food;
}

async function main(): Promise<void> {
	const userId = getUserId();
	const user = await db
		.selectFrom('users')
		.select(['id', 'name'])
		.where('id', '=', userId)
		.executeTakeFirst();
	if (!user) {
		throw new Error(`User ${userId} not found`);
	}

	const gramMeasure = await db
		.selectFrom('measure')
		.select('id')
		.where('element_id', 'is', null)
		.where('name', '=', 'g')
		.executeTakeFirst();
	if (!gramMeasure) {
		throw new Error('Global gram measure not found');
	}

	const usedIds = new Set<number>();
	const selectedClusters: SelectedCluster[] = [];
	for (const cluster of LOG_CLUSTER_SPECS) {
		const items = [];
		for (const item of cluster.items) {
			items.push({
				...item,
				food: await pickFood(item.search, usedIds),
			});
		}
		selectedClusters.push({ ...cluster, items });
	}

	const { from, to } = getTodayRange();
	const inserted = await db.transaction().execute(async (trx) => {
		const rawNames = selectedClusters.flatMap((cluster) =>
			cluster.items.map((item) => item.food.name),
		);
		await trx
			.deleteFrom('food_log')
			.where('user_id', '=', userId)
			.where('raw_name', 'in', rawNames)
			.where('logged_at', '>=', from)
			.where('logged_at', '<=', to)
			.execute();

		const rows = [];
		for (const cluster of selectedClusters) {
			const foodLogs = await trx
				.insertInto('food_log')
				.values(
					cluster.items.map((item, index) => ({
						user_id: userId,
						logged_at: getTodayAt(cluster.hour, cluster.minute, index * 30),
						element_id: item.food.id,
						raw_name: item.food.name,
						amount: item.amount,
						measure_id: gramMeasure.id,
					})),
				)
				.returning(['id', 'raw_name', 'amount', 'logged_at'])
				.execute();

			rows.push({ label: cluster.label, food_logs: foodLogs });
		}

		return rows;
	});

	console.log(
		JSON.stringify(
			{
				user,
				inserted,
			},
			null,
			2,
		),
	);
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
