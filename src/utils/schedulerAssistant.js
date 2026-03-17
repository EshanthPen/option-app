/**
 * schedulerAssistant.js
 *
 * Advanced scheduling engine for Option.
 * Uses Eisenhower Priority Matrix, priority scoring, intelligent block splitting,
 * spaced scheduling, calendar slot scoring, and rebalancing to produce
 * sustainable, high-quality study schedules.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const PLANNING_HORIZON_DAYS = 14;
const MIN_BLOCK_MINUTES = 25;
const MAX_BLOCK_MINUTES = 90;
const IDEAL_BLOCK_MINUTES = 50;
const BUFFER_RATIO = 0.85; // Schedule only 85% of available time
const Q2_RESERVE_RATIO = 0.30; // Reserve 30% of daily focus for Q2 tasks
const MAX_DAILY_DEEP_WORK_HOURS = 6;
const MIN_GAP_BETWEEN_BLOCKS_MS = 15 * 60 * 1000; // 15 minutes
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// ─── Eisenhower Quadrant ─────────────────────────────────────────────────────

/**
 * Assigns an Eisenhower quadrant based on urgency and importance (1-10 scale).
 * Threshold at 7 for the 1-10 scale (equivalent to 4 on a 1-5 scale).
 */
const eisenhowerQuadrant = (importance, urgency) => {
    const imp = importance || 5;
    const urg = urgency || 5;
    if (urg >= 7 && imp >= 7) return 'Q1'; // Do now
    if (urg < 7 && imp >= 7) return 'Q2';  // Plan deliberately
    if (urg >= 7 && imp < 7) return 'Q3';  // Limit
    return 'Q4'; // Defer or minimize
};

const QUADRANT_BOOST = { Q1: 1.0, Q2: 0.8, Q3: 0.45, Q4: 0.1 };

// ─── Priority Score ──────────────────────────────────────────────────────────

/**
 * Computes a continuous priority score for a task.
 *
 * priorityScore =
 *   0.35 * importanceNormalized +
 *   0.25 * urgencyNormalized +
 *   0.20 * duePressure +
 *   0.10 * effortWeight +
 *   0.10 * quadrantBoost
 */
const computePriorityScore = (task, now, horizonMs) => {
    const impNorm = (task.importance || 5) / 10;
    const urgNorm = (task.urgency || 5) / 10;

    // Due pressure: rises as deadline approaches
    let duePressure = 0;
    if (task.due_date) {
        const due = new Date(task.due_date);
        // Handle date-only strings by treating them as end-of-day local
        if (!task.due_date.includes('T')) {
            due.setHours(23, 59, 59, 999);
        }
        const daysUntilDue = Math.max(0, (due.getTime() - now.getTime()) / MS_PER_DAY);
        const planningHorizon = horizonMs / MS_PER_DAY;
        duePressure = Math.max(0, Math.min(1, 1 - (daysUntilDue / planningHorizon)));
    }

    // Effort weight: slightly favor longer tasks so they start earlier
    const effortWeight = Math.min(1, (task.duration || 60) / 300);

    const quadrant = task.quadrant || eisenhowerQuadrant(task.importance, task.urgency);
    const quadBoost = QUADRANT_BOOST[quadrant] || 0.1;

    return (
        0.35 * impNorm +
        0.25 * urgNorm +
        0.20 * duePressure +
        0.10 * effortWeight +
        0.10 * quadBoost
    );
};

// ─── Block Splitting ─────────────────────────────────────────────────────────

/**
 * Splits a task into work blocks based on duration, difficulty, and quadrant.
 *
 * Rules:
 * - Under 45 min → 1 block
 * - 45-120 min → 2-3 blocks
 * - 2-5 hours → 3-6 blocks
 * - 5+ hours → many blocks over several days
 *
 * Q2 tasks get smaller, more distributed blocks.
 * High difficulty tasks get shorter blocks (cognitive load management).
 */
