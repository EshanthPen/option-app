import { XMLParser } from 'fast-xml-parser';

// ── Shared helpers ─────────────────────────────────────────────────────────

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

/**
 * Parse a date string that may be in MM/DD/YYYY or YYYY-MM-DD format.
 * `new Date("MM/DD/YYYY")` is non-standard and returns Invalid Date on Safari.
 */
const parseDate = (dateStr) => {
    if (!dateStr) return null;
    // Already valid ISO? (YYYY-MM-DD or full ISO string)
    const iso = new Date(dateStr);
    if (!isNaN(iso.getTime()) && String(dateStr).length >= 8) return iso;
    // MM/DD/YYYY or M/D/YYYY
    const slash = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
        const d = new Date(parseInt(slash[3]), parseInt(slash[1]) - 1, parseInt(slash[2]));
        if (!isNaN(d.getTime())) return d;
    }
    // MM-DD-YYYY
    const dash = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dash) {
        const d = new Date(parseInt(dash[3]), parseInt(dash[1]) - 1, parseInt(dash[2]));
        if (!isNaN(d.getTime())) return d;
    }
    return null;
};

/**
 * Extract the inner Gradebook XML string from a SOAP response.
 * Handles: HTML-encoded content, CDATA wrapping, raw XML, namespaced elements.
 */
const extractInnerXml = (xmlString) => {
    // Match the result element, allowing for attributes (e.g. xsi:type="xsd:string")
    const match = xmlString.match(/<ProcessWebServiceRequestResult[^>]*>([\s\S]*?)<\/ProcessWebServiceRequestResult>/i);
    let inner = match ? match[1].trim() : null;

    if (inner) {
        // Unwrap CDATA section if present
        if (inner.startsWith('<![CDATA[')) {
            inner = inner.slice(9, inner.lastIndexOf(']]>')).trim();
        } else {
            // Decode HTML entities in the prescribed order (&amp; must come last)
            inner = inner
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&');
        }
    }

    // Fallback: raw XML without a SOAP wrapper
    if (!inner && xmlString.includes('<Gradebook')) {
        inner = xmlString;
    }

    return inner || null;
};

// ── parseStudentVuePeriods ─────────────────────────────────────────────────

export const parseStudentVuePeriods = (xmlString) => {
    try {
        const inner = extractInnerXml(xmlString);
        if (!inner) return { periods: [], currentPeriodIndex: 0, currentPeriodName: '' };

        const innerJson = xmlParser.parse(inner);
        const gb = innerJson?.Gradebook;
        if (!gb) return { periods: [], currentPeriodIndex: 0, currentPeriodName: '' };

        // Build the full periods list from the <ReportingPeriods> collection
        let reportPeriods =
            gb.ReportingPeriods?.ReportPeriod ||
            gb.ReportingPeriods?.ReportingPeriod;

        const periods = [];
        if (reportPeriods) {
            if (!Array.isArray(reportPeriods)) reportPeriods = [reportPeriods];
            reportPeriods.forEach(p => {
                const idx = parseInt(p['@_Index'] || p['@_GradingPeriodIndex'] || '0');
                const name = p['@_GradePeriod'] || p['@_MarkingPeriod'] || `Period ${idx}`;
                periods.push({ index: idx, name });
            });
        }

        // ── Current-period detection (3 strategies, most reliable first) ──

        // Strategy 1: Many StudentVUE responses include a single <ReportingPeriod>
        // directly under <Gradebook> (not inside <ReportingPeriods>) that marks
        // the active period — use it directly when present.
        const singlePeriod = gb.ReportingPeriod;
        if (singlePeriod && !Array.isArray(singlePeriod)) {
            const idx = parseInt(singlePeriod['@_Index'] || singlePeriod['@_GradingPeriodIndex'] || '0');
            const name = singlePeriod['@_GradePeriod'] || singlePeriod['@_MarkingPeriod'] || `Period ${idx}`;
            return { periods, currentPeriodIndex: idx, currentPeriodName: name };
        }

        // Strategy 2: Match today's date against each period's start/end range.
        // Uses parseDate() to handle MM/DD/YYYY (Safari-safe).
        if (periods.length > 0) {
            const today = new Date();
            let bestIndex = -1;
            let bestName = '';

            for (let i = 0; i < (Array.isArray(reportPeriods) ? reportPeriods : []).length; i++) {
                const p = (Array.isArray(reportPeriods) ? reportPeriods : [])[i];
                if (!p) continue;
                const start = parseDate(p['@_StartDate'] || p['@_Start']);
                const end = parseDate(p['@_EndDate'] || p['@_End']);
                if (start && end && today >= start && today <= end) {
                    bestIndex = periods[i]?.index ?? -1;
                    bestName = periods[i]?.name ?? '';
                    break;
                }
            }

            if (bestIndex >= 0) {
                return { periods, currentPeriodIndex: bestIndex, currentPeriodName: bestName };
            }

            // Strategy 3: No date match — pick the most recently ended period
            // (today is just past Q3's end date, between quarters) rather than
            // blindly taking the highest index (which would pick a future quarter).
            const today2 = new Date();
            let closestPast = null;
            let closestPastDiff = Infinity;
            let closestPastIdx = -1;
            let closestPastName = '';

            for (let i = 0; i < (Array.isArray(reportPeriods) ? reportPeriods : []).length; i++) {
                const p = (Array.isArray(reportPeriods) ? reportPeriods : [])[i];
                if (!p) continue;
                const end = parseDate(p['@_EndDate'] || p['@_End']);
                if (end && end < today2) {
                    const diff = today2 - end;
                    if (diff < closestPastDiff) {
                        closestPastDiff = diff;
                        closestPast = end;
                        closestPastIdx = periods[i]?.index ?? -1;
                        closestPastName = periods[i]?.name ?? '';
                    }
                }
            }

            if (closestPastIdx >= 0) {
                return { periods, currentPeriodIndex: closestPastIdx, currentPeriodName: closestPastName };
            }

            // Last resort: take the first period in the list
            return { periods, currentPeriodIndex: periods[0].index, currentPeriodName: periods[0].name };
        }

        return { periods: [], currentPeriodIndex: 0, currentPeriodName: '' };
    } catch (e) {
        console.error('parseStudentVuePeriods error:', e);
        return { periods: [], currentPeriodIndex: 0, currentPeriodName: '' };
    }
};

