import { performSmartScheduling } from './src/utils/schedulerAssistant.js';

const tasks = [
    { title: "Long Project", urgency: 7, importance: 9, duration: 240, is_planned: false, completed: false, type: 'assignment' },
];

const workingHours = {
    0: { start: 15, end: 22 },
    1: { start: 15, end: 22 },
    2: { start: 15, end: 22 },
    3: { start: 15, end: 22 },
    4: { start: 15, end: 22 },
    5: { start: 15, end: 22 },
    6: { start: 15, end: 22 },
};

const busyPeriods = [];

const result = performSmartScheduling(tasks, busyPeriods, workingHours);
console.log("SCHEDULED BLOCKS:", result.length);
if (result.length > 0) {
    console.log(result.map(x => ({ title: x.title, dt: x.date, start: x.scheduled_start.split('T')[1] })));
}
