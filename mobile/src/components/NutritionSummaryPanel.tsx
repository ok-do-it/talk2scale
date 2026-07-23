import { StyleSheet, Text, View } from 'react-native';

import type {
  DailyTargets,
  ElementSummary,
  NutrientEntry,
  NutrientGroup,
} from '../services/nutritionApi';

export type SummaryRow = {
  key: 'calories' | 'protein' | 'fiber' | 'fat';
  label: string;
  amount: number;
  target: number | null;
  unit: 'kcal' | 'g';
};

const SUMMARY_NUTRIENTS: Array<{
  key: SummaryRow['key'];
  label: string;
  unit: SummaryRow['unit'];
  match: (nutrient: NutrientEntry) => boolean;
}> = [
  {
    key: 'calories',
    label: 'Calories',
    unit: 'kcal',
    match: (nutrient) => {
      const name = nutrient.name.toLowerCase();
      return (
        nutrient.calculated === true ||
        name.includes('energy') ||
        name.includes('kcal') ||
        name.includes('calorie')
      );
    },
  },
  {
    key: 'protein',
    label: 'Protein',
    unit: 'g',
    match: (nutrient) => nutrient.name.toLowerCase().includes('protein'),
  },
  {
    key: 'fiber',
    label: 'Fiber',
    unit: 'g',
    match: (nutrient) => nutrient.name.toLowerCase().includes('fiber'),
  },
  {
    key: 'fat',
    label: 'Fat',
    unit: 'g',
    match: (nutrient) => {
      const name = nutrient.name.toLowerCase();
      return name.includes('fat') || name.includes('total lipid');
    },
  },
];

function getAllNutrients(groups: NutrientGroup[]): NutrientEntry[] {
  return groups.flatMap((group) => group.nutrients);
}

function formatAmount(amount: number, unit: SummaryRow['unit']): string {
  if (unit === 'kcal') return String(Math.round(amount));
  if (amount >= 10) return String(Math.round(amount));
  if (amount === 0) return '0';
  return amount.toFixed(1);
}

export function buildSummaryRows(
  groups: NutrientGroup[],
  targets: DailyTargets | null,
  targetNutrients: ElementSummary[] = [],
): SummaryRow[] {
  const nutrients = getAllNutrients(groups);
  return SUMMARY_NUTRIENTS.map(({ key, label, unit, match }) => {
    const nutrient = nutrients.find(match);
    const amount = nutrient?.amount ?? 0;
    const matchingTarget = targets?.nutrient_amounts.find((item) => {
      if (item.id === nutrient?.id) return true;
      const element = targetNutrients.find((entry) => entry.id === item.id);
      return element
        ? match({ id: element.id, name: element.name, amount: 0 })
        : false;
    });
    const target =
      key === 'calories'
        ? targets?.kcal ?? null
        : matchingTarget?.grams ?? null;

    return { key, label, unit, amount, target };
  });
}

function getProgress(row: SummaryRow): number {
  if (row.target === null || row.target <= 0) {
    return row.amount > 0 ? 100 : 0;
  }
  return Math.min((row.amount / row.target) * 100, 100);
}

function getValueText(row: SummaryRow): string {
  const amount = formatAmount(row.amount, row.unit);
  if (row.target === null) return `${amount} ${row.unit}`;
  return `${amount}/${formatAmount(row.target, row.unit)} ${row.unit}`;
}

type NutritionSummaryPanelProps = {
  rows: SummaryRow[];
  loading?: boolean;
  error?: string | null;
};

export function NutritionSummaryPanel({
  rows,
  loading = false,
  error = null,
}: NutritionSummaryPanelProps) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryHeader}>
        <Text style={styles.summaryTitle}>Today</Text>
        <Text style={styles.summarySubtitle}>
          {loading ? 'Loading...' : error ?? 'Daily targets'}
        </Text>
      </View>
      <View style={styles.summaryBars}>
        {rows.map((row) => (
          <View key={row.key} style={styles.nutrientRow}>
            <Text style={styles.nutrientName}>{row.label}</Text>
            <View style={styles.nutrientTrack}>
              <View
                style={[
                  styles.nutrientFill,
                  { width: `${getProgress(row)}%` },
                  row.target === null && styles.nutrientFillUntargeted,
                ]}
              />
            </View>
            <Text style={styles.nutrientValue} numberOfLines={1}>
              {getValueText(row)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flex: 1,
    margin: 12,
    padding: 18,
    backgroundColor: '#f5f7fb',
    borderRadius: 12,
    gap: 18,
    justifyContent: 'center',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryTitle: { fontSize: 20, fontWeight: 'bold' },
  summarySubtitle: { color: '#666', fontSize: 13 },
  summaryBars: {
    gap: 14,
  },
  nutrientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nutrientName: {
    width: 72,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  nutrientTrack: {
    flex: 1,
    height: 12,
    overflow: 'hidden',
    backgroundColor: '#dde3ea',
    borderRadius: 999,
  },
  nutrientFill: {
    height: '100%',
    backgroundColor: '#1976D2',
    borderRadius: 999,
  },
  nutrientFillUntargeted: {
    backgroundColor: '#8aa4bf',
  },
  nutrientValue: {
    width: 92,
    fontSize: 12,
    color: '#555',
    textAlign: 'right',
    flexShrink: 0,
  },
});
