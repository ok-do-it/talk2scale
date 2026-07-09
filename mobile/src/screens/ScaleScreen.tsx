import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  type GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { CalibrationOverlay } from '../components/CalibrationOverlay';
import { WeightDisplay } from '../components/WeightDisplay';
import type { RootStackParamList } from '../navigation/types';
import {
  addMealFoodLog,
  createMeal,
  deleteMealFoodLog,
  fetchElementNutrients,
  fetchMeal,
  fetchMeasures,
  renameMeal,
  searchFoodNames,
  type ApiFoodLog,
  type ElementSummary,
  type MealFoodLogInput,
  type NutrientGroup,
} from '../services/nutritionApi';
import { speechRecognition } from '../services/speech';
import { DEFAULT_USER_ID, getUserId } from '../services/storage';
import { useScaleStore } from '../state/scaleStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Scale'>;

type EditorLog = {
  localId: string;
  logId?: number;
  replacementForLogId?: number;
  elementId: number | null;
  rawName: string;
  displayName?: string;
  amount: number;
  measureId: number;
  calories: number;
};

type SwipeableLogRowProps = {
  item: EditorLog;
  index: number;
  selected: boolean;
  onPress: (index: number) => void;
  onSwipeRight: (log: EditorLog) => void;
};

const GRAM_MEASURE_ID = 1;
const NO_SELECTION = -1;
const FOOD_SEARCH_DEBOUNCE_MS = 300;
const FOOD_SEARCH_LIMIT = 6;
const VOICE_AUTO_SELECT_DELAY_MS = 3000;
const VOICE_AUTO_SELECT_TICK_MS = 100;

function resolveDefaultMealName(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'Breakfast';
  if (hour >= 11 && hour < 16) return 'Lunch';
  if (hour >= 16 && hour < 22) return 'Dinner';
  return 'Late Night';
}

function toEditorLog(log: ApiFoodLog): EditorLog {
  return {
    localId: `log-${log.id}`,
    logId: log.id,
    elementId: log.element_id,
    rawName: log.raw_name,
    amount: log.amount,
    measureId: log.measure_id,
    calories: 0,
  };
}

function toFoodLogInput(log: EditorLog): MealFoodLogInput {
  return {
    element_id: log.elementId,
    raw_name: log.rawName,
    amount: log.amount,
    measure_id: log.measureId,
  };
}

function extractKcal(groups: NutrientGroup[]): number {
  for (const group of groups) {
    for (const nutrient of group.nutrients) {
      const name = nutrient.name.toLowerCase();
      if (
        nutrient.calculated === true ||
        name.includes('energy') ||
        name.includes('kcal') ||
        name.includes('calorie')
      ) {
        return Math.round(nutrient.amount);
      }
    }
  }
  return 0;
}

async function calculateLogCalories(
  log: Pick<EditorLog, 'elementId' | 'amount' | 'measureId'>,
  userId: number,
): Promise<number> {
  if (log.elementId === null) return 0;
  const measures = await fetchMeasures(log.elementId, userId);
  const measure = measures.find((item) => item.id === log.measureId);
  const grams = measure?.grams ?? 1;
  const groups = await fetchElementNutrients(log.elementId, log.amount * grams);
  return extractKcal(groups);
}

