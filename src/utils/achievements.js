import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@option_achievements';

// ---------------------------------------------------------------------------
// 1. Achievement definitions
// ---------------------------------------------------------------------------

export const ACHIEVEMENTS = {
  // ---- Focus ----
  first_focus: {
    id: 'first_focus',
    title: 'First Focus',
    description: 'Complete your first pomodoro session',
    icon: '\u{1F345}',
    category: 'Focus',
    requirement: 1,
    stat: 'totalPomodoros',
  },
  focus_warrior: {
    id: 'focus_warrior',
    title: 'Focus Warrior',
    description: 'Complete 50 pomodoro sessions',
    icon: '\u{2694}\uFE0F',
    category: 'Focus',
    requirement: 50,
    stat: 'totalPomodoros',
  },
  focus_master: {
    id: 'focus_master',
    title: 'Focus Master',
    description: 'Complete 200 pomodoro sessions',
    icon: '\u{1F9D8}',
    category: 'Focus',
    requirement: 200,
    stat: 'totalPomodoros',
  },
  marathon_runner: {
    id: 'marathon_runner',
    title: 'Marathon Runner',
    description: 'Focus for 5 hours in a single day',
    icon: '\u{1F3C3}',
    category: 'Focus',
    requirement: 300, // 5 hours = 300 minutes
    stat: 'longestDayMinutes',
  },

  // ---- Grades ----
  honor_roll: {
    id: 'honor_roll',
    title: 'Honor Roll',
    description: 'Achieve a GPA of 3.5 or higher',
    icon: '\u{1F4DC}',
    category: 'Grades',
    requirement: 3.5,
    stat: 'gpa',
  },
  straight_as: {
    id: 'straight_as',
    title: 'Straight As',
    description: 'Get an A in every class',
    icon: '\u{1F31F}',
    category: 'Grades',
    requirement: 1, // boolean: 1 = true
    stat: 'allClassesA',
  },
  grade_climber: {
    id: 'grade_climber',
    title: 'Grade Climber',
    description: 'Improve a grade by 5% or more',
    icon: '\u{1F4C8}',
    category: 'Grades',
    requirement: 5,
    stat: 'gradeImprovement',
  },
  perfect_score: {
    id: 'perfect_score',
    title: 'Perfect Score',
    description: 'Score 100% on any assignment',
    icon: '\u{1F4AF}',
    category: 'Grades',
    requirement: 1, // boolean: 1 = true
    stat: 'perfectScore',
  },

  // ---- Streaks ----
  streak_3: {
    id: 'streak_3',
    title: '3 Day Streak',
    description: 'Use the app 3 days in a row',
    icon: '\u{1F525}',
    category: 'Streaks',
    requirement: 3,
    stat: 'currentStreak',
  },
  streak_7: {
    id: 'streak_7',
    title: '7 Day Streak',
    description: 'Use the app 7 days in a row',
    icon: '\u{1F525}',
    category: 'Streaks',
    requirement: 7,
    stat: 'currentStreak',
  },
  streak_14: {
    id: 'streak_14',
    title: '14 Day Streak',
    description: 'Use the app 14 days in a row',
    icon: '\u{2B50}',
    category: 'Streaks',
    requirement: 14,
    stat: 'currentStreak',
  },
  streak_30: {
    id: 'streak_30',
    title: '30 Day Streak',
    description: 'Use the app 30 days in a row',
    icon: '\u{1F451}',
    category: 'Streaks',
    requirement: 30,
    stat: 'currentStreak',
  },

  // ---- Tasks ----
  task_master: {
    id: 'task_master',
    title: 'Task Master',
    description: 'Complete 10 tasks',
    icon: '\u{2705}',
    category: 'Tasks',
    requirement: 10,
    stat: 'tasksCompleted',
  },
  productivity_pro: {
    id: 'productivity_pro',
    title: 'Productivity Pro',
    description: 'Complete 50 tasks',
    icon: '\u{1F680}',
    category: 'Tasks',
    requirement: 50,
    stat: 'tasksCompleted',
  },
  on_time_king: {
    id: 'on_time_king',
    title: 'On Time King',
    description: 'Complete 10 tasks before their deadline',
    icon: '\u{23F0}',
    category: 'Tasks',
    requirement: 10,
    stat: 'onTimeTasks',
  },
  centurion: {
    id: 'centurion',
    title: 'Centurion',
    description: 'Complete 100 tasks',
    icon: '\u{1F3C6}',
    category: 'Tasks',
    requirement: 100,
    stat: 'tasksCompleted',
  },

  // ---- Social ----
  first_friend: {
    id: 'first_friend',
    title: 'First Friend',
    description: 'Add your first friend',
    icon: '\u{1F91D}',
    category: 'Social',
    requirement: 1,
    stat: 'friendCount',
  },
  popular: {
    id: 'popular',
    title: 'Popular',
    description: 'Add 5 friends',
    icon: '\u{1F389}',
    category: 'Social',
    requirement: 5,
    stat: 'friendCount',
  },
  school_star: {
    id: 'school_star',
    title: 'School Star',
    description: 'Reach the top 3 on your school leaderboard',
    icon: '\u{1FA69}',
    category: 'Social',
    requirement: 3, // rank <= 3
    stat: 'schoolRank',
  },
};

