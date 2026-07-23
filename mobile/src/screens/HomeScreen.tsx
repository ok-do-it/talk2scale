import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { CalibrationOverlay } from '../components/CalibrationOverlay';
import {
  FoodLogList,
  toFoodLogRow,
  type FoodLogRow,
} from '../components/FoodLogList';
import {
  buildSummaryRows,
  NutritionSummaryPanel,
  type SummaryRow,
} from '../components/NutritionSummaryPanel';
import {
  ScaleIngredientEntry,
  type ResolvedFood,
} from '../components/ScaleIngredientEntry';
import type { RootStackParamList } from '../navigation/types';
import {
  createFoodLog,
  deleteFoodLog,
  fetchDailyTargets,
  fetchNutrientElements,
  fetchUserFoodLogNutrients,
  fetchUserFoodLogs,
  updateFoodLog,
} from '../services/nutritionApi';
import { DEFAULT_USER_ID, getUserId, setUserId } from '../services/storage';
import { fetchUser } from '../services/userApi';
import { useScaleStore } from '../state/scaleStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const GRAM_MEASURE_ID = 1;
const CAROUSEL_PAGES = 2;

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

export function HomeScreen({ navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const carouselRef = useRef<ScrollView>(null);
  const isFocused = useIsFocused();
  const isConnected = useScaleStore((s) => s.isConnected);

  const [userId, setUserIdState] = useState(DEFAULT_USER_ID);
  const [userName, setUserName] = useState<string | null>(null);
  const [foodLogRows, setFoodLogRows] = useState<FoodLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>(() =>
    buildSummaryRows([], null),
  );
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [userIdInput, setUserIdInput] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [showCalib, setShowCalib] = useState(false);
  const [savingFood, setSavingFood] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [foodQuerySeed, setFoodQuerySeed] = useState<{
    token: number;
    name: string;
  } | null>(null);
  const foodLogsRequestIdRef = useRef(0);
  const summaryRequestIdRef = useRef(0);
  const foodQuerySeedTokenRef = useRef(0);

  const carouselHeight = Math.max(280, Math.round(height * 0.36));

  const goToPage = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(CAROUSEL_PAGES - 1, index));
      carouselRef.current?.scrollTo({ x: next * width, animated: true });
      setPageIndex(next);
    },
    [width],
  );

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

  const loadFoodLogs = useCallback(async (id: number) => {
    const requestId = ++foodLogsRequestIdRef.current;
    if (id <= 0) {
      if (requestId === foodLogsRequestIdRef.current) {
        setFoodLogRows([]);
        setLogsLoading(false);
        setLogsError(null);
      }
      return;
    }

    setLogsLoading(true);
    setLogsError(null);
    try {
      const { from, to } = getTodayRange();
      const logs = await fetchUserFoodLogs(id, from, to);
      if (requestId !== foodLogsRequestIdRef.current) return;
      setFoodLogRows(logs.map(toFoodLogRow));
    } catch {
      if (requestId !== foodLogsRequestIdRef.current) return;
      setLogsError('Unable to load food logs');
    } finally {
      if (requestId === foodLogsRequestIdRef.current) {
        setLogsLoading(false);
      }
    }
  }, []);

  const loadSummary = useCallback(async (id: number) => {
    const requestId = ++summaryRequestIdRef.current;
    if (id <= 0) {
      if (requestId === summaryRequestIdRef.current) {
        setSummaryRows(buildSummaryRows([], null));
        setSummaryLoading(false);
        setSummaryError(null);
      }
      return;
    }

    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const { from, to } = getTodayRange();
      const [groups, targets] = await Promise.all([
        fetchUserFoodLogNutrients(id, from, to),
        fetchDailyTargets(id),
      ]);
      const targetNutrients =
        targets !== null && targets.nutrient_amounts.length > 0
          ? await fetchNutrientElements()
          : [];
      if (requestId !== summaryRequestIdRef.current) return;
      setSummaryRows(buildSummaryRows(groups, targets, targetNutrients));
    } catch {
      if (requestId !== summaryRequestIdRef.current) return;
      // Keep the last successful totals visible; only surface the error.
      setSummaryError('Unable to load today');
    } finally {
      if (requestId === summaryRequestIdRef.current) {
        setSummaryLoading(false);
      }
    }
  }, []);

  const refreshDashboard = useCallback(
    async (id: number) => {
      await Promise.all([loadFoodLogs(id), loadSummary(id)]);
    },
    [loadFoodLogs, loadSummary],
  );

  useEffect(() => {
    void getUserId().then(setUserIdState);
  }, []);

  useEffect(() => {
    void loadUserProfile(userId);
    void refreshDashboard(userId);
  }, [loadUserProfile, refreshDashboard, userId]);

  useFocusEffect(
    useCallback(() => {
      void refreshDashboard(userId);
    }, [refreshDashboard, userId]),
  );

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
    }
    setShowUserDialog(false);
  };

  const clearLogSelection = useCallback(() => {
    setSelectedLogId(null);
  }, []);

  const openLogEditor = useCallback(
    (log: FoodLogRow) => {
      setSelectedLogId(log.id);
      foodQuerySeedTokenRef.current += 1;
      setFoodQuerySeed({
        token: foodQuerySeedTokenRef.current,
        name: log.name,
      });
      goToPage(1);
    },
    [goToPage],
  );

  const confirmDeleteLog = useCallback(
    (log: FoodLogRow) => {
      Alert.alert('Are you sure', `Delete ${log.name}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteFoodLog(log.id);
                if (selectedLogId === log.id) {
                  clearLogSelection();
                }
                await refreshDashboard(userId);
              } catch {
                Alert.alert('Unable to delete food log');
              }
            })();
          },
        },
      ]);
    },
    [clearLogSelection, refreshDashboard, selectedLogId, userId],
  );

  const handleFoodResolved = useCallback(
    async (food: ResolvedFood) => {
      setSavingFood(true);
      try {
        if (selectedLogId !== null) {
          await updateFoodLog(selectedLogId, {
            element_id: food.element.id,
            raw_name: food.rawName,
          });
          clearLogSelection();
        } else {
          await createFoodLog({
            user_id: userId,
            logged_at: new Date().toISOString(),
            element_id: food.element.id,
            raw_name: food.rawName,
            amount: food.amountGrams,
            measure_id: GRAM_MEASURE_ID,
          });
        }
        await refreshDashboard(userId);
      } finally {
        setSavingFood(false);
      }
    },
    [clearLogSelection, refreshDashboard, selectedLogId, userId],
  );

  const onCarouselScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    const clamped = Math.max(0, Math.min(CAROUSEL_PAGES - 1, next));
    setPageIndex(clamped);
    if (clamped === 0) {
      void loadSummary(userId);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={openUserDialog}>
          <Ionicons name="person-circle-outline" size={32} color="#333" />
        </Pressable>
        <Text style={styles.userLabel}>{userName ?? `#${userId}`}</Text>
        <View style={styles.spacer} />
        <Pressable
          style={styles.iconBtn}
          onPress={() =>
            navigation.navigate('Connection', {
              autoStartConnect: !isConnected(),
            })
          }
        >
          <Ionicons name="bluetooth" size={28} color="#333" />
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          onPress={() => {
            if (!isConnected()) {
              Alert.alert('Scale not connected');
              return;
            }
            setShowCalib(true);
          }}
        >
          <Ionicons name="settings-outline" size={28} color="#333" />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setMenuOpen(true)}>
          <Ionicons name="menu" size={28} color="#333" />
        </Pressable>
      </View>

      <View style={[styles.carouselWrap, { height: carouselHeight }]}>
        <ScrollView
          ref={carouselRef}
          horizontal
          pagingEnabled
          removeClippedSubviews={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onCarouselScrollEnd}
          style={{ width }}
        >
          <View style={{ width, height: carouselHeight }}>
            <NutritionSummaryPanel
              key={`summary-${summaryRows.map((row) => `${row.key}:${row.amount}`).join('|')}`}
              rows={summaryRows}
              loading={summaryLoading}
              error={summaryError}
            />
          </View>
          <View style={{ width, height: carouselHeight }}>
            <ScrollView
              nestedScrollEnabled
              contentContainerStyle={styles.scalePageContent}
            >
              <ScaleIngredientEntry
                active={isFocused && pageIndex === 1}
                busy={savingFood}
                editing={selectedLogId !== null}
                foodQuerySeed={foodQuerySeed}
                onFoodResolved={handleFoodResolved}
                onClearSelection={clearLogSelection}
              />
            </ScrollView>
          </View>
        </ScrollView>
        <View style={styles.dots}>
          <Pressable
            accessibilityLabel="Nutrition"
            onPress={() => {
              clearLogSelection();
              goToPage(0);
              void loadSummary(userId);
            }}
            style={[styles.dot, pageIndex === 0 && styles.dotActive]}
          />
          <Pressable
            accessibilityLabel="Scale"
            onPress={() => goToPage(1)}
            style={[styles.dot, pageIndex === 1 && styles.dotActive]}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Today's food</Text>
      <FoodLogList
        logs={foodLogRows}
        loading={logsLoading}
        error={logsError}
        selectedLogId={selectedLogId}
        onPressLog={openLogEditor}
        onSwipeDelete={confirmDeleteLog}
      />

      <View style={styles.footer}>
        {pageIndex === 0 ? (
          <Pressable style={styles.primaryBtn} onPress={() => goToPage(1)}>
            <Text style={styles.primaryBtnText}>Add Food From Scale</Text>
            <Ionicons name="scale-outline" size={20} color="#fff" />
          </Pressable>
        ) : (
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => {
              clearLogSelection();
              goToPage(0);
              void loadSummary(userId);
            }}
          >
            <Text style={styles.secondaryBtnText}>Back</Text>
          </Pressable>
        )}
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

      <Modal visible={menuOpen} transparent animationType="fade">
        <Pressable
          style={styles.dialogBackdrop}
          onPress={() => setMenuOpen(false)}
        >
          <View style={styles.menuCard}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                navigation.navigate('CreateRecipe');
              }}
            >
              <Text style={styles.menuItemText}>Create Recipe</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <CalibrationOverlay
        visible={showCalib}
        onClose={() => setShowCalib(false)}
      />
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
  carouselWrap: {
    overflow: 'hidden',
  },
  scalePageContent: {
    paddingBottom: 8,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#c5ced8',
  },
  dotActive: {
    backgroundColor: '#1976D2',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  footer: { padding: 16 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1976D2',
    padding: 14,
    borderRadius: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  secondaryBtnText: { fontSize: 16, fontWeight: '600', color: '#333' },
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
  menuCard: {
    alignSelf: 'flex-end',
    marginTop: 56,
    marginRight: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    minWidth: 180,
    overflow: 'hidden',
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemText: {
    fontSize: 16,
    color: '#222',
  },
});
