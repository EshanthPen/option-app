import { Alert } from 'react-native';

/**
 * Fetches the user's busy periods from their primary Google Calendar.
 * 
 * @param {string} accessToken Complete OAuth access token
 * @param {Date} timeMin Start of the search window
 * @param {Date} timeMax End of the search window
 * @returns {Promise<Array>} Array of { start: string, end: string } ISO dates representing busy blocks
 */
export const fetchFreeBusy = async (accessToken, timeMin, timeMax) => {
    if (!accessToken) return [];

    try {
        const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                items: [{ id: 'primary' }]
            }),
        });

        if (!response.ok) {
            console.error("FreeBusy API Error:", await response.text());
            return [];
        }

        const data = await response.json();
        // data.calendars.primary.busy is an array of { start, end } objects
        return data.calendars?.primary?.busy || [];
    } catch (error) {
        console.error("Network Error fetching FreeBusy:", error);
        return [];
    }
};

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
        if (!assignment.due_date) continue;

        // Try parsing the date
        const dueDate = new Date(assignment.due_date);
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
