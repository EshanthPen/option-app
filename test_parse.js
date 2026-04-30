const today = new Date();
const periods = [
    { index: 1, name: "1st Quarter", start: new Date("2025-08-19"), end: new Date("2025-10-31") },
    { index: 2, name: "2nd Quarter", start: new Date("2025-11-01"), end: new Date("2026-01-25") },
    { index: 3, name: "3rd Quarter", start: new Date("2026-01-26"), end: new Date("2026-04-03") },
    { index: 4, name: "4th Quarter", start: new Date("2026-04-04"), end: new Date("2026-06-15") }
];
let bestIndex = 0;
let foundCurrent = false;
periods.forEach(p => {
    if (today >= p.start && today <= p.end) {
        bestIndex = p.index;
        foundCurrent = true;
    }
});
if (!foundCurrent) bestIndex = Math.max(...periods.map(p => p.index));
console.log("bestIndex:", bestIndex);
