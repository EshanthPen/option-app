import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// Simple obfuscation layer for sensitive credentials stored locally.
// This is NOT encryption — it deters casual inspection of AsyncStorage/localStorage.
// For production, use expo-secure-store on native devices.

const OBFUSCATION_PREFIX = 'opt_enc_v1:';

/**
 * Encode a sensitive value before storing it.
 * Uses base64 encoding to prevent plaintext exposure in storage dumps.
 */
const encode = (value) => {
    if (!value) return '';
    // Use btoa where available, otherwise manual base64
    if (typeof btoa === 'function') {
        return OBFUSCATION_PREFIX + btoa(unescape(encodeURIComponent(value)));
    }
    // Node/React Native fallback
    return OBFUSCATION_PREFIX + Buffer.from(value, 'utf-8').toString('base64');
};

/**
 * Decode a stored value.
 */
const decode = (stored) => {
    if (!stored) return '';
    if (!stored.startsWith(OBFUSCATION_PREFIX)) {
        // Legacy plaintext value — return as-is for backwards compatibility
        return stored;
    }
    const b64 = stored.slice(OBFUSCATION_PREFIX.length);
    if (typeof atob === 'function') {
        return decodeURIComponent(escape(atob(b64)));
    }
    return Buffer.from(b64, 'base64').toString('utf-8');
};

/**
 * Store a sensitive credential securely.
 */
export const setSecureItem = async (key, value) => {
    const encoded = encode(value);
    await AsyncStorage.setItem(key, encoded);
};

/**
 * Retrieve a sensitive credential.
 */
export const getSecureItem = async (key) => {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;
    return decode(stored);
};

/**
 * Remove a sensitive credential.
 */
export const removeSecureItem = async (key) => {
    await AsyncStorage.removeItem(key);
};
