/**
 * schedulerAssistant.js
 * 
 * Contains logic for determining the optimal times to schedule tasks 
 * based on Eisenhower Priority, block-splitting, spacing constraints, and calendar availability.
 */

// Helper: Compute Advanced Priority Score
const computePriorityScore = (task, now, horizonMs) => {
    // Normalize our 1-10 inputs to standard 0-1
    const impNode = (task.importance || 5) / 10;
    const urgNode = (task.urgency || 5) / 10;

    // Deadline pressure
    let duePress = 0;
    if (task.due_date) {
        // Assume due dates are midnight local time if no time provided, but for safety parse it straight
        const due = new Date(task.due_date).getTime();
        const timeUntil = due - now.getTime();
        // If overriding past due date or massive horizon, clamp it
        duePress = Math.max(0, Math.min(1, 1 - (timeUntil / horizonMs)));
    }

    // Quadrant Boost
    // Q1 (Urgent & Important): U>=7, I>=7
    // Q2 (Important, Not Urgent): U<7, I>=7
    // Q3 (Urgent, Not Important): U>=7, I<7
    // Q4 (Not Urgent, Not Important): U<7, I<7
    let quadBoost = 0.1;
    if (task.urgency >= 7 && task.importance >= 7) quadBoost = 1.0;
    else if (task.urgency < 7 && task.importance >= 7) quadBoost = 0.8;
    else if (task.urgency >= 7 && task.importance < 7) quadBoost = 0.45;

    // Effort Weighting (favor breaking apart larger tasks slightly)
    const effort = Math.min(1, (task.duration || 60) / 300);

    return (0.35 * impNode) + (0.25 * urgNode) + (0.20 * duePress) + (0.10 * effort) + (0.10 * quadBoost);
};

// Helper: Split Tasks into Blocks
const splitIntoBlocks = (durationMinutes, importance) => {
    let total = durationMinutes || 60;
    const blocks = [];

    if (total <= 45) return [total];

    const target = importance >= 7 ? 60 : 45;

    while (total > 0) {
        let block = Math.min(target, total);
        if (block < 25 && blocks.length > 0) {
            // Append tiny remainders to the last block rather than making a standalone 10-minute session
            blocks[blocks.length - 1] += block;
            break;
        }
        blocks.push(block);
        total -= block;
    }
    return blocks;
};

// Helper: Generate pure free capacity slots from busy blocks
const generateFreeSlots = (scheduleWindowStart, scheduleWindowEnd, busyPeriods, workingHours) => {
    const allBlocks = [...busyPeriods.map(bp => ({ start: new Date(bp.start), end: new Date(bp.end) }))];

    for (let d = new Date(scheduleWindowStart); d < scheduleWindowEnd; d.setDate(d.getDate() + 1)) {
        const jsDay = d.getDay();
        const uiDayIndex = jsDay === 0 ? 6 : jsDay - 1;
        const dayConfig = workingHours[uiDayIndex] || { start: 15, end: 22 };

        // Sleep period 1: Midnight to startHour
        const midnight = new Date(d);
        midnight.setHours(0, 0, 0, 0);

        const morningEnd = new Date(d);
        morningEnd.setHours(dayConfig.start, 0, 0, 0);

        if (morningEnd > midnight) {
            allBlocks.push({ start: midnight, end: morningEnd });
        }

        // Sleep period 2: endHour to next Midnight
        const eveningStart = new Date(d);
        eveningStart.setHours(dayConfig.end, 0, 0, 0);

        const nextMidnight = new Date(d);
        nextMidnight.setDate(nextMidnight.getDate() + 1);
        nextMidnight.setHours(0, 0, 0, 0);

        if (nextMidnight > eveningStart) {
            allBlocks.push({ start: eveningStart, end: nextMidnight });
        }
    }

    // Merge overlapping blocks securely
    allBlocks.sort((a, b) => a.start - b.start);
    const mergedBlocks = [];
    if (allBlocks.length > 0) {
        let currentBlock = allBlocks[0];
        for (let i = 1; i < allBlocks.length; i++) {
            const nextBlock = allBlocks[i];
            if (nextBlock.start <= currentBlock.end) {
                currentBlock.end = new Date(Math.max(currentBlock.end, nextBlock.end));
            } else {
                mergedBlocks.push(currentBlock);
                currentBlock = nextBlock;
            }
        }
        mergedBlocks.push(currentBlock);
    }

    // Now invert merged busy blocks to create `freeSlots` array
    const freeSlots = [];
    let currentMarker = new Date(scheduleWindowStart);

    for (const bBlock of mergedBlocks) {
        if (bBlock.start > currentMarker) {
            freeSlots.push({ start: currentMarker, end: new Date(bBlock.start) });
        }
        currentMarker = new Date(Math.max(currentMarker.getTime(), bBlock.end.getTime()));
    }

    if (currentMarker < scheduleWindowEnd) {
        freeSlots.push({ start: currentMarker, end: new Date(scheduleWindowEnd) });
    }

    return freeSlots;
};

