import AsyncStorage from '@react-native-async-storage/async-storage';

const GUEST_ENTRY_KEY = '@lex_guest_entry_v1';

export const wasGuestSelected = async (): Promise<boolean> =>
    (await AsyncStorage.getItem(GUEST_ENTRY_KEY)) === 'yes';

export const enterGuest = async (): Promise<void> => {
    await AsyncStorage.setItem(GUEST_ENTRY_KEY, 'yes');
};

export const leaveGuest = async (): Promise<void> => {
    await AsyncStorage.removeItem(GUEST_ENTRY_KEY);
};