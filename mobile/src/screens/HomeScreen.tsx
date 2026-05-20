import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { getUserId, setUserId } from '../services/storage';
import { useScaleStore } from '../state/scaleStore';
import type { MealEntry } from '../state/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const mealEntries = useScaleStore((s) => s.mealEntries);
  const [userId, setUserIdState] = useState(0);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [userIdInput, setUserIdInput] = useState('');

  useEffect(() => {
    void getUserId().then((id) => setUserIdState(id));
  }, []);

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
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={openUserDialog}>
          <Ionicons name="person-circle-outline" size={32} color="#333" />
        </Pressable>
        <Text style={styles.userLabel}>{userId > 0 ? `#${userId}` : '#0'}</Text>
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

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Total nutrients today</Text>
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
  iconBtn: { padding: 8 },
  userLabel: { fontSize: 16, marginLeft: 4 },
  spacer: { flex: 1 },
  summary: {
    margin: 12,
    padding: 24,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  summaryTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
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
