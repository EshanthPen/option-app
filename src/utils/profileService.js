import { supabase } from '../supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ── Profile CRUD ──────────────────────────────────────────────

/**
 * Get or create the current user's profile.
 * Returns null if user is not authenticated (device-ID only).
 */
export const getOrCreateProfile = async (userId) => {
    try {
        // Check if this is a real Supabase user (not device ID)
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return null;

        const uid = session.user.id;

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', uid)
            .single();

        if (data) return data;

        // Profile doesn't exist (maybe trigger didn't fire), create it
        if (error?.code === 'PGRST116') {
            const name = await AsyncStorage.getItem('userName') || 'Student';
            const { data: newProfile, error: insertErr } = await supabase
                .from('profiles')
                .insert({ user_id: uid, display_name: name })
                .select()
                .single();

            if (insertErr) console.error('Profile creation error:', insertErr);
            return newProfile;
        }

        console.error('Profile fetch error:', error);
        return null;
    } catch (err) {
        console.error('getOrCreateProfile error:', err);
        return null;
    }
};

/**
 * Update the current user's profile fields.
 */
export const updateProfile = async (updates) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return null;

        const { data, error } = await supabase
            .from('profiles')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('user_id', session.user.id)
            .select()
            .single();

        if (error) console.error('Profile update error:', error);
        return data;
    } catch (err) {
        console.error('updateProfile error:', err);
        return null;
    }
};

// ── Avatar Upload ─────────────────────────────────────────────

/**
 * Upload an avatar image to Supabase Storage.
 * Returns the public URL of the uploaded image.
 */
