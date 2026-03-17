import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { getUserId } from './auth';

// ── Storage Keys ──────────────────────────────────────────────
const POMODORO_SESSIONS_KEY = '@pomodoro_sessions';
const ACTIVITY_STREAK_KEY = '@activity_streak';
const FOCUS_SCORE_CACHE_KEY = '@focus_score_cache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Constants ─────────────────────────────────────────────────
const TARGET_WEEKLY_MINUTES = 1500; // 25 hours
const MAX_STREAK_DAYS = 7; // 7-day streak = 100

// ── Pomodoro Session Persistence ──────────────────────────────

/**
 * Record a completed pomodoro session.
 * Call this when a pomodoro timer finishes.
 */
export const recordPomodoroSession = async (durationMinutes = 25) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const raw = await AsyncStorage.getItem(POMODORO_SESSIONS_KEY);
        const sessions = raw ? JSON.parse(raw) : [];

        sessions.push({ date: today, minutes: durationMinutes, timestamp: Date.now() });

        // Keep only last 60 days of sessions
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 60);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const trimmed = sessions.filter(s => s.date >= cutoffStr);

        await AsyncStorage.setItem(POMODORO_SESSIONS_KEY, JSON.stringify(trimmed));

        // Update streak
        await updateStreak();

        // Invalidate cache so next score compute is fresh
        await AsyncStorage.removeItem(FOCUS_SCORE_CACHE_KEY);

        return true;
    } catch (err) {
        console.error('recordPomodoroSession error:', err);
        return false;
    }
};

/**
 * Get pomodoro sessions for the current week (Mon-Sun).
 * Returns { totalMinutes, dailyMinutes: [Mon...Sun] }
 */
export const getWeeklyPomodoroData = async () => {
    try {
        const raw = await AsyncStorage.getItem(POMODORO_SESSIONS_KEY);
        const sessions = raw ? JSON.parse(raw) : [];

        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - mondayOffset);
        monday.setHours(0, 0, 0, 0);
        const mondayStr = monday.toISOString().slice(0, 10);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const sundayStr = sunday.toISOString().slice(0, 10);

        const weekSessions = sessions.filter(s => s.date >= mondayStr && s.date <= sundayStr);

        // Build daily array [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
        const dailyMinutes = [0, 0, 0, 0, 0, 0, 0];
        weekSessions.forEach(s => {
            const d = new Date(s.date + 'T12:00:00');
            const idx = d.getDay() === 0 ? 6 : d.getDay() - 1;
            dailyMinutes[idx] += s.minutes;
        });

        const totalMinutes = dailyMinutes.reduce((a, b) => a + b, 0);

        return { totalMinutes, dailyMinutes, dailyHours: dailyMinutes.map(m => +(m / 60).toFixed(1)) };
    } catch (err) {
        console.error('getWeeklyPomodoroData error:', err);
        return { totalMinutes: 0, dailyMinutes: [0, 0, 0, 0, 0, 0, 0], dailyHours: [0, 0, 0, 0, 0, 0, 0] };
    }
};

// ── Streak Tracking ───────────────────────────────────────────

const updateStreak = async () => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const raw = await AsyncStorage.getItem(ACTIVITY_STREAK_KEY);
        const streak = raw ? JSON.parse(raw) : { currentStreak: 0, lastActiveDate: null };

        if (streak.lastActiveDate === today) return streak; // Already updated today

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);

        if (streak.lastActiveDate === yesterdayStr) {
            streak.currentStreak += 1;
        } else if (streak.lastActiveDate !== today) {
            streak.currentStreak = 1; // Reset streak
        }

        streak.lastActiveDate = today;
        await AsyncStorage.setItem(ACTIVITY_STREAK_KEY, JSON.stringify(streak));
        return streak;
    } catch (err) {
        console.error('updateStreak error:', err);
        return { currentStreak: 0, lastActiveDate: null };
    }
};

export const getStreak = async () => {
    try {
        const raw = await AsyncStorage.getItem(ACTIVITY_STREAK_KEY);
        return raw ? JSON.parse(raw) : { currentStreak: 0, lastActiveDate: null };
    } catch {
        return { currentStreak: 0, lastActiveDate: null };
    }
};

// ── Sub-Score Calculations ────────────────────────────────────

/**
 * Pomodoro score (0-100): weekly minutes vs target
 */
const calcPomodoroScore = async () => {
    const { totalMinutes } = await getWeeklyPomodoroData();
    return Math.min(100, Math.round((totalMinutes / TARGET_WEEKLY_MINUTES) * 100));
};

