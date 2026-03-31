import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { getUserId } from './auth';

// ── Storage Keys ──────────────────────────────────────────────
const POMODORO_SESSIONS_KEY = '@pomodoro_sessions';
const ACTIVITY_STREAK_KEY = '@activity_streak';
const FOCUS_SCORE_CACHE_KEY = '@focus_score_cache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Constants ─────────────────────────────────────────────────
// 10 hours/week = ~85 min/day is a realistic study target for high school students
const TARGET_WEEKLY_MINUTES = 600;
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
            // Consecutive day — extend streak
            streak.currentStreak += 1;
        } else if (streak.lastActiveDate) {
            // Check if gap is just a weekend (Fri → Mon is still a valid streak for students)
            const lastActive = new Date(streak.lastActiveDate + 'T12:00:00');
            const todayDate = new Date(today + 'T12:00:00');
            const gapDays = Math.round((todayDate - lastActive) / (24 * 60 * 60 * 1000));
            const lastActiveDay = lastActive.getDay(); // 0=Sun, 5=Fri

            // Allow a 2-day gap if the last active day was Friday (skip Sat+Sun)
            if (gapDays === 3 && lastActiveDay === 5) {
                streak.currentStreak += 1; // Friday → Monday = still a streak
            } else if (gapDays === 2 && (lastActiveDay === 5 || lastActiveDay === 6)) {
                streak.currentStreak += 1; // Fri→Sun or Sat→Mon
            } else {
                streak.currentStreak = 1; // Reset streak
            }
        } else {
            streak.currentStreak = 1; // First ever activity
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
 * Pomodoro score (0-100): weekly minutes vs realistic target (10 hrs/week).
 * Uses a curved scale so early sessions feel rewarding.
 *
 * 0 min = 0, 150 min (2.5h) = 40, 300 min (5h) = 65, 600 min (10h) = 100
 */
const calcPomodoroScore = async () => {
    const { totalMinutes } = await getWeeklyPomodoroData();
    if (totalMinutes === 0) return 0;

    // Logarithmic curve so early sessions have visible impact
    // score = 100 * (1 - e^(-totalMinutes / 250))
    // At 150min → ~45, 300min → ~70, 600min → ~91, 900min → ~97
    const raw = 100 * (1 - Math.exp(-totalMinutes / 250));
    return Math.min(100, Math.round(raw));
};

/**
 * Task completion score (0-100): completed / total tasks due THIS WEEK.
 *
 * FIX: Only counts tasks that are due within this week (Mon-Sun), not future tasks.
 * Future tasks shouldn't penalize you for not being done yet.
 */
const calcTaskCompletionScore = async () => {
    try {
        const userId = await getUserId();
        const now = new Date();
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - mondayOffset);
        monday.setHours(0, 0, 0, 0);
        const mondayStr = monday.toISOString().slice(0, 10);

        // End of this week (Sunday)
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const sundayStr = sunday.toISOString().slice(0, 10);

        const { data: weekTasks, error } = await supabase
            .from('tasks')
            .select('id, completed, due_date')
            .eq('user_id', userId)
            .gte('due_date', mondayStr)
            .lte('due_date', sundayStr); // Only tasks due THIS week

        if (error || !weekTasks || weekTasks.length === 0) return 50; // No tasks this week = neutral

        const completed = weekTasks.filter(t => t.completed).length;
        const total = weekTasks.length;

        // Use a slightly forgiving scale: 100% completion = 100, partial still good
        return Math.round((completed / total) * 100);
    } catch {
        return 50;
    }
};

/**
 * On-time completion score (0-100): tasks completed before their due date.
 *
 * FIX: Only looks at tasks completed in the last 30 days, not all-time.
 * All-time would mean one late assignment years ago permanently drags your score.
 */
const calcOnTimeScore = async () => {
    try {
        const userId = await getUserId();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

        const { data: completedTasks, error } = await supabase
            .from('tasks')
            .select('id, completed, due_date, completed_at')
            .eq('user_id', userId)
            .eq('completed', true)
            .not('due_date', 'is', null)
            .gte('due_date', thirtyDaysAgoStr); // Only recent tasks

        if (error || !completedTasks || completedTasks.length === 0) return 50;

        const onTime = completedTasks.filter(t => {
            if (!t.completed_at) return true; // Assume on-time if no timestamp
            // Compare dates: completed_at should be on or before due_date
            return t.completed_at.slice(0, 10) <= t.due_date;
        }).length;

        return Math.round((onTime / completedTasks.length) * 100);
    } catch {
        return 50;
    }
};

/**
 * Grade score (0-100): continuous mapping from average grade percentage.
 *
 * FIX: Uses a continuous linear scale instead of a step function with gaps.
 * The old step function jumped from 90 to 100 at 95%, losing granularity.
 *
 * 100% avg → 100 score
 * 90% avg → 85 score
 * 80% avg → 65 score
 * 70% avg → 45 score
 * 60% avg → 25 score
 * Below 60% → scales down to minimum of 10
 */
const calcGradeScore = async () => {
    try {
        const raw = await AsyncStorage.getItem('studentVueGrades');
        if (!raw) return 50; // No grades connected

        const classes = JSON.parse(raw);
        if (!Array.isArray(classes) || classes.length === 0) return 50;

        const validClasses = classes.filter(c => typeof c.grade === 'number' && c.grade > 0);
        if (validClasses.length === 0) return 50;

        const avgGrade = validClasses.reduce((sum, c) => sum + c.grade, 0) / validClasses.length;

        // Continuous linear mapping: grade 60-100 → score 25-100
        if (avgGrade >= 100) return 100;
        if (avgGrade >= 60) {
            // Linear interpolation: 60→25, 100→100
            return Math.round(25 + ((avgGrade - 60) / 40) * 75);
        }
        // Below 60: scale down to minimum 10
        return Math.max(10, Math.round(avgGrade * 0.4));
    } catch {
        return 50;
    }
};

