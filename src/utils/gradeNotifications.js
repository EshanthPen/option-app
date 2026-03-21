import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getSecureItem } from './secureStorage';

// ── Storage Keys ──────────────────────────────────────────────
const PREV_GRADES_KEY = '@grade_snapshot_prev';
const GRADE_CHANGES_KEY = '@grade_changes_recent';
const NOTIFICATIONS_ENABLED_KEY = '@grade_notifications_enabled';

// ── Grade Diffing ─────────────────────────────────────────────

/**
 * Compare two grade snapshots and return a list of changes.
 * Each change: { type, className, assignmentName, oldScore, newScore, oldGrade, newGrade }
 */
export const diffGrades = (oldClasses, newClasses) => {
    if (!oldClasses || !newClasses) return [];

    const changes = [];

    for (const newClass of newClasses) {
        const oldClass = oldClasses.find(c => c.name === newClass.name);

        if (!oldClass) {
            changes.push({
                type: 'new_class',
                className: newClass.name,
                grade: newClass.grade,
            });
            continue;
        }

        // Check overall grade change
        if (typeof newClass.grade === 'number' && typeof oldClass.grade === 'number') {
            const diff = Math.abs(newClass.grade - oldClass.grade);
            if (diff > 0.01) {
                changes.push({
                    type: 'grade_changed',
                    className: newClass.name,
                    oldGrade: oldClass.grade,
                    newGrade: newClass.grade,
                });
            }
        }

        // Check individual assignments
        const newAssignments = newClass.assignments || [];
        const oldAssignments = oldClass.assignments || [];

        for (const newAsgn of newAssignments) {
            const oldAsgn = oldAssignments.find(a =>
                a.name === newAsgn.name && a.date === newAsgn.date
            );

            if (!oldAsgn) {
                changes.push({
                    type: 'new_assignment',
                    className: newClass.name,
                    assignmentName: newAsgn.name,
                    score: newAsgn.score,
                    total: newAsgn.total,
                });
            } else if (oldAsgn.score !== newAsgn.score || oldAsgn.total !== newAsgn.total) {
                changes.push({
                    type: 'score_changed',
                    className: newClass.name,
                    assignmentName: newAsgn.name,
                    oldScore: oldAsgn.score,
                    newScore: newAsgn.score,
                    total: newAsgn.total,
                });
            }
        }
    }

    return changes;
};

// ── Snapshot Management ───────────────────────────────────────

/**
 * Save current grades as the "previous" snapshot before syncing new ones.
 */
export const saveGradeSnapshot = async () => {
    try {
        const currentRaw = await AsyncStorage.getItem('studentVueGrades');
        if (currentRaw) {
            await AsyncStorage.setItem(PREV_GRADES_KEY, currentRaw);
        }
    } catch (err) {
        console.error('saveGradeSnapshot error:', err);
    }
};

/**
 * After syncing new grades, diff against previous snapshot.
 * Returns the list of changes and saves them for UI display.
 */
export const checkForGradeChanges = async () => {
    try {
        const prevRaw = await AsyncStorage.getItem(PREV_GRADES_KEY);
        const currentRaw = await AsyncStorage.getItem('studentVueGrades');

        if (!prevRaw || !currentRaw) return [];

        const prevClasses = JSON.parse(prevRaw);
        const currentClasses = JSON.parse(currentRaw);

        const changes = diffGrades(prevClasses, currentClasses);

        if (changes.length > 0) {
            await AsyncStorage.setItem(GRADE_CHANGES_KEY, JSON.stringify({
                changes,
                detectedAt: Date.now(),
            }));
        }

        return changes;
    } catch (err) {
        console.error('checkForGradeChanges error:', err);
        return [];
    }
};

/**
 * Get recent grade changes for UI display (badges, banners).
 * Returns { changes, detectedAt } or null.
 */
export const getRecentGradeChanges = async () => {
    try {
        const raw = await AsyncStorage.getItem(GRADE_CHANGES_KEY);
        if (!raw) return null;

        const data = JSON.parse(raw);

        // Only show changes from the last 24 hours
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (Date.now() - data.detectedAt > oneDayMs) {
            await AsyncStorage.removeItem(GRADE_CHANGES_KEY);
            return null;
        }

        return data;
    } catch {
        return null;
    }
};

/**
 * Clear the recent grade changes (user has seen them).
 */
export const dismissGradeChanges = async () => {
    await AsyncStorage.removeItem(GRADE_CHANGES_KEY);
};

