import { XMLParser } from 'fast-xml-parser';

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

        let xmlCourses = innerJson?.Gradebook?.Courses?.Course;
        if (!xmlCourses) return [];

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
                // Fallback 1: Highest index with a valid score and non-zero assignments
                // Fallback 2: The last one in the list (this was the original bug, often picking "Final Exam" or S1)
                targetMark = marksList[marksList.length - 1];

                // Heuristic: Pick the mark that actually has assignments, prioritizing later quarters (e.g Q3 over Q2)
                for (let i = marksList.length - 1; i >= 0; i--) {
                    const m = marksList[i];
                    if (!m) continue;

                    const hasScore = m['@_CalculatedScoreRaw'];
                    const hasAssignments = m.Assignments?.Assignment;
                    const markName = (m['@_MarkName'] || '').toUpperCase();

                    // Avoid selecting "Final Exam" or "Semester" averages as the current active grade
                    // if there's a Quarter grade available with assignments.
                    if (hasScore && hasAssignments && !markName.includes('EXAM') && !markName.includes('SEMESTER')) {
                        targetMark = m;
                        break;
                    }
                }

                if (targetMark?.['@_CalculatedScoreRaw']) {
                    currentGrade = parseFloat(targetMark['@_CalculatedScoreRaw']);
                }
            }

            // Extract Assignments
            const formattedAssignments = [];

            // Navigate to assignments (Marks -> Mark -> Assignments -> Assignment)
            // Due to how schools configure it, assignments might be inside specific Marks.
            // Let's only aggregate assignments from the specific TargetMark to ensure we only show active ones
            let activeMarks = targetMark ? [targetMark] : [];

            activeMarks.forEach(m => {
                if (!m) return;
                let assignments = m?.Assignments?.Assignment;
                if (!assignments) return;

                if (!Array.isArray(assignments)) assignments = [assignments];

                assignments.forEach((asm, index) => {
                    const pointsStr = asm['@_Points']; // e.g., "45.00 / 50.0000"

                    let percentage = 0;
                    if (pointsStr && pointsStr.includes('/')) {
                        const parts = pointsStr.split('/');
                        const earned = parseFloat(parts[0]);
                        const pos = parseFloat(parts[1]);
                        if (pos > 0 && !isNaN(earned)) {
                            percentage = (earned / pos) * 100;
                        }
                    }

                    formattedAssignments.push({
                        id: asm['@_GradebookID'] || `${courseTitle}-asm-${index}`,
                        title: asm['@_Measure'] || asm['@_Type'] || 'Assignment',
                        score: parseFloat(percentage.toFixed(1)),
                        // StudentVUE doesn't immediately expose assignment weights unless requested deeply.
                        // Defaulting to 10 for the mock UI to function.
                        weight: 10
                    });
                });
            });

            // Put it all together into the format GradebookScreen expects
            formattedClasses.push({
                id: course['@_ClassID'] || courseTitle,
                name: courseTitle,
                grade: currentGrade,
                credits: 1.0,
                isAP: isAP,
                assignments: formattedAssignments
            });
        });

        return formattedClasses;

    } catch (err) {
        console.error("Error parsing StudentVUE XML:", err);
        return [];
    }
};