/**
 * Task completion score (0-100): completed / total this week
 */
const calcTaskCompletionScore = async () => {
    try {
        const userId = await getUserId();
        const now = new Date();
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - mondayOffset);
        const mondayStr = monday.toISOString().slice(0, 10);

        const { data: allTasks, error } = await supabase
            .from('tasks')
            .select('id, completed, due_date')
            .eq('user_id', userId)
            .gte('due_date', mondayStr);

        if (error || !allTasks || allTasks.length === 0) return 50; // No tasks = neutral score

        const completed = allTasks.filter(t => t.completed).length;
        return Math.round((completed / allTasks.length) * 100);
    } catch {
        return 50;
    }
};

/**
 * On-time completion score (0-100): tasks completed before due date
 */
const calcOnTimeScore = async () => {
    try {
        const userId = await getUserId();

        const { data: completedTasks, error } = await supabase
            .from('tasks')
            .select('id, completed, due_date, completed_at')
            .eq('user_id', userId)
            .eq('completed', true)
            .not('due_date', 'is', null);

        if (error || !completedTasks || completedTasks.length === 0) return 50;

        // If completed_at exists, check if before due_date. Otherwise assume on-time.
        const onTime = completedTasks.filter(t => {
            if (!t.completed_at) return true; // Assume on-time if no timestamp
            return t.completed_at.slice(0, 10) <= t.due_date;
        }).length;

        return Math.round((onTime / completedTasks.length) * 100);
    } catch {
        return 50;
    }
};

/**
 * Grade score (0-100): average grade percentage mapped
 */
const calcGradeScore = async () => {
    try {
        const raw = await AsyncStorage.getItem('studentVueGrades');
        if (!raw) return 50; // No grades connected

        const classes = JSON.parse(raw);
        if (classes.length === 0) return 50;

        const validClasses = classes.filter(c => typeof c.grade === 'number' && c.grade > 0);
        if (validClasses.length === 0) return 50;

        const avgGrade = validClasses.reduce((sum, c) => sum + c.grade, 0) / validClasses.length;

        // Map: 95+ = 100, 90 = 90, 85 = 80, etc.
        if (avgGrade >= 95) return 100;
        if (avgGrade >= 90) return 90;
        if (avgGrade >= 85) return 80;
        if (avgGrade >= 80) return 70;
        if (avgGrade >= 75) return 60;
        if (avgGrade >= 70) return 50;
        return Math.max(20, Math.round(avgGrade * 0.7));
    } catch {
        return 50;
    }
};

/**
 * Scheduling adherence (0-100): did user follow planned blocks
 */
const calcSchedulingAdherence = async () => {
    try {
        const raw = await AsyncStorage.getItem('@option_app_worktimes');
        if (!raw) return 50;

        const worktimes = JSON.parse(raw);
        const now = new Date();

        // Only look at past blocks within the last 7 days
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().slice(0, 10);
        const nowStr = now.toISOString();

        const pastBlocks = worktimes.filter(w =>
            w.scheduled_end && w.scheduled_end < nowStr && w.date >= weekAgoStr
        );

        if (pastBlocks.length === 0) return 50;

        // Check if there were pomodoro sessions during the block time windows
        const sessionsRaw = await AsyncStorage.getItem(POMODORO_SESSIONS_KEY);
        const sessions = sessionsRaw ? JSON.parse(sessionsRaw) : [];

        let adherentBlocks = 0;
        for (const block of pastBlocks) {
            const blockDate = block.date;
            // Simple heuristic: did user have any pomodoro on the same day?
            const hasSession = sessions.some(s => s.date === blockDate);
            if (hasSession) adherentBlocks++;
        }

        return Math.round((adherentBlocks / pastBlocks.length) * 100);
    } catch {
        return 50;
    }
};

/**
 * Streak score (0-100): consecutive active days
 */
const calcStreakScore = async () => {
    const streak = await getStreak();
    return Math.min(100, Math.round((streak.currentStreak / MAX_STREAK_DAYS) * 100));
};

/**
 * GPA trend score: improving = 100, stable = 70, declining = 30
 */
const calcGpaTrendScore = async () => {
    try {
        const currentRaw = await AsyncStorage.getItem('studentVueGrades');
        if (!currentRaw) return 50;

        const current = JSON.parse(currentRaw);
        const currentAvg = current.reduce((s, c) => s + (c.grade || 0), 0) / (current.length || 1);

        // Try to load previous period grades
        const prevRaw = await AsyncStorage.getItem('studentVueGradesPrev');
        if (!prevRaw) return 70; // No previous data, assume stable

        const prev = JSON.parse(prevRaw);
        const prevAvg = prev.reduce((s, c) => s + (c.grade || 0), 0) / (prev.length || 1);

        const diff = currentAvg - prevAvg;
        if (diff > 2) return 100;   // Improving
        if (diff >= -1) return 70;   // Stable
        return 30;                    // Declining
    } catch {
        return 70;
    }
};

