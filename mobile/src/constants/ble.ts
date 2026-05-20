export const SERVICE_UUID = '4c78c001-8118-4aea-8f72-70ddbda3c9b9';
export const NOTIFY_CHAR_UUID = '4c78c002-8118-4aea-8f72-70ddbda3c9b9';
export const WRITE_CHAR_UUID = '4c78c003-8118-4aea-8f72-70ddbda3c9b9';

export const ConnectionState = {
  DISCONNECTED: 0,
  CONNECTING: 1,
  CONNECTED: 2,
} as const;

export type ConnectionStateValue =
  (typeof ConnectionState)[keyof typeof ConnectionState];
