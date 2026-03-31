import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { getUserId } from './auth';
import { getWeeklyPomodoroData, getStreak } from './focusScoreEngine';

// ── Constants ────────────────────────────────────────────────
const WEEKLY_POMODORO_TARGET = 600; // minutes (10 hrs/week, matches focusScoreEngine)
const WEEKLY_POMODORO_LOW_THRESHOLD = 200; // below this = nudge (~3.3 hrs)
const GRADE_DROP_THRESHOLD = 3; // percentage points
const UPCOMING_DEADLINE_HOURS = 48; // 2 days
const POMODORO_BREAK_THRESHOLD = 4; // sessions before break nudge

// ── Nudge Types & Priorities ─────────────────────────────────
const TYPES = {
    WARNING: 'warning',
    SUGGESTION: 'suggestion',
    MOTIVATION: 'motivation',
    ACHIEVEMENT: 'achievement',
};

// ── Helpers ──────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

const isSunday = () => new Date().getDay() === 0;

const getTodaySessionCount = async () => {
    try {
        const raw = await AsyncStorage.getItem('@pomodoro_sessions');
        const sessions = raw ? JSON.parse(raw) : [];
        const todayStr = today();
        return sessions.filter(s => s.date === todayStr).length;
    } catch {
        return 0;
    }
};

// ── Individual Nudge Generators ──────────────────────────────

/**
 * Grade Drop Alert
 * Compares current grades against the previous snapshot.
 * If any class dropped by 3%+ points, warn the student.
 */
const checkGradeDrops = async () => {
    try {
        const [currentRaw, prevRaw] = await Promise.all([
            AsyncStorage.getItem('studentVueGrades'),
            AsyncStorage.getItem('studentVueGradesPrev'),
        ]);

        if (!currentRaw || !prevRaw) return [];

        const current = JSON.parse(currentRaw);
        const previous = JSON.parse(prevRaw);

        const nudges = [];

        const currentCourses = Array.isArray(current) ? current : current.courses || [];
        const prevCourses = Array.isArray(previous) ? previous : previous.courses || [];

        for (const course of currentCourses) {
            const prevCourse = prevCourses.find(
                p => p.title === course.title || p.name === course.name
            );
            if (!prevCourse) continue;

            const currentGrade = parseFloat(course.grade || course.pct || 0);
            const prevGrade = parseFloat(prevCourse.grade || prevCourse.pct || 0);
            const drop = prevGrade - currentGrade;

            if (drop >= GRADE_DROP_THRESHOLD) {
                const courseName = course.title || course.name || 'a class';
                nudges.push({
                    id: `grade_drop_${courseName.replace(/\s+/g, '_').toLowerCase()}`,
                    type: TYPES.WARNING,
                    title: 'Grade Drop Alert',
                    message: `Your grade in ${courseName} dropped by ${drop.toFixed(1)}%. Consider scheduling extra study time to recover.`,
                    priority: 5,
                    action: 'navigate_gradebook',
                    actionLabel: 'View Grades',
                });
            }
        }

        return nudges;
    } catch (err) {
        console.warn('checkGradeDrops error:', err);
        return [];
    }
};

/**
 * Upcoming Deadline
 * Checks Supabase tasks for anything due within 48 hours that is not completed.
 */
const checkUpcomingDeadlines = async () => {
    try {
        const userId = await getUserId();
        const now = new Date();
        const cutoff = new Date(now.getTime() + UPCOMING_DEADLINE_HOURS * 60 * 60 * 1000);

        const { data: tasks, error } = await supabase
            .from('tasks')
            .select('id, title, due_date, completed')
            .eq('user_id', userId)
            .eq('completed', false)
            .gte('due_date', now.toISOString())
            .lte('due_date', cutoff.toISOString())
            .order('due_date', { ascending: true });

        if (error || !tasks) return [];

        return tasks.map(task => {
            const dueDate = new Date(task.due_date);
            const hoursLeft = Math.round((dueDate - now) / (1000 * 60 * 60));
            const urgency = hoursLeft <= 12 ? 5 : hoursLeft <= 24 ? 4 : 3;

            return {
                id: `deadline_${task.id}`,
                type: TYPES.WARNING,
                title: 'Upcoming Deadline',
                message: `"${task.title}" is due in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}. Start working on it now!`,
                priority: urgency,
                action: 'navigate_calendar',
                actionLabel: 'View Calendar',
            };
        });
    } catch (err) {
        console.warn('checkUpcomingDeadlines error:', err);
        return [];
    }
};

