/**
 * aiEngine.js — Option's AI Smart Engine
 *
 * PRO FEATURE: Uses real AI (GPT-4o-mini) via serverless API to generate
 * personalized academic coaching, daily briefings, study plans, and reports.
 *
 * The engine collects student context (tasks, grades, focus data, schedule)
 * and sends it to /api/ai-assistant which calls OpenAI. Includes heuristic
 * fallbacks for offline/error scenarios.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../supabaseClient';
import { getUserId } from './auth';
import { getWeeklyPomodoroData, getStreak, computeFocusScore } from './focusScoreEngine';

// ── API Configuration ───────────────────────────────────────────

const getApiBaseUrl = () => {
  if (Platform.OS === 'web') {
    return window.location.origin;
  }
  // For native, point to your deployed Vercel URL
  return 'https://option-app.vercel.app';
};

/**
 * Call the AI assistant API endpoint
 */
const callAI = async (requestType, studentContext) => {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/ai-assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType, studentContext }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `AI API error: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
};

// ── Helpers ─────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);
const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;

const parseDueDate = (d) => {
  const date = new Date(d);
  if (!d.includes('T')) date.setHours(23, 59, 59, 999);
  return date;
};

const daysFromNow = (dateStr) => {
  if (!dateStr) return Infinity;
  const due = parseDueDate(dateStr);
  return Math.ceil((due.getTime() - Date.now()) / MS_PER_DAY);
};

const dayName = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
};

const shortDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// ── Data Loaders ────────────────────────────────────────────────

const loadTasks = async () => {
  try {
    const userId = await getUserId();
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('due_date', { ascending: true });
    return data || [];
  } catch {
    return [];
  }
};

const loadGrades = async () => {
  try {
    const raw = await AsyncStorage.getItem('studentVueGrades');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const loadWorkingHours = async () => {
  try {
    const raw = await AsyncStorage.getItem('smartScheduleHours');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    0: { start: 15, end: 22 }, 1: { start: 15, end: 22 },
    2: { start: 15, end: 22 }, 3: { start: 15, end: 22 },
    4: { start: 15, end: 22 }, 5: { start: 10, end: 23 },
    6: { start: 10, end: 22 },
  };
};

const loadWorktimes = async () => {
  try {
    const raw = await AsyncStorage.getItem('@option_app_worktimes');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

// ── Priority Calculator ─────────────────────────────────────────

/**
 * Compute a smart priority score for each task (0-100)
 * Considers: due date, importance, urgency, difficulty, estimated time, grade impact
 */
export const computeTaskPriority = (task, grades = []) => {
  const now = Date.now();
  let score = 0;

  // 1. Due date urgency (0-40 pts)
  const days = daysFromNow(task.due_date);
  if (days <= 0) score += 40;        // OVERDUE
  else if (days <= 1) score += 35;   // Due tomorrow
  else if (days <= 2) score += 28;   // 2 days
  else if (days <= 3) score += 22;
  else if (days <= 5) score += 16;
  else if (days <= 7) score += 10;
  else if (days <= 14) score += 5;
  else score += 2;

  // 2. Importance (0-25 pts)
  const imp = task.importance || 5;
  score += (imp / 10) * 25;

  // 3. Urgency (0-15 pts)
  const urg = task.urgency || 5;
  score += (urg / 10) * 15;

  // 4. Task type boost (0-10 pts)
  const title = (task.title || '').toLowerCase();
  if (title.includes('exam') || title.includes('test') || title.includes('final')) score += 10;
  else if (title.includes('project') || title.includes('essay') || title.includes('paper')) score += 8;
  else if (title.includes('quiz')) score += 6;
  else if (title.includes('lab') || title.includes('presentation')) score += 5;
  else score += 2;

  // 5. Grade-aware boost (0-10 pts)
  // If the task is for a class where grade is low, prioritize it
  if (grades.length > 0 && task.title) {
    const matchedClass = grades.find(g => {
      const className = (g.title || g.name || '').toLowerCase();
      return title.includes(className.split(' ')[0]?.toLowerCase());
    });
    if (matchedClass) {
      const grade = parseFloat(matchedClass.grade || matchedClass.pct || 100);
      if (grade < 70) score += 10;
      else if (grade < 80) score += 7;
      else if (grade < 90) score += 3;
    }
  }

  return Math.min(100, Math.round(score));
};

/**
 * Sort tasks by AI-computed priority (returns new sorted array)
 */
export const smartPrioritize = (tasks, grades = []) => {
  return [...tasks]
    .map(t => ({ ...t, _aiPriority: computeTaskPriority(t, grades) }))
    .sort((a, b) => b._aiPriority - a._aiPriority);
};

// ── Daily Briefing Generator ────────────────────────────────────

/**
 * Generate a comprehensive daily briefing
 * Returns: { greeting, summary, todaysPlan, alerts, tips, stats }
 */
export const generateDailyBriefing = async () => {
  const [tasks, grades, pomData, streak, focusResult, worktimes] = await Promise.all([
    loadTasks(),
    loadGrades(),
    getWeeklyPomodoroData(),
    getStreak(),
    computeFocusScore(),
    loadWorktimes(),
  ]);

  const now = new Date();
  const todayStr = today();
  const hour = now.getHours();

  // Categorize tasks
  const incomplete = tasks.filter(t => !t.completed);
  const overdue = incomplete.filter(t => t.due_date && t.due_date < todayStr);
  const dueToday = incomplete.filter(t => t.due_date === todayStr);
  const dueTomorrow = incomplete.filter(t => {
    const d = daysFromNow(t.due_date);
    return d === 1;
  });
  const dueThisWeek = incomplete.filter(t => {
    const d = daysFromNow(t.due_date);
    return d > 1 && d <= 7;
  });

  // Prioritize today's work
  const todaysWork = smartPrioritize([...overdue, ...dueToday, ...dueTomorrow], grades);

  // Scheduled blocks for today
  const todayBlocks = worktimes.filter(w => w.date === todayStr && w.scheduled_start);

  // Build greeting
  let greeting;
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  else greeting = 'Good evening';

  // Build summary text
  const summaryParts = [];
  if (overdue.length > 0) {
    summaryParts.push(`You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''} that need${overdue.length === 1 ? 's' : ''} attention.`);
  }
  if (dueToday.length > 0) {
    summaryParts.push(`${dueToday.length} task${dueToday.length > 1 ? 's are' : ' is'} due today.`);
  }
  if (dueTomorrow.length > 0) {
    summaryParts.push(`${dueTomorrow.length} due tomorrow.`);
  }
  if (dueThisWeek.length > 0) {
    summaryParts.push(`${dueThisWeek.length} more due this week.`);
  }
  if (summaryParts.length === 0) {
    summaryParts.push("You're all caught up! No urgent deadlines.");
  }

  // Build alerts
  const alerts = [];

  if (overdue.length > 0) {
    alerts.push({
      type: 'danger',
      title: 'Overdue Tasks',
      message: overdue.map(t => t.title).join(', '),
      count: overdue.length,
    });
  }

  // Check for grade concerns
  const lowGrades = grades.filter(g => {
    const grade = parseFloat(g.grade || g.pct || 100);
    return grade > 0 && grade < 80;
  });
  if (lowGrades.length > 0) {
    alerts.push({
      type: 'warning',
      title: 'Grades Need Attention',
      message: lowGrades.map(g => `${g.title || g.name}: ${g.grade || g.pct}%`).join(', '),
      count: lowGrades.length,
    });
  }

  // Streak alert
  if (streak.currentStreak >= 3) {
    alerts.push({
      type: 'success',
      title: `${streak.currentStreak}-Day Streak`,
      message: "Keep it going! Complete a focus session today.",
    });
  }

  // Build tips
  const tips = [];

  // Tip based on focus score
  const { score } = focusResult;
  if (score < 40) {
    tips.push("Your focus score is low. Try starting with just one 25-minute Pomodoro session today.");
  } else if (score < 60) {
    tips.push("You're building momentum! Try to complete at least 2 focus sessions today.");
  } else if (score >= 80) {
    tips.push("Excellent focus this week! Keep up the consistency.");
  }

  // Tip based on study balance
  if (pomData.totalMinutes < 60 && incomplete.length > 3) {
    tips.push("You have several tasks but low study time this week. Block out 1-2 hours today to make progress.");
  }

  // Tip based on task types
  const exams = incomplete.filter(t => {
    const title = (t.title || '').toLowerCase();
    return title.includes('exam') || title.includes('test') || title.includes('final');
  });
  if (exams.length > 0) {
    const nearestExam = exams[0];
    const daysLeft = daysFromNow(nearestExam.due_date);
    if (daysLeft <= 3) {
      tips.push(`You have an exam "${nearestExam.title}" in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Use active recall and practice problems.`);
    }
  }

  // Estimate today's workload
  const estimatedMinutes = todaysWork.slice(0, 5).reduce((sum, t) => sum + (t.duration || 45), 0);
  const estimatedHours = (estimatedMinutes / 60).toFixed(1);

  return {
    greeting,
    summary: summaryParts.join(' '),
    todaysPlan: todaysWork.slice(0, 8).map(t => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      priority: t._aiPriority,
      duration: t.duration || 45,
      isOverdue: t.due_date && t.due_date < todayStr,
      daysUntilDue: daysFromNow(t.due_date),
      priorityLabel: t._aiPriority >= 70 ? 'Critical' : t._aiPriority >= 50 ? 'High' : t._aiPriority >= 30 ? 'Medium' : 'Low',
    })),
    alerts,
    tips,
    stats: {
      focusScore: score,
      streak: streak.currentStreak,
      weeklyMinutes: pomData.totalMinutes,
      estimatedWorkToday: `${estimatedHours}h`,
      tasksRemaining: incomplete.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
    },
    scheduledBlocks: todayBlocks.map(b => ({
      title: b.title,
      start: b.scheduled_start,
      end: b.scheduled_end,
      duration: b.duration,
    })),
  };
};

// ── Weekly Report Generator ─────────────────────────────────────

/**
 * Generate a weekly performance report
 * PRO FEATURE
 */
export const generateWeeklyReport = async () => {
  const [tasks, grades, pomData, streak, focusResult] = await Promise.all([
    loadTasks(),
    loadGrades(),
    getWeeklyPomodoroData(),
    getStreak(),
    computeFocusScore(),
  ]);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * MS_PER_DAY);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);

  // Tasks completed this week
  const completedThisWeek = tasks.filter(t =>
    t.completed && t.completed_at && t.completed_at >= weekAgoStr
  );

  // Tasks added this week
  const addedThisWeek = tasks.filter(t =>
    t.created_at && t.created_at >= weekAgoStr
  );

  // On-time completions
  const onTime = completedThisWeek.filter(t => {
    if (!t.due_date || !t.completed_at) return true;
    return t.completed_at.slice(0, 10) <= t.due_date;
  });

  // Study pattern analysis
  const { dailyMinutes, dailyHours } = pomData;
  const daysStudied = dailyMinutes.filter(m => m > 0).length;
  const avgPerStudyDay = daysStudied > 0
    ? Math.round(pomData.totalMinutes / daysStudied)
    : 0;
  const mostProductiveDay = dailyMinutes.indexOf(Math.max(...dailyMinutes));
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Grade changes
  let gradeChanges = [];
  try {
    const prevRaw = await AsyncStorage.getItem('studentVueGradesPrev');
    if (prevRaw) {
      const prev = JSON.parse(prevRaw);
      const prevArr = Array.isArray(prev) ? prev : prev.courses || [];
      const currArr = Array.isArray(grades) ? grades : grades.courses || [];

      for (const curr of currArr) {
        const match = prevArr.find(p => (p.title || p.name) === (curr.title || curr.name));
        if (match) {
          const currGrade = parseFloat(curr.grade || curr.pct || 0);
          const prevGrade = parseFloat(match.grade || match.pct || 0);
          if (currGrade !== prevGrade && prevGrade > 0) {
            gradeChanges.push({
              class: curr.title || curr.name,
              current: currGrade,
              previous: prevGrade,
              change: +(currGrade - prevGrade).toFixed(1),
              direction: currGrade > prevGrade ? 'up' : 'down',
            });
          }
        }
      }
    }
  } catch {}

  // Recommendations
  const recommendations = [];

  if (daysStudied < 4) {
    recommendations.push({
      type: 'consistency',
      title: 'Study More Consistently',
      message: `You only studied ${daysStudied} out of 7 days. Try to study at least 5 days a week, even if some sessions are short.`,
    });
  }

  if (pomData.totalMinutes > 0 && avgPerStudyDay > 180) {
    recommendations.push({
      type: 'balance',
      title: 'Spread Out Study Sessions',
      message: `You averaged ${avgPerStudyDay} min on study days. Try shorter, more frequent sessions for better retention.`,
    });
  }

  const declining = gradeChanges.filter(g => g.direction === 'down' && Math.abs(g.change) >= 2);
  if (declining.length > 0) {
    recommendations.push({
      type: 'grades',
      title: 'Focus on Declining Grades',
      message: `${declining.map(g => g.class).join(', ')} dropped this week. Schedule extra study time for ${declining.length === 1 ? 'this class' : 'these classes'}.`,
    });
  }

  const onTimeRate = completedThisWeek.length > 0
    ? Math.round((onTime.length / completedThisWeek.length) * 100)
    : 100;

  if (onTimeRate < 80) {
    recommendations.push({
      type: 'deadlines',
      title: 'Improve Deadline Adherence',
      message: `Only ${onTimeRate}% of tasks were completed on time. Try starting tasks earlier — aim for 2 days before the deadline.`,
    });
  }

  // Overall assessment
  const { score } = focusResult;
  let assessment;
  if (score >= 80) assessment = "Excellent week! You're performing at a high level. Keep this up.";
  else if (score >= 60) assessment = "Good week overall. A few areas to improve, but you're on track.";
  else if (score >= 40) assessment = "Room for improvement. Focus on consistency and starting tasks earlier.";
  else assessment = "Tough week. Don't get discouraged — small daily habits add up. Start with one focus session today.";

  return {
    period: `${shortDate(weekAgoStr)} - ${shortDate(today())}`,
    assessment,
    stats: {
      focusScore: score,
      streak: streak.currentStreak,
      totalStudyMinutes: pomData.totalMinutes,
      totalStudyHours: +(pomData.totalMinutes / 60).toFixed(1),
      daysStudied,
      avgMinutesPerStudyDay: avgPerStudyDay,
      mostProductiveDay: dayNames[mostProductiveDay],
      tasksCompleted: completedThisWeek.length,
      tasksAdded: addedThisWeek.length,
      onTimeRate,
    },
    studyPattern: {
      dailyMinutes,
      dailyHours,
      dayNames,
    },
    gradeChanges,
    recommendations,
  };
};

// ── Smart Auto-Reschedule ───────────────────────────────────────

/**
 * Analyze the current schedule and suggest reschedules
 * Detects conflicts, overloaded days, and missed blocks
 */
export const analyzeAndSuggestReschedule = async () => {
  const [tasks, worktimes, workingHours] = await Promise.all([
    loadTasks(),
    loadWorktimes(),
    loadWorkingHours(),
  ]);

  const now = new Date();
  const todayStr = today();
  const suggestions = [];

  // 1. Find missed/past blocks that weren't completed
  const missedBlocks = worktimes.filter(w => {
    if (!w.scheduled_end) return false;
    const end = new Date(w.scheduled_end);
    return end < now && !w.completed;
  });

  if (missedBlocks.length > 0) {
    suggestions.push({
      type: 'reschedule_missed',
      priority: 'high',
      title: `${missedBlocks.length} Missed Study Block${missedBlocks.length > 1 ? 's' : ''}`,
      message: `You missed ${missedBlocks.length} scheduled block${missedBlocks.length > 1 ? 's' : ''}. Want me to reschedule them?`,
      action: 'reschedule_missed',
      blocks: missedBlocks.map(b => ({
        title: b.title,
        duration: b.duration,
        parentTaskId: b.parent_task_id,
      })),
    });
  }

  // 2. Check for overloaded days (too many hours)
  const futureBlocks = worktimes.filter(w =>
    w.date && w.date >= todayStr && w.scheduled_start
  );

  const dayLoads = {};
  futureBlocks.forEach(b => {
    if (!dayLoads[b.date]) dayLoads[b.date] = 0;
    dayLoads[b.date] += (b.duration || 45);
  });

  for (const [day, minutes] of Object.entries(dayLoads)) {
    if (minutes > 360) { // More than 6 hours
      suggestions.push({
        type: 'overloaded_day',
        priority: 'medium',
        title: `Heavy Day: ${shortDate(day)}`,
        message: `${(minutes / 60).toFixed(1)} hours of study scheduled on ${shortDate(day)}. Consider moving some blocks to lighter days.`,
        action: 'rebalance_day',
        data: { date: day, minutes },
      });
    }
  }

  // 3. Detect unscheduled high-priority tasks
  const incomplete = tasks.filter(t => !t.completed);
  const scheduledTaskIds = new Set(worktimes.map(w => w.parent_task_id).filter(Boolean));
  const unscheduledImportant = incomplete.filter(t => {
    const days = daysFromNow(t.due_date);
    return !scheduledTaskIds.has(t.id) && days <= 7 && (t.importance >= 7 || days <= 2);
  });

  if (unscheduledImportant.length > 0) {
    suggestions.push({
      type: 'unscheduled_important',
      priority: 'high',
      title: `${unscheduledImportant.length} Important Task${unscheduledImportant.length > 1 ? 's' : ''} Not Scheduled`,
      message: `${unscheduledImportant.map(t => `"${t.title}"`).join(', ')} ${unscheduledImportant.length > 1 ? 'are' : 'is'} due soon but not scheduled yet.`,
      action: 'auto_schedule',
      tasks: unscheduledImportant.map(t => ({ id: t.id, title: t.title, due_date: t.due_date })),
    });
  }

  // 4. Study distribution analysis
  const daysWithStudy = Object.keys(dayLoads).length;
  const totalFutureMinutes = Object.values(dayLoads).reduce((a, b) => a + b, 0);

  if (daysWithStudy > 0 && daysWithStudy <= 2 && totalFutureMinutes > 120) {
    suggestions.push({
      type: 'poor_distribution',
      priority: 'medium',
      title: 'Study Time Concentrated',
      message: `All your study time is packed into ${daysWithStudy} day${daysWithStudy > 1 ? 's' : ''}. Spreading sessions across more days improves retention.`,
      action: 'redistribute',
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

  return suggestions;
};

// ── Grade Impact Predictor ──────────────────────────────────────

/**
 * Predict how completing/not completing tasks could impact grades
 * PRO FEATURE
 */
export const predictGradeImpact = async () => {
  const [tasks, grades] = await Promise.all([loadTasks(), loadGrades()]);

  const incomplete = tasks.filter(t => !t.completed);
  const predictions = [];

  const gradeArr = Array.isArray(grades) ? grades : grades.courses || [];

  for (const cls of gradeArr) {
    const grade = parseFloat(cls.grade || cls.pct || 0);
    if (grade <= 0) continue;

    const className = (cls.title || cls.name || '').toLowerCase();

    // Find tasks that might be for this class
    const classTasks = incomplete.filter(t => {
      const title = (t.title || '').toLowerCase();
      return title.includes(className.split(' ')[0]) ||
        (cls.teacherName && title.includes(cls.teacherName.split(' ').pop()?.toLowerCase()));
    });

    if (classTasks.length > 0) {
      // Simple prediction: each missed major assignment could drop grade 3-5%
      const majorTasks = classTasks.filter(t => {
        const title = (t.title || '').toLowerCase();
        return title.includes('test') || title.includes('exam') ||
          title.includes('project') || title.includes('essay');
      });

      const riskDrop = majorTasks.length * 4 + (classTasks.length - majorTasks.length) * 1.5;

      predictions.push({
        className: cls.title || cls.name,
        currentGrade: grade,
        tasksRemaining: classTasks.length,
        potentialDrop: Math.min(riskDrop, grade - 50),
        predictedGradeIfComplete: Math.min(100, grade + 1),
        predictedGradeIfMissed: Math.max(50, grade - riskDrop),
        risk: riskDrop >= 8 ? 'high' : riskDrop >= 4 ? 'medium' : 'low',
      });
    }
  }

  return predictions.sort((a, b) => b.potentialDrop - a.potentialDrop);
};

// ── Time Block Suggester ────────────────────────────────────────

/**
 * Suggest optimal time blocks for today based on available time and priorities
 */
export const suggestTodayBlocks = async () => {
  const [tasks, worktimes, workingHours] = await Promise.all([
    loadTasks(),
    loadWorktimes(),
    loadWorkingHours(),
  ]);

  const now = new Date();
  const todayStr = today();
  const jsDay = now.getDay();
  const uiDay = jsDay === 0 ? 6 : jsDay - 1;
  const dayConfig = workingHours[uiDay] || { start: 15, end: 22 };

  // Available hours left today
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const availableStart = Math.max(currentHour, dayConfig.start);
  const availableEnd = dayConfig.end;
  const availableMinutes = Math.max(0, (availableEnd - availableStart) * 60);

  if (availableMinutes < 25) {
    return { blocks: [], message: "No study time available today based on your working hours." };
  }

  // Already scheduled blocks today
  const existingBlocks = worktimes.filter(w => w.date === todayStr && w.scheduled_start);
  const existingMinutes = existingBlocks.reduce((sum, b) => sum + (b.duration || 45), 0);

  // Get prioritized incomplete tasks
  const grades = await loadGrades();
  const incomplete = tasks.filter(t => !t.completed);
  const prioritized = smartPrioritize(incomplete, grades);

  // Build suggested blocks
  const blocks = [];
  let minutesUsed = existingMinutes;
  let blockStart = availableStart;

  for (const task of prioritized) {
    if (minutesUsed >= availableMinutes * 0.85) break; // Leave 15% buffer

    const taskDuration = Math.min(task.duration || 45, 90); // Cap at 90 min
    const blockDuration = taskDuration <= 60 ? taskDuration : 50; // Split long tasks

    if (minutesUsed + blockDuration > availableMinutes) continue;

    blocks.push({
      taskId: task.id,
      title: task.title,
      suggestedStart: `${Math.floor(blockStart)}:${String(Math.round((blockStart % 1) * 60)).padStart(2, '0')}`,
      duration: blockDuration,
      priority: task._aiPriority,
      reason: task._aiPriority >= 70 ? 'Due soon, high priority'
        : task._aiPriority >= 50 ? 'Important this week'
        : 'Good to work on',
    });

    blockStart += (blockDuration + 15) / 60; // Add 15 min break
    minutesUsed += blockDuration;

    if (blocks.length >= 6) break; // Max 6 blocks suggested
  }

  return {
    blocks,
    availableMinutes: Math.round(availableMinutes - existingMinutes),
    suggestedMinutes: minutesUsed - existingMinutes,
    message: blocks.length === 0
      ? "No tasks to schedule right now."
      : `Suggested ${blocks.length} study blocks (${Math.round(minutesUsed - existingMinutes)} min total)`,
  };
};

// ══════════════════════════════════════════════════════════════════
// ██  REAL AI-POWERED FUNCTIONS (PRO ONLY)  ██
// ══════════════════════════════════════════════════════════════════

/**
 * Gather all student context into a single object for the AI
 */
const gatherStudentContext = async (extras = {}) => {
  const [tasks, grades, pomData, streak, focusResult, worktimes, workingHours] = await Promise.all([
    loadTasks(),
    loadGrades(),
    getWeeklyPomodoroData(),
    getStreak(),
    computeFocusScore(),
    loadWorktimes(),
    loadWorkingHours(),
  ]);

  const now = new Date();
  const todayStr = today();

  const incomplete = tasks.filter(t => !t.completed);
  const overdue = incomplete.filter(t => t.due_date && t.due_date < todayStr);
  const dueToday = incomplete.filter(t => t.due_date === todayStr);
  const dueSoon = incomplete.filter(t => {
    const d = daysFromNow(t.due_date);
    return d > 0 && d <= 7;
  });
  const completedRecently = tasks.filter(t =>
    t.completed && t.completed_at &&
    (Date.now() - new Date(t.completed_at).getTime()) < 7 * MS_PER_DAY
  );

  // Simplify grades for the AI (strip unnecessary fields)
  const gradeArr = Array.isArray(grades) ? grades : grades.courses || [];
  const simplifiedGrades = gradeArr.map(g => ({
    class: g.title || g.name,
    grade: g.grade || g.pct,
    teacher: g.teacherName,
  })).filter(g => g.grade > 0);

  // Today's scheduled blocks
  const todayBlocks = worktimes.filter(w => w.date === todayStr && w.scheduled_start);

  return {
    currentTime: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    currentDay: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    focusScore: focusResult.score,
    focusBreakdown: focusResult.breakdown,
    streak: streak.currentStreak,
    weeklyStudyMinutes: pomData.totalMinutes,
    weeklyStudyByDay: pomData.dailyHours,
    grades: simplifiedGrades,
    overdueTasks: overdue.map(t => ({ title: t.title, due: t.due_date, duration: t.duration })),
    dueTodayTasks: dueToday.map(t => ({ title: t.title, duration: t.duration, importance: t.importance })),
    upcomingTasks: dueSoon.slice(0, 10).map(t => ({
      title: t.title, due: t.due_date, duration: t.duration,
      importance: t.importance, urgency: t.urgency,
    })),
    completedThisWeek: completedRecently.length,
    totalIncomplete: incomplete.length,
    todayScheduledBlocks: todayBlocks.map(b => ({
      title: b.title, start: b.scheduled_start, end: b.scheduled_end, duration: b.duration,
    })),
    workingHours: workingHours,
    ...extras,
  };
};

/**
 * AI-Powered Daily Briefing
 * Sends student context to GPT-4o-mini and gets a personalized daily plan
 */
export const generateAIDailyBriefing = async () => {
  const context = await gatherStudentContext();
  try {
    const aiData = await callAI('daily_briefing', context);
    return { source: 'ai', ...aiData };
  } catch (err) {
    console.warn('AI briefing failed, using heuristic fallback:', err.message);
    const fallback = await generateDailyBriefing();
    return { source: 'heuristic', ...fallback };
  }
};

/**
 * AI-Powered Weekly Report
 * Generates a detailed performance analysis using AI
 */
export const generateAIWeeklyReport = async () => {
  const context = await gatherStudentContext();
  try {
    const aiData = await callAI('weekly_report', context);
    return { source: 'ai', ...aiData };
  } catch (err) {
    console.warn('AI report failed, using heuristic fallback:', err.message);
    const fallback = await generateWeeklyReport();
    return { source: 'heuristic', ...fallback };
  }
};

/**
 * AI-Powered Study Plan
 * Creates an optimal study schedule for today using AI
 */
export const generateAIStudyPlan = async () => {
  const context = await gatherStudentContext();
  try {
    const aiData = await callAI('study_plan', context);
    return { source: 'ai', ...aiData };
  } catch (err) {
    console.warn('AI study plan failed, using heuristic fallback:', err.message);
    const fallback = await suggestTodayBlocks();
    return { source: 'heuristic', ...fallback };
  }
};

/**
 * AI-Powered Reschedule Suggestions
 */
export const generateAIReschedule = async () => {
  const context = await gatherStudentContext();
  try {
    const aiData = await callAI('reschedule', context);
    return { source: 'ai', ...aiData };
  } catch (err) {
    console.warn('AI reschedule failed, using heuristic fallback:', err.message);
    const fallback = await analyzeAndSuggestReschedule();
    return { source: 'heuristic', suggestions: fallback };
  }
};

/**
 * AI Chat — Ask anything about your academics
 * Takes a user message and responds with personalized advice
 */
export const chatWithAI = async (userMessage) => {
  const context = await gatherStudentContext({ userMessage });
  try {
    const aiData = await callAI('chat', context);
    return { source: 'ai', ...aiData };
  } catch (err) {
    console.warn('AI chat failed:', err.message);
    return {
      source: 'error',
      response: "I couldn't connect to the AI service right now. Please check your connection and try again.",
      suggestions: [],
      relatedTip: null,
    };
  }
};