// ---------------------------------------------------------------------------
// 2. Check which achievements are newly unlocked given current stats
// ---------------------------------------------------------------------------

export async function checkAchievements(stats) {
  const alreadyUnlocked = await getUnlockedAchievements();
  const alreadySet = new Set(alreadyUnlocked);
  const newlyUnlocked = [];

  for (const achievement of Object.values(ACHIEVEMENTS)) {
    if (alreadySet.has(achievement.id)) continue;

    const value = stats[achievement.stat];
    if (value === undefined || value === null) continue;

    let earned = false;

    if (achievement.id === 'school_star') {
      // For rank, lower is better: earned when rank <= requirement
      earned = value > 0 && value <= achievement.requirement;
    } else {
      earned = value >= achievement.requirement;
    }

    if (earned) {
      await unlockAchievement(achievement.id);
      newlyUnlocked.push(achievement.id);
    }
  }

  return newlyUnlocked;
}

// ---------------------------------------------------------------------------
// 3. Get all unlocked achievement IDs from storage
// ---------------------------------------------------------------------------

export async function getUnlockedAchievements() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((entry) => entry.id);
  } catch (error) {
    console.error('Failed to load achievements:', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 4. Persist a newly unlocked achievement with timestamp
// ---------------------------------------------------------------------------

export async function unlockAchievement(id) {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : [];

    // Avoid duplicates
    if (existing.some((entry) => entry.id === id)) return;

    existing.push({ id, unlockedAt: new Date().toISOString() });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch (error) {
    console.error('Failed to unlock achievement:', error);
  }
}

// ---------------------------------------------------------------------------
// 5. Get every achievement with its current progress percentage
// ---------------------------------------------------------------------------

export function getAchievementProgress(stats) {
  return Object.values(ACHIEVEMENTS).map((achievement) => {
    const value = stats[achievement.stat];

    let progress = 0;

    if (value !== undefined && value !== null) {
      if (achievement.id === 'school_star') {
        // Rank-based: progress is 100% when rank <= requirement, otherwise
        // approximate from a reasonable upper bound (e.g. rank 20 -> 0%).
        if (value > 0 && value <= achievement.requirement) {
          progress = 100;
        } else if (value > 0) {
          // Linear scale from rank 20 down to requirement
          const maxRank = 20;
          progress = Math.max(
            0,
            Math.min(99, ((maxRank - value) / (maxRank - achievement.requirement)) * 100)
          );
        }
      } else {
        progress = Math.min(100, (value / achievement.requirement) * 100);
      }
    }

    return {
      ...achievement,
      currentValue: value ?? 0,
      progress: Math.round(progress),
    };
  });
}
