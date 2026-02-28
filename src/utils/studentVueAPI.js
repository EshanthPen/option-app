import { Platform } from 'react-native';

function escapeXml(str) {
    return String(str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function parseAttrs(attrStr) {
    const obj = {};
    for (const [, key, val] of attrStr.matchAll(/(\w+)="([^"]*)"/g)) {
        obj[key] = val
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    }
    return obj;
}

function formatDate(raw) {
    if (!raw) return "";
    try {
        const d = new Date(raw);
        return isNaN(d) ? raw : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch { return raw; }
}

function parseGradebook(xml) {
    const courses = [];

    for (const [, attrs, body] of xml.matchAll(/<Course\s([^>]*)>([\s\S]*?)<\/Course>/g)) {
        const attr = parseAttrs(attrs);
        // Strip trailing numeric codes like "(280404)" or "[441036]" from course names
        const rawTitle = attr.Title || attr.CourseName || "Unknown Course";
        const title = rawTitle.replace(/\s*[\(\[]\d+[\)\]]\s*$/, '').replace(/\s+TJ\b.*/, '').trim();
        const period = attr.Period || "";
        const room = attr.Room || "";
        const teacher = attr.Staff || attr.Teacher || "";

        const markMatch = body.match(/<Mark\s([^>]*)\/?>/);
        const mark = markMatch ? parseAttrs(markMatch[1]) : {};
        const letterGrade = mark.CalculatedScoreString || mark.MarkName || "N/A";
        const rawPct = parseFloat(mark.CalculatedScoreRaw || mark.CalculatedScore || "0");
        const pct = isNaN(rawPct) ? 0 : rawPct;

        const tl = title.toLowerCase();
        // Match " HN" as a word boundary (e.g. "Chemistry 1 HN"), not just "hnr"
        const type = /\bap\b/.test(tl) ? "AP" : /\bhn\b|honor|hnr|adv|accelerat/.test(tl) ? "HN" : "REG";
        const baseGP = pct >= 93 ? 4 : pct >= 90 ? 3.7 : pct >= 87 ? 3.3 : pct >= 83 ? 3 : pct >= 80 ? 2.7 : pct >= 77 ? 2.3 : pct >= 73 ? 2 : pct >= 70 ? 1.7 : 1;
        const bonus = type === "AP" ? 1 : type === "HN" ? 0.5 : 0;

        const assignments = [];

        for (const [, asgnAttrs] of body.matchAll(/<Assignment\s([^>]*?)(?:\/>|>[^<]*<\/Assignment>)/g)) {
            const a = parseAttrs(asgnAttrs);

            const name = a.Measure || a.MeasureName || "Assignment";
            const dateRaw = a.Date || a.DueDate || "";
            const date = formatDate(dateRaw);
            const isoDate = dateRaw ? (() => { try { return new Date(dateRaw).toISOString().slice(0, 10); } catch { return ""; } })() : "";

            let scoreNum = undefined;
            let totalNum = undefined;

            const rawScore = a.Score || a.Points || "";
            const rawPoss = a.PointsPossible || a.ScorePossible || "";

            if (rawScore.includes("/")) {
                const parts = rawScore.split("/").map(s => s.trim());
                const s = parseFloat(parts[0]);
                const t = parseFloat(parts[1]);
                if (!isNaN(s) && !isNaN(t)) { scoreNum = s; totalNum = t; }
            } else if (rawScore && rawPoss) {
                const s = parseFloat(rawScore);
                const t = parseFloat(rawPoss);
                const isGraded = !rawScore.includes("*")
                    && !/not|graded|missing|incomplete|ng/i.test(rawScore)
                    && !isNaN(s) && !isNaN(t);
                if (isGraded) { scoreNum = s; totalNum = t; }
            }

            const cat = (a.Type || a.Category || a.MeasureType || "").toLowerCase();
            const aType =
                /final|midterm|semester|exam/.test(cat) ? "Final" :
                    /test|quiz|assess|summ|major/.test(cat) ? "Summative" :
                        "Formative";

            if (name && name !== "Assignment") {
                assignments.push({
                    id: `${name}-${dateRaw}`,
                    name,
                    title: name, // keep for backwards compatibility
                    date,
                    isoDate,
                    type: aType,
                    score: scoreNum,
                    total: totalNum,
                    weight: 10,
                    category: a.Type || a.Category || a.MeasureType || "",
                    notes: a.Notes || "",
                    rawScore: rawScore || "",
                    scoreType: a.ScoreType || "",
                });
            }
        }

        assignments.sort((a, b) => {
            if (a.isoDate && b.isoDate) return b.isoDate.localeCompare(a.isoDate);
            return 0;
        });

        courses.push({
            id: courses.length + 1,
            code: `PD${period}-${title.slice(0, 3).toUpperCase()}`,
            name: title,
            type,
            grade: +pct.toFixed(1),
            pct: +pct.toFixed(1),
            letter: letterGrade,
            wGP: +(baseGP + bonus).toFixed(1),
            uGP: +baseGP.toFixed(1),
            period, room, teacher, assignments,
            isAP: type === 'AP'
        });
    }

    return courses.sort((a, b) => (parseInt(a.period) || 99) - (parseInt(b.period) || 99));
}

/**
 * Main sync function. Returns { grades, periods, period, periodIndex }.
 * - grades: array of course objects for the selected period
 * - periods: array of { index, name } for all available periods
 * - period: name of the selected period (e.g. "Quarter 3")
 * - periodIndex: the index of the fetched period
 */
export const syncStudentVueGrades = async (username, password, districtUrl, requestedPeriodIndex = null) => {
    if (!username || !password || !districtUrl) {
        throw new Error("Missing username, password, or districtUrl");
    }

    const base = districtUrl.trim().replace(/\/+$/, "");

    // Use a CORS proxy ONLY when running on the web, since Native apps don't have CORS restrictions.
    // We use a POST-compatible proxy if on web, since StudentVUE requires POST requests.
    const CORS_PROXY = Platform.OS === 'web' ? 'https://corsproxy.io/?' : '';

    const candidateEndpoints = [
        `${CORS_PROXY}${base}/Service/PXPCommunication.asmx`,
        `${CORS_PROXY}${base}/SVUE/Service/PXPCommunication.asmx`,
        `${CORS_PROXY}${base}/PXP2/Service/PXPCommunication.asmx`,
    ];

    const buildSoap = (u, p, method, paramStr) => `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/">
      <userID>${escapeXml(u)}</userID>
      <password>${escapeXml(p)}</password>
      <skipLoginLog>1</skipLoginLog>
      <parent>0</parent>
      <webServiceHandleName>PXPWebServices</webServiceHandleName>
      <methodName>${method}</methodName>
      <paramStr>${paramStr}</paramStr>
    </ProcessWebServiceRequest>
  </soap:Body>
</soap:Envelope>`;

    const soapFetch = async (endpoint, soapBody) => {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "text/xml; charset=utf-8",
                "SOAPAction": "http://edupoint.com/webservices/ProcessWebServiceRequest",
            },
            body: soapBody,
        });
        return response.text();
    };

    const extractInner = (xmlText) => {
        const match = xmlText.match(/<ProcessWebServiceRequestResult>([\s\S]*?)<\/ProcessWebServiceRequestResult>/);
        if (!match) return null;
        return match[1]
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    };

    // ── Step 1: Find the working endpoint ──────────────────────
    let endpoint = "";
    let lastError = "";

    for (const candidate of candidateEndpoints) {
        try {
            const text = await soapFetch(
                candidate,
                buildSoap(username, password, "Gradebook", "&lt;Parms&gt;&lt;ReportPeriod&gt;0&lt;/ReportPeriod&gt;&lt;/Parms&gt;")
            );
            const trimmed = text.trimStart();
            if (trimmed.startsWith("<html") || trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<!doctype")) {
                lastError = `Returned HTML (wrong path).`;
                continue;
            }
            if (text.includes("ProcessWebServiceRequestResult") || text.includes("<soap:Body>")) {
                endpoint = candidate;
                break;
            }
            lastError = `Returned unexpected content.`;
        } catch (e) {
            lastError = `${e?.message}`;
        }
    }

    if (!endpoint) {
        throw new Error(`Could not reach StudentVUE at "${base}". Check your district URL starts with https://. Detail: ${lastError}`);
    }

    // ── Step 2: Fetch gradebook period listing ──────────────────
    let gradebookListXml = "";
    try {
        const raw = await soapFetch(
            endpoint,
            buildSoap(username, password, "Gradebook", "&lt;Parms&gt;&lt;ReportPeriod&gt;0&lt;/ReportPeriod&gt;&lt;/Parms&gt;")
        );
        gradebookListXml = extractInner(raw) || "";
    } catch (e) {
        throw new Error(`Failed fetching gradebook periods. Detail: ${e?.message}`);
    }

    const failPhrases = ["Invalid user", "Login failed", "The user name or password", "credentials are incorrect", "not authorized"];
    if (failPhrases.some(p => gradebookListXml.includes(p) || gradebookListXml === "")) {
        if (failPhrases.some(p => gradebookListXml.includes(p))) {
            throw new Error("Invalid username or password.");
        }
    }

    // ── Step 3: Parse all available reporting periods ───────────
    const today = new Date();
    const periodMatches = [...gradebookListXml.matchAll(/<ReportPeriod\s([^/]*?)\/?>/g)];

    // Build human-readable list of all periods
    const allPeriods = periodMatches.map(([, attrs]) => {
        const a = parseAttrs(attrs);
        const idx = parseInt(a.Index ?? a.GradingPeriodIndex ?? "0");
        const name = a.GradePeriod || a.MarkingPeriod || `Period ${idx}`;
        return { index: idx, name };
    });

    // ── Step 4: Auto-detect the best (current) period ──────────
    let bestIndex = 0;
    let bestDate = new Date(0);
    let foundCurrent = false;

    if (periodMatches.length > 0) {
        for (const [, attrs] of periodMatches) {
            const a = parseAttrs(attrs);
            const idx = parseInt(a.Index ?? a.GradingPeriodIndex ?? "0");
            const startRaw = a.StartDate || a.Start || "";
            const endRaw = a.EndDate || a.End || "";
            const start = startRaw ? new Date(startRaw) : null;
            const end = endRaw ? new Date(endRaw) : null;

            if (start && end && today >= start && today <= end) {
                bestIndex = idx;
                foundCurrent = true;
                break;
            }

            if (start && start <= today && start > bestDate) {
                bestDate = start;
                bestIndex = idx;
            }
        }

        if (!foundCurrent && periodMatches.length > 0) {
            let maxIdx = 0;
            for (const [, attrs] of periodMatches) {
                const a = parseAttrs(attrs);
                const idx = parseInt(a.Index ?? a.GradingPeriodIndex ?? "0");
                if (idx > maxIdx) maxIdx = idx;
            }
            if (bestDate.getTime() === 0) bestIndex = maxIdx;
        }
    }

    // If caller specified a period, use it; otherwise use auto-detected
    const targetIndex = requestedPeriodIndex !== null ? requestedPeriodIndex : bestIndex;

    // ── Step 5: Fetch gradebook for the target period ───────────
    let currentGradebookXml = gradebookListXml;

    if (targetIndex !== 0) {
        try {
            const paramStr = `&lt;Parms&gt;&lt;ReportPeriod&gt;${targetIndex}&lt;/ReportPeriod&gt;&lt;/Parms&gt;`;
            const raw = await soapFetch(endpoint, buildSoap(username, password, "Gradebook", paramStr));
            const inner = extractInner(raw);
            if (inner) currentGradebookXml = inner;
        } catch (e) {
            // Fall back to period 0
        }
    }

    // ── Step 6: Get the name of the fetched period ──────────────
    let periodName = `Period ${targetIndex}`;
    for (const [, attrs] of periodMatches) {
        const a = parseAttrs(attrs);
        const idx = parseInt(a.Index ?? a.GradingPeriodIndex ?? "0");
        if (idx === targetIndex) {
            periodName = a.GradePeriod || a.MarkingPeriod || periodName;
            break;
        }
    }

    // ── Step 7: Parse and return ────────────────────────────────
    try {
        const grades = parseGradebook(currentGradebookXml);
        return {
            grades,
            periods: allPeriods,
            period: periodName,
            periodIndex: targetIndex,
        };
    } catch (e) {
        throw new Error(`Connected to StudentVUE but failed to parse the gradebook data: ${e?.message}`);
    }
};
