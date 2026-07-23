import { useCallback, useRef } from 'react';
import {
  FlatList,
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ApiFoodLog } from '../services/nutritionApi';

const CLUSTER_GAP_MS = 30 * 60 * 1000;

export type FoodLogRow = {
  id: number;
  name: string;
  time: string;
  calories: number;
  loggedAtMs: number;
};

type ListItem =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'log'; key: string; log: FoodLogRow };

type FoodLogListProps = {
  logs: FoodLogRow[];
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  selectedLogId?: number | null;
  onPressLog: (log: FoodLogRow) => void;
  onSwipeDelete: (log: FoodLogRow) => void;
};

type SwipeableLogRowProps = {
  item: FoodLogRow;
  selected: boolean;
  onPress: (log: FoodLogRow) => void;
  onSwipeRight: (log: FoodLogRow) => void;
};

export function toFoodLogRow(log: ApiFoodLog): FoodLogRow {
  const loggedAt = new Date(log.logged_at);
  return {
    id: log.id,
    name: log.raw_name,
    time: loggedAt.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }),
    calories: Math.round(log.kcal ?? 0),
    loggedAtMs: loggedAt.getTime(),
  };
}

export function buildClusteredListItems(logs: FoodLogRow[]): ListItem[] {
  const sorted = [...logs].sort((a, b) => b.loggedAtMs - a.loggedAtMs);
  const items: ListItem[] = [];
  let previousLoggedAt: number | null = null;
  let clusterIndex = 0;

  for (const log of sorted) {
    const needsHeader =
      previousLoggedAt === null ||
      previousLoggedAt - log.loggedAtMs > CLUSTER_GAP_MS;
    if (needsHeader) {
      clusterIndex += 1;
      items.push({
        kind: 'header',
        key: `cluster-${clusterIndex}-${log.loggedAtMs}`,
        label: log.time,
      });
    }
    items.push({
      kind: 'log',
      key: `log-${log.id}`,
      log,
    });
    previousLoggedAt = log.loggedAtMs;
  }

  return items;
}

function SwipeableLogRow({
  item,
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
        onPress(item);
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <Text style={styles.logName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.logTime}>{item.time}</Text>
      <Text style={styles.logCal}>{item.calories}</Text>
    </Pressable>
  );
}

export function FoodLogList({
  logs,
  loading = false,
  error = null,
  emptyText = 'No food logs yet',
  selectedLogId = null,
  onPressLog,
  onSwipeDelete,
}: FoodLogListProps) {
  const items = buildClusteredListItems(logs);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'header') {
        return (
          <View style={styles.clusterHeader}>
            <Text style={styles.clusterHeaderText}>{item.label}</Text>
          </View>
        );
      }
      return (
        <SwipeableLogRow
          item={item.log}
          selected={item.log.id === selectedLogId}
          onPress={onPressLog}
          onSwipeRight={onSwipeDelete}
        />
      );
    },
    [onPressLog, onSwipeDelete, selectedLogId],
  );

  return (
    <>
      <View style={styles.tableHeader}>
        <Text style={[styles.headerCell, styles.nameCol]}>Food</Text>
        <Text style={[styles.headerCell, styles.timeCol]}>Time</Text>
        <Text style={[styles.headerCell, styles.calCol]}>Cal</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        style={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading ? 'Loading food logs...' : error ?? emptyText}
          </Text>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
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
  clusterHeader: {
    backgroundColor: '#f7f9fc',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e4e8ee',
  },
  clusterHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#607089',
    textTransform: 'uppercase',
  },
  logRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  logRowSelected: {
    backgroundColor: '#e3f2fd',
  },
  logName: { flex: 3, fontSize: 15 },
  logTime: { flex: 1, textAlign: 'right', fontSize: 15 },
  logCal: { flex: 1, textAlign: 'right', fontSize: 15 },
  empty: { textAlign: 'center', color: '#888', marginTop: 24 },
});
