import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cmrirqwntwgmxignbrvj.supabase.co';
const supabaseAnonKey = 'sb_publishable_7VYxHNmZIbuw21187BJ6PA_6SiFcquZ'; // As provided, maybe invalid but replacing it anyway. Is that the actual anon key or the project API key password thing? Assuming it's the anon key.

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