function SwipeableLogRow({
  item,
  index,
  selected,
  onPress,
  onSwipeRight,
}: SwipeableLogRowProps) {
  const startXRef = useRef<number | null>(null);
  const swipedRef = useRef(false);

  const onTouchStart = (event: GestureResponderEvent) => {
    startXRef.current = event.nativeEvent.pageX;
    swipedRef.current = false;
  };

  const onTouchEnd = (event: GestureResponderEvent) => {
    const startX = startXRef.current;
    startXRef.current = null;
    if (startX === null) return;
    if (event.nativeEvent.pageX - startX > 60) {
      swipedRef.current = true;
      onSwipeRight(item);
    }
  };

  return (
    <Pressable
      style={[styles.logRow, selected && styles.logRowSelected]}
      onPress={() => {
        if (swipedRef.current) return;
        onPress(index);
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <Text style={styles.logFood} numberOfLines={1}>
        {item.displayName ?? item.rawName}
      </Text>
      <Text style={styles.logWeight}>{Math.round(item.amount)} g</Text>
      <Text style={styles.logCal}>{item.calories}</Text>
    </Pressable>
  );
}

export function ScaleScreen({ navigation, route }: Props) {
  const mealId = route.params?.mealId;
  const isMealEdit = mealId !== undefined;
  const weightReading = useScaleStore((s) => s.weightReading);
  const lastWeight = useScaleStore((s) => s.lastWeight);
  const isConnected = useScaleStore((s) => s.isConnected);
  const sendTare = useScaleStore((s) => s.sendTare);
  const setMockEnabled = useScaleStore((s) => s.setMockEnabled);
  const addMockWeight = useScaleStore((s) => s.addMockWeight);

  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [mealName, setMealName] = useState(() => resolveDefaultMealName(new Date()));
  const [originalMealName, setOriginalMealName] = useState(mealName);
  const [editorLogs, setEditorLogs] = useState<EditorLog[]>([]);
  const [foodText, setFoodText] = useState('');
  const [listening, setListening] = useState(false);
  const [loadingMeal, setLoadingMeal] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [showCalib, setShowCalib] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(NO_SELECTION);
  const [foodSearchResults, setFoodSearchResults] = useState<ElementSummary[]>([]);
  const [foodSearchLoading, setFoodSearchLoading] = useState(false);
  const [voiceAutoSelect, setVoiceAutoSelect] = useState<{
    element: ElementSummary;
    rawName: string;
  } | null>(null);
  const [voiceAutoSelectProgress, setVoiceAutoSelectProgress] = useState(0);
  const immediateFoodSearchRef = useRef<string | null>(null);
  const voiceSearchRawNameRef = useRef<string | null>(null);

  const weight = weightReading?.weight ?? 0;
  const stable = weightReading?.stable ?? false;
  const hasFood = foodText.trim().length > 0;
  const isLogEditing = selectedIndex !== NO_SELECTION;

  useEffect(() => {
    void getUserId().then(setUserId);
  }, []);

  const updateLogCalories = useCallback(
    (log: EditorLog) => {
      if (log.elementId === null) return;
      void calculateLogCalories(log, userId)
        .then((calories) => {
          setEditorLogs((logs) =>
            logs.map((item) =>
              item.localId === log.localId ? { ...item, calories } : item,
            ),
          );
        })
        .catch(() => {
          // Keep unresolved calories at zero when nutrition data is unavailable.
        });
    },
    [userId],
  );

  const clearSearchSourceMetadata = useCallback(() => {
    voiceSearchRawNameRef.current = null;
    setVoiceAutoSelect(null);
    setVoiceAutoSelectProgress(0);
  }, []);

  const updateFoodText = useCallback(
    (text: string) => {
      clearSearchSourceMetadata();
      setFoodText(text);
      setFoodSearchResults([]);
    },
    [clearSearchSourceMetadata],
  );

  const runFoodSearch = useCallback(
    async (filter: string, isCancelled: () => boolean = () => false) => {
      setFoodSearchLoading(true);
      try {
        const elements = await searchFoodNames(filter, FOOD_SEARCH_LIMIT);
        if (!isCancelled()) {
          setFoodSearchResults(elements);
          const rawName = voiceSearchRawNameRef.current;
          if (rawName === filter && elements.length > 0) {
            setVoiceAutoSelect({
              element: elements[0],
              rawName,
            });
            setVoiceAutoSelectProgress(1);
          } else {
            setVoiceAutoSelect(null);
            setVoiceAutoSelectProgress(0);
          }
        }
      } catch {
        if (!isCancelled()) {
          setFoodSearchResults([]);
          setVoiceAutoSelect(null);
          setVoiceAutoSelectProgress(0);
        }
      } finally {
        if (!isCancelled()) setFoodSearchLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setSelectedIndex(NO_SELECTION);
    clearSearchSourceMetadata();
    setFoodText('');
    setFoodSearchResults([]);
    if (mealId === undefined) {
      const defaultName = resolveDefaultMealName(new Date());
      setMealName(defaultName);
      setOriginalMealName(defaultName);
      setEditorLogs([]);
      setLoadingMeal(false);
      return;
    }

    let cancelled = false;
    setLoadingMeal(true);
    void (async () => {
      try {
        const meal = await fetchMeal(mealId);
        if (cancelled) return;
        const name = meal.name ?? 'Meal';
        const logs = await Promise.all(
          meal.food_logs.map(async (log) => {
            const editorLog = toEditorLog(log);
            return {
              ...editorLog,
              calories: await calculateLogCalories(editorLog, userId).catch(
                () => 0,
              ),
            };
          }),
        );
        if (cancelled) return;
        setMealName(name);
        setOriginalMealName(name);
        setEditorLogs(logs);
      } catch {
        if (!cancelled) {
          Alert.alert('Unable to load meal');
          navigation.goBack();
        }
      } finally {
        if (!cancelled) setLoadingMeal(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSearchSourceMetadata, mealId, navigation, userId]);

  useEffect(() => {
    const filter = foodText.trim();
    if (
      !filter ||
      listening ||
      loadingMeal ||
      savingMeal
    ) {
      setFoodSearchResults([]);
      setFoodSearchLoading(false);
      setVoiceAutoSelect(null);
      setVoiceAutoSelectProgress(0);
      return;
    }

    const immediateFilter = immediateFoodSearchRef.current;
    if (immediateFilter !== null) {
      immediateFoodSearchRef.current = null;
      if (immediateFilter === filter) return;
    }

    let cancelled = false;
    setFoodSearchLoading(true);
    const timer = setTimeout(() => {
      void runFoodSearch(filter, () => cancelled);
    }, FOOD_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [foodText, listening, loadingMeal, runFoodSearch, savingMeal]);

  const applyLogEntry = useCallback(
    (rawName: string, element: ElementSummary): boolean => {
      if (!rawName) {
        Alert.alert('Enter a food name first');
        return false;
      }
      if (lastWeight <= 0) {
        Alert.alert('No weight reading yet');
        return false;
      }
      const entry: EditorLog = {
        localId: `new-${Date.now()}-${Math.random()}`,
        elementId: element.id,
        rawName,
        displayName: element.name,
        amount: lastWeight,
        measureId: GRAM_MEASURE_ID,
        calories: 0,
      };
      setEditorLogs((logs) => [entry, ...logs]);
      updateLogCalories(entry);
      sendTare();
      setSelectedIndex(NO_SELECTION);
      return true;
    },
    [lastWeight, sendTare, updateLogCalories],
  );

  const applyRename = useCallback(
    (
      rawName: string,
      index: number,
      element: ElementSummary,
    ): boolean => {
      if (!rawName) {
        Alert.alert('Enter a food name first');
        return false;
      }
      let updated = false;
      let updatedLog: EditorLog | null = null;
      setEditorLogs((logs) => {
        const existing = logs[index];
        if (!existing) return logs;
        const next = [...logs];
        updatedLog = {
          ...existing,
          logId: undefined,
          replacementForLogId:
            existing.replacementForLogId ?? existing.logId,
          elementId: element.id,
          rawName,
          displayName: element.name,
          calories: 0,
        };
        next[index] = updatedLog;
        updated = true;
        return next;
      });
      if (updated) {
        if (updatedLog !== null) updateLogCalories(updatedLog);
        setSelectedIndex(NO_SELECTION);
      }
      return updated;
    },
    [updateLogCalories],
  );

  const applyFoodElement = useCallback(
    (element: ElementSummary, rawNameOverride?: string) => {
      const rawName =
        rawNameOverride ?? voiceSearchRawNameRef.current ?? foodText.trim();
      const applied = isLogEditing
        ? applyRename(rawName, selectedIndex, element)
        : applyLogEntry(rawName, element);
      if (applied) {
        clearSearchSourceMetadata();
        setFoodText('');
        setFoodSearchResults([]);
        setFoodSearchLoading(false);
      }
    },
    [
      applyLogEntry,
      applyRename,
      clearSearchSourceMetadata,
      foodText,
      isLogEditing,
      selectedIndex,
    ],
  );

  useEffect(() => {
    if (voiceAutoSelect === null) return;

    const startedAt = Date.now();
    setVoiceAutoSelectProgress(1);
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setVoiceAutoSelectProgress(
        Math.max(0, 1 - elapsed / VOICE_AUTO_SELECT_DELAY_MS),
      );
    }, VOICE_AUTO_SELECT_TICK_MS);
    const timer = setTimeout(() => {
      applyFoodElement(voiceAutoSelect.element, voiceAutoSelect.rawName);
    }, VOICE_AUTO_SELECT_DELAY_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [applyFoodElement, voiceAutoSelect]);

  const showRepeatToast = useCallback(() => {
    const message = 'Food not found. Please hold the mic and repeat.';
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    Alert.alert(message);
  }, []);

  useEffect(() => {
    speechRecognition.setCallbacks({
      onListeningStateChanged: setListening,
      onPartialText: (text) => {
        updateFoodText(text);
      },
      onFinalText: (text) => {
        const food = text.trim();
        updateFoodText(food);
        if (!food) {
          showRepeatToast();
          return;
        }
        voiceSearchRawNameRef.current = food;
        immediateFoodSearchRef.current = food;
        void runFoodSearch(food);
      },
      onNoMatchOrTimeout: () => {
        showRepeatToast();
      },
      onUnavailable: () => {
        showRepeatToast();
      },
    });
    return () => {
      void speechRecognition.release();
    };
  }, [runFoodSearch, showRepeatToast, updateFoodText]);

  const onMicPressIn = async () => {
    await speechRecognition.startListening();
  };

  const onMicPressOut = async () => {
    await speechRecognition.stopListening();
  };

  const onClearFood = () => {
    if (isLogEditing) {
      setSelectedIndex(NO_SELECTION);
    }
    clearSearchSourceMetadata();
    setFoodText('');
    setFoodSearchResults([]);
    setFoodSearchLoading(false);
  };

  const selectLogItem = useCallback(
    (index: number) => {
      const entry = editorLogs[index];
      if (!entry) return;
      setSelectedIndex(index);
      clearSearchSourceMetadata();
      setFoodText(entry.rawName);
      setFoodSearchResults([]);
      setFoodSearchLoading(false);
    },
    [clearSearchSourceMetadata, editorLogs],
  );

  const removeLogLocally = useCallback((localId: string) => {
    setEditorLogs((logs) => logs.filter((log) => log.localId !== localId));
    setSelectedIndex(NO_SELECTION);
    clearSearchSourceMetadata();
  }, [clearSearchSourceMetadata]);

  const confirmDeleteLog = useCallback(
    (log: EditorLog) => {
      Alert.alert('Are you sure', `Delete ${log.displayName ?? log.rawName}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const backendLogId = log.logId ?? log.replacementForLogId;
              if (mealId !== undefined && backendLogId !== undefined) {
                try {
                  await deleteMealFoodLog(mealId, backendLogId);
                } catch {
                  Alert.alert('Unable to delete food log');
                  return;
                }
              }
              removeLogLocally(log.localId);
            })();
          },
        },
      ]);
    },
    [mealId, removeLogLocally],
  );

  const handleSecondary = () => {
    if (isMealEdit || editorLogs.length === 0) {
      navigation.goBack();
      return;
    }
    setSelectedIndex(NO_SELECTION);
    clearSearchSourceMetadata();
    setFoodSearchResults([]);
    setEditorLogs([]);
  };

  const handleSubmit = async () => {
    if (savingMeal) return;
    if (!isMealEdit && editorLogs.length === 0) {
      Alert.alert('Add at least one food first');
      return;
    }
    const trimmedName = mealName.trim();
    if (!trimmedName) {
      Alert.alert('Enter a meal name first');
      return;
    }

    setSavingMeal(true);
    try {
      if (mealId === undefined) {
        const meal = await createMeal({
          user_id: userId,
          logged_at: new Date().toISOString(),
          food_logs: editorLogs.map(toFoodLogInput),
        });
        if (trimmedName !== (meal.name ?? '')) {
          await renameMeal(meal.id, trimmedName);
        }
      } else {
        if (trimmedName !== originalMealName) {
          await renameMeal(mealId, trimmedName);
        }

        for (const log of editorLogs) {
          if (log.replacementForLogId !== undefined) {
            await deleteMealFoodLog(mealId, log.replacementForLogId);
          }
        }

        for (const log of editorLogs) {
          if (log.logId === undefined) {
            await addMealFoodLog(mealId, toFoodLogInput(log));
          }
        }
      }
      setSelectedIndex(NO_SELECTION);
      navigation.navigate('Home');
    } catch {
      Alert.alert('Unable to save meal');
    } finally {
      setSavingMeal(false);
    }
  };

  const toggleMockDev = () => {
    if (__DEV__) {
      const next = !useScaleStore.getState().mockEnabled;
      setMockEnabled(next);
      Alert.alert('Mock mode', next ? 'enabled' : 'disabled');
    }
  };

  const renderLogItem = useCallback(
    ({ item, index }: { item: EditorLog; index: number }) => (
      <SwipeableLogRow
        item={item}
        index={index}
        selected={index === selectedIndex}
        onPress={selectLogItem}
        onSwipeRight={confirmDeleteLog}
      />
    ),
    [confirmDeleteLog, selectLogItem, selectedIndex],
  );

  const showFoodDropdown =
    hasFood &&
    !listening &&
    !loadingMeal &&
    !savingMeal &&
    (foodSearchLoading || foodSearchResults.length > 0);
  const autoSelectProgressWidth =
    `${Math.round(voiceAutoSelectProgress * 100)}%` as `${number}%`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
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
      </View>

      <WeightDisplay
        weight={weight}
        stable={stable}
        onPress={addMockWeight}
        onLongPress={toggleMockDev}
      />

      <View style={styles.mealNameWrap}>
        <Text style={styles.mealNameLabel}>
          {isMealEdit ? 'Edit meal' : 'New meal'}
        </Text>
        <TextInput
          style={styles.mealNameInput}
          value={mealName}
          onChangeText={setMealName}
          placeholder="Meal name"
          editable={!loadingMeal && !savingMeal}
        />
      </View>

      <Pressable style={styles.tareBtn} onPress={sendTare}>
        <Text style={styles.tareText}>TARE</Text>
      </Pressable>

      <View style={styles.foodSearchWrap}>
        <View style={styles.foodInputWrap}>
          <Ionicons name="search" size={22} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.foodInput}
            value={foodText}
            onChangeText={updateFoodText}
            placeholder="Food name"
            editable={!listening && !loadingMeal && !savingMeal}
          />
          {hasFood && !listening && (
            <Pressable style={styles.inlineBtn} onPress={onClearFood}>
              <Ionicons name="close-circle" size={28} color="#666" />
            </Pressable>
          )}
          {listening && (
            <View style={styles.listeningOverlay}>
              <Text style={styles.listeningText}>Listening...</Text>
            </View>
          )}
        </View>
        {showFoodDropdown && (
          <View style={styles.foodDropdown}>
            {foodSearchLoading ? (
              <Text style={styles.foodDropdownStatus}>Searching...</Text>
            ) : (
              <>
                {voiceAutoSelect !== null && (
                  <View style={styles.autoSelectProgressTrack}>
                    <View
                      style={[
                        styles.autoSelectProgressFill,
                        { width: autoSelectProgressWidth },
                      ]}
                    />
                  </View>
                )}
                {foodSearchResults.map((element) => (
                  <Pressable
                    key={element.id}
                    style={styles.foodOption}
                    onPress={() => applyFoodElement(element)}
                  >
                    <Text style={styles.foodOptionName} numberOfLines={1}>
                      {element.name}
                    </Text>
                    <Text style={styles.foodOptionType}>{element.type}</Text>
                  </Pressable>
                ))}
              </>
            )}
          </View>
        )}
      </View>

      <Pressable
        style={[styles.micBtn, listening && styles.micBtnRecording]}
        onPressIn={() => void onMicPressIn()}
        onPressOut={() => void onMicPressOut()}
      >
        <Ionicons name="mic" size={20} color="#fff" />
        <Text style={styles.micText}>
          {listening ? 'Release to send' : 'Hold to speak'}
        </Text>
      </Pressable>

      <View style={styles.tableHeader}>
        <Text style={[styles.headerCell, styles.foodCol]}>Food</Text>
        <Text style={[styles.headerCell, styles.weightCol]}>Weight</Text>
        <Text style={[styles.headerCell, styles.calCol]}>Cal</Text>
      </View>

      <FlatList
        data={editorLogs}
        keyExtractor={(item) => item.localId}
        renderItem={renderLogItem}
        style={styles.logList}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loadingMeal ? 'Loading meal...' : 'No food logs yet'}
          </Text>
        }
      />

      <View style={styles.footer}>
        <Pressable style={styles.footerBtn} onPress={handleSecondary}>
          <Text>{isMealEdit || editorLogs.length === 0 ? 'Back' : 'Discard'}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.footerBtn,
            (savingMeal || loadingMeal || (!isMealEdit && editorLogs.length === 0)) &&
              styles.footerBtnDisabled,
          ]}
          onPress={() => void handleSubmit()}
          disabled={savingMeal || loadingMeal || (!isMealEdit && editorLogs.length === 0)}
        >
          <Text>{savingMeal ? 'Saving...' : 'Submit'}</Text>
        </Pressable>
      </View>

      <CalibrationOverlay visible={showCalib} onClose={() => setShowCalib(false)} />
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
  spacer: { flex: 1 },
  iconBtn: { padding: 8 },
  mealNameWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  mealNameLabel: {
    color: '#666',
    fontSize: 13,
    marginBottom: 4,
  },
  mealNameInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    fontSize: 16,
    padding: 10,
  },
  tareBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#e0e0e0',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  tareText: { fontWeight: '600' },
  foodSearchWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  foodInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  searchIcon: { marginRight: 8 },
  foodInput: { flex: 1, fontSize: 16, minHeight: 48 },
  inlineBtn: { padding: 4 },
  foodDropdown: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    overflow: 'hidden',
  },
  foodDropdownStatus: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#666',
  },
  autoSelectProgressTrack: {
    height: 3,
    backgroundColor: '#e0e0e0',
  },
  autoSelectProgressFill: {
    height: 3,
    backgroundColor: '#1976D2',
  },
  foodOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  foodOptionName: { fontSize: 15, color: '#222' },
  foodOptionType: { marginTop: 2, fontSize: 12, color: '#777' },
  listeningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  listeningText: { color: '#fff', fontWeight: 'bold' },
  micBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#1976D2',
    padding: 12,
    borderRadius: 4,
  },
  micBtnRecording: { backgroundColor: '#C62828' },
  micText: { color: '#fff', fontWeight: '600' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  headerCell: { fontSize: 14, fontWeight: 'bold' },
  foodCol: { flex: 3 },
  weightCol: { flex: 1, textAlign: 'right' },
  calCol: { flex: 1, textAlign: 'right' },
  logList: { flex: 1 },
  logRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  logRowSelected: { backgroundColor: '#e3f2fd' },
  logFood: { flex: 3, fontSize: 15 },
  logWeight: { flex: 1, textAlign: 'right', fontSize: 15 },
  logCal: { flex: 1, textAlign: 'right', fontSize: 15 },
  empty: { textAlign: 'center', color: '#888', marginTop: 24 },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  footerBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  footerBtnDisabled: { opacity: 0.5 },
});