/**
 * Focus Deficit
 * If weekly pomodoro minutes are below the low threshold, nudge to start a session.
 */
const checkFocusDeficit = async () => {
    try {
        const { totalMinutes } = await getWeeklyPomodoroData();

        if (totalMinutes < WEEKLY_POMODORO_LOW_THRESHOLD) {
            const pct = Math.round((totalMinutes / WEEKLY_POMODORO_TARGET) * 100);
            return [
                {
                    id: 'focus_deficit',
                    type: TYPES.SUGGESTION,
                    title: 'Focus Time Running Low',
                    message: `You've only logged ${totalMinutes} min this week (${pct}% of your ${WEEKLY_POMODORO_TARGET} min goal). Start a focus session to get back on track!`,
                    priority: 4,
                    action: 'navigate_focus',
                    actionLabel: 'Start Focus Session',
                },
            ];
        }

        return [];
    } catch (err) {
        console.warn('checkFocusDeficit error:', err);
        return [];
    }
};

/**
 * Streak at Risk
 * If the user was active yesterday but hasn't been active today yet.
 */
const checkStreakAtRisk = async () => {
    try {
        const streak = await getStreak();

        if (!streak.lastActiveDate || streak.currentStreak === 0) return [];

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);
        const todayStr = today();

        if (streak.lastActiveDate === yesterdayStr && streak.lastActiveDate !== todayStr) {
            return [
                {
                    id: 'streak_at_risk',
                    type: TYPES.MOTIVATION,
                    title: 'Streak at Risk!',
                    message: `You have a ${streak.currentStreak}-day streak going! Complete a focus session today to keep it alive.`,
                    priority: 4,
                    action: 'navigate_focus',
                    actionLabel: 'Protect Streak',
                },
            ];
        }

        return [];
    } catch (err) {
        console.warn('checkStreakAtRisk error:', err);
        return [];
    }
};

/**
 * GPA Booster
 * Identifies the lowest-grade class and suggests studying it.
 */
const checkGPABooster = async () => {
    try {
        const raw = await AsyncStorage.getItem('studentVueGrades');
        if (!raw) return [];

        const grades = JSON.parse(raw);
        const courses = Array.isArray(grades) ? grades : grades.courses || [];

        if (courses.length === 0) return [];

        // Find the course with the lowest numeric grade
        let lowest = null;
        let lowestGrade = Infinity;

        for (const course of courses) {
            const grade = parseFloat(course.grade || course.pct || 0);
            if (grade > 0 && grade < lowestGrade) {
                lowestGrade = grade;
                lowest = course;
            }
        }

        if (!lowest || lowestGrade >= 90) return []; // No nudge if everything is an A

        const courseName = lowest.title || lowest.name || 'your lowest class';

        return [
            {
                id: 'gpa_booster',
                type: TYPES.SUGGESTION,
                title: 'GPA Booster Tip',
                message: `${courseName} is your lowest grade at ${lowestGrade.toFixed(1)}%. Spending extra time here will have the biggest impact on your GPA.`,
                priority: 3,
                action: 'navigate_gradebook',
                actionLabel: 'View Gradebook',
            },
        ];
    } catch (err) {
        console.warn('checkGPABooster error:', err);
        return [];
    }
};

/**
 * Achievement Close
 * If the user is close to unlocking an achievement, give them a nudge.
 * Attempts to import getAchievementProgress; skips gracefully if unavailable.
 */