const splitIntoBlocks = (task) => {
    const total = task.duration || 60;
    const difficulty = task.difficulty || 3;
    const quadrant = task.quadrant || 'Q2';

    // If user provided a sessionLength, use it directly
    if (task.sessionLength && task.sessionLength > 0) {
        const sessionLen = task.sessionLength;
        if (total <= sessionLen) return [total];

        const blocks = [];
        let remaining = total;
        while (remaining > 0) {
            const blockSize = Math.min(sessionLen, remaining);
            // Merge tiny remainders into previous block
            if (blockSize < MIN_BLOCK_MINUTES && blocks.length > 0) {
                if (blocks[blocks.length - 1] + blockSize <= sessionLen + 15) {
                    blocks[blocks.length - 1] += blockSize;
                } else {
                    blocks.push(blockSize);
                }
                break;
            }
            blocks.push(blockSize);
            remaining -= blockSize;
        }
        return blocks;
    }

    if (total <= 45) return [total];

    // Determine target block size based on difficulty and quadrant
    let target;
    if (difficulty >= 4) {
        target = 45; // Shorter blocks for hard tasks
    } else if (quadrant === 'Q2') {
        target = 50; // Q2: more distributed, moderate blocks
    } else if (task.importance >= 7) {
        target = 60;
    } else {
        target = IDEAL_BLOCK_MINUTES;
    }

    // Respect task-level min/max block preferences
    const minBlock = task.minBlockSize || MIN_BLOCK_MINUTES;
    const maxBlock = task.maxBlockSize || MAX_BLOCK_MINUTES;
    target = Math.max(minBlock, Math.min(maxBlock, target));

    // If the task explicitly cannot be split, return as a single block
    if (task.canSplit === false) {
        return [Math.min(total, maxBlock)];
    }

    const blocks = [];
    let remaining = total;

    while (remaining > 0) {
        let blockSize = Math.min(target, remaining);
        // If the remainder is too small to be its own block, merge it
        if (blockSize < minBlock && blocks.length > 0) {
            // Add to previous block if it won't exceed max
            if (blocks[blocks.length - 1] + blockSize <= maxBlock) {
                blocks[blocks.length - 1] += blockSize;
            } else {
                blocks.push(blockSize); // Accept a slightly short block
            }
            break;
        }
        blocks.push(blockSize);
        remaining -= blockSize;
    }

    return blocks;
};

// ─── Spacing Logic ───────────────────────────────────────────────────────────

/**
 * Computes the target gap in days between blocks of the same task.
 *
 * targetGapDays = baseGap + importanceFactor + longTaskFactor - deadlinePressure
 */
const computeTargetGapMs = (task, now) => {
    const importance = task.importance || 5;
    const duration = task.duration || 60;
    const numBlocks = task.blocks ? task.blocks.length : 1;

    // If there's a due date and multiple blocks, spread them evenly
    if (task.due_date && numBlocks > 1) {
        const due = new Date(task.due_date);
        if (!task.due_date.includes('T')) due.setHours(23, 59, 59, 999);
        const daysUntilDue = Math.max(1, (due.getTime() - now.getTime()) / MS_PER_DAY);
        // Spread blocks evenly across available days, with at most 1 block per day
        const spreadGapDays = Math.max(0.8, daysUntilDue / numBlocks);
        return spreadGapDays * MS_PER_DAY;
    }

    let baseGap = 1; // 1 day base
    const importanceFactor = importance >= 7 ? 1 : 0;
    const longTaskFactor = duration >= 180 ? 1 : 0;

    let deadlinePressure = 0;
    if (task.due_date) {
        const due = new Date(task.due_date);
        if (!task.due_date.includes('T')) due.setHours(23, 59, 59, 999);
        const daysUntilDue = (due.getTime() - now.getTime()) / MS_PER_DAY;
        if (daysUntilDue <= 2) deadlinePressure = 1;
        else if (daysUntilDue <= 4) deadlinePressure = 0.5;
    }

    const gapDays = Math.max(0.5, baseGap + importanceFactor + longTaskFactor - deadlinePressure);
    return gapDays * MS_PER_DAY;
};

