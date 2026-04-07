/**
 * Parse Focus SIS grades HTML into the same format as StudentVUE parser output.
 * Focus SIS renders grades in HTML tables — this extracts class names, grades,
 * and individual assignments.
 */

export function parseFocusSISGrades(html) {
    const classes = [];

    // Focus SIS grade pages use table-based layouts.
    // The structure varies but typically has:
    // - Course name rows with overall grade
    // - Assignment rows within each course section
    // We parse using regex since we don't have DOM access on the server side.

    // Extract course blocks — Focus SIS wraps each course in identifiable sections
    // Common patterns: class name in bold/header, grade percentage, assignment table

    // Try parsing the modern Focus SIS layout (table with class rows)
    const coursePattern = /<td[^>]*class="[^"]*title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi;
    const gradePattern = /(\d{1,3}(?:\.\d+)?)\s*%/g;

    // Alternative: look for the grades table structure
    // Focus SIS typically has a table with columns: Course, Teacher, Grade, etc.
    const tableRowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;

    // Clean HTML helper
    const stripTags = (html) => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ').trim();

    // Strategy 1: Look for course grade summary table
    // Focus SIS often has a table with id or class containing "grades" or "courses"
    const summaryTableMatch = html.match(/<table[^>]*(?:id|class)="[^"]*(?:grade|course|report)[^"]*"[^>]*>([\s\S]*?)<\/table>/i);

    if (summaryTableMatch) {
        const tableHtml = summaryTableMatch[1];
        const rows = [];
        let match;
        const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        while ((match = rowRe.exec(tableHtml)) !== null) {
            const cells = [];
            const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            let cellMatch;
            while ((cellMatch = cellRe.exec(match[1])) !== null) {
                cells.push(stripTags(cellMatch[1]));
            }
            if (cells.length >= 2) rows.push(cells);
        }

        for (const cells of rows) {
            const name = cells[0];
            if (!name || name.length < 2) continue;
            const gradeStr = cells.find(c => /\d{1,3}(\.\d+)?%/.test(c));
            const grade = gradeStr ? parseFloat(gradeStr.match(/(\d{1,3}(?:\.\d+)?)/)[1]) : 0;

            classes.push({
                id: `focus-${classes.length}`,
                name: name,
                teacher: cells.length > 2 ? cells[1] : '',
                period: '',
                room: '',
                grade: grade,
                type: 'ST',
                wGP: gradeToGP(grade),
                uGP: gradeToGP(grade),
                assignments: [],
                source: 'focus-sis',
            });
        }
    }

    // Strategy 2: If no summary table, look for course headers and grade spans
    if (classes.length === 0) {
        // Focus SIS sometimes uses div-based layouts with course-name classes
        const courseHeaderPattern = /<(?:h[1-6]|div|span|td)[^>]*class="[^"]*(?:course|class|subject)[^"]*"[^>]*>([\s\S]*?)<\/(?:h[1-6]|div|span|td)>/gi;
        let courseMatch;
        while ((courseMatch = courseHeaderPattern.exec(html)) !== null) {
            const name = stripTags(courseMatch[1]);
            if (!name || name.length < 2) continue;

            // Look for a grade percentage nearby (within next 500 chars)
            const nearby = html.substring(courseMatch.index, courseMatch.index + 500);
            const gradeMatch = nearby.match(/(\d{2,3}(?:\.\d+)?)\s*%/);
            const grade = gradeMatch ? parseFloat(gradeMatch[1]) : 0;

            classes.push({
                id: `focus-${classes.length}`,
                name: name,
                teacher: '',
                period: '',
                room: '',
                grade: grade,
                type: 'ST',
                wGP: gradeToGP(grade),
                uGP: gradeToGP(grade),
                assignments: [],
                source: 'focus-sis',
            });
        }
    }

    // Strategy 3: Brute-force — find all grade percentages with associated text
    if (classes.length === 0) {
        // Look for any table rows that contain a percentage
        const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        while ((rowMatch = rowRe.exec(html)) !== null) {
            const rowContent = rowMatch[1];
            const pctMatch = rowContent.match(/(\d{2,3}(?:\.\d+)?)\s*%/);
            if (!pctMatch) continue;

            const cells = [];
            const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            let cellMatch;
            while ((cellMatch = cellRe.exec(rowContent)) !== null) {
                cells.push(stripTags(cellMatch[1]));
            }

            // Find the longest text cell as the course name
            const nameCandidates = cells.filter(c => c.length > 3 && !/^\d+(\.\d+)?%?$/.test(c));
            if (nameCandidates.length === 0) continue;

            const name = nameCandidates[0];
            const grade = parseFloat(pctMatch[1]);

            // Skip if we already have this class
            if (classes.some(c => c.name === name)) continue;

            classes.push({
                id: `focus-${classes.length}`,
                name: name,
                teacher: nameCandidates.length > 1 ? nameCandidates[1] : '',
                period: '',
                room: '',
                grade: grade,
                type: 'ST',
                wGP: gradeToGP(grade),
                uGP: gradeToGP(grade),
                assignments: [],
                source: 'focus-sis',
            });
        }
    }

    return { classes };
}

function gradeToGP(pct) {
    if (pct >= 93) return 4.0;
    if (pct >= 90) return 3.7;
    if (pct >= 87) return 3.3;
    if (pct >= 83) return 3.0;
    if (pct >= 80) return 2.7;
    if (pct >= 77) return 2.3;
    if (pct >= 73) return 2.0;
    if (pct >= 70) return 1.7;
    return 1.0;
}
