/**
 * schedulerAssistant.js
 *
 * Advanced scheduling engine for Option.
 * Uses Eisenhower Priority Matrix, priority scoring, intelligent block splitting,
 * spaced scheduling, calendar slot scoring, and rebalancing to produce
 * sustainable, high-quality study schedules.
 *
 * KEY RULES:
 * 1. All blocks are scheduled AFTER the current date/time (never in the past)
 * 2. All blocks are scheduled BEFORE the task's due date
 * 3. Mandatory 15-minute gaps between ANY two blocks (rest/transition time)
 * 4. Blocks of the same task are spaced across different days when possible
 * 5. Existing Google Calendar events (from any source) are fully respected
 * 6. Daily work caps prevent burnout (max 6 hours deep work per day)
 * 7. Blocks are placed within the user's configured working hours only
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const PLANNING_HORIZON_DAYS = 14;
const MIN_BLOCK_MINUTES = 25;
const MAX_BLOCK_MINUTES = 90;
const IDEAL_BLOCK_MINUTES = 50;
const BUFFER_RATIO = 0.85; // Schedule only 85% of available time
const MAX_DAILY_DEEP_WORK_HOURS = 6;
const BREAK_BETWEEN_BLOCKS_MINUTES = 15; // Mandatory gap between ANY two blocks
const BREAK_BETWEEN_BLOCKS_MS = BREAK_BETWEEN_BLOCKS_MINUTES * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// ─── Eisenhower Quadrant ─────────────────────────────────────────────────────

/**
 * Assigns an Eisenhower quadrant based on urgency and importance (1-10 scale).
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
 * Computes a continuous priority score for a task (0.0 - 1.0).
 */