/**
 * Heuristic: how many days before the due date should we start?
 * recommendedStartDaysBeforeDue = ceil(estimatedMinutes / 90) + importance_factor
 */
const recommendedStartDaysBeforeDue = (task) => {
    const est = task.duration || 60;
    const imp = task.importance || 5;
    const impFactor = imp >= 7 ? Math.ceil(imp / 3) : 1;
    return Math.ceil(est / 90) + impFactor;
};

// ─── Free Slot Generation ────────────────────────────────────────────────────

/**
 * Generates free time slots from busy periods and working hours.
 * Merges all busy blocks, inverts them within the scheduling window,
 * and clips to working hours.
 */
const generateFreeSlots = (windowStart, windowEnd, busyPeriods, workingHours) => {
    // Build all busy blocks: existing calendar events + non-working hours
    const allBlocks = busyPeriods.map(bp => ({
        start: new Date(bp.start),
        end: new Date(bp.end),
    }));

    // Add non-working-hour blocks for each day in the window
    for (let d = new Date(windowStart); d < windowEnd; d.setDate(d.getDate() + 1)) {
        const jsDay = d.getDay(); // 0=Sun, 1=Mon, ...
        // Convert to UI index: 0=Mon, ..., 6=Sun
        const uiDayIndex = jsDay === 0 ? 6 : jsDay - 1;
        const dayConfig = workingHours[uiDayIndex] || { start: 15, end: 22 };

        // Block: midnight to working-start
        const midnight = new Date(d);
        midnight.setHours(0, 0, 0, 0);
        const morningEnd = new Date(d);
        morningEnd.setHours(dayConfig.start, 0, 0, 0);
        if (morningEnd > midnight) {
            allBlocks.push({ start: new Date(midnight), end: new Date(morningEnd) });
        }

        // Block: working-end to next-midnight
        const eveningStart = new Date(d);
        eveningStart.setHours(dayConfig.end, 0, 0, 0);
        const nextMidnight = new Date(d);
        nextMidnight.setDate(nextMidnight.getDate() + 1);
        nextMidnight.setHours(0, 0, 0, 0);
        if (nextMidnight > eveningStart) {
            allBlocks.push({ start: new Date(eveningStart), end: new Date(nextMidnight) });
        }
    }

    // Merge overlapping busy blocks
    allBlocks.sort((a, b) => a.start - b.start);
    const merged = [];
    if (allBlocks.length > 0) {
        let current = { start: allBlocks[0].start, end: allBlocks[0].end };
        for (let i = 1; i < allBlocks.length; i++) {
            const next = allBlocks[i];
            if (next.start <= current.end) {
                current.end = new Date(Math.max(current.end.getTime(), next.end.getTime()));
            } else {
                merged.push(current);
                current = { start: next.start, end: next.end };
            }
        }
        merged.push(current);
    }

    // Invert to free slots
    const freeSlots = [];
    let marker = new Date(windowStart);
    for (const block of merged) {
        if (block.start > marker) {
            freeSlots.push({ start: new Date(marker), end: new Date(block.start) });
        }
        marker = new Date(Math.max(marker.getTime(), block.end.getTime()));
    }
    if (marker < windowEnd) {
        freeSlots.push({ start: new Date(marker), end: new Date(windowEnd) });
    }

    return freeSlots;
};

// ─── Daily Load Tracking ─────────────────────────────────────────────────────

/**
 * Tracks how much work has been placed on each day to enforce daily caps.
 */
class DailyLoadTracker {
    constructor() {
        this.dayLoads = {}; // 'YYYY-MM-DD' -> total minutes scheduled
    }

    getDateKey(date) {
        return date.toISOString().split('T')[0];
    }

    getLoad(date) {
        return this.dayLoads[this.getDateKey(date)] || 0;
    }

    addLoad(date, minutes) {
        const key = this.getDateKey(date);
        this.dayLoads[key] = (this.dayLoads[key] || 0) + minutes;
    }

