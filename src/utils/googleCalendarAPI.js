import { Alert } from 'react-native';

/**
 * Creates an event on the user's primary Google Calendar.
 * 
 * @param {string} accessToken Complete OAuth access token for Google API
 * @param {object} eventDetails Object containing summary, description, start/end dates
 * @returns {Promise<boolean>} Success status
 */
export const createGoogleCalendarEvent = async (accessToken, eventDetails) => {
    if (!accessToken) {
        console.warn("No access token provided to createGoogleCalendarEvent");
        return false;
    }

    try {
        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(eventDetails),
        });

        if (res.ok) {
            return true;
        } else {
            console.error("Google Calendar API Error:", await res.text());
            return false;
        }
    } catch (error) {
        console.error("Network Error reaching Google:", error);
        return false;
    }
};

/**
 * Syncs a list of StudentVUE assignments to Google Calendar as all-day events.
 * 
 * @param {string} accessToken Complete OAuth access token for Google API
 * @param {Array} assignments Array of assignment objects (needs .title, .date, .courseName, etc)
 * @returns {Promise<number>} Number of events successfully created
 */
export const syncAssignmentsToCalendar = async (accessToken, assignments) => {
    if (!accessToken || !assignments || assignments.length === 0) return 0;

    let successCount = 0;

    // Process sequentially to avoid rate limiting
    for (const assignment of assignments) {
        // Skip assignments without a date
        if (!assignment.isoDate) continue;

        // Try parsing the date
        const dueDate = new Date(assignment.isoDate);
        if (isNaN(dueDate)) continue;

        // Make it an all-day event for the due date
        // API requires yyyy-mm-dd format for all-day events
        const dateString = dueDate.toISOString().split('T')[0];

        const event = {
            summary: `Due: ${assignment.title} (${assignment.courseName || 'Assignment'})`,
            description: `Type: ${assignment.type}\nCategory: ${assignment.category}\n\nSynced automatically by Option.`,
            start: {
                date: dateString,
                timeZone: 'America/New_York', // Could make this dynamic later
            },
            end: {
                date: dateString,
                timeZone: 'America/New_York',
            },
        };

        const success = await createGoogleCalendarEvent(accessToken, event);
        if (success) successCount++;
    }

    return successCount;
};
