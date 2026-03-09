import { XMLParser } from 'fast-xml-parser';

export const parseStudentVuePeriods = (xmlString) => {
    try {
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
        const match = xmlString.match(/<ProcessWebServiceRequestResult>(.*?)<\/ProcessWebServiceRequestResult>/s);
        let gradebookXmlString = match ? match[1] : null;
        if (!gradebookXmlString && xmlString.includes('<Gradebook')) gradebookXmlString = xmlString;
        if (!gradebookXmlString) return { periods: [], currentPeriodIndex: 0, currentPeriodName: '' };

        gradebookXmlString = gradebookXmlString.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const innerJson = parser.parse(gradebookXmlString);

        let reportPeriods = innerJson?.Gradebook?.ReportingPeriods?.ReportPeriod || innerJson?.Gradebook?.ReportingPeriods?.ReportingPeriod;
        let periods = [];
        if (reportPeriods) {
            if (!Array.isArray(reportPeriods)) reportPeriods = [reportPeriods];

            const today = new Date();
            let bestIndex = 0;
            let bestName = '';
            let foundCurrent = false;

            periods = reportPeriods.map(p => {
                const idx = parseInt(p['@_Index'] || p['@_GradingPeriodIndex'] || '0');
                const name = p['@_GradePeriod'] || p['@_MarkingPeriod'] || `Period ${idx}`;

                const start = new Date(p['@_StartDate'] || p['@_Start'] || 0);
                const end = new Date(p['@_EndDate'] || p['@_End'] || 0);

                if (start && end && today >= start && today <= end) {
                    bestIndex = idx;
                    bestName = name;
                    foundCurrent = true;
                }

                return { index: idx, name: name };
            });

            if (!foundCurrent && periods.length > 0) {
                // Default to first period if start dates are empty or in the future
                // Wait, typically we want the highest index if dates are missing, or the most recent past date
                let maxIdx = periods[0].index;
                let maxName = periods[0].name;
                periods.forEach(p => {
                    if (p.index > maxIdx) {
                        maxIdx = p.index;
                        maxName = p.name;
                    }
                });
                bestIndex = maxIdx;
                bestName = maxName;
            }

            return { periods, currentPeriodIndex: bestIndex, currentPeriodName: bestName };
        }
        return { periods: [], currentPeriodIndex: 0, currentPeriodName: '' };
    } catch (e) {
        return { periods: [], currentPeriodIndex: 0, currentPeriodName: '' };
    }
};