    getRemainingCapacity(date, maxMinutes) {
        return Math.max(0, maxMinutes - this.getLoad(date));
    }
}

// ─── Slot Scoring ────────────────────────────────────────────────────────────

/**
 * Scores a candidate slot for a specific task block.
 *
 * slotScore =
 *   0.30 * priorityScore
 * + 0.20 * focusFit
 * + 0.20 * spacingFit
 * + 0.15 * dueFit
 * + 0.10 * continuityFit
 * - 0.15 * overloadPenalty
 * - 0.10 * fragmentationPenalty
 */
const scoreSlot = (slot, requiredMs, task, lastBlockEnd, now, dailyTracker, userPrefs) => {
    const slotDurationMs = slot.end.getTime() - slot.start.getTime();

    // Must fit the block
    if (slotDurationMs < requiredMs) return -Infinity;

    // Must be before deadline
    if (task.due_date) {
        const due = new Date(task.due_date);
        if (!task.due_date.includes('T')) due.setHours(23, 59, 59, 999);
        const slotEnd = new Date(slot.start.getTime() + requiredMs);
        if (slotEnd.getTime() > due.getTime()) return -Infinity;
    }

    // Must respect daily capacity
    const maxDailyMinutes = (userPrefs.maxDailyDeepWorkHours || MAX_DAILY_DEEP_WORK_HOURS) * 60;
    const bufferedMax = maxDailyMinutes * BUFFER_RATIO;
    const blockMinutes = requiredMs / MS_PER_MINUTE;
    const currentDayLoad = dailyTracker.getLoad(slot.start);
    if (currentDayLoad + blockMinutes > bufferedMax) return -Infinity;

    // ── focusFit: high if hard/important work is in best hours ──
    let focusFit = 0.5; // neutral
    const hour = slot.start.getHours();
    const isHighEnergy = hour >= 9 && hour <= 12; // morning focus
    const isMidEnergy = (hour >= 14 && hour <= 17); // afternoon
    const isLowEnergy = hour >= 20; // late evening

    if (task.difficulty >= 4 || task.importance >= 7) {
        // Hard/important tasks prefer high-energy windows
        if (isHighEnergy) focusFit = 1.0;
        else if (isMidEnergy) focusFit = 0.7;
        else if (isLowEnergy) focusFit = 0.2;
    } else if (task.quadrant === 'Q3') {
        // Q3 tasks go to lower-energy windows
        if (isLowEnergy) focusFit = 1.0;
        else if (isMidEnergy) focusFit = 0.7;
        else if (isHighEnergy) focusFit = 0.3;
    } else {
        focusFit = 0.6; // Neutral for normal tasks
    }

    // ── spacingFit: high if far enough from previous blocks of same task ──
    let spacingFit = 1.0;
    if (lastBlockEnd) {
        const gapMs = slot.start.getTime() - lastBlockEnd.getTime();
        const targetGapMs = computeTargetGapMs(task, now);

        if (gapMs < MIN_GAP_BETWEEN_BLOCKS_MS) {
            spacingFit = 0.05; // Way too close, basically back-to-back
        } else if (gapMs < targetGapMs * 0.5) {
            spacingFit = 0.2; // Too close
        } else if (gapMs >= targetGapMs * 0.5 && gapMs < targetGapMs) {
            spacingFit = 0.6; // Acceptable but not ideal
        } else if (gapMs >= targetGapMs && gapMs < targetGapMs * 3) {
            spacingFit = 1.0; // Ideal spacing
        } else {
            spacingFit = 0.5; // Spaced too far (losing continuity)
        }

        // Q2 tasks strongly prefer multi-day spacing
        if (task.quadrant === 'Q2' && gapMs < 12 * MS_PER_HOUR) {
            spacingFit = Math.min(spacingFit, 0.15);
        }
    }

    // ── dueFit: prefer earlier slots (leave buffer before deadline) ──
    let dueFit = 0.5;
    if (task.due_date) {
        const due = new Date(task.due_date);
        if (!task.due_date.includes('T')) due.setHours(23, 59, 59, 999);
        const timeFromNow = slot.start.getTime() - now.getTime();
        const totalTime = due.getTime() - now.getTime();
        if (totalTime > 0) {
            // Prefer earlier: higher score for earlier slots
            dueFit = Math.max(0, 1 - (timeFromNow / totalTime));
        }
    }

    // ── continuityFit: penalize leaving useless fragments ──
    const leftoverMs = slotDurationMs - requiredMs;
    const leftoverMin = leftoverMs / MS_PER_MINUTE;
    let continuityFit = 1.0;
    if (leftoverMin > 0 && leftoverMin < MIN_BLOCK_MINUTES) {
        continuityFit = 0.2; // Leaves a fragment too small to use
    }

    // ── overloadPenalty: penalize days with too much work ──
    const loadRatio = (currentDayLoad + blockMinutes) / bufferedMax;
    const overloadPenalty = loadRatio > 0.7 ? (loadRatio - 0.7) / 0.3 : 0;

    // ── fragmentationPenalty: penalize weird tiny gaps ──
    let fragmentationPenalty = 0;
    if (leftoverMin > 0 && leftoverMin < 15) {
        fragmentationPenalty = 0.8; // Very small useless gap
    } else if (leftoverMin >= 15 && leftoverMin < MIN_BLOCK_MINUTES) {
        fragmentationPenalty = 0.4;
    }

    return (
        0.30 * task.priorityScore +
        0.20 * focusFit +
        0.20 * spacingFit +
        0.15 * dueFit +
        0.10 * continuityFit -
        0.15 * overloadPenalty -
        0.10 * fragmentationPenalty
    );
};

