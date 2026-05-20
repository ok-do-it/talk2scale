import Voice, {
  type SpeechErrorEvent,
  type SpeechResultsEvent,
} from '@react-native-voice/voice';

export type SpeechCallbacks = {
  onListeningStateChanged: (listening: boolean) => void;
  onPartialText: (text: string) => void;
  onFinalText: (text: string) => void;
  onNoMatchOrTimeout: () => void;
  onUnavailable: () => void;
};

export class SpeechRecognition {
  private callbacks: SpeechCallbacks | null = null;
  private listening = false;
  private wired = false;

  setCallbacks(callbacks: SpeechCallbacks | null): void {
    this.callbacks = callbacks;
    if (callbacks && !this.wired) {
      this.wireEvents();
    }
  }

  isListening(): boolean {
    return this.listening;
  }

  async startListening(): Promise<void> {
    try {
      await Voice.destroy();
      this.listening = false;
      await Voice.start('en-US');
      this.setListening(true);
    } catch {
      this.callbacks?.onUnavailable();
    }
  }

  async cancelListening(): Promise<void> {
    try {
      await Voice.cancel();
    } catch {
      // ignore
    }
    await this.destroyRecognizer();
    this.setListening(false);
  }

  async release(): Promise<void> {
    await this.destroyRecognizer();
    this.listening = false;
  }

  private wireEvents(): void {
    this.wired = true;
    Voice.onSpeechStart = () => this.setListening(true);
    Voice.onSpeechEnd = () => this.setListening(false);
    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      const text = e.value?.[0];
      if (text) this.callbacks?.onPartialText(text);
    };
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      this.setListening(false);
      const text = e.value?.[0];
      if (text) this.callbacks?.onFinalText(text);
      void this.destroyRecognizer();
    };
    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      this.setListening(false);
      const code = e.error?.code;
      if (code === '7' || code === '6') {
        this.callbacks?.onNoMatchOrTimeout();
      }
      void this.destroyRecognizer();
    };
  }

  private setListening(isListening: boolean): void {
    if (this.listening === isListening) return;
    this.listening = isListening;
    this.callbacks?.onListeningStateChanged(isListening);
  }

  private async destroyRecognizer(): Promise<void> {
    try {
      await Voice.destroy();
    } catch {
      // ignore
    }
  }
}

export const speechRecognition = new SpeechRecognition();
