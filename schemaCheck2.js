import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cmrirqwntwgmxignbrvj.supabase.co';
const supabaseAnonKey = 'sb_publishable_7VYxHNmZIbuw21187BJ6PA_6SiFcquZ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
    const { data: cols, error: e1 } = await supabase.rpc('get_my_schema');
    console.log(e1);

    // Let's try inserting a dummy task with `type`, `is_planned` to see the exact error
    const { error } = await supabase.from('tasks').insert([{
        title: 'Dummy Test for Columns',
        user_id: 'test_user_id_123',
        source: 'manual',
        type: 'assignment',
        is_planned: false
    }]);
    if (error) {
        console.error("INSERT ERROR IS:", error);
    } else {
        console.log("INSERT WORKED WITH EXTRA COLUMNS!");
    }
}

test();
