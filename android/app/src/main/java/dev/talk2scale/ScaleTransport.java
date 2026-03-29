package dev.talk2scale;

public interface ScaleTransport {

    interface Listener {
        void onConnectionStateChanged(int state);
        void onWeightData(int weight, int flags);
    }

    void setListener(Listener listener);

    void sendTare();

    void sendCalibrate(int refMassGrams);

    void close();
}
