import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// ── Helpers ──────────────────────────────────────────────────

const isWeb = Platform.OS === 'web';

/**
 * No-op guard for web platform where expo-notifications is unsupported.
 * Returns the fallback value without executing the callback.
 */
const guardWeb = async (fn, fallback = null) => {
  if (isWeb) return fallback;
  return fn();
};

// ── 1. Initialize Notifications ─────────────────────────────

/**
 * Sets up the notification handler, requests permissions, and returns
 * the Expo push token (or null on web / permission denied).
 *
 * Call once at app startup (e.g. in App.js or a root useEffect).
 */
export const initializeNotifications = async () => {
  return guardWeb(async () => {
    // Configure how notifications appear when the app is foregrounded
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Push notification permissions not granted');
      return null;
    }

    // Android requires a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6B35',
      });
    }

    // Get the Expo push token
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      return tokenData.data;
    } catch (err) {
      console.warn('Failed to get push token:', err.message);
      return null;
    }
  });
};

// ── 2. Deadline Reminder ────────────────────────────────────

/**
 * Schedules a local notification 24 hours before a task's due date.
 *
 * @param {string} taskTitle - Name of the assignment / task.
 * @param {Date|string|number} dueDate - The due date (anything `new Date()` accepts).
 * @returns {string|null} Notification identifier, or null if not scheduled.
 */
export const scheduleDeadlineReminder = async (taskTitle, dueDate) => {
  return guardWeb(async () => {
    const due = new Date(dueDate);
    const reminderTime = new Date(due.getTime() - 24 * 60 * 60 * 1000);

    // Don't schedule if the reminder time has already passed
    if (reminderTime <= new Date()) {
      console.log('Deadline reminder not scheduled: reminder time already passed');
      return null;
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Assignment Due Tomorrow',
        body: `${taskTitle} is due tomorrow!`,
        data: { type: 'deadline_reminder', taskTitle },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderTime,
      },
    });

    return id;
  });
};

// ── 3. Grade Change Notification ────────────────────────────

/**
 * Immediately sends a local notification about a grade change.
 *
 * @param {string} className - Name of the class.
 * @param {number} oldGrade - Previous grade percentage.
 * @param {number} newGrade - Updated grade percentage.
 * @returns {string|null} Notification identifier, or null on web.
 */
export const scheduleGradeChangeNotification = async (className, oldGrade, newGrade) => {
  return guardWeb(async () => {
    const improved = newGrade > oldGrade;
    const title = improved ? 'Grade Improved!' : 'Grade Alert';
    const direction = improved ? 'up' : 'down';
    const arrow = improved ? '\u2191' : '\u2193';

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: `${className}: ${oldGrade.toFixed(1)}% ${arrow} ${newGrade.toFixed(1)}% (${direction})`,
        data: { type: 'grade_change', className, oldGrade, newGrade },
        sound: true,
      },
      trigger: null, // Immediate
    });

    return id;
  });
};

// ── 4. Daily Streak Reminder ────────────────────────────────

/**
 * Schedules a recurring notification every day at 6 PM local time
 * reminding the user to keep their focus streak alive.
 *
 * @returns {string|null} Notification identifier.
 */
export const scheduleDailyStreakReminder = async () => {
  return guardWeb(async () => {
    // Cancel any existing streak reminders first to avoid duplicates
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (notif.content.data?.type === 'daily_streak') {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Keep Your Streak!',
        body: "Don't break your streak! Open Option to log a focus session.",
        data: { type: 'daily_streak' },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 18,
        minute: 0,
      },
    });

    return id;
  });
};

// ── 5. Pomodoro Complete ────────────────────────────────────

/**
 * Fires an immediate notification when a Pomodoro session finishes.
 *
 * @returns {string|null} Notification identifier.
 */
export const schedulePomodoroComplete = async () => {
  return guardWeb(async () => {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Pomodoro Complete!',
        body: 'Great work. Take a short break.',
        data: { type: 'pomodoro_complete' },
        sound: true,
      },
      trigger: null, // Immediate
    });

    return id;
  });
};

// ── 6. Weekly Review ────────────────────────────────────────

/**
 * Schedules a recurring notification every Sunday at 10 AM local time
 * prompting the user to review their week.
 *
 * @returns {string|null} Notification identifier.
 */
export const scheduleWeeklyReview = async () => {
  return guardWeb(async () => {
    // Cancel any existing weekly review notifications to avoid duplicates
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (notif.content.data?.type === 'weekly_review') {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Weekly Review',
        body: 'Check your progress and plan your week!',
        data: { type: 'weekly_review' },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1, // Sunday (1 = Sunday in expo-notifications)
        hour: 10,
        minute: 0,
      },
    });

    return id;
  });
};

// ── 7. Cancel All Notifications ─────────────────────────────

/**
 * Cancels every scheduled notification.
 */
export const cancelAllNotifications = async () => {
  return guardWeb(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
  });
};

// ── 8. Permission Status ────────────────────────────────────

/**
 * Returns the current notification permission status.
 *
 * @returns {string} One of: 'granted', 'denied', 'undetermined', or 'unsupported'.
 */
export const getNotificationPermissionStatus = async () => {
  if (isWeb) return 'unsupported';

  const { status } = await Notifications.getPermissionsAsync();
  return status;
};
