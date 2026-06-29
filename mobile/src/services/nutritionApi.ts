import { buildApiUrl } from '../config/api';

export type NutrientEntry = {
  id: number | null;
  name: string;
  amount: number;
  calculated?: boolean;
};

export type NutrientGroup = {
  id: number;
  name: string;
  displayOrder: number;
  nutrients: NutrientEntry[];
};

export type DailyTargets = {
  kcal: number;
  nutrient_amounts: Array<{ id: number; grams: number }>;
};

export type ElementSummary = {
  id: number;
  type: 'nutrient' | 'whole_food' | 'recipe' | 'branded_food';
  name: string;
};

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await res.json()) as T;
}

export async function fetchDailyTargets(
  userId: number,
): Promise<DailyTargets | null> {
  const res = await fetch(buildApiUrl(`/users/${userId}/daily-targets`));
  return readJsonOrThrow<DailyTargets | null>(res);
}

export async function fetchUserMealNutrients(
  userId: number,
  from: Date,
  to: Date,
): Promise<NutrientGroup[]> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const res = await fetch(
    buildApiUrl(`/users/${userId}/meals/nutrients?${params.toString()}`),
  );
  return readJsonOrThrow<NutrientGroup[]>(res);
}

export async function fetchNutrientElements(): Promise<ElementSummary[]> {
  const res = await fetch(buildApiUrl('/elements?type=nutrient'));
  return readJsonOrThrow<ElementSummary[]>(res);
}