export const uploadAvatar = async (imageUri) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return null;

        const uid = session.user.id;
        const ext = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${uid}/avatar.${ext}`;

        // Fetch the image as a blob
        const response = await fetch(imageUri);
        const blob = await response.blob();

        const { error: uploadErr } = await supabase.storage
            .from('avatars')
            .upload(fileName, blob, {
                contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                upsert: true,
            });

        if (uploadErr) {
            console.error('Avatar upload error:', uploadErr);
            return null;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);

        // Update profile with the new URL
        await updateProfile({ avatar_url: publicUrl, avatar_preset: null });

        return publicUrl;
    } catch (err) {
        console.error('uploadAvatar error:', err);
        return null;
    }
};

/**
 * Set a preset avatar (stored as a key like "bear", "cat", etc.)
 */
export const setPresetAvatar = async (presetKey) => {
    return updateProfile({ avatar_preset: presetKey, avatar_url: null });
};

// ── Preset Avatar Map ─────────────────────────────────────────

export const PRESET_AVATARS = {
    bear: { label: 'Bear', emoji: '🐻' },
    cat: { label: 'Cat', emoji: '🐱' },
    fox: { label: 'Fox', emoji: '🦊' },
    owl: { label: 'Owl', emoji: '🦉' },
    panda: { label: 'Panda', emoji: '🐼' },
    rabbit: { label: 'Rabbit', emoji: '🐰' },
    tiger: { label: 'Tiger', emoji: '🐯' },
    wolf: { label: 'Wolf', emoji: '🐺' },
    eagle: { label: 'Eagle', emoji: '🦅' },
    dolphin: { label: 'Dolphin', emoji: '🐬' },
    lion: { label: 'Lion', emoji: '🦁' },
    penguin: { label: 'Penguin', emoji: '🐧' },
};

// ── Friend System ─────────────────────────────────────────────

/**
 * Look up a user by their 6-character friend code.
 */
export const lookupByFriendCode = async (code) => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url, avatar_preset, friend_code')
            .eq('friend_code', code.toUpperCase().trim())
            .single();

        if (error) return null;
        return data;
    } catch (err) {
        console.error('lookupByFriendCode error:', err);
        return null;
    }
};

/**
 * Add a friend (bidirectional via Postgres RPC to bypass RLS).
 */
export const addFriend = async (friendUserId) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return { success: false, error: 'Not authenticated' };

        const myId = session.user.id;
        if (myId === friendUserId) return { success: false, error: 'Cannot add yourself' };

        // Use RPC function that runs with SECURITY DEFINER to insert both directions
        const { error } = await supabase.rpc('add_friend', { friend_uuid: friendUserId });

        if (error) {
            console.error('addFriend error:', error);
            if (error.message?.includes('already friends')) {
                return { success: false, error: 'Already friends with this user' };
            }
            return { success: false, error: 'Failed to add friend' };
        }

        return { success: true };
    } catch (err) {
        console.error('addFriend error:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Remove a friend (bidirectional via Postgres RPC).
 */
export const removeFriend = async (friendUserId) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return false;

        const myId = session.user.id;

        // Use RPC to remove both directions
        const { error } = await supabase.rpc('remove_friend', { friend_uuid: friendUserId });
        if (error) console.error('removeFriend rpc error:', error);

        // Fallback: also try direct delete for the direction we own
        await supabase.from('friendships').delete().match({ user_id: myId, friend_id: friendUserId });

        return true;
    } catch (err) {
        console.error('removeFriend error:', err);
        return false;
    }
};

/**
 * Get all friends with their profiles.
 */
export const getFriends = async () => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return [];

        const { data, error } = await supabase
            .from('friendships')
            .select('friend_id, profiles!friendships_friend_id_fkey(user_id, display_name, avatar_url, avatar_preset, focus_score_weekly, focus_score_monthly)')
            .eq('user_id', session.user.id);

        if (error) {
            console.error('getFriends error:', error);
            return [];
        }

        return (data || []).map(f => f.profiles).filter(Boolean);
    } catch (err) {
        console.error('getFriends error:', err);
        return [];
    }
};

// ── Leaderboard Queries ───────────────────────────────────────

/**
 * Get friend leaderboard (sorted by score).
 */
export const getFriendLeaderboard = async (period = 'weekly') => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return [];

        const friends = await getFriends();
        const myProfile = await getOrCreateProfile();

        const scoreField = period === 'monthly' ? 'focus_score_monthly' : 'focus_score_weekly';

        // Include self in the list
        const all = myProfile ? [myProfile, ...friends] : friends;

        return all
            .map((p, i) => ({
                user_id: p.user_id,
                display_name: p.display_name,
                avatar_url: p.avatar_url,
                avatar_preset: p.avatar_preset,
                score: Number(p[scoreField] || 0),
                isMe: p.user_id === session.user.id,
            }))
            .sort((a, b) => b.score - a.score)
            .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
    } catch (err) {
        console.error('getFriendLeaderboard error:', err);
        return [];
    }
};

/**
 * Get school leaderboard.
 */
export const getSchoolLeaderboard = async (period = 'weekly') => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return [];

        const myProfile = await getOrCreateProfile();
        if (!myProfile?.school_name) return [];

        const scoreField = period === 'monthly' ? 'focus_score_monthly' : 'focus_score_weekly';

        const { data, error } = await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url, avatar_preset, focus_score_weekly, focus_score_monthly')
            .eq('school_name', myProfile.school_name)
            .order(scoreField, { ascending: false })
            .limit(100);

        if (error) return [];

        return (data || []).map((p, idx) => ({
            user_id: p.user_id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            avatar_preset: p.avatar_preset,
            score: Number(p[scoreField] || 0),
            rank: idx + 1,
            isMe: p.user_id === session.user.id,
        }));
    } catch (err) {
        console.error('getSchoolLeaderboard error:', err);
        return [];
    }
};

/**
 * Get global leaderboard.
 */
export const getGlobalLeaderboard = async (period = 'weekly') => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const myId = session?.user?.id;

        const scoreField = period === 'monthly' ? 'focus_score_monthly' : 'focus_score_weekly';

        const { data, error } = await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url, avatar_preset, focus_score_weekly, focus_score_monthly')
            .order(scoreField, { ascending: false })
            .limit(100);

        if (error) return [];

        return (data || []).map((p, idx) => ({
            user_id: p.user_id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            avatar_preset: p.avatar_preset,
            score: Number(p[scoreField] || 0),
            rank: idx + 1,
            isMe: myId ? p.user_id === myId : false,
        }));
    } catch (err) {
        console.error('getGlobalLeaderboard error:', err);
        return [];
    }
};