// ─── Rebalancing ─────────────────────────────────────────────────────────────

/**
 * Post-placement rebalancing pass.
 * - Spreads overloaded days to lighter days
 * - Moves Q2 tasks earlier if they are clumped
 */
const rebalanceSchedule = (scheduledBlocks, freeSlots, now, dailyTracker, userPrefs) => {
    if (scheduledBlocks.length === 0) return scheduledBlocks;

    const maxDailyMinutes = (userPrefs.maxDailyDeepWorkHours || MAX_DAILY_DEEP_WORK_HOURS) * 60 * BUFFER_RATIO;

    // Find overloaded days
    const dayGroups = {};
    scheduledBlocks.forEach((block, idx) => {
        const day = block.date;
        if (!dayGroups[day]) dayGroups[day] = [];
        dayGroups[day].push({ block, idx });
    });

    // For each overloaded day, try to move lowest-priority blocks to lighter days
    for (const [day, blocks] of Object.entries(dayGroups)) {
        const totalMinutes = blocks.reduce((sum, b) => sum + b.block.duration, 0);
        if (totalMinutes <= maxDailyMinutes) continue;

        // Sort blocks by priority (lowest first — candidates to move)
        blocks.sort((a, b) => (a.block._priorityScore || 0) - (b.block._priorityScore || 0));

        let excess = totalMinutes - maxDailyMinutes;
        for (const { block, idx } of blocks) {
            if (excess <= 0) break;

            // Try to find a lighter day with a free slot
            const blockMs = block.duration * MS_PER_MINUTE;
            for (let i = 0; i < freeSlots.length; i++) {
                const slot = freeSlots[i];
                const slotDay = slot.start.toISOString().split('T')[0];
                if (slotDay === day) continue; // Same day, skip
                const slotDuration = slot.end.getTime() - slot.start.getTime();
                if (slotDuration < blockMs) continue;
                const slotDayLoad = dailyTracker.getLoad(slot.start);
                if (slotDayLoad + block.duration > maxDailyMinutes) continue;

                // Move the block
                const newStart = new Date(slot.start);
                const newEnd = new Date(newStart.getTime() + blockMs);

                // Update the block
                scheduledBlocks[idx] = {
                    ...block,
                    scheduled_start: newStart.toISOString(),
                    scheduled_end: newEnd.toISOString(),
                    date: slotDay,
                };

                // Update daily loads
                dailyTracker.addLoad(new Date(day + 'T12:00:00'), -block.duration);
                dailyTracker.addLoad(slot.start, block.duration);

                // Shrink the free slot
                if (newEnd.getTime() < slot.end.getTime()) {
                    freeSlots[i] = { start: newEnd, end: slot.end };
                } else {
                    freeSlots.splice(i, 1);
                }

                excess -= block.duration;
                break;
            }
        }
    }

    return scheduledBlocks;
};