/**
 * Scheduling adherence (0-100): did the user actually study during planned blocks?
 *
 * FIX: Uses timestamp-level comparison instead of just same-day heuristic.
 * Now checks if a pomodoro session occurred within 1 hour of a scheduled block's
 * start time, which is a much more accurate measure of adherence.
 */
const calcSchedulingAdherence = async () => {
    try {
        const raw = await AsyncStorage.getItem('@option_app_worktimes');
        if (!raw) return 50;

        const worktimes = JSON.parse(raw);
        if (!Array.isArray(worktimes)) return 50;

        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().slice(0, 10);
        const nowMs = now.getTime();

        // Only look at past blocks within the last 7 days
        const pastBlocks = worktimes.filter(w => {
            if (!w.scheduled_end) return false;
            const endMs = new Date(w.scheduled_end).getTime();
            return endMs < nowMs && w.date >= weekAgoStr;
        });

        if (pastBlocks.length === 0) return 50;

        const sessionsRaw = await AsyncStorage.getItem(POMODORO_SESSIONS_KEY);
        const sessions = sessionsRaw ? JSON.parse(sessionsRaw) : [];

        let adherentBlocks = 0;
        const ONE_HOUR_MS = 60 * 60 * 1000;

        for (const block of pastBlocks) {
            const blockStartMs = new Date(block.scheduled_start).getTime();
            const blockEndMs = new Date(block.scheduled_end).getTime();

            // Check if any pomodoro session started within the block's time window
            // (with a 1-hour grace period on either side)
            const hasSession = sessions.some(s => {
                const sessionMs = s.timestamp || new Date(s.date + 'T12:00:00').getTime();
                return sessionMs >= (blockStartMs - ONE_HOUR_MS) && sessionMs <= (blockEndMs + ONE_HOUR_MS);
            });

            if (hasSession) adherentBlocks++;
        }

        return Math.round((adherentBlocks / pastBlocks.length) * 100);
    } catch {
        return 50;
    }
};

/**
 * Streak score (0-100): consecutive active days.
 * Capped at 7 days = 100.
 */
const calcStreakScore = async () => {
    const streak = await getStreak();
    return Math.min(100, Math.round((streak.currentStreak / MAX_STREAK_DAYS) * 100));
};

/**
 * GPA trend score (0-100): improving, stable, or declining.
 *
 * FIX: Uses a continuous scale instead of 3 discrete values (100/70/30).
 * Also handles edge case where current grades array has classes with grade=0.
 */
const calcGpaTrendScore = async () => {
    try {
        const currentRaw = await AsyncStorage.getItem('studentVueGrades');
        if (!currentRaw) return 50;

        const current = JSON.parse(currentRaw);
        if (!Array.isArray(current) || current.length === 0) return 50;

        const validCurrent = current.filter(c => typeof c.grade === 'number' && c.grade > 0);
        if (validCurrent.length === 0) return 50;

        const currentAvg = validCurrent.reduce((s, c) => s + c.grade, 0) / validCurrent.length;

        // Try to load previous period grades
        const prevRaw = await AsyncStorage.getItem('studentVueGradesPrev');
        if (!prevRaw) return 65; // No previous data, slightly above neutral

        const prev = JSON.parse(prevRaw);
        if (!Array.isArray(prev) || prev.length === 0) return 65;

        const validPrev = prev.filter(c => typeof c.grade === 'number' && c.grade > 0);
        if (validPrev.length === 0) return 65;

        const prevAvg = validPrev.reduce((s, c) => s + c.grade, 0) / validPrev.length;

        const diff = currentAvg - prevAvg;

        // Continuous mapping: diff of +5 or more = 100, diff of -5 or less = 10
        // 0 diff = 55 (slightly above midpoint since stable is okay)
        if (diff >= 5) return 100;
        if (diff <= -5) return 10;
        // Linear interpolation between -5 → 10 and +5 → 100
        return Math.round(55 + (diff / 5) * 45);
    } catch {
        return 65;
    }
};

// ── Main Focus Score Computation ──────────────────────────────

/**
 * Compute the full focus score (0-100).
 * Uses 30-min cache to avoid expensive recalculations.
 *
 * Weights (must sum to 1.0):
 *   Pomodoro:     0.25  (Are you putting in study time?)
 *   Task comp:    0.20  (Are you finishing what's due?)
 *   On-time:      0.15  (Are you finishing before deadlines?)
 *   Grades:       0.15  (How are your actual grades?)
 *   Scheduling:   0.10  (Are you following your schedule?)
 *   Streak:       0.10  (Are you consistent day-to-day?)
 *   GPA trend:    0.05  (Are grades improving/declining?)
 *   TOTAL:        1.00
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

        // Weighted combination (weights sum to exactly 1.0)
        const rawScore =
            0.25 * pomodoroScore +
            0.20 * taskCompletionScore +
            0.15 * onTimeScore +
            0.15 * gradeScore +
            0.10 * schedulingAdherence +
            0.10 * streakScore +
            0.05 * gpaTrendScore;

        // Clamp to 0-100
        const score = Math.max(0, Math.min(100, Math.round(rawScore)));

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
        return { score: 0, breakdown: {}, fromCache: false };
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
