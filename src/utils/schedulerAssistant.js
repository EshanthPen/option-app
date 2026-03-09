/**
 * schedulerAssistant.js
 * 
 * Contains logic for determining the optimal times to schedule tasks 
 * based on Google Calendar busy periods, user working hours, and Eisenhower Priority.
 */

/**
 * Main Auto-Scheduling Algorithm
 * 
 * @param {Array} tasks - Array of task objects from Supabase (needs .urgency, .importance, .duration)
 * @param {Array} busyPeriods - Array of { start: Date, end: Date } from Google Calendar FreeBusy
 * @param {Object} workingHours - e.g. { 0: { start: 15, end: 22 }, ... 6: { start: 10, end: 23 } } (0=Mon...6=Sun)
 * @returns {Array} List of tasks with newly assigned `scheduled_start` and `scheduled_end` (ISO strings)
 */
export const performSmartScheduling = (tasks, busyPeriods, workingHours) => {
    console.log("SMART SCHEDULER: Received", tasks.length, "total tasks");
    // 1. Filter out tasks that are already scheduled or completed
    const unscheduledTasks = tasks.filter(t => {
        const isAssignment = t.type === 'assignment' || !t.type;
        const valid = !t.is_planned && !t.completed && isAssignment;
        if (!valid) {
            console.log("Filtered Out Task:", t.title, "| Planned:", t.is_planned, "| Completed:", t.completed, "| Type:", t.type);
        }
        return valid;
    });
    console.log("SMART SCHEDULER: Unscheduled valid tasks to process:", unscheduledTasks.length);

    // 2. Sort by Eisenhower Matrix Priority
    // Quadrant 1 (Urgent & Important) > Quadrant 2 (Important, Not Urgent) > Quadrant 3 > Quadrant 4
    unscheduledTasks.sort((a, b) => {
        const scoreA = (a.importance * 2) + a.urgency;
        const scoreB = (b.importance * 2) + b.urgency;
        return scoreB - scoreA; // Descending order (Highest score first)
    });

    // 3. Define the scheduling window (Next 7 Days)
    const now = new Date();
    // Start scheduling from the next available block, at least 30 mins from now.
    const scheduleWindowStart = new Date(Math.ceil((now.getTime() + 30 * 60000) / 1800000) * 1800000);
    const scheduleWindowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    // Prepare combined blocked timeline
    // We treat hours outside `workingHours` as implicit "busy" blocks for every single day.
    const allBlocks = [...busyPeriods.map(bp => ({ start: new Date(bp.start), end: new Date(bp.end) }))];

    for (let d = new Date(scheduleWindowStart); d < scheduleWindowEnd; d.setDate(d.getDate() + 1)) {
        // Convert JS getDay (0=Sun, 1=Mon) to our UI day index (0=Mon...6=Sun)
        const jsDay = d.getDay();
        const uiDayIndex = jsDay === 0 ? 6 : jsDay - 1;

        // Fallback safely if workingHours structure is malformed
        const dayConfig = workingHours[uiDayIndex] || { start: 15, end: 22 };

        // Block 1: Midnight to startHour (e.g., Sleep/School)
        const midnight = new Date(d);
        midnight.setHours(0, 0, 0, 0);

        const morningEnd = new Date(d);
        morningEnd.setHours(dayConfig.start, 0, 0, 0);

        if (morningEnd > midnight) {
            allBlocks.push({ start: midnight, end: morningEnd });
        }

        // Block 2: endHour to Midnight (e.g., Sleep)
        const eveningStart = new Date(d);
        eveningStart.setHours(dayConfig.end, 0, 0, 0);

        const nextMidnight = new Date(d);
        nextMidnight.setDate(nextMidnight.getDate() + 1);
        nextMidnight.setHours(0, 0, 0, 0);

        if (nextMidnight > eveningStart) {
            allBlocks.push({ start: eveningStart, end: nextMidnight });
        }
    }

    // Sort blocks chronologically and merge overlapping ones
    allBlocks.sort((a, b) => a.start - b.start);
    const mergedBlocks = [];
    if (allBlocks.length > 0) {
        let currentBlock = allBlocks[0];
        for (let i = 1; i < allBlocks.length; i++) {
            const nextBlock = allBlocks[i];
            if (nextBlock.start <= currentBlock.end) {
                // Overlapping or adjacent, merge them
                currentBlock.end = new Date(Math.max(currentBlock.end, nextBlock.end));
            } else {
                mergedBlocks.push(currentBlock);
                currentBlock = nextBlock;
            }
        }
        mergedBlocks.push(currentBlock);
    }

    // 4. Find gaps and assign times to tasks
    const scheduledTasks = [];
    let currentMarker = new Date(scheduleWindowStart);

    for (const task of unscheduledTasks) {
        const requiredMs = (task.duration || 60) * 60 * 1000;
        let placed = false;

        // Advance marker if it falls inside a merged busy block
        while (!placed && currentMarker < scheduleWindowEnd) {
            let conflict = mergedBlocks.find(b => currentMarker >= b.start && currentMarker < b.end);
            if (conflict) {
                currentMarker = new Date(conflict.end); // Jump to end of conflict
                continue;
            }

            // Check if the gap from currentMarker to the NEXT busy block is large enough
            const nextBlock = mergedBlocks.find(b => b.start > currentMarker);
            const gapEnd = nextBlock ? new Date(nextBlock.start) : scheduleWindowEnd;

            if (gapEnd.getTime() - currentMarker.getTime() >= requiredMs) {
                // We found a gap big enough!
                const taskEnd = new Date(currentMarker.getTime() + requiredMs);

                // Generate a new "worktime" task instead of mutating the assignment
                scheduledTasks.push({
                    title: `Prep: ${task.title}`,
                    type: 'worktime',
                    parent_task_id: task.id,
                    urgency: task.urgency,
                    importance: task.importance,
                    duration: task.duration,
                    user_id: task.user_id,
                    scheduled_start: currentMarker.toISOString(),
                    scheduled_end: taskEnd.toISOString(),
                    date: currentMarker.toISOString().split('T')[0] // For local rendering
                });

                // Move marker forward and inject this task's time as a new busy block natively
                // Note: we could just advance `currentMarker = taskEnd`, but doing this handles edge cases safely
                currentMarker = taskEnd;
                placed = true;
            } else {
                // Gap too small, jump to the end of the blocking block to search again
                currentMarker = new Date(gapEnd);
            }
        }
    }

    return scheduledTasks;
};
