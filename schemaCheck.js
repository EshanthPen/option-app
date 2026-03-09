import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cmrirqwntwgmxignbrvj.supabase.co';
const supabaseAnonKey = 'sb_publishable_7VYxHNmZIbuw21187BJ6PA_6SiFcquZ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
    const { data, error } = await supabase.from('tasks').select('*').limit(1);
    console.log(error ? error : Object.keys(data[0] || {}));
}

test();
