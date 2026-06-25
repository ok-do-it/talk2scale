package dev.talk2scale;

import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothProfile;
import android.content.Context;
import android.util.Log;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.UUID;

public class BleScaleTransport implements ScaleTransport {

    private static final String TAG = "BleScaleTransport";

    private static final UUID SERVICE_UUID =
            UUID.fromString("4c78c001-8118-4aea-8f72-70ddbda3c9b9");
    private static final UUID NOTIFY_CHAR_UUID =
            UUID.fromString("4c78c002-8118-4aea-8f72-70ddbda3c9b9");
    private static final UUID WRITE_CHAR_UUID =
            UUID.fromString("4c78c003-8118-4aea-8f72-70ddbda3c9b9");
    private static final UUID CCCD_UUID =
            UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private Listener listener;
    private BluetoothGatt gatt;

    public void connectToDevice(Context context, BluetoothDevice device, boolean autoConnect) {
        closeGatt();
        gatt = device.connectGatt(context, autoConnect, gattCallback, BluetoothDevice.TRANSPORT_LE);
    }

    @Override
    public void setListener(Listener listener) {
        this.listener = listener;
    }

    @SuppressWarnings("MissingPermission")
    @Override
    public void sendTare() {
        if (gatt == null) return;
        BluetoothGattService service = gatt.getService(SERVICE_UUID);
        if (service == null) return;
        BluetoothGattCharacteristic writeChar = service.getCharacteristic(WRITE_CHAR_UUID);
        if (writeChar == null) return;
        gatt.writeCharacteristic(writeChar, new byte[]{0x01},
                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
    }

    @SuppressWarnings("MissingPermission")
    @Override
    public void sendCalibrate(int refMassGrams) {
        if (gatt == null) return;
        BluetoothGattService service = gatt.getService(SERVICE_UUID);
        if (service == null) return;
        BluetoothGattCharacteristic writeChar = service.getCharacteristic(WRITE_CHAR_UUID);
        if (writeChar == null) return;
        byte[] payload = new byte[3];
        payload[0] = 0x02;
        payload[1] = (byte) (refMassGrams & 0xFF);
        payload[2] = (byte) ((refMassGrams >> 8) & 0xFF);
        gatt.writeCharacteristic(writeChar, payload,
                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
    }

    @Override
    public void close() {
        closeGatt();
        dispatchConnectionState(BluetoothProfile.STATE_DISCONNECTED);
    }

    @SuppressWarnings("MissingPermission")
    private void closeGatt() {
        if (gatt != null) {
            gatt.close();
            gatt = null;
        }
    }

    private void dispatchConnectionState(int state) {
        if (listener != null) {
            listener.onConnectionStateChanged(state);
        }
    }

    private void dispatchWeightData(int weight) {
        if (listener != null) {
            listener.onWeightData(weight);
        }
    }

    @SuppressWarnings("MissingPermission")
    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            Log.d(TAG, "onConnectionStateChange: status=" + status + " newState=" + newState);
            dispatchConnectionState(newState);
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                gatt = g;
                g.discoverServices();
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                Log.w(TAG, "onServicesDiscovered failed: " + status);
                return;
            }
            BluetoothGattService service = g.getService(SERVICE_UUID);
            if (service == null) {
                Log.w(TAG, "Scale service not found");
                return;
            }
            BluetoothGattCharacteristic notifyChar = service.getCharacteristic(NOTIFY_CHAR_UUID);
            if (notifyChar == null) {
                Log.w(TAG, "Notify characteristic not found");
                return;
            }
            g.setCharacteristicNotification(notifyChar, true);
            BluetoothGattDescriptor cccd = notifyChar.getDescriptor(CCCD_UUID);
            if (cccd != null) {
                g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt g,
                BluetoothGattCharacteristic characteristic, byte[] value) {
            if (!NOTIFY_CHAR_UUID.equals(characteristic.getUuid())) return;
            if (value.length < 4) return;
            int weight = ByteBuffer.wrap(value, 0, 4)
                    .order(ByteOrder.LITTLE_ENDIAN).getInt();
            dispatchWeightData(weight);
        }
    };
}
