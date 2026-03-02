import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = '@OptionApp_AnonymousDeviceID';

/**
 * Retrieves the persistent anonymous Device ID for this installation.
 * If one does not exist, it securely generates a UUID variant, saves it, and returns it.
 * This ensures multi-tenant database queries remain isolated (e.g. your friend cannot see your homework).
 *
 * @returns {Promise<string>} The unique device ID string for this user.
 */
export const getDeviceId = async () => {
    try {
        let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

        if (!deviceId) {
            // Generate a random UUID
            deviceId = `user_${Crypto.randomUUID()}`;
            await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
        }

        return deviceId;
    } catch (error) {
        console.error("Error fetching or generating Device ID:", error);
        // Fallback for extreme cases where Async Storage is blocked (e.g. corrupted web localstorage)
        return `user_fallback_${Math.floor(Math.random() * 1000000)}`;
    }
};