/**
 * Check if a specific assignment has changed.
 * Used by GradebookScreen to show per-item badges.
 */
export const isAssignmentNew = (changes, className, assignmentName) => {
    if (!changes || !changes.length) return false;
    return changes.some(c =>
        (c.type === 'new_assignment' || c.type === 'score_changed') &&
        c.className === className &&
        c.assignmentName === assignmentName
    );
};

/**
 * Check if a class grade has changed.
 */
export const isClassGradeChanged = (changes, className) => {
    if (!changes || !changes.length) return false;
    return changes.some(c =>
        (c.type === 'grade_changed' || c.type === 'new_class') &&
        c.className === className
    );
};

// ── Notification Settings ─────────────────────────────────────

export const isNotificationsEnabled = async () => {
    try {
        const val = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
        return val === 'true';
    } catch {
        return false;
    }
};

export const setNotificationsEnabled = async (enabled) => {
    await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? 'true' : 'false');
};

// ── Background Check (called by background fetch task) ────────

/**
 * Perform a background grade check.
 * This is called by the background fetch task in App.js.
 * Returns true if new grades were found.
 */
export const backgroundGradeCheck = async () => {
    try {
        const enabled = await isNotificationsEnabled();
        if (!enabled) return false;

        // Load StudentVUE credentials from secure storage
        const svUsername = await getSecureItem('svUsername');
        const svPassword = await getSecureItem('svPassword');
        const svDistrictUrl = await AsyncStorage.getItem('svDistrictUrl');

        if (!svUsername || !svPassword || !svDistrictUrl) return false;

        // Save snapshot before sync
        await saveGradeSnapshot();

        // Dynamically import to avoid circular deps
        // The actual sync would need to be called here
        // For now, we rely on the manual refresh with diff approach
        // since background fetch on mobile requires careful handling

        const changes = await checkForGradeChanges();

        if (changes.length > 0) {
            // Fire local notification
            await sendGradeNotification(changes);
            return true;
        }

        return false;
    } catch (err) {
        console.error('backgroundGradeCheck error:', err);
        return false;
    }
};

/**
 * Send a local notification about grade changes.
 * Uses expo-notifications if available.
 */
const sendGradeNotification = async (changes) => {
    try {
        // Dynamically import expo-notifications (may not be installed yet)
        const Notifications = require('expo-notifications');

        const newGrades = changes.filter(c => c.type === 'new_assignment');
        const changedGrades = changes.filter(c => c.type === 'score_changed');
        const gradeChanges = changes.filter(c => c.type === 'grade_changed');

        let title = 'Grade Update';
        let body = '';

        if (newGrades.length > 0) {
            const first = newGrades[0];
            title = 'New Grade Posted';
            body = `${first.className}: ${first.assignmentName}`;
            if (first.score != null && first.total != null) {
                body += ` - ${first.score}/${first.total}`;
            }
            if (newGrades.length > 1) {
                body += ` (+${newGrades.length - 1} more)`;
            }
        } else if (gradeChanges.length > 0) {
            const first = gradeChanges[0];
            title = 'Grade Changed';
            body = `${first.className}: ${first.oldGrade?.toFixed(1)}% -> ${first.newGrade?.toFixed(1)}%`;
        } else if (changedGrades.length > 0) {
            title = 'Score Updated';
            body = `${changedGrades[0].className}: ${changedGrades[0].assignmentName}`;
        }

        await Notifications.scheduleNotificationAsync({
            content: { title, body, data: { screen: 'Gradebook' } },
            trigger: null, // Immediate
        });
    } catch (err) {
        // expo-notifications may not be installed; silently fail
        console.log('Notification not sent (expo-notifications may not be available):', err.message);
    }
};

/**
 * Format a change for display in a banner.
 */
export const formatChangeMessage = (change) => {
    switch (change.type) {
        case 'new_assignment':
            return `New: ${change.assignmentName} in ${change.className}${change.score != null ? ` (${change.score}/${change.total})` : ''}`;
        case 'score_changed':
            return `Updated: ${change.assignmentName} in ${change.className} (${change.oldScore} -> ${change.newScore})`;
        case 'grade_changed':
            return `${change.className}: ${change.oldGrade?.toFixed(1)}% -> ${change.newGrade?.toFixed(1)}%`;
        case 'new_class':
            return `New class added: ${change.className}`;
        default:
            return 'Grade update';
    }
};
