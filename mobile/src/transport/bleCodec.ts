import { decode as base64Decode, encode as base64Encode } from 'react-native-base64';

function base64ToBytes(base64: string): Uint8Array {
  const bin = base64Decode(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function decodeWeightFromBase64(base64: string): number | null {
  const bytes = base64ToBytes(base64);
  if (bytes.length < 4) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getInt32(0, true);
}

export function encodeTarePayload(): string {
  return base64Encode(String.fromCharCode(0x01));
}

export function encodeCalibratePayload(refMassGrams: number): string {
  const bytes = [
    0x02,
    refMassGrams & 0xff,
    (refMassGrams >> 8) & 0xff,
  ];
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return base64Encode(binary);
}