const checkAchievementProgress = async () => {
    try {
        const { getAchievementProgress, getUnlockedAchievements } = require('./achievements');
        if (!getAchievementProgress) return [];

        // Build a basic stats object from available data
        const pomData = await getWeeklyPomodoroData();
        const streak = await getStreak();
        const unlocked = await getUnlockedAchievements();

        const stats = {
            totalPomodoros: pomData.totalMinutes > 0 ? Math.ceil(pomData.totalMinutes / 25) : 0,
            currentStreak: streak.currentStreak || 0,
        };

        const achievements = getAchievementProgress(stats);
        if (!achievements || !Array.isArray(achievements)) return [];

        // Filter out already unlocked
        const unlockedSet = new Set(unlocked);
        const nudges = [];

        for (const achievement of achievements) {
            if (unlockedSet.has(achievement.id)) continue;

            const pct = achievement.progress || 0;

            // Nudge if between 70% and 99% complete
            if (pct >= 70 && pct < 100) {
                nudges.push({
                    id: `achievement_${achievement.id}`,
                    type: TYPES.ACHIEVEMENT,
                    title: 'Achievement Almost Unlocked!',
                    message: `You're ${Math.round(pct)}% of the way to "${achievement.title}". Keep going!`,
                    priority: 2,
                    action: 'navigate_leaderboard',
                    actionLabel: 'View Achievements',
                });
            }
        }

        return nudges;
    } catch {
        // achievements module may not exist yet; silently skip
        return [];
    }
};

/**
 * Weekly Review
 * On Sundays, suggest that the student review the week's progress.
 */
const checkWeeklyReview = () => {
    if (!isSunday()) return [];

    return [
        {
            id: 'weekly_review',
            type: TYPES.SUGGESTION,
            title: 'Weekly Review Time',
            message: "It's Sunday! Take a few minutes to review your progress this week and plan for the next one.",
            priority: 2,
            action: 'navigate_leaderboard',
            actionLabel: 'Review Progress',
        },
    ];
};

/**
 * Break Reminder
 * If the user has done 4+ pomodoros today, suggest a longer break.
 */
const checkBreakReminder = async () => {
    try {
        const count = await getTodaySessionCount();

        if (count >= POMODORO_BREAK_THRESHOLD) {
            return [
                {
                    id: 'break_reminder',
                    type: TYPES.MOTIVATION,
                    title: 'Take a Break!',
                    message: `You've completed ${count} focus sessions today. Great work! Take a longer break to recharge before your next session.`,
                    priority: 1,
                    action: 'dismiss',
                    actionLabel: 'Got It',
                },
            ];
        }

        return [];
    } catch (err) {
        console.warn('checkBreakReminder error:', err);
        return [];
    }
};

// ── Main Export ───────────────────────────────────────────────

/**
 * Analyze the student's data and return an array of smart study nudges.
 *
 * Each nudge: { id, type, title, message, priority, action, actionLabel }
 *   - type: 'warning' | 'suggestion' | 'motivation' | 'achievement'
 *   - priority: 1-5 (5 = most urgent)
 *   - action: 'navigate_focus' | 'navigate_gradebook' | 'navigate_calendar'
 *             | 'navigate_leaderboard' | 'dismiss'
 *
 * @returns {Promise<Array>} Nudges sorted by priority (highest first).
 */
export const generateNudges = async () => {
    try {
        const results = await Promise.allSettled([
            checkGradeDrops(),
            checkUpcomingDeadlines(),
            checkFocusDeficit(),
            checkStreakAtRisk(),
            checkGPABooster(),
            checkAchievementProgress(),
            Promise.resolve(checkWeeklyReview()),
            checkBreakReminder(),
        ]);

        const nudges = results
            .filter(r => r.status === 'fulfilled' && Array.isArray(r.value))
            .flatMap(r => r.value);

        // Sort by priority descending (most urgent first)
        nudges.sort((a, b) => b.priority - a.priority);

        return nudges;
    } catch (err) {
        console.error('generateNudges error:', err);
        return [];
    }
};
