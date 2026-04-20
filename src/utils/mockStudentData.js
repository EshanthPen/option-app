import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Helpers ──────────────────────────────────────────────────
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const COURSE_LIST = [
    { name: 'AP United States History', type: 'AP' },
    { name: 'AP English Language & Composition', type: 'AP' },
    { name: 'AP Calculus BC', type: 'AP' },
    { name: 'AP Computer Science A', type: 'AP' },
    { name: 'AP Chemistry', type: 'AP' },
    { name: 'AP Statistics', type: 'AP' },
    { name: 'AP Psychology', type: 'AP' },
    { name: 'Honors English 11', type: 'HN' },
    { name: 'Honors Pre-Calculus', type: 'HN' },
    { name: 'Honors Biology', type: 'HN' },
    { name: 'Honors Chemistry HN', type: 'HN' },
    { name: 'Spanish 4 HN', type: 'HN' },
    { name: 'Symphonic Band', type: 'REG' },
    { name: 'Physical Education', type: 'REG' },
    { name: 'Studio Art', type: 'REG' },
    { name: 'Computer Applications', type: 'REG' },
];

const TEACHERS = [
    'Dr. Sarah Okonkwo', 'Mr. James Whitfield', 'Ms. Rachel Torres',
    'Mr. David Chen', 'Mrs. Amanda Patel', 'Dr. Michael Saunders',
    'Ms. Lisa Park', 'Mr. Carlos Fuentes',
];

const CATEGORIES = {
    AP: ['Tests & Quizzes', 'AP Practice FRQ', 'Classwork', 'Homework'],
    HN: ['Summative', 'Formative', 'Homework', 'Projects'],
    REG: ['Tests', 'Daily Work', 'Participation', 'Projects'],
};

const ASSIGNMENT_NAMES = {
    'Tests & Quizzes': ['Unit Test', 'Chapter Quiz', 'Assessment', 'Cumulative Exam'],
    'AP Practice FRQ': ['FRQ: Continuity & Change', 'FRQ: Comparison', 'FRQ: Causation', 'Document-Based Question'],
    'Classwork': ['Primary Source Analysis', 'Short Answer Response', 'Group Discussion Notes', 'Reading Check'],
    'Homework': ['Reading Ch. 12', 'Problem Set 7', 'Vocabulary Review', 'Worksheet 4.3', 'Study Guide'],
    'Summative': ['Chapter Test', 'Semester Assessment', 'Unit Exam', 'Major Quiz'],
    'Formative': ['Exit Ticket', 'Bell Ringer', 'Pop Quiz', 'Reading Check'],
    'Projects': ['Research Paper', 'Poster Presentation', 'Group Project', 'Lab Report'],
    'Tests': ['Chapter Test', 'Unit Exam', 'Quarterly Assessment'],
    'Daily Work': ['Cornell Notes', 'Graphic Organizer', 'Reading Response', 'Class Work'],
    'Participation': ['Class Discussion', 'Group Work Grade', 'Engagement Check'],
};

const QUARTER_DATES = [
    { start: '2025-09-02', end: '2025-11-07' }, // Q1
    { start: '2025-11-10', end: '2026-01-23' }, // Q2
    { start: '2026-01-26', end: '2026-04-03' }, // Q3
    { start: '2026-04-06', end: '2026-06-12' }, // Q4
];

const gradeLetter = (pct) => {
    if (pct >= 93) return 'A';
    if (pct >= 90) return 'A-';
    if (pct >= 87) return 'B+';
    if (pct >= 83) return 'B';
    if (pct >= 80) return 'B-';
    if (pct >= 77) return 'C+';
    if (pct >= 73) return 'C';
    if (pct >= 70) return 'C-';
    return 'D';
};

const buildGP = (pct, type) => {
    const base = pct >= 93 ? 4 : pct >= 90 ? 3.7 : pct >= 87 ? 3.3 : pct >= 83 ? 3 : pct >= 80 ? 2.7 : pct >= 77 ? 2.3 : pct >= 73 ? 2 : pct >= 70 ? 1.7 : 1;
    const bonus = type === 'AP' ? 1 : type === 'HN' ? 0.5 : 0;
    return { wGP: +(base + bonus).toFixed(1), uGP: +base.toFixed(1) };
};

const buildDate = (startDateStr, dayOffset) => {
    const d = new Date(startDateStr);
    d.setDate(d.getDate() + dayOffset);
    return {
        display: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        iso: d.toISOString().slice(0, 10),
    };
};

