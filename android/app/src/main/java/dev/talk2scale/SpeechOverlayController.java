package dev.talk2scale;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.View;
import android.view.animation.Animation;
import android.view.animation.AnimationUtils;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Locale;

/**
 * Self-contained controller for the speech-recognition overlay.
 * Call {@link #bind(View)} once from the Activity after setContentView,
 * then use {@link #open()} / {@link #close()} to show/hide it.
 */
public class SpeechOverlayController {

    public interface Callback {
        void onApply(String foodText);
        void onCancel();
    }

    private final Context context;
    private final Callback callback;

    private FrameLayout root;
    private View pulseRing;
    private ImageView micIcon;
    private TextView statusLabel;
    private EditText editText;
    private ImageButton toggleBtn;
    private Button applyBtn;
    private Button cancelBtn;

    private SpeechRecognizer recognizer;
    private boolean listening;
    private Animation pulseAnim;

    public SpeechOverlayController(Context context, Callback callback) {
        this.context = context;
        this.callback = callback;
    }

    /** Wire up views after the overlay layout has been inflated (via include). */
    public void bind(View rootView) {
        root = rootView.findViewById(R.id.speechOverlay);
        pulseRing = root.findViewById(R.id.speechPulseRing);
        micIcon = root.findViewById(R.id.speechMicIcon);
        statusLabel = root.findViewById(R.id.speechStatusLabel);
        editText = root.findViewById(R.id.speechEditText);
        toggleBtn = root.findViewById(R.id.speechToggleBtn);
        applyBtn = root.findViewById(R.id.speechApplyBtn);
        cancelBtn = root.findViewById(R.id.speechCancelBtn);

        pulseAnim = AnimationUtils.loadAnimation(context, R.anim.pulse);

        toggleBtn.setOnClickListener(v -> {
            if (listening) {
                stopListening();
            } else {
                startListening();
            }
        });

        applyBtn.setOnClickListener(v -> {
            stopListening();
            String text = editText.getText().toString().trim();
            callback.onApply(text);
        });

        cancelBtn.setOnClickListener(v -> {
            close();
            callback.onCancel();
        });
    }

    public boolean isVisible() {
        return root != null && root.getVisibility() == View.VISIBLE;
    }

    /** Show the overlay and auto-start recognition. */
    public void open() {
        if (root == null) return;
        editText.setText("");
        root.setVisibility(View.VISIBLE);
        startListening();
    }

    /** Show the overlay without starting recognition (e.g. while awaiting permission). */
    public void openWithoutListening() {
        if (root == null) return;
        editText.setText("");
        root.setVisibility(View.VISIBLE);
        setIdleState();
    }

    /** Hide the overlay and release recognizer. */
    public void close() {
        stopListening();
        destroyRecognizer();
        if (root != null) {
            root.setVisibility(View.GONE);
        }
    }

    /**
     * Called by the Activity when microphone permission is denied.
     * Overlay stays open so the user can see the message and cancel.
     */
    public void onPermissionDenied() {
        setIdleState();
        statusLabel.setText(R.string.speech_status_no_mic_permission);
    }

    public void startListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            statusLabel.setText(R.string.speech_status_unavailable);
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
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

        recognizer.startListening(intent);
        setRecordingState();
    }

    private void stopListening() {
        if (recognizer != null && listening) {
            recognizer.stopListening();
        }
        setIdleState();
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
        listening = false;
    }

    private void setRecordingState() {
        listening = true;
        statusLabel.setText(R.string.speech_status_listening);
        toggleBtn.setImageResource(R.drawable.ic_stop_square);
        pulseRing.setVisibility(View.VISIBLE);
        pulseRing.startAnimation(pulseAnim);
    }

    private void setIdleState() {
        listening = false;
        statusLabel.setText(R.string.speech_status_ready);
        toggleBtn.setImageResource(R.drawable.ic_mic_circle);
        pulseRing.clearAnimation();
        pulseRing.setVisibility(View.GONE);
    }

    private final RecognitionListener recognitionListener = new RecognitionListener() {
        @Override
        public void onReadyForSpeech(Bundle params) { }

        @Override
        public void onBeginningOfSpeech() { }

        @Override
        public void onRmsChanged(float rmsdB) { }

        @Override
        public void onBufferReceived(byte[] buffer) { }

        @Override
        public void onEndOfSpeech() {
            setIdleState();
        }

        @Override
        public void onError(int error) {
            setIdleState();
            if (error == SpeechRecognizer.ERROR_NO_MATCH
                    || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                statusLabel.setText(R.string.speech_status_error);
            } else if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                statusLabel.setText(R.string.speech_status_no_mic_permission);
            } else {
                statusLabel.setText(R.string.speech_status_error);
            }
        }

        @Override
        public void onResults(Bundle results) {
            setIdleState();
            ArrayList<String> matches =
                    results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (matches != null && !matches.isEmpty()) {
                editText.setText(matches.get(0));
                editText.setSelection(editText.getText().length());
            }
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
            ArrayList<String> partial =
                    partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (partial != null && !partial.isEmpty()) {
                editText.setText(partial.get(0));
                editText.setSelection(editText.getText().length());
            }
        }

        @Override
        public void onEvent(int eventType, Bundle params) { }
    };
}