// ── Main Focus Score Computation ──────────────────────────────

/**
 * Compute the full focus score (0-100).
 * Uses 30-min cache to avoid expensive recalculations.
 *
 * Returns { score, breakdown, fromCache }
 */
export const computeFocusScore = async (forceRefresh = false) => {
    try {
        // Check cache first
        if (!forceRefresh) {
            const cacheRaw = await AsyncStorage.getItem(FOCUS_SCORE_CACHE_KEY);
            if (cacheRaw) {
                const cache = JSON.parse(cacheRaw);
                if (Date.now() - cache.computedAt < CACHE_TTL_MS) {
                    return { score: cache.score, breakdown: cache.breakdown, fromCache: true };
                }
            }
        }

        // Compute all sub-scores in parallel
        const [
            pomodoroScore,
            taskCompletionScore,
            onTimeScore,
            gradeScore,
            schedulingAdherence,
            streakScore,
            gpaTrendScore,
        ] = await Promise.all([
            calcPomodoroScore(),
            calcTaskCompletionScore(),
            calcOnTimeScore(),
            calcGradeScore(),
            calcSchedulingAdherence(),
            calcStreakScore(),
            calcGpaTrendScore(),
        ]);

        // Weighted combination
        const score = Math.round(
            0.25 * pomodoroScore +
            0.20 * taskCompletionScore +
            0.15 * onTimeScore +
            0.15 * gradeScore +
            0.10 * schedulingAdherence +
            0.10 * streakScore +
            0.05 * gpaTrendScore
        );

        const breakdown = {
            pomodoro: pomodoroScore,
            taskCompletion: taskCompletionScore,
            onTime: onTimeScore,
            grades: gradeScore,
            scheduling: schedulingAdherence,
            streak: streakScore,
            gpaTrend: gpaTrendScore,
        };

        // Cache locally
        await AsyncStorage.setItem(FOCUS_SCORE_CACHE_KEY, JSON.stringify({
            score,
            breakdown,
            computedAt: Date.now(),
        }));

        return { score, breakdown, fromCache: false };
    } catch (err) {
        console.error('computeFocusScore error:', err);
        return { score: 50, breakdown: {}, fromCache: false };
    }
};

/**
 * Sync the computed focus score to Supabase (profiles + focus_scores tables).
 * Call this after computing the score.
 */
export const syncScoreToSupabase = async (score, breakdown) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return; // Only for authenticated users

        const uid = session.user.id;
        const today = new Date().toISOString().slice(0, 10);

        // Upsert daily score
        await supabase
            .from('focus_scores')
            .upsert({
                user_id: uid,
                score,
                breakdown,
                recorded_at: today,
            }, { onConflict: 'user_id,recorded_at' });

        // Calculate weekly average (last 7 days)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().slice(0, 10);

        const { data: weekScores } = await supabase
            .from('focus_scores')
            .select('score')
            .eq('user_id', uid)
            .gte('recorded_at', weekAgoStr);

        const weeklyAvg = weekScores?.length
            ? Math.round(weekScores.reduce((s, r) => s + Number(r.score), 0) / weekScores.length)
            : score;

        // Calculate monthly average (last 30 days)
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        const monthAgoStr = monthAgo.toISOString().slice(0, 10);

        const { data: monthScores } = await supabase
            .from('focus_scores')
            .select('score')
            .eq('user_id', uid)
            .gte('recorded_at', monthAgoStr);

        const monthlyAvg = monthScores?.length
            ? Math.round(monthScores.reduce((s, r) => s + Number(r.score), 0) / monthScores.length)
            : score;

        // Update profile aggregates
        await supabase
            .from('profiles')
            .update({
                focus_score_weekly: weeklyAvg,
                focus_score_monthly: monthlyAvg,
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', uid);
    } catch (err) {
        console.error('syncScoreToSupabase error:', err);
    }
};

/**
 * Get a human-readable label for the focus score.
 */
export const getScoreLabel = (score) => {
    if (score >= 90) return 'Outstanding';
    if (score >= 75) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 45) return 'Fair';
    if (score >= 30) return 'Needs Work';
    return 'Getting Started';
};