const computePriorityScore = (task, now, horizonMs) => {
    const impNorm = (task.importance || 5) / 10;
    const urgNorm = (task.urgency || 5) / 10;

    // Due pressure: rises as deadline approaches
    let duePressure = 0;
    if (task.due_date) {
        const due = parseDueDate(task.due_date);
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

// ─── Date Helper ────────────────────────────────────────────────────────────

/**
 * Parse a due_date string into a Date object. Date-only strings are treated
 * as end-of-day (23:59:59).
 */
const parseDueDate = (dueDateStr) => {
    const d = new Date(dueDateStr);
    if (!dueDateStr.includes('T')) {
        d.setHours(23, 59, 59, 999);
    }
    return d;
};

// ─── Block Splitting ─────────────────────────────────────────────────────────

/**
 * Splits a task into work blocks based on duration, difficulty, and quadrant.
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
        target = 50;
    } else if (task.importance >= 7) {
        target = 60;
    } else {
        target = IDEAL_BLOCK_MINUTES;
    }

    const minBlock = task.minBlockSize || MIN_BLOCK_MINUTES;
    const maxBlock = task.maxBlockSize || MAX_BLOCK_MINUTES;
    target = Math.max(minBlock, Math.min(maxBlock, target));

    if (task.canSplit === false) {
        return [Math.min(total, maxBlock)];
    }

    const blocks = [];
    let remaining = total;

    while (remaining > 0) {
        let blockSize = Math.min(target, remaining);
        if (blockSize < minBlock && blocks.length > 0) {
            if (blocks[blocks.length - 1] + blockSize <= maxBlock) {
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
};

// ─── Free Slot Generation ────────────────────────────────────────────────────

/**
 * Generates free time slots from busy periods and working hours.
 * All existing calendar events (from any source) are treated as busy.
 * Adds buffer padding around busy events so blocks don't start immediately
 * after another event ends.
 */
const generateFreeSlots = (windowStart, windowEnd, busyPeriods, workingHours) => {
    const allBlocks = [];

    // Add all existing busy periods with buffer padding
    for (const bp of busyPeriods) {
        const bpStart = new Date(bp.start);
        const bpEnd = new Date(bp.end);
        allBlocks.push({
            start: bpStart,
            // Add buffer AFTER each busy period so we don't schedule right on top of it
            end: new Date(bpEnd.getTime() + BREAK_BETWEEN_BLOCKS_MS),
        });
    }

    // Add non-working-hour blocks for each day in the window
    const dayIterator = new Date(windowStart);
    dayIterator.setHours(0, 0, 0, 0);
    while (dayIterator < windowEnd) {
        const jsDay = dayIterator.getDay(); // 0=Sun, 1=Mon, ...
        const uiDayIndex = jsDay === 0 ? 6 : jsDay - 1;
        const dayConfig = workingHours[uiDayIndex] || { start: 15, end: 22 };

        // Block: midnight to working-start
        const midnight = new Date(dayIterator);
        const morningEnd = new Date(dayIterator);
        morningEnd.setHours(dayConfig.start, 0, 0, 0);
        if (morningEnd > midnight) {
            allBlocks.push({ start: new Date(midnight), end: new Date(morningEnd) });
        }

        // Block: working-end to next-midnight
        const eveningStart = new Date(dayIterator);
        eveningStart.setHours(dayConfig.end, 0, 0, 0);
        const nextMidnight = new Date(dayIterator);
        nextMidnight.setDate(nextMidnight.getDate() + 1);
        nextMidnight.setHours(0, 0, 0, 0);
        if (nextMidnight > eveningStart) {
            allBlocks.push({ start: new Date(eveningStart), end: new Date(nextMidnight) });
        }

        dayIterator.setDate(dayIterator.getDate() + 1);
    }

    // Merge overlapping busy blocks
    allBlocks.sort((a, b) => a.start - b.start);
    const merged = [];
    if (allBlocks.length > 0) {
        let current = { start: new Date(allBlocks[0].start), end: new Date(allBlocks[0].end) };
        for (let i = 1; i < allBlocks.length; i++) {
            const next = allBlocks[i];
            if (next.start <= current.end) {
                current.end = new Date(Math.max(current.end.getTime(), next.end.getTime()));
            } else {
                merged.push(current);
                current = { start: new Date(next.start), end: new Date(next.end) };
            }
        }
        merged.push(current);
    }

    // Invert to free slots
    const freeSlots = [];
    let marker = new Date(windowStart);
    for (const block of merged) {
        if (block.start > marker) {
            const slotDurationMs = block.start.getTime() - marker.getTime();
            // Only include slots large enough to hold at least a minimum block
            if (slotDurationMs >= MIN_BLOCK_MINUTES * MS_PER_MINUTE) {
                freeSlots.push({ start: new Date(marker), end: new Date(block.start) });
            }
        }
        marker = new Date(Math.max(marker.getTime(), block.end.getTime()));
    }
    if (marker < windowEnd) {
        const slotDurationMs = windowEnd.getTime() - marker.getTime();
        if (slotDurationMs >= MIN_BLOCK_MINUTES * MS_PER_MINUTE) {
            freeSlots.push({ start: new Date(marker), end: new Date(windowEnd) });
        }
    }

    return freeSlots;
};

// ─── Daily Load Tracking ─────────────────────────────────────────────────────

class DailyLoadTracker {
    constructor() {
        this.dayLoads = {};
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

// ─── Global Placement Tracker ───────────────────────────────────────────────

/**
 * Tracks ALL placed blocks (across all tasks) so we can enforce gaps between
 * any two blocks, not just blocks of the same task.
 */
class PlacementTracker {
    constructor() {
        this.placements = []; // sorted array of { start: Date, end: Date }
    }

    addPlacement(start, end) {
        this.placements.push({ start: new Date(start), end: new Date(end) });
        this.placements.sort((a, b) => a.start - b.start);
    }

    /**
     * Check if placing a block from `start` to `end` would violate the
     * minimum gap rule with any existing placement.
     */
    wouldViolateGap(start, end) {
        const startMs = start.getTime();
        const endMs = end.getTime();

        for (const p of this.placements) {
            const pStartMs = p.start.getTime();
            const pEndMs = p.end.getTime();

            // Check if the proposed block overlaps with or is too close to an existing one
            // Need BREAK_BETWEEN_BLOCKS_MS gap on both sides
            if (endMs + BREAK_BETWEEN_BLOCKS_MS > pStartMs && startMs < pEndMs + BREAK_BETWEEN_BLOCKS_MS) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get the earliest possible start time after a given time, respecting
     * gaps from all existing placements.
     */
    getEarliestStartAfter(time) {
        let earliest = time.getTime();

        for (const p of this.placements) {
            const pEndWithGap = p.end.getTime() + BREAK_BETWEEN_BLOCKS_MS;
            // If our earliest start falls within or too close to this placement
            if (earliest >= p.start.getTime() - BREAK_BETWEEN_BLOCKS_MS && earliest < pEndWithGap) {
                earliest = pEndWithGap;
            }
        }

        return new Date(earliest);
    }
}

// ─── Spacing Logic ───────────────────────────────────────────────────────────

/**
 * Computes the target gap between blocks of the SAME task.
 * This is for spaced repetition / distributed practice.
 */
const computeTargetGapMs = (task, now) => {
    const numBlocks = task.blocks ? task.blocks.length : 1;

    // If there's a due date and multiple blocks, spread them evenly
    if (task.due_date && numBlocks > 1) {
        const due = parseDueDate(task.due_date);
        const daysUntilDue = Math.max(1, (due.getTime() - now.getTime()) / MS_PER_DAY);
        const spreadGapDays = Math.max(0.8, daysUntilDue / numBlocks);
        return spreadGapDays * MS_PER_DAY;
    }

    let baseGap = 1; // 1 day base
    const importance = task.importance || 5;
    const duration = task.duration || 60;
    const importanceFactor = importance >= 7 ? 1 : 0;
    const longTaskFactor = duration >= 180 ? 1 : 0;

    let deadlinePressure = 0;
    if (task.due_date) {
        const due = parseDueDate(task.due_date);
        const daysUntilDue = (due.getTime() - now.getTime()) / MS_PER_DAY;
        if (daysUntilDue <= 2) deadlinePressure = 1;
        else if (daysUntilDue <= 4) deadlinePressure = 0.5;
    }

    const gapDays = Math.max(0.5, baseGap + importanceFactor + longTaskFactor - deadlinePressure);
    return gapDays * MS_PER_DAY;
};

/**
 * How many days before the due date should we ideally start?
 */
const recommendedStartDaysBeforeDue = (task) => {
    const est = task.duration || 60;
    const imp = task.importance || 5;
    const impFactor = imp >= 7 ? Math.ceil(imp / 3) : 1;
    return Math.ceil(est / 90) + impFactor;
};

// ─── Slot Scoring ────────────────────────────────────────────────────────────

/**
 * Scores a candidate slot for a specific task block.
 * Returns -Infinity if the slot is invalid (too small, past deadline, overloaded).
 */
const scoreSlot = (slot, candidateStart, requiredMs, task, lastBlockEndForTask, now, dailyTracker, placementTracker, userPrefs) => {
    const candidateEnd = new Date(candidateStart.getTime() + requiredMs);

    // HARD CONSTRAINT: Must fit within the slot
    if (candidateEnd.getTime() > slot.end.getTime()) return -Infinity;

    // HARD CONSTRAINT: Must be after current time
    if (candidateStart.getTime() < now.getTime()) return -Infinity;

    // HARD CONSTRAINT: Must be before deadline
    if (task.due_date) {
        const due = parseDueDate(task.due_date);
        if (candidateEnd.getTime() > due.getTime()) return -Infinity;
    }

    // HARD CONSTRAINT: Must respect daily capacity
    const maxDailyMinutes = (userPrefs.maxDailyDeepWorkHours || MAX_DAILY_DEEP_WORK_HOURS) * 60;
    const bufferedMax = maxDailyMinutes * BUFFER_RATIO;
    const blockMinutes = requiredMs / MS_PER_MINUTE;
    const currentDayLoad = dailyTracker.getLoad(candidateStart);
    if (currentDayLoad + blockMinutes > bufferedMax) return -Infinity;

    // HARD CONSTRAINT: Must respect gaps from ALL other placements
    if (placementTracker.wouldViolateGap(candidateStart, candidateEnd)) return -Infinity;

    // ── focusFit: high if hard/important work is in best hours ──
    let focusFit = 0.5;
    const hour = candidateStart.getHours();
    const isHighEnergy = hour >= 9 && hour <= 12;
    const isMidEnergy = (hour >= 14 && hour <= 17);
    const isLowEnergy = hour >= 20;

    if (task.difficulty >= 4 || task.importance >= 7) {
        if (isHighEnergy) focusFit = 1.0;
        else if (isMidEnergy) focusFit = 0.7;
        else if (isLowEnergy) focusFit = 0.2;
    } else if (task.quadrant === 'Q3') {
        if (isLowEnergy) focusFit = 1.0;
        else if (isMidEnergy) focusFit = 0.7;
        else if (isHighEnergy) focusFit = 0.3;
    } else {
        focusFit = 0.6;
    }

    // ── spacingFit: for same-task blocks, prefer spacing across days ──
    let spacingFit = 1.0;
    if (lastBlockEndForTask) {
        const gapMs = candidateStart.getTime() - lastBlockEndForTask.getTime();
        const targetGapMs = computeTargetGapMs(task, now);

        if (gapMs < 2 * MS_PER_HOUR) {
            spacingFit = 0.05; // Way too close (same session)
        } else if (gapMs < targetGapMs * 0.3) {
            spacingFit = 0.15; // Too close
        } else if (gapMs < targetGapMs * 0.7) {
            spacingFit = 0.5; // Acceptable but not ideal
        } else if (gapMs >= targetGapMs * 0.7 && gapMs < targetGapMs * 2) {
            spacingFit = 1.0; // Ideal spacing
        } else {
            spacingFit = 0.6; // Spaced too far
        }

        // Strongly penalize same-day placement for multi-block tasks
        const lastDay = lastBlockEndForTask.toISOString().split('T')[0];
        const candidateDay = candidateStart.toISOString().split('T')[0];
        if (lastDay === candidateDay && task.blocks && task.blocks.length > 1) {
            spacingFit = Math.min(spacingFit, 0.1);
        }
    }

    // ── dueFit: prefer earlier slots to leave buffer before deadline ──
    let dueFit = 0.5;
    if (task.due_date) {
        const due = parseDueDate(task.due_date);
        const timeFromNow = candidateStart.getTime() - now.getTime();
        const totalTime = due.getTime() - now.getTime();
        if (totalTime > 0) {
            dueFit = Math.max(0, 1 - (timeFromNow / totalTime));
        }
    }

    // ── continuityFit: penalize leaving useless slot fragments ──
    const leftoverMs = slot.end.getTime() - candidateEnd.getTime();
    const leftoverMin = leftoverMs / MS_PER_MINUTE;
    let continuityFit = 1.0;
    if (leftoverMin > 0 && leftoverMin < MIN_BLOCK_MINUTES) {
        continuityFit = 0.2;
    }

    // ── overloadPenalty: penalize days approaching their cap ──
    const loadRatio = (currentDayLoad + blockMinutes) / bufferedMax;
    const overloadPenalty = loadRatio > 0.6 ? (loadRatio - 0.6) / 0.4 : 0;

    return (
        0.30 * task.priorityScore +
        0.20 * focusFit +
        0.25 * spacingFit +
        0.15 * dueFit +
        0.05 * continuityFit -
        0.15 * overloadPenalty
    );
};

// ─── Rebalancing ─────────────────────────────────────────────────────────────

/**
 * Post-placement rebalancing: spreads overloaded days to lighter days.
 */
const rebalanceSchedule = (scheduledBlocks, freeSlots, now, dailyTracker, placementTracker, userPrefs) => {
    if (scheduledBlocks.length === 0) return scheduledBlocks;

    const maxDailyMinutes = (userPrefs.maxDailyDeepWorkHours || MAX_DAILY_DEEP_WORK_HOURS) * 60 * BUFFER_RATIO;

    // Find overloaded days
    const dayGroups = {};
    scheduledBlocks.forEach((block, idx) => {
        const day = block.date;
        if (!dayGroups[day]) dayGroups[day] = [];
        dayGroups[day].push({ block, idx });
    });

    for (const [day, blocks] of Object.entries(dayGroups)) {
        const totalMinutes = blocks.reduce((sum, b) => sum + b.block.duration, 0);
        if (totalMinutes <= maxDailyMinutes) continue;

        blocks.sort((a, b) => (a.block._priorityScore || 0) - (b.block._priorityScore || 0));

        let excess = totalMinutes - maxDailyMinutes;
        for (const { block, idx } of blocks) {
            if (excess <= 0) break;

            const blockMs = block.duration * MS_PER_MINUTE;
            for (let i = 0; i < freeSlots.length; i++) {
                const slot = freeSlots[i];
                const slotDay = slot.start.toISOString().split('T')[0];
                if (slotDay === day) continue;
                const slotDuration = slot.end.getTime() - slot.start.getTime();
                if (slotDuration < blockMs) continue;
                const slotDayLoad = dailyTracker.getLoad(slot.start);
                if (slotDayLoad + block.duration > maxDailyMinutes) continue;

                // Check gap constraints
                const newStart = placementTracker.getEarliestStartAfter(slot.start);
                const newEnd = new Date(newStart.getTime() + blockMs);
                if (newEnd.getTime() > slot.end.getTime()) continue;
                if (placementTracker.wouldViolateGap(newStart, newEnd)) continue;

                // Move the block
                scheduledBlocks[idx] = {
                    ...block,
                    scheduled_start: newStart.toISOString(),
                    scheduled_end: newEnd.toISOString(),
                    date: slotDay,
                };

                dailyTracker.addLoad(new Date(day + 'T12:00:00'), -block.duration);
                dailyTracker.addLoad(newStart, block.duration);

                // Update placement tracker
                placementTracker.addPlacement(newStart, newEnd);

                if (newEnd.getTime() + BREAK_BETWEEN_BLOCKS_MS < slot.end.getTime()) {
                    freeSlots[i] = {
                        start: new Date(newEnd.getTime() + BREAK_BETWEEN_BLOCKS_MS),
                        end: slot.end,
                    };
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
 * @param {Array} tasks - All user tasks to potentially schedule
 * @param {Array} busyPeriods - Existing calendar events [{start, end}] from ANY source
 * @param {Object} workingHours - Per-day working hours config { 0: {start, end}, ... }
 * @param {Object} userPrefs - Optional user preferences
 * @returns {Array} Scheduled work block events with scheduled_start/scheduled_end
 */
export const performSmartScheduling = (tasks, busyPeriods, workingHours, userPrefs = {}) => {
    console.log("SMART SCHEDULER: Starting with", tasks.length, "tasks and", busyPeriods.length, "busy periods");

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

    // Window starts from NOW (rounded to next 15-min boundary) — never in the past
    const roundTo15 = 15 * MS_PER_MINUTE;
    const windowStart = new Date(Math.ceil(now.getTime() / roundTo15) * roundTo15);
    const windowEnd = new Date(now.getTime() + horizonMs);

    // ── Step A: Generate free slots (respecting ALL existing events) ──
    let freeSlots = generateFreeSlots(windowStart, windowEnd, busyPeriods, workingHours);

    console.log(`SMART SCHEDULER: Found ${freeSlots.length} free slots in ${PLANNING_HORIZON_DAYS}-day window`);

    // ── Step B: Compute quadrant, priority, and blocks for each task ──
    unscheduledTasks.forEach(task => {
        task.quadrant = eisenhowerQuadrant(task.importance, task.urgency);
        task.priorityScore = computePriorityScore(task, now, horizonMs);
        task.blocks = splitIntoBlocks(task);
    });

    // Sort by priority descending (highest priority scheduled first)
    unscheduledTasks.sort((a, b) => b.priorityScore - a.priorityScore);

    // ── Step C: Initialize trackers ──
    const dailyTracker = new DailyLoadTracker();
    const placementTracker = new PlacementTracker();
    const scheduledBlocks = [];

    // Register existing busy periods in daily load and placement tracker
    for (const bp of busyPeriods) {
        const bpStart = new Date(bp.start);
        const bpEnd = new Date(bp.end);
        const bpDuration = (bpEnd.getTime() - bpStart.getTime()) / MS_PER_MINUTE;
        dailyTracker.addLoad(bpStart, bpDuration);
        placementTracker.addPlacement(bpStart, bpEnd);
    }

    // Track per-task per-day block counts
    const taskDayBlockCount = {};

    // ── Step D: Place blocks into best slots ──
    for (const task of unscheduledTasks) {
        let lastBlockEndForTask = null;
        let blockIndex = 1;
        const totalBlocks = task.blocks.length;
        taskDayBlockCount[task.id] = {};

        // Determine how many blocks of this task we allow per day
        let maxBlocksPerTaskPerDay = 1;
        if (task.due_date) {
            const due = parseDueDate(task.due_date);
            const daysUntilDue = (due.getTime() - now.getTime()) / MS_PER_DAY;
            if (daysUntilDue <= 1) maxBlocksPerTaskPerDay = 4;
            else if (daysUntilDue <= 2) maxBlocksPerTaskPerDay = 3;
            else if (daysUntilDue <= 3) maxBlocksPerTaskPerDay = 2;
        }

        for (const blockDuration of task.blocks) {
            const requiredMs = blockDuration * MS_PER_MINUTE;

            let bestSlotIndex = -1;
            let bestCandidateStart = null;
            let bestScore = -Infinity;

            for (let i = 0; i < freeSlots.length; i++) {
                const slot = freeSlots[i];

                // Skip slots that are entirely in the past
                if (slot.end.getTime() <= now.getTime()) continue;

                // Enforce max blocks per task per day
                const slotDay = slot.start.toISOString().split('T')[0];
                const dayCount = taskDayBlockCount[task.id][slotDay] || 0;
                if (dayCount >= maxBlocksPerTaskPerDay) continue;

                // Find the earliest valid start within this slot
                // It must be after now, and must respect gaps from all placements
                let candidateStart = new Date(Math.max(slot.start.getTime(), now.getTime()));
                candidateStart = placementTracker.getEarliestStartAfter(candidateStart);

                // Check if the block still fits in this slot
                const candidateEnd = new Date(candidateStart.getTime() + requiredMs);
                if (candidateEnd.getTime() > slot.end.getTime()) continue;

                const score = scoreSlot(
                    slot, candidateStart, requiredMs, task,
                    lastBlockEndForTask, now, dailyTracker, placementTracker, userPrefs
                );

                if (score > bestScore) {
                    bestScore = score;
                    bestSlotIndex = i;
                    bestCandidateStart = candidateStart;
                }
            }

            if (bestSlotIndex !== -1 && bestScore > -Infinity && bestCandidateStart) {
                const slot = freeSlots[bestSlotIndex];
                const blockStart = bestCandidateStart;
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
                placementTracker.addPlacement(blockStart, blockEnd);
                lastBlockEndForTask = blockEnd;
                blockIndex++;

                // Track per-task-per-day block count
                const placedDay = blockStart.toISOString().split('T')[0];
                taskDayBlockCount[task.id][placedDay] = (taskDayBlockCount[task.id][placedDay] || 0) + 1;

                // Update free slots: shrink the used slot, adding a gap after the block
                const newSlotStart = new Date(blockEnd.getTime() + BREAK_BETWEEN_BLOCKS_MS);
                if (newSlotStart.getTime() < slot.end.getTime()) {
                    const remainingMs = slot.end.getTime() - newSlotStart.getTime();
                    if (remainingMs >= MIN_BLOCK_MINUTES * MS_PER_MINUTE) {
                        freeSlots[bestSlotIndex] = { start: newSlotStart, end: slot.end };
                    } else {
                        // Remaining fragment is too small, remove slot
                        freeSlots.splice(bestSlotIndex, 1);
                    }
                } else {
                    freeSlots.splice(bestSlotIndex, 1);
                }

                // Also check if there's usable time BEFORE the block in this slot
                if (blockStart.getTime() - BREAK_BETWEEN_BLOCKS_MS > slot.start.getTime()) {
                    const beforeEnd = new Date(blockStart.getTime() - BREAK_BETWEEN_BLOCKS_MS);
                    const beforeMs = beforeEnd.getTime() - slot.start.getTime();
                    if (beforeMs >= MIN_BLOCK_MINUTES * MS_PER_MINUTE) {
                        freeSlots.push({ start: new Date(slot.start), end: beforeEnd });
                        freeSlots.sort((a, b) => a.start - b.start);
                    }
                }
            } else {
                console.log(
                    `SCHEDULER: Could not place block for "${task.title}" (${blockDuration}m) — no valid slot`
                );
            }
        }
    }

    // ── Step E: Rebalance ──
    const rebalanced = rebalanceSchedule(scheduledBlocks, freeSlots, now, dailyTracker, placementTracker, userPrefs);

    console.log(`SMART SCHEDULER: Placed ${rebalanced.length} blocks for ${unscheduledTasks.length} tasks`);

    // Validate: ensure no block is in the past or after its due date
    const validated = rebalanced.filter(block => {
        const start = new Date(block.scheduled_start);
        const end = new Date(block.scheduled_end);

        // Must be in the future
        if (start.getTime() < now.getTime()) {
            console.warn(`SCHEDULER: Removing past block "${block.title}" at ${block.scheduled_start}`);
            return false;
        }

        // Must be before due date of parent task
        const parentTask = unscheduledTasks.find(t => t.id === block.parent_task_id);
        if (parentTask?.due_date) {
            const due = parseDueDate(parentTask.due_date);
            if (end.getTime() > due.getTime()) {
                console.warn(`SCHEDULER: Removing post-deadline block "${block.title}"`);
                return false;
            }
        }

        return true;
    });

    // Clean internal fields before returning
    return validated.map(block => {
        const { _quadrant, _priorityScore, ...clean } = block;
        return clean;
    });
};