// Helper: Score a candidate free slot for a specific block
const scoreSlot = (slot, requiredMs, task, lastBlockEnd, now) => {
    const slotDurationMs = slot.end.getTime() - slot.start.getTime();
    if (slotDurationMs < requiredMs) return -1; // Block doesn't fit

    let dueFit = 1;
    if (task.due_date) {
        // Force the check against midnight of the due date in local bounds
        const rawDate = new Date(task.due_date);
        const taskDue = new Date(rawDate.getTime() + Math.abs(rawDate.getTimezoneOffset() * 60000));
        taskDue.setHours(23, 59, 59, 999); // Due by end of that day

        if (slot.end.getTime() > taskDue.getTime()) return -1; // Slot happens after deadline!

        const timeFromNow = slot.start.getTime() - now.getTime();
        const totalTime = taskDue.getTime() - now.getTime();
        dueFit = Math.max(0, 1 - (timeFromNow / totalTime));
    }

    let spacingFit = 1;
    if (lastBlockEnd) {
        const hoursSinceLast = (slot.start.getTime() - lastBlockEnd.getTime()) / 3600000;

        if (task.importance >= 7) {
            // For Q2/Important, spacing by a day is highly valued, penalty for back-to-back
            if (hoursSinceLast < 12) spacingFit = 0.2;
            else if (hoursSinceLast >= 12 && hoursSinceLast < 48) spacingFit = 1.0;
            else spacingFit = 0.6; // Maybe spaced *too* far apart but acceptable
        } else {
            // Lower importance or urgent tasks can be stacked with a tiny break
            if (hoursSinceLast < 0.5) spacingFit = 0.4; // Still want 30 min breaks
            else spacingFit = 1.0;
        }
    }

    // Continuity Penalty
    const leftoverMin = (slotDurationMs - requiredMs) / 60000;
    let continuityFit = 1;
    if (leftoverMin > 0 && leftoverMin < 25) continuityFit = 0.2; // Leaves useless stranded fragments of <25 mins

    return (0.35 * task.priorityScore) + (0.30 * spacingFit) + (0.20 * dueFit) + (0.15 * continuityFit);
};

/**
 * Main Auto-Scheduling Algorithm with Advanced Blocks & Prioritization
 */
export const performSmartScheduling = (tasks, busyPeriods, workingHours) => {
    console.log("SMART SCHEDULER: Initiating Advanced Algorithm with", tasks.length, "tasks");

    const unscheduledTasks = tasks.filter(t => !t.is_planned && !t.completed && (t.type === 'assignment' || !t.type));

    // Define the scheduling window (14 Days horizon to allow generous spacing)
    const now = new Date();
    const horizonMs = 14 * 24 * 60 * 60 * 1000;
    const scheduleWindowStart = new Date(Math.ceil((now.getTime() + 30 * 60000) / 1800000) * 1800000);
    const scheduleWindowEnd = new Date(now.getTime() + horizonMs);

    // Compute priority and generate blocks
    unscheduledTasks.forEach(task => {
        task.priorityScore = computePriorityScore(task, now, horizonMs);
        task.blocks = splitIntoBlocks(task.duration, task.importance);
    });

    // Sort heavily by priority DESC
    unscheduledTasks.sort((a, b) => b.priorityScore - a.priorityScore);

    // Generate valid free slots timeline
    let freeSlots = generateFreeSlots(scheduleWindowStart, scheduleWindowEnd, busyPeriods, workingHours);

    const scheduledBlockEvents = [];

    // Map each block into the optimal slot
    for (const task of unscheduledTasks) {
        let lastBlockEnd = null;
        let blockIndex = 1;

        for (const blockDuration of task.blocks) {
            const requiredMs = blockDuration * 60000;

            let bestSlotIndex = -1;
            let bestScore = -1;

            for (let i = 0; i < freeSlots.length; i++) {
                const score = scoreSlot(freeSlots[i], requiredMs, task, lastBlockEnd, now);
                if (score > bestScore) {
                    bestScore = score;
                    bestSlotIndex = i;
                }
            }

            if (bestSlotIndex !== -1) {
                const slot = freeSlots[bestSlotIndex];
                const blockStart = new Date(slot.start);
                const blockEnd = new Date(blockStart.getTime() + requiredMs);

                // Create the newly carved out event block
                // Appending part 1/2 if multiple blocks exist
                const suffix = task.blocks.length > 1 ? ` (Part ${blockIndex}/${task.blocks.length})` : '';

                scheduledBlockEvents.push({
                    title: `Prep: ${task.title}${suffix}`,
                    type: 'worktime',
                    parent_task_id: task.id,
                    urgency: task.urgency,
                    importance: task.importance,
                    duration: blockDuration,
                    user_id: task.user_id,
                    scheduled_start: blockStart.toISOString(),
                    scheduled_end: blockEnd.toISOString(),
                    date: blockStart.toISOString().split('T')[0]
                });

                lastBlockEnd = blockEnd;
                blockIndex++;

                // Shrink/split the free slot array
                if (blockEnd.getTime() < slot.end.getTime()) {
                    // Update slot in place to represent the remaining capacity
                    freeSlots[bestSlotIndex] = { start: blockEnd, end: slot.end };
                } else {
                    // The block completely consumed the slot perfectly
                    freeSlots.splice(bestSlotIndex, 1);
                }
            } else {
                console.log(`Failed to find slot for block of task: ${task.title} (${blockDuration}m)`);
            }
        }
    }

    return scheduledBlockEvents;
};
