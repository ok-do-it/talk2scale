import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import {
  fetchDailyTargets,
  fetchNutrientElements,
  fetchUserMealNutrients,
  type DailyTargets,
  type ElementSummary,
  type NutrientEntry,
  type NutrientGroup,
} from '../services/nutritionApi';
import { DEFAULT_USER_ID, getUserId, setUserId } from '../services/storage';
import { fetchUser } from '../services/userApi';
import { useScaleStore } from '../state/scaleStore';
import type { MealEntry } from '../state/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

type SummaryRow = {
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

function getTodayRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  return { from, to };
}

function getAllNutrients(groups: NutrientGroup[]): NutrientEntry[] {
  return groups.flatMap((group) => group.nutrients);
}

function formatAmount(amount: number, unit: SummaryRow['unit']): string {
  if (unit === 'kcal') return String(Math.round(amount));
  if (amount >= 10) return String(Math.round(amount));
  if (amount === 0) return '0';
  return amount.toFixed(1);
}

function buildSummaryRows(
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

export function HomeScreen({ navigation }: Props) {
  const { height } = useWindowDimensions();
  const mealEntries = useScaleStore((s) => s.mealEntries);
  const [userId, setUserIdState] = useState(DEFAULT_USER_ID);
  const [userName, setUserName] = useState<string | null>(null);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>(() =>
    buildSummaryRows([], null),
  );
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [userIdInput, setUserIdInput] = useState('');
  const summaryHeight = Math.max(160, Math.round(height * 0.24));

  const loadUserProfile = useCallback(async (id: number) => {
    if (id <= 0) {
      setUserName(null);
      return;
    }
    try {
      const user = await fetchUser(id);
      setUserName(user.name);
    } catch {
      setUserName(null);
    }
  }, []);

  const loadSummary = useCallback(async (id: number) => {
    if (id <= 0) {
      setSummaryRows(buildSummaryRows([], null));
      setSummaryLoading(false);
      setSummaryError(null);
      return;
    }

    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const { from, to } = getTodayRange();
      const [groups, targets] = await Promise.all([
        fetchUserMealNutrients(id, from, to),
        fetchDailyTargets(id),
      ]);
      const targetNutrients =
        targets !== null && targets.nutrient_amounts.length > 0
          ? await fetchNutrientElements()
          : [];
      setSummaryRows(buildSummaryRows(groups, targets, targetNutrients));
    } catch {
      setSummaryRows(buildSummaryRows([], null));
      setSummaryError('Unable to load today');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void getUserId().then((id) => {
      setUserIdState(id);
      void loadUserProfile(id);
      void loadSummary(id);
    });
  }, [loadSummary, loadUserProfile]);

  useEffect(() => {
    void loadSummary(userId);
  }, [loadSummary, mealEntries.length, userId]);

  const openUserDialog = () => {
    setUserIdInput(userId > 0 ? String(userId) : '');
    setShowUserDialog(true);
  };

  const saveUserId = async () => {
    const trimmed = userIdInput.trim();
    if (!trimmed) {
      setShowUserDialog(false);
      return;
    }
    const id = parseInt(trimmed, 10);
    if (!Number.isNaN(id)) {
      await setUserId(id);
      setUserIdState(id);
      await loadUserProfile(id);
    }
    setShowUserDialog(false);
  };

  const renderMeal = useCallback(
    ({ item }: { item: MealEntry }) => (
      <View style={styles.mealRow}>
        <Text style={styles.mealName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.mealTime}>{item.time}</Text>
        <Text style={styles.mealCal}>{item.calories}</Text>
      </View>
    ),
    [],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={openUserDialog}>
          <Ionicons name="person-circle-outline" size={32} color="#333" />
        </Pressable>
        <Text style={styles.userLabel}>
          {userName ?? `#${userId}`}
        </Text>
        <View style={styles.spacer} />
        <Pressable
          style={styles.iconBtn}
          onPress={() =>
            navigation.navigate('Connection', { autoStartConnect: true })
          }
        >
          <Ionicons name="bluetooth" size={28} color="#333" />
        </Pressable>
        <Pressable style={styles.iconBtn}>
          <Ionicons name="menu" size={28} color="#333" />
        </Pressable>
      </View>

      <View style={[styles.summary, { height: summaryHeight }]}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>Today</Text>
          <Text style={styles.summarySubtitle}>
            {summaryLoading
              ? 'Loading...'
              : summaryError ?? 'Daily targets'}
          </Text>
        </View>
        <View style={styles.summaryBars}>
          {summaryRows.map((row) => (
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

      <Text style={styles.sectionTitle}>Meals and snacks</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.headerCell, styles.nameCol]}>Name</Text>
        <Text style={[styles.headerCell, styles.timeCol]}>Time</Text>
        <Text style={[styles.headerCell, styles.calCol]}>Cal</Text>
      </View>

      <FlatList
        data={mealEntries}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderMeal}
        style={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No meals yet</Text>}
      />

      <View style={styles.footer}>
        <Pressable
          style={styles.mealBtn}
          onPress={() => navigation.navigate('Scale')}
        >
          <Text style={styles.mealBtnText}>+ Meal</Text>
          <Ionicons name="scale-outline" size={20} color="#fff" />
        </Pressable>
      </View>

      <Modal visible={showUserDialog} transparent animationType="fade">
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>User ID</Text>
            <TextInput
              style={styles.dialogInput}
              value={userIdInput}
              onChangeText={setUserIdInput}
              keyboardType="number-pad"
              placeholder="Enter user id"
            />
            <View style={styles.dialogActions}>
              <Pressable onPress={() => setShowUserDialog(false)}>
                <Text>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void saveUserId()}>
                <Text style={styles.dialogOk}>OK</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  iconBtn: { padding: 8 },
  userLabel: { fontSize: 16, marginLeft: 4 },
  spacer: { flex: 1 },
  summary: {
    margin: 12,
    padding: 18,
    backgroundColor: '#f5f7fb',
    borderRadius: 12,
    gap: 18,
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  headerCell: { fontSize: 14, fontWeight: 'bold' },
  nameCol: { flex: 3 },
  timeCol: { flex: 1, textAlign: 'right' },
  calCol: { flex: 1, textAlign: 'right' },
  list: { flex: 1 },
  mealRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  mealName: { flex: 3, fontSize: 15 },
  mealTime: { flex: 1, textAlign: 'right', fontSize: 15 },
  mealCal: { flex: 1, textAlign: 'right', fontSize: 15 },
  empty: { textAlign: 'center', color: '#888', marginTop: 24 },
  footer: { padding: 16 },
  mealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1976D2',
    padding: 14,
    borderRadius: 4,
  },
  mealBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: { backgroundColor: '#fff', borderRadius: 8, padding: 20 },
  dialogTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  dialogInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 10,
    marginBottom: 16,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 24,
  },
  dialogOk: { fontWeight: '600', color: '#1976D2' },
});
