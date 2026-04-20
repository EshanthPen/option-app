import { parseStudentVueGradebook } from '../src/utils/studentVueParser.js';

const xml = `
<ProcessWebServiceRequestResult>
    <Gradebook>
        <Courses>
            <Course Title="Calculus" ClassID="1" Period="1" Staff="Mr. Math" Room="101">
                <Marks>
                    <Mark MarkName="Quarter 1" CalculatedScoreRaw="0">
                        <Assignments>
                            <Assignment GradebookID="1" Measure="Test 1" Points="90 / 100" Score="90" Date="10/01/2026" Type="Summative" />
                        </Assignments>
                    </Mark>
                </Marks>
            </Course>
        </Courses>
    </Gradebook>
</ProcessWebServiceRequestResult>
`;

const res = parseStudentVueGradebook(xml);
console.log(JSON.stringify(res, null, 2));

// Add fallback logic to the script
const calculateFallbackGrade = (assignments) => {
    const cats = { Summative: { e: 0, p: 0 }, Formative: { e: 0, p: 0 }, Final: { e: 0, p: 0 } };
    let hasGraded = false;
    assignments.forEach(a => {
        if (!a.isGraded || a.score === null || a.total <= 0) return;
        hasGraded = true;
        const cat = a.category || 'Formative';
        if (cats[cat]) {
            cats[cat].e += a.score;
            cats[cat].p += a.total;
        } else {
            cats.Formative.e += a.score;
            cats.Formative.p += a.total;
        }
    });

    if (!hasGraded) return 0;

    const sAvg = cats.Summative.p > 0 ? (cats.Summative.e / cats.Summative.p) * 100 : null;
    const fAvg = cats.Formative.p > 0 ? (cats.Formative.e / cats.Formative.p) * 100 : null;
    const feAvg = cats.Final.p > 0 ? (cats.Final.e / cats.Final.p) * 100 : null;
    
    let w = sAvg !== null && fAvg !== null ? sAvg * 0.7 + fAvg * 0.3 : sAvg ?? fAvg ?? null;
    if (w === null) return 0;
    
    return feAvg !== null ? w * 0.8 + feAvg * 0.2 : w;
};

res.classes.forEach(c => {
    if (c.grade === 0 && c.assignments.length > 0) {
        c.grade = calculateFallbackGrade(c.assignments);
    }
});
console.log("After fallback:");
console.log(JSON.stringify(res, null, 2));
