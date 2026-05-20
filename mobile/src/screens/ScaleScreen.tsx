import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { CalibrationOverlay } from '../components/CalibrationOverlay';
import { WeightDisplay } from '../components/WeightDisplay';
import type { RootStackParamList } from '../navigation/types';
import { requestRecordAudioPermission } from '../services/permissions';
import { speechRecognition } from '../services/speech';
import { useScaleStore } from '../state/scaleStore';
import type { LogEntry } from '../state/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Scale'>;

const NO_SELECTION = -1;

export function ScaleScreen({ navigation }: Props) {
  const weightReading = useScaleStore((s) => s.weightReading);
  const lastWeight = useScaleStore((s) => s.lastWeight);
  const logEntries = useScaleStore((s) => s.logEntries);
  const isConnected = useScaleStore((s) => s.isConnected);
  const mockEnabled = useScaleStore((s) => s.mockEnabled);
  const addLogEntry = useScaleStore((s) => s.addLogEntry);
  const renameLogEntry = useScaleStore((s) => s.renameLogEntry);
  const clearLogEntries = useScaleStore((s) => s.clearLogEntries);
  const submitBreakfastMeal = useScaleStore((s) => s.submitBreakfastMeal);
  const sendTare = useScaleStore((s) => s.sendTare);
  const setMockEnabled = useScaleStore((s) => s.setMockEnabled);
  const addMockWeight = useScaleStore((s) => s.addMockWeight);

  const [foodText, setFoodText] = useState('');
  const [listening, setListening] = useState(false);
  const [showCalib, setShowCalib] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(NO_SELECTION);
  const selectedIndexRef = useRef(NO_SELECTION);
  selectedIndexRef.current = selectedIndex;

  const weight = weightReading?.weight ?? 0;
  const stable = weightReading?.stable ?? false;
  const hasFood = foodText.trim().length > 0;
  const isEditing = selectedIndex !== NO_SELECTION;

  const applyLogEntry = useCallback(
    (food: string): boolean => {
      if (!food) {
        Alert.alert('Enter a food name first');
        return false;
      }
      if (lastWeight === 0) {
        Alert.alert('No weight reading yet');
        return false;
      }
      addLogEntry(food, lastWeight);
      sendTare();
      setSelectedIndex(NO_SELECTION);
      return true;
    },
    [addLogEntry, lastWeight, sendTare],
  );

  const applyRename = useCallback(
    (food: string, index: number): boolean => {
      if (!food) {
        Alert.alert('Enter a food name first');
        return false;
      }
      const ok = renameLogEntry(index, food);
      if (ok) {
        setSelectedIndex(NO_SELECTION);
      }
      return ok;
    },
    [renameLogEntry],
  );

  useEffect(() => {
    speechRecognition.setCallbacks({
      onListeningStateChanged: setListening,
      onPartialText: (text) => {
        setFoodText(text);
      },
      onFinalText: (text) => {
        setFoodText(text);
        const food = text.trim();
        const idx = selectedIndexRef.current;
        if (idx !== NO_SELECTION) {
          if (applyRename(food, idx)) setFoodText('');
        } else if (applyLogEntry(food)) {
          setFoodText('');
        }
      },
      onNoMatchOrTimeout: () => {
        Alert.alert('Could not recognise speech - try again');
      },
      onUnavailable: () => {
        Alert.alert('Speech recognition not available on this device');
      },
    });
    return () => {
      void speechRecognition.release();
    };
  }, [applyLogEntry, applyRename]);

  const onMicTap = async () => {
    if (listening) {
      await speechRecognition.cancelListening();
      setFoodText('');
      return;
    }
    const granted = await requestRecordAudioPermission();
    if (!granted) {
      Alert.alert('Microphone permission denied');
      return;
    }
    await speechRecognition.startListening();
  };

  const onApply = () => {
    const food = foodText.trim();
    const applied = isEditing
      ? applyRename(food, selectedIndex)
      : applyLogEntry(food);
    if (applied) setFoodText('');
  };

  const onClearFood = () => {
    if (isEditing) {
      setSelectedIndex(NO_SELECTION);
    }
    setFoodText('');
  };

  const selectLogItem = (index: number) => {
    const entry = logEntries[index];
    if (!entry) return;
    setSelectedIndex(index);
    setFoodText(entry.foodName);
  };

  const handleSecondary = () => {
    if (logEntries.length === 0) {
      navigation.goBack();
      return;
    }
    setSelectedIndex(NO_SELECTION);
    clearLogEntries();
  };

  const handleSubmit = () => {
    if (!submitBreakfastMeal()) return;
    setSelectedIndex(NO_SELECTION);
    navigation.goBack();
  };

  const toggleMockDev = () => {
    if (__DEV__) {
      const next = !useScaleStore.getState().mockEnabled;
      setMockEnabled(next);
      Alert.alert('Mock mode', next ? 'enabled' : 'disabled');
    }
  };

  const renderLogItem = useCallback(
    ({ item, index }: { item: LogEntry; index: number }) => (
      <Pressable
        style={[styles.logRow, index === selectedIndex && styles.logRowSelected]}
        onPress={() => selectLogItem(index)}
      >
        <Text style={styles.logFood} numberOfLines={1}>
          {item.foodName}
        </Text>
        <Text style={styles.logWeight}>{item.weightGrams} g</Text>
        <Text style={styles.logCal}>{item.calories}</Text>
      </Pressable>
    ),
    [selectedIndex, logEntries],
  );

  const applyEnabled =
    hasFood && !listening && (isEditing || lastWeight > 0);

  return (
    <View style={styles.container}>
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

      <Pressable style={styles.tareBtn} onPress={sendTare}>
        <Text style={styles.tareText}>TARE</Text>
      </Pressable>

      <View style={styles.foodInputWrap}>
        <Ionicons name="search" size={22} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.foodInput}
          value={foodText}
          onChangeText={setFoodText}
          placeholder="Food name"
          editable={!listening}
        />
        {hasFood && !listening && (
          <>
            <Pressable style={styles.inlineBtn} onPress={onClearFood}>
              <Ionicons name="close-circle" size={28} color="#666" />
            </Pressable>
            <Pressable
              style={[styles.inlineBtn, !applyEnabled && styles.inlineBtnDisabled]}
              onPress={onApply}
              disabled={!applyEnabled}
            >
              <Ionicons name="checkmark-circle" size={28} color="#2e7d32" />
            </Pressable>
          </>
        )}
        {listening && (
          <View style={styles.listeningOverlay}>
            <Text style={styles.listeningText}>Listening...</Text>
          </View>
        )}
      </View>

      <Pressable style={styles.micBtn} onPress={() => void onMicTap()}>
        <Ionicons name="mic" size={20} color="#fff" />
        <Text style={styles.micText}>{listening ? 'CANCEL' : 'Voice Input'}</Text>
      </Pressable>

      <View style={styles.tableHeader}>
        <Text style={[styles.headerCell, styles.foodCol]}>Food</Text>
        <Text style={[styles.headerCell, styles.weightCol]}>Weight</Text>
        <Text style={[styles.headerCell, styles.calCol]}>Cal</Text>
      </View>

      <FlatList
        data={logEntries}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderLogItem}
        style={styles.logList}
      />

      <View style={styles.footer}>
        <Pressable style={styles.footerBtn} onPress={handleSecondary}>
          <Text>{logEntries.length > 0 ? 'Discard' : 'Back'}</Text>
        </Pressable>
        <Pressable
          style={[styles.footerBtn, logEntries.length === 0 && styles.footerBtnDisabled]}
          onPress={handleSubmit}
          disabled={logEntries.length === 0}
        >
          <Text>Submit</Text>
        </Pressable>
      </View>

      <CalibrationOverlay visible={showCalib} onClose={() => setShowCalib(false)} />
    </View>
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
  tareBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#e0e0e0',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  tareText: { fontWeight: '600' },
  foodInputWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  searchIcon: { marginRight: 8 },
  foodInput: { flex: 1, fontSize: 16, minHeight: 48 },
  inlineBtn: { padding: 4 },
  inlineBtnDisabled: { opacity: 0.4 },
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