export const parseStudentVueGradebook = (xmlString) => {
    try {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_"
        });

        const jsonObj = parser.parse(xmlString);

        // The SOAP response wraps the actual XML string inside a Result node.
        // Schools send different SOAP envelopes, so we extract the inner XML string manually.
        const match = xmlString.match(/<ProcessWebServiceRequestResult>(.*?)<\/ProcessWebServiceRequestResult>/s);
        let gradebookXmlString = match ? match[1] : null;

        // Fallback: If the regex didn't catch it, maybe they returned raw XML without SOAP encoding
        if (!gradebookXmlString && xmlString.includes('<Gradebook')) {
            gradebookXmlString = xmlString;
        }

        if (!gradebookXmlString) {
            console.error("Could not find Gradebook raw XML inside response");
            return [];
        }

        // Unescape XML entities that SOAP might have injected (&lt;, &gt;)
        gradebookXmlString = gradebookXmlString.replace(/&lt;/g, '<').replace(/&gt;/g, '>');

        // Parse the inner Gradebook XML explicitly
        const innerJson = parser.parse(gradebookXmlString);

        // Extract Reporting Periods (Quarters/Semesters)
        let xmlPeriods = innerJson?.Gradebook?.ReportingPeriods?.ReportPeriod || innerJson?.Gradebook?.ReportingPeriods?.ReportingPeriod;
        const formattedPeriods = [];
        if (xmlPeriods) {
            if (!Array.isArray(xmlPeriods)) xmlPeriods = [xmlPeriods];
            xmlPeriods.forEach(p => {
                formattedPeriods.push({
                    index: parseInt(p['@_Index']),
                    name: p['@_GradePeriod'] || p['@_MarkingPeriod'] || `Quarter ${p['@_Index']}`,
                    startDate: p['@_StartDate'],
                    endDate: p['@_EndDate']
                });
            });
        }

        let xmlCourses = innerJson?.Gradebook?.Courses?.Course;
        if (!xmlCourses) return { classes: [], periods: formattedPeriods };

        // If taking only 1 class, it might not be an array
        if (!Array.isArray(xmlCourses)) {
            xmlCourses = [xmlCourses];
        }

        const formattedClasses = [];

        xmlCourses.forEach(course => {
            const courseTitle = course['@_Title'] || 'Unknown Class';

            // Check if class is AP (for GPA math)
            const isAP = courseTitle.toUpperCase().includes('AP ');

            // Navigate to Marks to get the current Grade
            let marks = course?.Marks?.Mark;
            let currentGrade = 0;
            let targetMark = null;

            if (marks) {
                const marksList = Array.isArray(marks) ? marks : [marks];

                // Try to find the most "relevant" active term.
                // We prioritize marks that have a score and assignments.
                for (let i = marksList.length - 1; i >= 0; i--) {
                    const m = marksList[i];
                    if (!m) continue;

                    const hasScore = m['@_CalculatedScoreRaw'];
                    const hasAssignments = m.Assignments?.Assignment;
                    const markName = (m['@_MarkName'] || '').toUpperCase();

                    if (hasScore && hasAssignments && !markName.includes('EXAM') && !markName.includes('SEMESTER')) {
                        targetMark = m;
                        break;
                    }
                }

                // Fallback to the last mark if none matched the heuristic
                if (!targetMark && marksList.length > 0) {
                    targetMark = marksList[marksList.length - 1];
                }

                if (targetMark?.['@_CalculatedScoreRaw']) {
                    currentGrade = parseFloat(targetMark['@_CalculatedScoreRaw']);
                }
            }

            // Extract Assignments
            const formattedAssignments = [];

            if (targetMark) {
                let assignments = targetMark?.Assignments?.Assignment;
                if (assignments) {
                    if (!Array.isArray(assignments)) assignments = [assignments];

                    assignments.forEach((asm, index) => {
                        const pointsStr = asm['@_Points']; // e.g., "45.00 / 50.0000"

                        let percentage = 0;
                        let earned = 0;
                        let total = 0;
                        if (pointsStr && pointsStr.includes('/')) {
                            const parts = pointsStr.split('/');
                            earned = parseFloat(parts[0]);
                            total = parseFloat(parts[1]);
                            if (total > 0 && !isNaN(earned)) {
                                percentage = (earned / total) * 100;
                            }
                        }

                        formattedAssignments.push({
                            id: asm['@_GradebookID'] || `${courseTitle}-asm-${index}`,
                            title: asm['@_Measure'] || asm['@_Type'] || 'Assignment',
                            score: earned,
                            total: total,
                            percentage: parseFloat(percentage.toFixed(1)),
                            date: asm['@_Date'] || '',
                            category: asm['@_Type'] || 'Other'
                        });
                    });
                }
            }

            // Put it all together into the format GradebookScreen expects
            formattedClasses.push({
                id: course['@_ClassID'] || courseTitle,
                name: courseTitle,
                grade: currentGrade,
                period: course['@_Period'] || '',
                teacher: course['@_Staff'] || '',
                room: course['@_Room'] || '',
                type: isAP ? 'AP' : (courseTitle.includes(' HN') ? 'HN' : 'ST'),
                assignments: formattedAssignments
            });
        });

        return { classes: formattedClasses, periods: formattedPeriods };

    } catch (err) {
        console.error("Error parsing StudentVUE XML:", err);
        return { classes: [], periods: [] };
    }
};
