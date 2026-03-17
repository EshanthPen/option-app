-- ============================================================
-- Option Dashboard: Focus Score, Leaderboard & Profiles Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT DEFAULT 'Student',
    avatar_url TEXT,
    avatar_preset TEXT,
    school_name TEXT,
    friend_code TEXT UNIQUE DEFAULT UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6)),
    focus_score_weekly NUMERIC DEFAULT 0,
    focus_score_monthly NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_school ON profiles(school_name);
CREATE INDEX IF NOT EXISTS idx_profiles_weekly_score ON profiles(focus_score_weekly DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_monthly_score ON profiles(focus_score_monthly DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_friend_code ON profiles(friend_code);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 2. FRIENDSHIPS TABLE
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own friendships" ON friendships FOR SELECT
    USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Users can create friendships" ON friendships FOR INSERT
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own friendships" ON friendships FOR DELETE
    USING (auth.uid() = user_id);

-- 3. FOCUS SCORES TABLE (daily history)
CREATE TABLE IF NOT EXISTS focus_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    score NUMERIC NOT NULL DEFAULT 0,
    breakdown JSONB,
    recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE(user_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_focus_scores_user_date ON focus_scores(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_focus_scores_date ON focus_scores(recorded_at);

ALTER TABLE focus_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all scores" ON focus_scores FOR SELECT USING (true);
CREATE POLICY "Users can insert own scores" ON focus_scores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scores" ON focus_scores FOR UPDATE USING (auth.uid() = user_id);

-- 4. AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (user_id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'Student'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 5. STORAGE BUCKET FOR AVATARS
-- Run this separately in Supabase Dashboard > Storage:
-- Create bucket "avatars" with public access, 2MB max, allowed MIME: image/jpeg, image/png, image/webp

-- 6. HELPER: Get leaderboard for a school
CREATE OR REPLACE FUNCTION get_school_leaderboard(p_school TEXT, p_period TEXT DEFAULT 'weekly')
RETURNS TABLE(user_id UUID, display_name TEXT, avatar_url TEXT, avatar_preset TEXT, score NUMERIC, rank BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT p.user_id, p.display_name, p.avatar_url, p.avatar_preset,
           CASE WHEN p_period = 'monthly' THEN p.focus_score_monthly ELSE p.focus_score_weekly END AS score,
           ROW_NUMBER() OVER (ORDER BY CASE WHEN p_period = 'monthly' THEN p.focus_score_monthly ELSE p.focus_score_weekly END DESC) AS rank
    FROM profiles p
    WHERE p.school_name = p_school
    ORDER BY score DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- 7. HELPER: Get global leaderboard
CREATE OR REPLACE FUNCTION get_global_leaderboard(p_period TEXT DEFAULT 'weekly')
RETURNS TABLE(user_id UUID, display_name TEXT, avatar_url TEXT, avatar_preset TEXT, score NUMERIC, rank BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT p.user_id, p.display_name, p.avatar_url, p.avatar_preset,
           CASE WHEN p_period = 'monthly' THEN p.focus_score_monthly ELSE p.focus_score_weekly END AS score,
           ROW_NUMBER() OVER (ORDER BY CASE WHEN p_period = 'monthly' THEN p.focus_score_monthly ELSE p.focus_score_weekly END DESC) AS rank
    FROM profiles p
    ORDER BY score DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;