// ─── Main Scheduling Algorithm ───────────────────────────────────────────────

/**
 * Main auto-scheduling algorithm.
 *
 * Steps:
 * A. Place fixed events (already on calendar as busy periods)
 * B. Generate free slots
 * C. Sort flexible tasks by priority
 * D. Split each task into blocks
 * E. Place each block in the best slot
 * F. Rebalance
 *
 * @param {Array} tasks - All user tasks
 * @param {Array} busyPeriods - Existing Google Calendar busy periods [{start, end}]
 * @param {Object} workingHours - Per-day working hours config
 * @param {Object} userPrefs - Optional user preferences
 * @returns {Array} Scheduled work block events
 */
export const performSmartScheduling = (tasks, busyPeriods, workingHours, userPrefs = {}) => {
    console.log("SMART SCHEDULER: Initiating Advanced Algorithm with", tasks.length, "tasks");

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Filter to unscheduled, incomplete, flexible tasks due today or in the future
    const unscheduledTasks = tasks.filter(
        t => !t.is_planned && !t.completed && (t.type === 'assignment' || !t.type) && !t.isFixedTime
             && (!t.due_date || t.due_date >= todayStr)
    );

    if (unscheduledTasks.length === 0) {
        console.log("SMART SCHEDULER: No tasks to schedule");
        return [];
    }
    const horizonMs = PLANNING_HORIZON_DAYS * MS_PER_DAY;

    // Round start to next 30-minute boundary
    const windowStart = new Date(Math.ceil((now.getTime() + 30 * MS_PER_MINUTE) / (30 * MS_PER_MINUTE)) * (30 * MS_PER_MINUTE));
    const windowEnd = new Date(now.getTime() + horizonMs);

    // ── Step A: Fixed events are already represented in busyPeriods ──

    // ── Step B: Generate free slots ──
    let freeSlots = generateFreeSlots(windowStart, windowEnd, busyPeriods, workingHours);

    // ── Step C: Compute quadrant, priority, and blocks for each task ──
    unscheduledTasks.forEach(task => {
        task.quadrant = eisenhowerQuadrant(task.importance, task.urgency);
        task.priorityScore = computePriorityScore(task, now, horizonMs);
        task.blocks = splitIntoBlocks(task);
    });

    // Sort by priority descending (highest priority scheduled first)
    unscheduledTasks.sort((a, b) => b.priorityScore - a.priorityScore);

    // ── Step D & E: Place blocks into best slots ──
    const dailyTracker = new DailyLoadTracker();
    const scheduledBlocks = [];

    // First pass: existing busy periods contribute to daily load
    for (const bp of busyPeriods) {
        const bpStart = new Date(bp.start);
        const bpDuration = (new Date(bp.end).getTime() - bpStart.getTime()) / MS_PER_MINUTE;
        dailyTracker.addLoad(bpStart, bpDuration);
    }

    // Track how many blocks of each task are placed on each day
    const taskDayBlockCount = {}; // { taskId: { 'YYYY-MM-DD': count } }

    for (const task of unscheduledTasks) {
        let lastBlockEnd = null;
        let blockIndex = 1;
        const totalBlocks = task.blocks.length;
        taskDayBlockCount[task.id] = {};

        // For important/long tasks, check if we should start earlier
        const startDaysBefore = recommendedStartDaysBeforeDue(task);
        let earliestStartMs = now.getTime();
        if (task.due_date) {
            const due = new Date(task.due_date);
            if (!task.due_date.includes('T')) due.setHours(23, 59, 59, 999);
            const idealStart = due.getTime() - (startDaysBefore * MS_PER_DAY);
            earliestStartMs = Math.max(now.getTime(), Math.min(idealStart, now.getTime()));
        }

        // Allow more blocks per day when the due date is very close
        let maxBlocksPerTaskPerDay = 1;
        if (task.due_date) {
            const due = new Date(task.due_date);
            if (!task.due_date.includes('T')) due.setHours(23, 59, 59, 999);
            const daysUntilDue = (due.getTime() - now.getTime()) / MS_PER_DAY;
            if (daysUntilDue <= 1) maxBlocksPerTaskPerDay = 4;
            else if (daysUntilDue <= 2) maxBlocksPerTaskPerDay = 3;
            else if (daysUntilDue <= 3) maxBlocksPerTaskPerDay = 2;
        }

        for (const blockDuration of task.blocks) {
            const requiredMs = blockDuration * MS_PER_MINUTE;

            let bestSlotIndex = -1;
            let bestScore = -Infinity;

            for (let i = 0; i < freeSlots.length; i++) {
                const slot = freeSlots[i];

                // Skip slots before earliest start time
                if (slot.end.getTime() < earliestStartMs) continue;

                // Enforce max blocks per task per day
                const slotDay = slot.start.toISOString().split('T')[0];
                const dayCount = taskDayBlockCount[task.id][slotDay] || 0;
                if (dayCount >= maxBlocksPerTaskPerDay) continue;

                const score = scoreSlot(
                    slot, requiredMs, task, lastBlockEnd, now, dailyTracker, userPrefs
                );

                if (score > bestScore) {
                    bestScore = score;
                    bestSlotIndex = i;
                }
            }

            if (bestSlotIndex !== -1 && bestScore > -Infinity) {
                const slot = freeSlots[bestSlotIndex];
                const blockStart = new Date(slot.start);
                const blockEnd = new Date(blockStart.getTime() + requiredMs);

                const suffix = totalBlocks > 1
                    ? ` (Part ${blockIndex}/${totalBlocks})`
                    : '';

                const scheduledBlock = {
                    title: `Prep: ${task.title}${suffix}`,
                    type: 'worktime',
                    parent_task_id: task.id,
                    urgency: task.urgency,
                    importance: task.importance,
                    duration: blockDuration,
                    user_id: task.user_id,
                    scheduled_start: blockStart.toISOString(),
                    scheduled_end: blockEnd.toISOString(),
                    date: blockStart.toISOString().split('T')[0],
                    _quadrant: task.quadrant,
                    _priorityScore: task.priorityScore,
                };

                scheduledBlocks.push(scheduledBlock);
                dailyTracker.addLoad(blockStart, blockDuration);
                lastBlockEnd = blockEnd;
                blockIndex++;

                // Track per-task-per-day block count
                const placedDay = blockStart.toISOString().split('T')[0];
                taskDayBlockCount[task.id][placedDay] = (taskDayBlockCount[task.id][placedDay] || 0) + 1;

                // Update free slots: shrink or remove the used slot
                if (blockEnd.getTime() < slot.end.getTime()) {
                    freeSlots[bestSlotIndex] = { start: blockEnd, end: slot.end };
                } else {
                    freeSlots.splice(bestSlotIndex, 1);
                }
            } else {
                console.log(
                    `SCHEDULER: Could not place block for "${task.title}" (${blockDuration}m) — no valid slot found`
                );
            }
        }
    }

    // ── Step F: Rebalance ──
    const rebalanced = rebalanceSchedule(scheduledBlocks, freeSlots, now, dailyTracker, userPrefs);

    console.log(`SMART SCHEDULER: Placed ${rebalanced.length} blocks for ${unscheduledTasks.length} tasks`);

    // Clean internal fields before returning
    return rebalanced.map(block => {
        const { _quadrant, _priorityScore, ...clean } = block;
        return clean;
    });
};
