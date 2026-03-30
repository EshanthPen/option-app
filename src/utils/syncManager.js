import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';

const LAST_SYNC_KEY = '@OptionApp_LastSyncTime';

let currentStatus = 'online';
let statusListeners = [];

/**
 * Returns the current sync status.
 * @returns {'online' | 'syncing' | 'offline'}
 */
export const getSyncStatus = () => currentStatus;

/**
 * Sets the sync status and notifies all listeners.
 * @param {'online' | 'syncing' | 'offline'} status
 */
export const setSyncStatus = (status) => {
    if (currentStatus !== status) {
        currentStatus = status;
        statusListeners.forEach((listener) => listener(status));
    }
};

/**
 * Subscribe to sync status changes.
 * @param {(status: string) => void} listener
 * @returns {() => void} Unsubscribe function
 */
export const onSyncStatusChange = (listener) => {
    statusListeners.push(listener);
    return () => {
        statusListeners = statusListeners.filter((l) => l !== listener);
    };
};

/**
 * Pings Supabase to check connectivity.
 * @returns {Promise<boolean>} True if online, false if offline.
 */
export const checkConnectivity = async () => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const { error } = await supabase
            .from('profiles')
            .select('id')
            .limit(1)
            .abortSignal(controller.signal);

        clearTimeout(timeout);

        if (error) {
            setSyncStatus('offline');
            return false;
        }

        setSyncStatus('online');
        return true;
    } catch {
        setSyncStatus('offline');
        return false;
    }
};

/**
 * Reads the last sync timestamp from AsyncStorage.
 * @returns {Promise<number|null>} Unix timestamp in ms, or null if never synced.
 */
export const getLastSyncTime = async () => {
    try {
        const value = await AsyncStorage.getItem(LAST_SYNC_KEY);
        return value ? parseInt(value, 10) : null;
    } catch {
        return null;
    }
};

/**
 * Saves the current timestamp as the last sync time.
 * @returns {Promise<void>}
 */
export const updateLastSyncTime = async () => {
    try {
        await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
    } catch {
        // Silently fail - non-critical operation
    }
};
