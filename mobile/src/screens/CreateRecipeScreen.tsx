import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import {
  ScaleIngredientEntry,
  type ResolvedFood,
} from '../components/ScaleIngredientEntry';
import type { RootStackParamList } from '../navigation/types';
import { createRecipe } from '../services/nutritionApi';
import { DEFAULT_USER_ID, getUserId } from '../services/storage';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateRecipe'>;

type DraftIngredient = {
  localId: string;
  elementId: number;
  name: string;
  grams: number;
};

export function CreateRecipeScreen({ navigation }: Props) {
  const isFocused = useIsFocused();
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [name, setName] = useState('');
  const [servingGramsText, setServingGramsText] = useState('');
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getUserId().then(setUserId);
  }, []);

  const totalGrams = useMemo(
    () => ingredients.reduce((sum, item) => sum + item.grams, 0),
    [ingredients],
  );

  const hasUnsavedChanges =
    name.trim().length > 0 ||
    servingGramsText.trim().length > 0 ||
    ingredients.length > 0;

  const handleFoodResolved = useCallback(async (food: ResolvedFood) => {
    setIngredients((current) => [
      {
        localId: `ing-${Date.now()}-${Math.random()}`,
        elementId: food.element.id,
        name: food.element.name,
        grams: food.amountGrams,
      },
      ...current,
    ]);
  }, []);

  const removeIngredient = useCallback((localId: string) => {
    setIngredients((current) =>
      current.filter((item) => item.localId !== localId),
    );
  }, []);

  const handleBack = () => {
    if (!hasUnsavedChanges) {
      navigation.goBack();
      return;
    }
    Alert.alert('Discard recipe?', 'Your unsaved ingredients will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => navigation.goBack(),
      },
    ]);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Enter a recipe name first');
      return;
    }
    if (ingredients.length === 0) {
      Alert.alert('Add at least one ingredient');
      return;
    }

    let servingGrams: number | undefined;
    const servingText = servingGramsText.trim();
    if (servingText) {
      const parsed = Number.parseFloat(servingText);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        Alert.alert('Serving grams must be a positive number');
        return;
      }
      servingGrams = parsed;
    }

    setSaving(true);
    try {
      await createRecipe({
        name: trimmedName,
        children: ingredients.map((item) => ({
          element_id: item.elementId,
          grams: item.grams,
        })),
        serving_grams: servingGrams,
        user_id: userId > 0 ? userId : undefined,
      });
      navigation.goBack();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save recipe';
      Alert.alert(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={28} color="#333" />
        </Pressable>
        <Text style={styles.title}>Create Recipe</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Recipe name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Overnight oats"
          editable={!saving}
        />
        <Text style={styles.label}>Serving grams (optional)</Text>
        <TextInput
          style={styles.input}
          value={servingGramsText}
          onChangeText={setServingGramsText}
          placeholder={`Default whole batch: ${Math.round(totalGrams) || 0}`}
          keyboardType="decimal-pad"
          editable={!saving}
        />
      </View>

      <ScaleIngredientEntry
        active={isFocused}
        busy={saving}
        onFoodResolved={handleFoodResolved}
      />

      <Text style={styles.sectionTitle}>
        Ingredients ({Math.round(totalGrams)} g)
      </Text>
      <FlatList
        data={ingredients}
        keyExtractor={(item) => item.localId}
        style={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Weigh and resolve ingredients</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.rowGrams}>{Math.round(item.grams)} g</Text>
            <Pressable
              style={styles.deleteBtn}
              onPress={() => removeIngredient(item.localId)}
              disabled={saving}
            >
              <Ionicons name="trash-outline" size={20} color="#C62828" />
            </Pressable>
          </View>
        )}
      />

      <View style={styles.footer}>
        <Pressable style={styles.secondaryBtn} onPress={handleBack}>
          <Text>Back</Text>
        </Pressable>
        <Pressable
          style={[
            styles.primaryBtn,
            (saving || ingredients.length === 0 || !name.trim()) &&
              styles.btnDisabled,
          ]}
          onPress={() => void handleSave()}
          disabled={saving || ingredients.length === 0 || !name.trim()}
        >
          <Text style={styles.primaryBtnText}>
            {saving ? 'Saving...' : 'Save Recipe'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 8,
  },
  iconBtn: { padding: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  form: {
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 6,
  },
  label: { fontSize: 13, color: '#666' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 10,
    fontSize: 16,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
    gap: 8,
  },
  rowName: { flex: 1, fontSize: 15 },
  rowGrams: { width: 64, textAlign: 'right', fontSize: 15 },
  deleteBtn: { padding: 4 },
  empty: { textAlign: 'center', color: '#888', marginTop: 24 },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  secondaryBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  primaryBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 4,
    alignItems: 'center',
    backgroundColor: '#1976D2',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
});
