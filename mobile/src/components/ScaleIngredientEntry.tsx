import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { WeightDisplay } from './WeightDisplay';
import {
  searchFoodNames,
  type ElementSummary,
} from '../services/nutritionApi';
import { speechRecognition } from '../services/speech';
import { useScaleStore } from '../state/scaleStore';

const FOOD_SEARCH_DEBOUNCE_MS = 300;
const FOOD_SEARCH_LIMIT = 6;
const VOICE_AUTO_SELECT_DELAY_MS = 3000;
const VOICE_AUTO_SELECT_TICK_MS = 100;

export type ResolvedFood = {
  rawName: string;
  element: ElementSummary;
  amountGrams: number;
};

type ScaleIngredientEntryProps = {
  busy?: boolean;
  active?: boolean;
  onFoodResolved: (food: ResolvedFood) => void | Promise<void>;
  onRequestCalibrate?: () => void;
};

export function ScaleIngredientEntry({
  busy = false,
  active = true,
  onFoodResolved,
  onRequestCalibrate,
}: ScaleIngredientEntryProps) {
  const weightReading = useScaleStore((s) => s.weightReading);
  const lastWeight = useScaleStore((s) => s.lastWeight);
  const sendTare = useScaleStore((s) => s.sendTare);
  const setMockEnabled = useScaleStore((s) => s.setMockEnabled);
  const addMockWeight = useScaleStore((s) => s.addMockWeight);

  const [foodText, setFoodText] = useState('');
  const [listening, setListening] = useState(false);
  const [foodSearchResults, setFoodSearchResults] = useState<ElementSummary[]>(
    [],
  );
  const [foodSearchLoading, setFoodSearchLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
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
  const controlsDisabled = busy || resolving || listening || !active;

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
    const filter = foodText.trim();
    if (!filter || listening || busy || resolving) {
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
  }, [busy, foodText, listening, resolving, runFoodSearch]);

  const applyFoodElement = useCallback(
    async (element: ElementSummary, rawNameOverride?: string) => {
      const rawName =
        rawNameOverride ?? voiceSearchRawNameRef.current ?? foodText.trim();
      if (!rawName) {
        Alert.alert('Enter a food name first');
        return;
      }
      if (lastWeight <= 0) {
        Alert.alert('No weight reading yet');
        return;
      }

      setResolving(true);
      try {
        await onFoodResolved({
          rawName,
          element,
          amountGrams: lastWeight,
        });
        clearSearchSourceMetadata();
        setFoodText('');
        setFoodSearchResults([]);
        setFoodSearchLoading(false);
        sendTare();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to add food';
        Alert.alert(message);
      } finally {
        setResolving(false);
      }
    },
    [clearSearchSourceMetadata, foodText, lastWeight, onFoodResolved, sendTare],
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
      void applyFoodElement(voiceAutoSelect.element, voiceAutoSelect.rawName);
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
    if (!active) {
      void speechRecognition.release();
      setListening(false);
      return;
    }

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
  }, [active, runFoodSearch, showRepeatToast, updateFoodText]);

  const onClearFood = () => {
    clearSearchSourceMetadata();
    setFoodText('');
    setFoodSearchResults([]);
    setFoodSearchLoading(false);
  };

  const toggleMockDev = () => {
    if (__DEV__) {
      const next = !useScaleStore.getState().mockEnabled;
      setMockEnabled(next);
      Alert.alert('Mock mode', next ? 'enabled' : 'disabled');
    }
  };

  const showFoodDropdown =
    hasFood &&
    !listening &&
    !busy &&
    !resolving &&
    (foodSearchLoading || foodSearchResults.length > 0);
  const autoSelectProgressWidth =
    `${Math.round(voiceAutoSelectProgress * 100)}%` as `${number}%`;

  return (
    <View>
      <WeightDisplay
        weight={weight}
        stable={stable}
        onPress={addMockWeight}
        onLongPress={toggleMockDev}
      />

      <Pressable
        style={styles.tareBtn}
        onPress={sendTare}
        disabled={controlsDisabled}
      >
        <Text style={styles.tareText}>TARE</Text>
      </Pressable>

      {onRequestCalibrate ? (
        <Pressable
          style={styles.calibrateBtn}
          onPress={onRequestCalibrate}
          disabled={controlsDisabled}
        >
          <Text style={styles.tareText}>Calibrate</Text>
        </Pressable>
      ) : null}

      <View style={styles.foodSearchWrap}>
        <View style={styles.foodInputWrap}>
          <Ionicons
            name="search"
            size={22}
            color="#666"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.foodInput}
            value={foodText}
            onChangeText={updateFoodText}
            placeholder="Food name"
            editable={!controlsDisabled}
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
                    onPress={() => void applyFoodElement(element)}
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
        onPressIn={() => void speechRecognition.startListening()}
        onPressOut={() => void speechRecognition.stopListening()}
        disabled={busy || resolving || !active}
      >
        <Ionicons name="mic" size={20} color="#fff" />
        <Text style={styles.micText}>
          {listening ? 'Release to send' : 'Hold to speak'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tareBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#e0e0e0',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  calibrateBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#eee',
    padding: 10,
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
});
