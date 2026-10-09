import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useScaleStore } from '../state/scaleStore';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function CalibrationOverlay({ visible, onClose }: Props) {
  const [grams, setGrams] = useState('');
  const isConnected = useScaleStore((s) => s.isConnected);
  const sendTare = useScaleStore((s) => s.sendTare);
  const sendCalibrate = useScaleStore((s) => s.sendCalibrate);

  const guardConnected = (): boolean => {
    if (!isConnected()) {
      return false;
    }
    return true;
  };

  const handleSetZero = () => {
    if (!guardConnected()) return;
    sendTare();
  };

  const handleSetCalibWeight = () => {
    if (!guardConnected()) return;
    const trimmed = grams.trim();
    if (!trimmed) return;
    const value = parseInt(trimmed, 10);
    if (Number.isNaN(value) || value <= 0) return;
    sendCalibrate(value);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        <View style={styles.content}>
          <Text style={styles.title}>Calibrate Scale</Text>

          <Text style={styles.step}>
            1. Remove everything from the scale and press Set Zero.
          </Text>
          <Pressable style={styles.button} onPress={handleSetZero}>
            <Text style={styles.buttonText}>SET ZERO</Text>
          </Pressable>

          <Text style={[styles.step, styles.stepSpaced]}>
            2. Place a known weight on the scale, enter it in grams below, and
            press Set Calibration Weight.
          </Text>
          <TextInput
            style={styles.input}
            value={grams}
            onChangeText={setGrams}
            placeholder="Weight in grams"
            keyboardType="number-pad"
          />
          <Pressable style={styles.button} onPress={handleSetCalibWeight}>
            <Text style={styles.buttonText}>SET CALIBRATION WEIGHT</Text>
          </Pressable>

          {!isConnected() && (
            <Text style={styles.hint}>Scale not connected</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: 16,
  },
  closeText: {
    fontSize: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  step: {
    fontSize: 16,
    marginBottom: 12,
  },
  stepSpaced: {
    marginTop: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#1976D2',
    padding: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  hint: {
    marginTop: 16,
    textAlign: 'center',
    color: '#c62828',
  },
});
