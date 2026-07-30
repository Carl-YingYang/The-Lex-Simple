// SpeechRecognitionSafe.ts
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = () => { };

try {
    // Subukang i-import ang native module
    const SpeechRecognition = require('expo-speech-recognition');
    ExpoSpeechRecognitionModule = SpeechRecognition.ExpoSpeechRecognitionModule;
    useSpeechRecognitionEvent = SpeechRecognition.useSpeechRecognitionEvent;
} catch (e) {
    console.warn("⚠️ ExpoSpeechRecognition native module not found. Running in Expo Go compatibility mode.");
    // Dummy implementations para hindi mag-crash
    ExpoSpeechRecognitionModule = {
        requestPermissionsAsync: async () => ({ granted: false }),
        start: async () => { throw new Error("Speech Recognition not available in Expo Go. Build a development build."); },
        stop: () => { },
    };
    useSpeechRecognitionEvent = (event: string, handler: any) => {
        if (event === 'error') {
            // Mock error event para hindi mag-hang ang UI
            setTimeout(() => handler({ error: 'native_module_missing', message: 'Not available in Expo Go' }), 0);
        }
    };
}

export { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent };