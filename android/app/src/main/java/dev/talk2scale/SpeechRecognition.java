package dev.talk2scale;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.util.ArrayList;
import java.util.Locale;

/** Handles Android SpeechRecognizer lifecycle and callbacks. */
public class SpeechRecognition {

    public interface Callback {
        void onListeningStateChanged(boolean listening);
        void onPartialText(String text);
        void onFinalText(String text);
        void onNoMatchOrTimeout();
        void onUnavailable();
    }

    private final Context context;
    private final Callback callback;
    private SpeechRecognizer recognizer;
    private boolean listening;

    public SpeechRecognition(Context context, Callback callback) {
        this.context = context;
        this.callback = callback;
    }

    public boolean isListening() {
        return listening;
    }

    public void startListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            callback.onUnavailable();
            return;
        }

        destroyRecognizer();
        recognizer = SpeechRecognizer.createSpeechRecognizer(context);
        recognizer.setRecognitionListener(recognitionListener);

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false);

        recognizer.startListening(intent);
        setListening(true);
    }

    public void cancelListening() {
        if (recognizer != null && listening) {
            recognizer.stopListening();
        }
        destroyRecognizer();
        setListening(false);
    }

    public void release() {
        destroyRecognizer();
        listening = false;
    }

    private void setListening(boolean isListening) {
        if (listening == isListening) return;
        listening = isListening;
        callback.onListeningStateChanged(isListening);
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
    }

    private final RecognitionListener recognitionListener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle params) { }
        @Override public void onBeginningOfSpeech() { }
        @Override public void onRmsChanged(float rmsdB) { }
        @Override public void onBufferReceived(byte[] buffer) { }

        @Override
        public void onEndOfSpeech() {
            setListening(false);
        }

        @Override
        public void onError(int error) {
            setListening(false);
            if (error == SpeechRecognizer.ERROR_NO_MATCH
                    || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                callback.onNoMatchOrTimeout();
            }
            destroyRecognizer();
        }

        @Override
        public void onResults(Bundle results) {
            setListening(false);
            ArrayList<String> matches =
                    results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (matches != null && !matches.isEmpty()) {
                callback.onFinalText(matches.get(0));
            }
            destroyRecognizer();
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
            ArrayList<String> partial =
                    partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (partial != null && !partial.isEmpty()) {
                callback.onPartialText(partial.get(0));
            }
        }

        @Override public void onEvent(int eventType, Bundle params) { }
    };
}
