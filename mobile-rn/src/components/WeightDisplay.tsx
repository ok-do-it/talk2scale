import { Pressable, StyleSheet, Text } from 'react-native';

const COLORS = {
  unstable: '#FFDD00',
  stable: '#36D7FF',
};

type Props = {
  weight: number;
  stable: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function WeightDisplay({ weight, stable, onPress, onLongPress }: Props) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress}>
      <Text style={[styles.display, { color: stable ? COLORS.stable : COLORS.unstable }]}>
        {weight} g
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  display: {
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 16,
  },
});