const makeAssignments = (type, coursePct, quarterStartDate) => {
    const cats = CATEGORIES[type] || CATEGORIES.REG;
    const assignments = [];
    let dayOffset = 3;

    for (const cat of cats) {
        const names = ASSIGNMENT_NAMES[cat] || ['Assignment'];
        const count = rnd(3, 6);
        for (let i = 0; i < count; i++) {
            const variance = rnd(-11, 11);
            const rawPct = Math.min(100, Math.max(45, coursePct + variance));
            const total = pick([10, 20, 25, 50, 100]);
            const score = +(total * (rawPct / 100)).toFixed(1);
            const { display, iso } = buildDate(quarterStartDate, dayOffset);
            const aName = names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : '');

            assignments.push({
                id: `${cat}-${i}-${dayOffset}`,
                name: aName,
                title: aName,
                date: display,
                isoDate: iso,
                type: /test|quiz|exam|frq|summ|major|project/i.test(cat) ? 'Summative' : 'Formative',
                score,
                total,
                category: cat,
                rawScore: `${score}/${total}`,
                notes: '',
                scoreType: 'Raw Score',
                weight: 10,
            });
            dayOffset += rnd(3, 7);
        }
    }

    return assignments.sort((a, b) => b.isoDate.localeCompare(a.isoDate));
};

// Build one quarter's class list.
// basePcts: array of base percentages for each course (so grades drift between quarters).
const buildQuarterClasses = (courseSelection, basePcts, quarterIdx) => {
    const qDate = QUARTER_DATES[quarterIdx].start;

    return courseSelection.map((course, i) => {
        // Each quarter has slight grade drift (-5 to +5)
        const drift = rnd(-4, 5);
        const pct = Math.min(100, Math.max(58, basePcts[i] + drift));
        const rounded = +pct.toFixed(1);
        const { wGP, uGP } = buildGP(rounded, course.type);
        const period = i + 1;

        return {
            id: i + 1,
            code: `PD${period}-${course.name.slice(0, 3).toUpperCase()}`,
            name: course.name,
            type: course.type,
            grade: rounded,
            pct: rounded,
            letter: gradeLetter(rounded),
            wGP, uGP,
            period: String(period),
            room: `${rnd(1, 4)}${String.fromCharCode(65 + rnd(0, 9))}${rnd(10, 40)}`,
            teacher: TEACHERS[i % TEACHERS.length],
            assignments: makeAssignments(course.type, rounded, qDate),
            isAP: course.type === 'AP',
            isDemo: true,
        };
    }).sort((a, b) => parseInt(a.period) - parseInt(b.period));
};

// ── Main export ──────────────────────────────────────────────
export const loadMockGradebookData = async () => {
    // Pick 7 courses once — stays consistent across all quarters
    const shuffled = [...COURSE_LIST].sort(() => Math.random() - 0.5).slice(0, 7);

    // Establish "base" percentages for each course
    const basePcts = shuffled.map(c => {
        if (c.type === 'AP') return rnd(78, 96);
        if (c.type === 'HN') return rnd(82, 98);
        return rnd(76, 99);
    });

    const periods = [
        { index: 0, name: 'Quarter 1' },
        { index: 1, name: 'Quarter 2' },
        { index: 2, name: 'Quarter 3' },
        { index: 3, name: 'Quarter 4' },
    ];

    // Build and store 4 separate quarter datasets
    const allQuarterClasses = [];
    for (let q = 0; q < 4; q++) {
        const classes = buildQuarterClasses(shuffled, basePcts, q);
        allQuarterClasses.push(classes);
        await AsyncStorage.setItem(`studentVueGradesQ${q}`, JSON.stringify(classes));
    }

    // Default to Quarter 3 (index 2)
    const defaultClasses = allQuarterClasses[2];
    await AsyncStorage.setItem('studentVueGrades', JSON.stringify(defaultClasses));
    await AsyncStorage.setItem('studentVuePeriods', JSON.stringify(periods));
    await AsyncStorage.setItem('studentVuePeriodName', 'Quarter 3');
    await AsyncStorage.setItem('studentVuePeriodIndex', '2');
    // Flag that this is demo data (so GradebookScreen can use per-quarter cache)
    await AsyncStorage.setItem('isDemoData', 'true');

    const totalAssignments = defaultClasses.reduce((s, c) => s + c.assignments.length, 0);
    return { classCount: defaultClasses.length, assignmentCount: totalAssignments };
};
