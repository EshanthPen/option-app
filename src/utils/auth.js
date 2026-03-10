import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from '../supabaseClient';

const DEVICE_ID_KEY = '@OptionApp_AnonymousDeviceID';

/**
 * Retrieves the most relevant unique identifier for the user.
 * 1. Checks for an active Supabase session/user.
 * 2. If no user, falls back to a persistent anonymous Device ID.
 * 
 * @returns {Promise<string>} The unique ID (Supabase UUID or Device ID).
 */
export const getUserId = async () => {
    try {
        // 1. Check Supabase active session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
            return session.user.id;
        }

        // 2. Fallback to Device ID
        let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

        if (!deviceId) {
            // Generate a random UUID
            deviceId = `user_${Crypto.randomUUID()}`;
            await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
        }

        return deviceId;
    } catch (error) {
        console.error("Error fetching or generating ID:", error);
        return `user_fallback_${Math.floor(Math.random() * 1000000)}`;
    }
};

/**
 * Linked alias for backwards compatibility
 */
export const getDeviceId = getUserId;