// ── parseStudentVueGradebook ───────────────────────────────────────────────

export const parseStudentVueGradebook = (xmlString, targetPeriodName = null) => {
    try {
        const inner = extractInnerXml(xmlString);
        if (!inner) {
            console.error('Could not find Gradebook XML inside response');
            return { classes: [], periods: [] };
        }

        const innerJson = xmlParser.parse(inner);
        const gb = innerJson?.Gradebook;
        if (!gb) {
            console.error('No <Gradebook> element found after parsing');
            return { classes: [], periods: [] };
        }

        // ── Reporting periods (for UI period switcher) ──
        let xmlPeriods =
            gb.ReportingPeriods?.ReportPeriod ||
            gb.ReportingPeriods?.ReportingPeriod;
        const formattedPeriods = [];
        if (xmlPeriods) {
            if (!Array.isArray(xmlPeriods)) xmlPeriods = [xmlPeriods];
            xmlPeriods.forEach(p => {
                formattedPeriods.push({
                    index: parseInt(p['@_Index']),
                    name: p['@_GradePeriod'] || p['@_MarkingPeriod'] || `Quarter ${p['@_Index']}`,
                    startDate: p['@_StartDate'],
                    endDate: p['@_EndDate'],
                });
            });
        }

        // ── Courses ──
        // Some schools omit the <Courses> wrapper and put <Course> directly in <Gradebook>
        let xmlCourses = gb.Courses?.Course ?? gb.Course;
        if (!xmlCourses || typeof xmlCourses !== 'object') {
            return { classes: [], periods: formattedPeriods };
        }
        if (!Array.isArray(xmlCourses)) xmlCourses = [xmlCourses];

        const formattedClasses = [];

        xmlCourses.forEach(course => {
            const courseTitle = course['@_Title'] || 'Unknown Class';
            const isAP = courseTitle.toUpperCase().includes('AP ');

            let marks = course?.Marks?.Mark;
            let currentGrade = 0;
            let targetMark = null;
            const formattedAssignments = [];

            if (marks) {
                const marksList = Array.isArray(marks) ? marks : [marks];

                // Match by period name
                if (targetPeriodName) {
                    targetMark = marksList.find(m =>
                        (m['@_MarkName'] || '').toUpperCase() === targetPeriodName.toUpperCase()
                    );
                }

                // Fallback: last mark with a score that isn't an exam/semester mark
                if (!targetMark) {
                    for (let i = marksList.length - 1; i >= 0; i--) {
                        const m = marksList[i];
                        if (!m) continue;
                        const hasScore = m['@_CalculatedScoreRaw'] || m['@_CalculatedScoreString'];
                        const markName = (m['@_MarkName'] || '').toUpperCase();
                        if (hasScore && !markName.includes('EXAM') && !markName.includes('SEMESTER')) {
                            targetMark = m;
                            break;
                        }
                    }
                }

                // Last resort: final mark in list
                if (!targetMark && marksList.length > 0) {
                    targetMark = marksList[marksList.length - 1];
                }

                if (targetMark) {
                    const raw = targetMark['@_CalculatedScoreRaw'];
                    const str = targetMark['@_CalculatedScoreString'];
                    let parsedStr = NaN;
                    if (str) {
                        const pctMatch = str.match(/(\d{1,3}(?:\.\d+)?)%/);
                        if (pctMatch) {
                            parsedStr = parseFloat(pctMatch[1]);
                        } else {
                            const numMatch = str.match(/(?:^|\s|\()(\d{1,3}(?:\.\d+)?)(?:$|\s|\))/);
                            if (numMatch) parsedStr = parseFloat(numMatch[1]);
                        }
                    }
                    if (!isNaN(parsedStr) && parsedStr >= 0) {
                        currentGrade = parsedStr;
                    } else if (raw && !isNaN(parseFloat(raw))) {
                        currentGrade = parseFloat(raw);
                    }
                }

                // Category weights
                let categoryWeights = null;
                if (targetMark?.GradeCalculationSummary?.AssignmentGradeCalc) {
                    let calcs = targetMark.GradeCalculationSummary.AssignmentGradeCalc;
                    if (!Array.isArray(calcs)) calcs = [calcs];
                    const weights = {};
                    let totalWeight = 0;
                    calcs.forEach(calc => {
                        const type = calc['@_Type'];
                        const weightStr = calc['@_Weight'];
                        if (type && weightStr) {
                            const wMatch = weightStr.match(/[\d.]+/);
                            if (wMatch) {
                                const w = parseFloat(wMatch[0]);
                                if (w > 0) { weights[type] = w / 100; totalWeight += w / 100; }
                            }
                        }
                    });
                    if (Object.keys(weights).length > 0 && totalWeight > 0) categoryWeights = weights;
                }

                // Assignments — collect from all non-exam marks, deduplicated
                const seenIds = new Set();
                const allAssignments = [];
                const marksList2 = Array.isArray(marks) ? marks : [marks];
                marksList2.forEach((m, mi) => {
                    if (!m) return;
                    const markName = (m['@_MarkName'] || '').toUpperCase();
                    if (markName.includes('EXAM') || markName.includes('SEMESTER')) return;
                    let asmList = m.Assignments?.Assignment;
                    if (!asmList) return;
                    if (!Array.isArray(asmList)) asmList = [asmList];
                    asmList.forEach((asm, ai) => {
                        const id = asm['@_GradebookID'] || `${courseTitle}-${asm['@_Measure'] || asm['@_Type']}-${asm['@_Date'] || ''}-${mi}-${ai}`;
                        if (!seenIds.has(id)) {
                            seenIds.add(id);
                            allAssignments.push(asm);
                        }
                    });
                });

                allAssignments.forEach((asm, index) => {
                    const pointsStr = asm['@_Points'];
                    const pointsPossibleStr = asm['@_PointsPossible'] || asm['@_Points_Possible'];
                    const scoreStr = asm['@_Score'];
                    const scoreTypeStr = asm['@_ScoreType'];

                    let earned = NaN;
                    let total = NaN;
                    let isGraded = false;

                    if (pointsPossibleStr && !isNaN(parseFloat(pointsPossibleStr))) {
                        total = parseFloat(pointsPossibleStr);
                    }
                    if (pointsStr && typeof pointsStr === 'string' && pointsStr.includes('/')) {
                        const parts = pointsStr.split('/');
                        const e = parseFloat(parts[0]);
                        const t = parseFloat(parts[1]);
                        if (!isNaN(t)) total = t;
                        if (!isNaN(e)) { earned = e; isGraded = true; }
                    } else if (isNaN(total) && pointsStr && !isNaN(parseFloat(pointsStr))) {
                        total = parseFloat(pointsStr);
                    }

                    if (!isGraded && scoreStr != null) {
                        const strVal = String(scoreStr);
                        if (strVal.includes('/')) {
                            const parts = strVal.split('/');
                            const e = parseFloat(parts[0]);
                            const t = parseFloat(parts[1]);
                            if (!isNaN(t)) total = t;
                            if (!isNaN(e)) { earned = e; isGraded = true; }
                        } else {
                            const hasPctSymbol = strVal.includes('%');
                            const cleanScore = strVal.replace('%', '').trim();
                            const scoreNum = parseFloat(cleanScore);
                            const lc = cleanScore.toLowerCase();
                            if (!isNaN(scoreNum) && lc !== 'not graded' && lc !== 'excused' && lc !== 'missing') {
                                const isPercentage = scoreTypeStr === 'Percentage' || hasPctSymbol;
                                if (isPercentage && !isNaN(total) && total > 0) {
                                    earned = (scoreNum / 100) * total;
                                } else {
                                    earned = scoreNum;
                                }
                                isGraded = true;
                            }
                        }
                    }

                    let percentage = 0;
                    if (isGraded && !isNaN(earned) && !isNaN(total) && total > 0) {
                        percentage = (earned / total) * 100;
                    }

                    formattedAssignments.push({
                        id: asm['@_GradebookID'] || `${courseTitle}-asm-${index}`,
                        title: asm['@_Measure'] || asm['@_Type'] || 'Assignment',
                        score: isGraded ? earned : null,
                        total: isNaN(total) ? 0 : total,
                        percentage: parseFloat(percentage.toFixed(1)),
                        date: asm['@_Date'] || '',
                        due_date: asm['@_DueDate'] || '',
                        category: asm['@_Type'] || 'Other',
                        isGraded,
                    });
                });
            }

            // Fallback grade calculation when school reports 0 but assignments exist
            let finalGrade = currentGrade;
            if (finalGrade === 0 && formattedAssignments.length > 0) {
                const cats = { Summative: { e: 0, p: 0 }, Formative: { e: 0, p: 0 }, Final: { e: 0, p: 0 } };
                let hasGraded = false;
                formattedAssignments.forEach(a => {
                    if (!a.isGraded || a.score === null || a.total <= 0) return;
                    hasGraded = true;
                    const cat = a.category || 'Formative';
                    if (cats[cat]) { cats[cat].e += a.score; cats[cat].p += a.total; }
                    else { cats.Formative.e += a.score; cats.Formative.p += a.total; }
                });
                if (hasGraded) {
                    const sAvg = cats.Summative.p > 0 ? (cats.Summative.e / cats.Summative.p) * 100 : null;
                    const fAvg = cats.Formative.p > 0 ? (cats.Formative.e / cats.Formative.p) * 100 : null;
                    const feAvg = cats.Final.p > 0 ? (cats.Final.e / cats.Final.p) * 100 : null;
                    let w = sAvg !== null && fAvg !== null ? sAvg * 0.7 + fAvg * 0.3 : sAvg ?? fAvg ?? null;
                    if (w !== null) finalGrade = feAvg !== null ? w * 0.8 + feAvg * 0.2 : w;
                }
            }

            formattedClasses.push({
                id: course['@_ClassID'] || courseTitle,
                name: courseTitle,
                grade: finalGrade,
                period: course['@_Period'] || '',
                teacher: course['@_Staff'] || '',
                room: course['@_Room'] || '',
                type: isAP ? 'AP' : (courseTitle.includes(' HN') ? 'HN' : 'ST'),
                assignments: formattedAssignments,
                categoryWeights: null, // set below after category extraction
            });

            // Attach category weights to the last pushed class
            if (targetMark?.GradeCalculationSummary?.AssignmentGradeCalc) {
                let calcs = targetMark.GradeCalculationSummary.AssignmentGradeCalc;
                if (!Array.isArray(calcs)) calcs = [calcs];
                const weights = {};
                let totalWeight = 0;
                calcs.forEach(calc => {
                    const type = calc['@_Type'];
                    const weightStr = calc['@_Weight'];
                    if (type && weightStr) {
                        const wMatch = weightStr.match(/[\d.]+/);
                        if (wMatch) {
                            const w = parseFloat(wMatch[0]);
                            if (w > 0) { weights[type] = w / 100; totalWeight += w / 100; }
                        }
                    }
                });
                if (Object.keys(weights).length > 0 && totalWeight > 0) {
                    formattedClasses[formattedClasses.length - 1].categoryWeights = weights;
                }
            }
        });

        return { classes: formattedClasses, periods: formattedPeriods };

    } catch (err) {
        console.error('parseStudentVueGradebook error:', err);
        return { classes: [], periods: [] };
    }
};
