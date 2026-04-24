import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    Alert, ScrollView, Modal, ActivityIndicator, Platform,
    KeyboardAvoidingView, Pressable, Dimensions
} from 'react-native';

const IS_WIDE = Platform.OS === 'web' && Dimensions.get('window').width > 1100;
import { LineChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, RefreshCw, Plus, BookOpen, Trash2, Bell, FileText, Sparkles } from 'lucide-react-native';
import { TopBar } from '../components/DesignKit';
import * as Notifications from 'expo-notifications';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../context/ThemeContext';
import { parseStudentVueGradebook, parseStudentVuePeriods } from '../utils/studentVueParser';
import { getRecentGradeChanges, dismissGradeChanges, isAssignmentNew, isClassGradeChanged, saveGradeSnapshot, checkForGradeChanges, formatChangeMessage } from '../utils/gradeNotifications';
import { scheduleGradeChangeNotification } from '../utils/notificationService';

// ── Helpers ───────────────────────────────────────────────────
const gradeColor = (pct, theme) => {
    if (pct >= 90) return theme.colors.green;
    if (pct >= 80) return theme.colors.blue;
    if (pct >= 70) return theme.colors.orange;
    return theme.colors.red;
};
const gradeLetter = (pct) => {
    if (pct >= 93) return 'A'; if (pct >= 90) return 'A-';
    if (pct >= 87) return 'B+'; if (pct >= 83) return 'B';
    if (pct >= 80) return 'B-'; if (pct >= 77) return 'C+';
    if (pct >= 73) return 'C'; if (pct >= 70) return 'C-';
    return 'D';
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// Numeric score extractor that treats null / "" / "Not Graded" as ungraded.
const numScore = (v) => {
    if (v === null || v === undefined || v === '') return NaN;
    if (typeof v === 'string' && v.trim().toLowerCase() === 'not graded') return NaN;
    const n = parseFloat(v);
    return isNaN(n) ? NaN : n;
};

// ── Grade calculation (weighted: Summative 70%, Formative 30%, Final 20% of total) ──
// Accepts mixed real + hypothetical assignments. An assignment counts if it has a
// numeric score AND a total > 0. A zero score (0/50) IS a valid graded assignment.
const calcGrade = (assignments) => {
    const cats = { Summative: { e: 0, p: 0 }, Formative: { e: 0, p: 0 }, Final: { e: 0, p: 0 } };
    (assignments || []).forEach(a => {
        const s = numScore(a.score);
        const t = parseFloat(a.total);
        if (isNaN(s) || isNaN(t) || t <= 0) return;
        const cat = a.category || 'Formative';
        if (cats[cat]) { cats[cat].e += s; cats[cat].p += t; }
        else { cats.Formative.e += s; cats.Formative.p += t; }
    });
    const sAvg = cats.Summative.p > 0 ? (cats.Summative.e / cats.Summative.p) * 100 : null;
    const fAvg = cats.Formative.p > 0 ? (cats.Formative.e / cats.Formative.p) * 100 : null;
    const feAvg = cats.Final.p > 0 ? (cats.Final.e / cats.Final.p) * 100 : null;
    let w = sAvg !== null && fAvg !== null ? sAvg * 0.7 + fAvg * 0.3 : sAvg ?? fAvg ?? null;
    if (w === null) return null;
    return feAvg !== null ? w * 0.8 + feAvg * 0.2 : w;
};

const buildGP = (pct, type) => {
    const base = pct >= 93 ? 4 : pct >= 90 ? 3.7 : pct >= 87 ? 3.3 : pct >= 83 ? 3 : pct >= 80 ? 2.7 : pct >= 77 ? 2.3 : pct >= 73 ? 2 : pct >= 70 ? 1.7 : 1;
    const bonus = type === 'AP' ? 1 : type === 'HN' ? 0.5 : 0;
    return { wGP: +(base + bonus).toFixed(1), uGP: +base.toFixed(1) };
};

// ── Storage helpers ───────────────────────────────────────────
const MANUAL_KEY = 'manualGrades';
const saveManual = async (classes) => AsyncStorage.setItem(MANUAL_KEY, JSON.stringify(classes));
const loadManual = async () => JSON.parse(await AsyncStorage.getItem(MANUAL_KEY) || '[]');

export default function GradebookScreen() {
    const { theme } = useTheme();
    const S = getStyles(theme);

    // Core state
    const [svClasses, setSvClasses] = useState([]);   // StudentVUE synced
    const [manClasses, setManClasses] = useState([]); // Manual entries
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [gradeChanges, setGradeChanges] = useState(null);
    const [chartWidth, setChartWidth] = useState(0);
    const [fetchError, setFetchError] = useState(false);

    // Navigation
    const [selectedClass, setSelectedClass] = useState(null);
    const [catFilter, setCatFilter] = useState('All');
    const [hypothetical, setHypothetical] = useState(false);
    // hypoEdits: per-assignment overrides while hypothetical mode is on
    //   { [assignmentId]: { score: string|number, total: string|number } }
    const [hypoEdits, setHypoEdits] = useState({});
    // hypoAssignments: "fake" assignments the student adds while in hypothetical mode.
    // These are scoped to the current selectedClass and discarded when hypo mode turns off.
    //   { [classId]: Assignment[] }
    const [hypoAssignments, setHypoAssignments] = useState({});

    // Modals
    const [showAddClass, setShowAddClass] = useState(false);
    const [showAddAsgn, setShowAddAsgn] = useState(false);
    const [newClassName, setNewClassName] = useState('');
    const [newClassTeacher, setNewClassTeacher] = useState('');
    const [newClassType, setNewClassType] = useState('ST');
    const [newAsgnName, setNewAsgnName] = useState('');
    const [newAsgnScore, setNewAsgnScore] = useState('');
    const [newAsgnTotal, setNewAsgnTotal] = useState('100');
    const [newAsgnCat, setNewAsgnCat] = useState('Summative');
    const [newAsgnDate, setNewAsgnDate] = useState('');

    // Load data
    useFocusEffect(useCallback(() => {
        (async () => {
            try {
                const [svRaw, manRaw, isDemo] = await Promise.all([
                    AsyncStorage.getItem('studentVueGrades'),
                    AsyncStorage.getItem(MANUAL_KEY),
                    AsyncStorage.getItem('isDemoData'),
                ]);
                const isDemoData = isDemo === 'true';
                
                if (svRaw) {
                    const g = JSON.parse(svRaw);
                    const isOldDemo = g.length > 0 && g[0].name === 'Physical Education' && g[0].teacher === 'Dr. Sarah Okonkwo';
                    if ((g.length > 0 && g[0].isDemo && !isDemoData) || (isOldDemo && !isDemoData)) {
                        setSvClasses([]);
                    } else {
                        setSvClasses(g);
                    }
                }
                
                if (manRaw) setManClasses(JSON.parse(manRaw));
                const changes = await getRecentGradeChanges();
                if (changes) setGradeChanges(changes.changes);
            } catch (e) { console.error(e); }
            finally { setIsLoading(false); }
        })();
    }, []));

    const allClasses = [...svClasses, ...manClasses];

    // On wide web screens, keep a class always selected so the right-pane detail is never empty.
    useEffect(() => {
        if (IS_WIDE && !selectedClass && allClasses.length > 0) {
            setSelectedClass(allClasses[0]);
        }
    }, [IS_WIDE, allClasses.length]);

    // ── Sync Current Grades ───────────────────────────────────
    const syncCurrentGrades = async () => {
        try {
            setFetchError(false);
            const isDemo = await AsyncStorage.getItem('isDemoData') === 'true';
            const [svUser, svPass, svUrl] = await Promise.all([
                AsyncStorage.getItem('svUsername'),
                AsyncStorage.getItem('svPassword'),
                AsyncStorage.getItem('svDistrictUrl'),
            ]);

            if (isDemo && (!svUser || !svPass)) {
                setIsSyncing(true);
                await new Promise(r => setTimeout(r, 1000));
                setIsSyncing(false);
                return;
            }

            if (!svUser || !svPass || !svUrl) {
                Alert.alert('Not configured', 'Enter credentials in Settings first.');
                return;
            }
            
            setIsSyncing(true);
            const finalUrl = svUrl.endsWith('Service/PXPCommunication.asmx') ? svUrl : `${svUrl}/Service/PXPCommunication.asmx`;
            const base = Platform.OS === 'web' ? '' : 'https://optionapp.online';

            // 1. Fetch periods list to find the active period
            const periodsSoap = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>${svUser}</userID><password>${svPass}</password><skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;0&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>`;
            
            const periodsRes = await fetch(`${base}/api/studentvue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUrl: finalUrl, soapPayload: periodsSoap }) });
            if (!periodsRes.ok) throw new Error('Network error');
            const periodsXml = await periodsRes.text();
            if (!periodsXml.includes('Gradebook') && periodsXml.includes('RT_ERROR')) throw new Error('API error');
            
            const { currentPeriodIndex } = parseStudentVuePeriods(periodsXml);
            let finalXml = periodsXml;
            
            // 2. If the active period is not 0 (e.g. FCPS returning 1st quarter when passing 0), fetch the active period specifically
            if (currentPeriodIndex !== 0) {
                const gradesSoap = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>${svUser}</userID><password>${svPass}</password><skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;${currentPeriodIndex}&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>`;
                const gradesRes = await fetch(`${base}/api/studentvue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUrl: finalUrl, soapPayload: gradesSoap }) });
                if (gradesRes.ok) {
                    finalXml = await gradesRes.text();
                }
            }
            
            const { classes: parsed } = parseStudentVueGradebook(finalXml);
            if (parsed && parsed.length > 0) {
                const parsedStr = JSON.stringify(parsed);
                
                await saveGradeSnapshot(0);
                const changes = await checkForGradeChanges(0, parsedStr);
                
                await AsyncStorage.setItem('studentVueGrades', parsedStr);
                setSvClasses(parsed);
                
                if (changes && changes.length > 0) {
                    setGradeChanges(changes);
                    const msg = changes.length === 1
                        ? formatChangeMessage(changes[0])
                        : `${changes.length} grade updates detected`;
                    if (Platform.OS === 'web') window.alert(`Grade Update: ${msg}`);
                    else Alert.alert('Grade Update', msg);
                    
                    if (Platform.OS !== 'web') {
                        for (const change of changes) {
                            if (change.type === 'grade_changed' && typeof change.oldGrade === 'number' && typeof change.newGrade === 'number') {
                                scheduleGradeChangeNotification(change.className, change.oldGrade, change.newGrade).catch(() => {});
                            }
                        }
                    }
                }
            } else {
                throw new Error('No grades found');
            }
            await AsyncStorage.setItem('isDemoData', 'false');
        } catch (err) {
            console.error(err);
            setFetchError(true);
        } finally {
            setIsSyncing(false);
        }
    };

    // ── Manual class CRUD ─────────────────────────────────────
    const addManualClass = async () => {
        if (!newClassName.trim()) return;
        const cls = {
            id: uid(), name: newClassName.trim(), teacher: newClassTeacher.trim(),
            type: newClassType, period: '', room: '', grade: 0,
            assignments: [], isManual: true,
            ...buildGP(0, newClassType),
        };
        const updated = [...manClasses, cls];
        setManClasses(updated);
        await saveManual(updated);
        setShowAddClass(false);
        setNewClassName(''); setNewClassTeacher(''); setNewClassType('ST');
        setSelectedClass(cls);
    };

    const deleteManualClass = async (id) => {
        const updated = manClasses.filter(c => c.id !== id);
        setManClasses(updated);
        await saveManual(updated);
        setSelectedClass(null);
    };

    // Add a real assignment (manual class, persists) OR a hypothetical/fake assignment
    // (synced class in hypo mode — ephemeral, discarded when hypo mode turns off).
    const addAssignment = async () => {
        if (!selectedClass) return;
        if (!newAsgnName.trim() || !newAsgnTotal) return;

        const scoreVal = newAsgnScore === '' ? null : parseFloat(newAsgnScore);
        const totalVal = parseFloat(newAsgnTotal);
        if (isNaN(totalVal) || totalVal <= 0) {
            Alert.alert('Invalid total', 'Total points must be a positive number.');
            return;
        }

        const asgn = {
            id: uid(),
            name: newAsgnName.trim(),
            title: newAsgnName.trim(),
            score: scoreVal !== null && !isNaN(scoreVal) ? scoreVal : null,
            total: totalVal,
            category: newAsgnCat,
            date: newAsgnDate || new Date().toLocaleDateString(),
            isGraded: scoreVal !== null && !isNaN(scoreVal),
        };

        if (selectedClass.isManual && !hypothetical) {
            // Real, persistent assignment on a manual class
            const updatedAsgns = [...(selectedClass.assignments || []), asgn];
            const newGrade = calcGrade(updatedAsgns) ?? 0;
            const gp = buildGP(newGrade, selectedClass.type);
            const updatedCls = { ...selectedClass, assignments: updatedAsgns, grade: +newGrade.toFixed(1), ...gp };
            const updated = manClasses.map(c => c.id === selectedClass.id ? updatedCls : c);
            setManClasses(updated);
            setSelectedClass(updatedCls);
            await saveManual(updated);
        } else {
            // Hypothetical fake assignment — ephemeral, stored in hypoAssignments
            asgn.isHypothetical = true;
            setHypoAssignments(prev => ({
                ...prev,
                [selectedClass.id]: [...(prev[selectedClass.id] || []), asgn],
            }));
            // Turn hypothetical mode on automatically if it wasn't already
            if (!hypothetical) setHypothetical(true);
        }

        setShowAddAsgn(false);
        setNewAsgnName(''); setNewAsgnScore(''); setNewAsgnTotal('100');
        setNewAsgnCat('Summative'); setNewAsgnDate('');
    };

    const deleteAssignment = async (asgnId) => {
        if (!selectedClass?.isManual) return;
        const updatedAsgns = selectedClass.assignments.filter(a => a.id !== asgnId);
        const newGrade = calcGrade(updatedAsgns) ?? 0;
        const gp = buildGP(newGrade, selectedClass.type);
        const updatedCls = { ...selectedClass, assignments: updatedAsgns, grade: +newGrade.toFixed(1), ...gp };
        const updated = manClasses.map(c => c.id === selectedClass.id ? updatedCls : c);
        setManClasses(updated);
        setSelectedClass(updatedCls);
        await saveManual(updated);
    };

    const deleteHypoAssignment = (asgnId) => {
        if (!selectedClass) return;
        setHypoAssignments(prev => ({
            ...prev,
            [selectedClass.id]: (prev[selectedClass.id] || []).filter(a => a.id !== asgnId),
        }));
    };

    // Patch a single fake hypothetical assignment in place (used by inline editing).
    const updateHypoAssignment = (asgnId, patch) => {
        if (!selectedClass) return;
        setHypoAssignments(prev => ({
            ...prev,
            [selectedClass.id]: (prev[selectedClass.id] || []).map(a =>
                a.id === asgnId ? { ...a, ...patch } : a
            ),
        }));
    };

    // Add a blank fake hypothetical assignment directly to the top of the list,
    // so the student can edit its fields inline rather than filling out a modal.
    const addBlankHypoAssignment = () => {
        if (!selectedClass) return;
        const asgn = {
            id: uid(),
            name: '',
            title: '',
            // Stored as strings so TextInputs can bind directly without blowing up NaN.
            score: '',
            total: '100',
            category: 'Summative',
            date: new Date().toLocaleDateString(),
            isHypothetical: true,
            isGraded: false,
        };
        setHypoAssignments(prev => ({
            ...prev,
            // New items go to the top so they're immediately visible.
            [selectedClass.id]: [asgn, ...(prev[selectedClass.id] || [])],
        }));
        if (!hypothetical) setHypothetical(true);
    };

    // Cycle category on tap: Summative → Formative → Final → Summative
    const cycleHypoCategory = (asgnId, currentCat) => {
        const order = ['Summative', 'Formative', 'Final'];
        const idx = order.indexOf(currentCat);
        const next = order[(idx + 1) % order.length];
        updateHypoAssignment(asgnId, { category: next });
    };

    // ── GPA calc ─────────────────────────────────────────────
    const overallGPA = () => {
        if (!allClasses.length) return '—';
        const pts = allClasses.reduce((s, c) => {
            const g = parseFloat(c.grade) || 0;
            const { wGP } = buildGP(g, c.type);
            return s + wGP;
        }, 0);
        return (pts / allClasses.length).toFixed(2);
    };

    // ── Share Report Card (PDF) ────────────────────────────
    const shareReportCard = async () => {
        try {
            const rows = allClasses.map(c => {
                const g = parseFloat(c.grade) || 0;
                const letter = gradeLetter(g);
                const { wGP, uGP } = buildGP(g, c.type);
                const color = g >= 90 ? '#22c55e' : g >= 80 ? '#3b82f6' : g >= 70 ? '#f59e0b' : '#ef4444';
                return `<tr>
                    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:500;">${c.name}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${c.type || 'ST'}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:${color};font-weight:700;">${letter}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:${color};font-weight:600;">${g.toFixed(1)}%</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${wGP}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${uGP}</td>
                </tr>`;
            }).join('');

            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:32px;color:#1a1a2e;background:#fff}
                h1{font-size:24px;margin:0 0 4px}
                .sub{font-size:12px;color:#6b7280;margin-bottom:24px}
                .gpa-box{background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px 24px;margin-bottom:24px;display:inline-block}
                .gpa-label{font-size:10px;color:#6b7280;letter-spacing:2px;text-transform:uppercase}
                .gpa-val{font-size:28px;font-weight:700;color:#1a1a2e}
                table{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
                th{background:#f1f5f9;padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;text-align:left;border-bottom:2px solid #e5e7eb}
                td{font-size:14px}
                .footer{margin-top:24px;font-size:10px;color:#9ca3af;text-align:center}
            </style></head><body>
                <h1>Report Card</h1>
                <p class="sub">Current Period &middot; Generated ${new Date().toLocaleDateString()}</p>
                <div class="gpa-box"><div class="gpa-label">WEIGHTED GPA</div><div class="gpa-val">${overallGPA()}</div></div>
                <table>
                    <thead><tr><th>Class</th><th style="text-align:center">Type</th><th style="text-align:center">Grade</th><th style="text-align:center">Pct</th><th style="text-align:center">W.GPA</th><th style="text-align:center">U.GPA</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <p class="footer">Generated by Option App</p>
            </body></html>`;

            if (Platform.OS === 'web') {
                const w = window.open('', '_blank');
                if (w) { w.document.write(html); w.document.close(); w.print(); }
                return;
            }

            const { uri } = await Print.printToFileAsync({ html });
            await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
        } catch (err) {
            console.error('Share report error:', err);
            Alert.alert('Error', 'Could not generate report card.');
        }
    };

    // ── Build the effective assignment list for a class, applying hypoEdits
    // (score/total overrides) AND merging in any fake hypo assignments. Used both
    // for the hypothetical grade calc and (in hypo mode) for rendering.
    const applyHypo = (cls) => {
        if (!cls) return [];
        const real = (cls.assignments || []).map(a => {
            const edit = hypoEdits[a.id];
            if (!edit) return a;
            const s = edit.score === '' || edit.score === undefined ? null : parseFloat(edit.score);
            const t = edit.total === '' || edit.total === undefined ? parseFloat(a.total) : parseFloat(edit.total);
            return {
                ...a,
                score: isNaN(s) ? null : s,
                total: isNaN(t) ? a.total : t,
                isGraded: !isNaN(s),
            };
        });
        const fake = (hypoAssignments[cls.id] || []);
        return [...real, ...fake];
    };

    const getHypoGrade = (cls) => {
        if (!hypothetical || !cls?.assignments) return null;
        return calcGrade(applyHypo(cls));
    };

    // ── Grade impact calc (how much an assignment moved the overall grade) ──
    const getGradeImpact = (cls, asgn) => {
        if (!cls?.assignments) return null;
        const without = cls.assignments.filter(a => a.id !== asgn.id);
        const gradeWith = calcGrade(cls.assignments);
        const gradeWithout = calcGrade(without);
        if (gradeWith === null || gradeWithout === null) return null;
        return gradeWith - gradeWithout;
    };

    // ─────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────

    if (isLoading) return (
        <View style={[S.center, { backgroundColor: theme.colors.bg }]}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
    );

    const cls = selectedClass;
    const gColor = cls ? gradeColor(parseFloat(cls.grade) || 0, theme) : theme.colors.accent;
    const clsHypoAssignments = cls ? (hypoAssignments[cls.id] || []) : [];

    // The list of assignments to RENDER in detail view:
    //  - In hypothetical mode: fake hypo assignments FIRST (newest on top), then real
    //  - Outside hypo mode: just real assignments
    const renderAssignments = cls
        ? (hypothetical
            ? [...clsHypoAssignments, ...(cls.assignments || [])]
            : (cls.assignments || []))
        : [];

    return (
        <View style={S.root}>
            <TopBar
                title={cls && !IS_WIDE ? cls.name : 'Gradebook'}
                subtitle={cls && !IS_WIDE
                    ? (cls.teacher || '')
                    : `Current Period · ${allClasses.length} class${allClasses.length === 1 ? '' : 'es'}`}
                actions={
                    cls && !IS_WIDE ? (
                        <TouchableOpacity
                            onPress={() => {
                                setSelectedClass(null);
                                setHypothetical(false);
                                setHypoEdits({});
                                setCatFilter('All');
                            }}
                            style={{
                                flexDirection: 'row', alignItems: 'center', gap: 6,
                                paddingHorizontal: 12, paddingVertical: 8,
                                borderRadius: 10,
                                backgroundColor: theme.colors.surface,
                                borderWidth: 1, borderColor: theme.colors.border2,
                            }}
                        >
                            <ChevronLeft size={14} color={theme.colors.ink2} />
                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '600', color: theme.colors.ink2 }}>
                                Back
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            onPress={() => syncCurrentGrades()}
                            disabled={isSyncing}
                            style={{
                                flexDirection: 'row', alignItems: 'center', gap: 6,
                                paddingHorizontal: 12, paddingVertical: 8,
                                borderRadius: 10,
                                backgroundColor: theme.colors.surface,
                                borderWidth: 1, borderColor: theme.colors.border2,
                            }}
                        >
                            {isSyncing
                                ? <ActivityIndicator size="small" color={theme.colors.ink3} />
                                : <RefreshCw size={14} color={theme.colors.ink2} />
                            }
                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '600', color: theme.colors.ink2 }}>
                                Sync
                            </Text>
                        </TouchableOpacity>
                    )
                }
            />

            {/* Two-panel container for wide web */}
            <View style={{ flex: 1, flexDirection: IS_WIDE ? 'row' : 'column' }}>

            {/* CLASS LIST */}
            {(!cls || IS_WIDE) && (
                <ScrollView
                    style={IS_WIDE
                        ? { width: 320, flexShrink: 0, borderRightWidth: 1, borderRightColor: theme.colors.border, backgroundColor: theme.colors.surface }
                        : { flex: 1 }
                    }
                    contentContainerStyle={S.listContent}
                    showsVerticalScrollIndicator={false}
                >
                    {allClasses.length > 0 && (
                        <View style={S.gpaBanner}>
                            <View>
                                <Text style={S.gpaBannerLabel}>WEIGHTED GPA</Text>
                                <Text style={S.gpaBannerVal}>{overallGPA()}</Text>
                            </View>
                            <View>
                                <Text style={S.gpaBannerLabel}>CLASSES</Text>
                                <Text style={S.gpaBannerVal}>{allClasses.length}</Text>
                            </View>
                        </View>
                    )}

                    {allClasses.length > 0 && (
                        <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12, marginBottom: 16, ...theme.shadows.sm }}
                            onPress={shareReportCard}
                            activeOpacity={0.75}
                        >
                            <FileText size={16} color={theme.colors.accent} />
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, fontWeight: '600', color: theme.colors.accent }}>Share Report Card</Text>
                        </TouchableOpacity>
                    )}

                    {allClasses.length === 0 && fetchError && (
                        <View style={S.emptyState}>
                            <Text style={S.emptyIcon}>⚠️</Text>
                            <Text style={S.emptyTitle}>Sync Failed</Text>
                            <Text style={S.emptySub}>Could not pull grades for the current period. Please check your connection or try signing in again.</Text>
                        </View>
                    )}

                    {allClasses.length === 0 && !fetchError && !isSyncing && (
                        <View style={S.emptyState}>
                            <Text style={S.emptyIcon}>📚</Text>
                            <Text style={S.emptyTitle}>No grades yet</Text>
                            <Text style={S.emptySub}>Connect StudentVUE in Settings or add classes manually with the + button</Text>
                        </View>
                    )}

                    {allClasses.map((item) => {
                        const g = parseFloat(item.grade) || 0;
                        const color = gradeColor(g, theme);
                        const letter = gradeLetter(g);
                        return (
                            <TouchableOpacity key={item.id} style={S.classCard} onPress={() => { setSelectedClass(item); setCatFilter('All'); setHypothetical(false); setHypoEdits({}); }} activeOpacity={0.75}>
                                <View style={[S.classCardAccent, { backgroundColor: color }]} />
                                <View style={S.classCardBody}>
                                    <View style={{ flex: 1 }}>
                                        <View style={S.classCardTags}>
                                            <View style={[S.tag, item.type === 'AP' && S.tagAP, item.type === 'HN' && S.tagHN]}>
                                                <Text style={[S.tagTxt, (item.type === 'AP' || item.type === 'HN') && { color: '#fff' }]}>{item.type || 'ST'}</Text>
                                            </View>
                                            {item.period ? <Text style={S.periodTxt}>Period {item.period}</Text> : null}
                                            {item.isManual && <Text style={[S.periodTxt, { color: theme.colors.blue }]}>Manual</Text>}
                                        </View>
                                        <Text style={S.className} numberOfLines={2}>{item.name}</Text>
                                        {item.teacher ? <Text style={S.teacherTxt}>{item.teacher}</Text> : null}
                                    </View>
                                    <View style={S.gradeBlock}>
                                        <Text style={[S.gradeLetterBig, { color }]}>{letter}</Text>
                                        <Text style={[S.gradePctSmall, { color }]}>{g.toFixed(1)}%</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                    <View style={{ height: 100 }} />
                </ScrollView>
            )}

            {/* CLASS DETAIL */}
            {cls && (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                    {/* Detail header (matches design): color dot + type badge + title + teacher | actions */}
                    <View style={{
                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
                        paddingHorizontal: 32, paddingTop: 28, paddingBottom: 18,
                    }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: gColor }} />
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    {cls.type || 'ST'}{cls.period ? ` · Period ${cls.period}` : ''}{cls.isManual ? ' · Manual' : ''}
                                </Text>
                            </View>
                            <Text style={{
                                fontFamily: theme.fonts.d, fontSize: 26, fontWeight: '700',
                                color: theme.colors.ink, letterSpacing: -0.5,
                            }} numberOfLines={2}>
                                {cls.name}
                            </Text>
                            {cls.teacher ? (
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, marginTop: 4 }}>
                                    {cls.teacher} · W{cls.wGP || '—'} / U{cls.uGP || '—'}
                                </Text>
                            ) : null}
                        </View>
                        <TouchableOpacity
                            style={{
                                flexDirection: 'row', alignItems: 'center', gap: 6,
                                paddingHorizontal: 12, paddingVertical: 8,
                                backgroundColor: hypothetical ? theme.colors.blue + '18' : theme.colors.surface,
                                borderWidth: 1, borderColor: hypothetical ? theme.colors.blue : theme.colors.border2,
                                borderRadius: 10,
                            }}
                            onPress={() => {
                                const next = !hypothetical;
                                setHypothetical(next);
                                if (!next) {
                                    setHypoEdits({});
                                    setHypoAssignments(prev => ({ ...prev, [cls.id]: [] }));
                                }
                            }}
                        >
                            <Sparkles size={14} color={hypothetical ? theme.colors.blue : theme.colors.ink2} />
                            <Text style={{
                                fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '600',
                                color: hypothetical ? theme.colors.blue : theme.colors.ink2,
                            }}>
                                {hypothetical ? 'Exit hypothetical' : 'What-if mode'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* 3-card stat row (matches design) */}
                    <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 32, marginBottom: 24 }}>
                        {/* Letter + percent + bar */}
                        <View style={{
                            flex: 1.3,
                            backgroundColor: theme.colors.surface,
                            borderRadius: theme.radii.lg,
                            borderWidth: 1, borderColor: theme.colors.border,
                            padding: 18,
                            flexDirection: 'row', alignItems: 'center', gap: 18,
                            ...theme.shadows.sm,
                        }}>
                            <Text style={{
                                fontFamily: theme.fonts.d, fontSize: 52, fontWeight: '700',
                                color: gColor, letterSpacing: -2, lineHeight: 56,
                            }}>
                                {gradeLetter(parseFloat(cls.grade) || 0)}
                            </Text>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontFamily: theme.fonts.mono, fontSize: 26, fontWeight: '500', color: theme.colors.ink }}>
                                    {(parseFloat(cls.grade) || 0).toFixed(1)}%
                                </Text>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 2 }}>
                                    Current grade
                                </Text>
                                <View style={{ height: 6, backgroundColor: theme.colors.surface2, borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
                                    <View style={{ width: `${Math.min(100, parseFloat(cls.grade) || 0)}%`, height: '100%', backgroundColor: gColor, borderRadius: 3 }} />
                                </View>
                                {hypothetical && getHypoGrade(cls) !== null && (
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, color: theme.colors.blue, fontWeight: '600', marginTop: 6 }}>
                                        With what-ifs: {getHypoGrade(cls).toFixed(1)}%
                                    </Text>
                                )}
                            </View>
                        </View>

                        {/* Trend (mini sparkline) */}
                        {(() => {
                            const graded = (cls.assignments || []).filter(a => {
                                const s = numScore(a.score), t = parseFloat(a.total);
                                return !isNaN(s) && !isNaN(t) && t > 0;
                            });
                            const trendVal = graded.length >= 2
                                ? +(graded[graded.length - 1].score / graded[graded.length - 1].total * 100 - graded[0].score / graded[0].total * 100).toFixed(1)
                                : 0;
                            const trendColor = trendVal >= 0 ? theme.colors.green : theme.colors.red;
                            return (
                                <View style={{
                                    flex: 1,
                                    backgroundColor: theme.colors.surface,
                                    borderRadius: theme.radii.lg,
                                    borderWidth: 1, borderColor: theme.colors.border,
                                    padding: 18,
                                    ...theme.shadows.sm,
                                }}>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1 }}>
                                        Trend
                                    </Text>
                                    <Text style={{
                                        fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '700',
                                        color: trendColor, marginTop: 8,
                                    }}>
                                        {trendVal >= 0 ? '+' : ''}{trendVal}%
                                    </Text>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 4 }}>
                                        First → latest
                                    </Text>
                                </View>
                            );
                        })()}

                        {/* Assignment count */}
                        <View style={{
                            flex: 1,
                            backgroundColor: theme.colors.surface,
                            borderRadius: theme.radii.lg,
                            borderWidth: 1, borderColor: theme.colors.border,
                            padding: 18,
                            ...theme.shadows.sm,
                        }}>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1 }}>
                                Assignments
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                                <Text style={{ fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '700', color: theme.colors.ink }}>
                                    {(cls.assignments || []).length}
                                </Text>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 }}>
                                    · {(cls.assignments || []).filter(a => isNaN(numScore(a.score))).length} pending
                                </Text>
                            </View>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 8 }}>
                                {(() => {
                                    const graded = (cls.assignments || []).filter(a => {
                                        const s = numScore(a.score), t = parseFloat(a.total);
                                        return !isNaN(s) && !isNaN(t) && t > 0;
                                    });
                                    if (graded.length === 0) return 'No grades yet';
                                    const avg = Math.round(graded.reduce((sum, a) => sum + a.score / a.total * 100, 0) / graded.length);
                                    return `Avg: ${avg}%`;
                                })()}
                            </Text>
                        </View>
                    </View>

                    {/* Grade Trend Chart */}
                    {(() => {
                        const graded = (cls.assignments || []).filter(a => {
                            const s = numScore(a.score), t = parseFloat(a.total);
                            return !isNaN(s) && !isNaN(t) && t > 0;
                        });
                        if (graded.length < 2) return null;
                        const sorted = [...graded].sort((a, b) => {
                            const da = a.date ? new Date(a.date) : 0;
                            const db = b.date ? new Date(b.date) : 0;
                            return da - db;
                        });
                        const runningGrades = [];
                        for (let i = 1; i <= sorted.length; i++) {
                            const slice = sorted.slice(0, i);
                            const g = calcGrade(slice);
                            runningGrades.push(g !== null ? Math.round(g * 10) / 10 : 0);
                        }
                        const labels = sorted.map((a, i) =>
                            i === 0 || i === sorted.length - 1
                                ? (a.date ? a.date.replace(/\/\d{4}$/, '') : `${i + 1}`)
                                : ''
                        );
                        return (
                            <View style={S.gradeTrendCard} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
                                    GRADE TREND
                                </Text>
                                {chartWidth > 0 && (
                                    <LineChart
                                        data={{
                                            labels,
                                            datasets: [{ data: runningGrades, strokeWidth: 2 }],
                                        }}
                                        width={chartWidth - 28}
                                        height={140}
                                        yAxisSuffix="%"
                                        fromZero={false}
                                        withInnerLines={false}
                                        withOuterLines={false}
                                        withDots={runningGrades.length <= 15}
                                        chartConfig={{
                                            backgroundColor: 'transparent',
                                            backgroundGradientFrom: theme.colors.surface,
                                            backgroundGradientTo: theme.colors.surface,
                                            decimalPlaces: 1,
                                            color: () => gColor,
                                            labelColor: () => theme.colors.ink3,
                                            propsForLabels: { fontFamily: theme.fonts.m, fontSize: 10 },
                                            propsForDots: { r: '3', strokeWidth: '0', fill: gColor },
                                            fillShadowGradientFrom: gColor,
                                            fillShadowGradientFromOpacity: 0.15,
                                            fillShadowGradientTo: gColor,
                                            fillShadowGradientToOpacity: 0,
                                        }}
                                        style={{ borderRadius: 8, paddingRight: 20 }}
                                    />
                                )}
                            </View>
                        );
                    })()}

                    {/* (Hypothetical toggle moved to header above) */}

                    {/* Section heading + filter pills (matches design) */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 32, marginBottom: 14 }}>
                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink }}>
                            Assignments
                        </Text>
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 }}>
                            ({(cls.assignments || []).length})
                        </Text>
                    </View>

                    {/* Category filter tabs */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: 20, marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
                        {(() => {
                            const cats = new Set(['All']);
                            renderAssignments.forEach(a => cats.add(a.category || 'Other'));
                            return [...cats].map(cat => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[S.filterChip, catFilter === cat && S.filterChipActive]}
                                    onPress={() => setCatFilter(cat)}
                                >
                                    {cat !== 'All' && (
                                        <View style={[S.filterDot, { backgroundColor: cat === 'Summative' ? theme.colors.blue : cat === 'Formative' ? theme.colors.orange : cat === 'Final' ? theme.colors.purple : theme.colors.ink3 }]} />
                                    )}
                                    <Text style={[S.filterChipTxt, catFilter === cat && S.filterChipTxtActive]}>{cat}</Text>
                                </TouchableOpacity>
                            ));
                        })()}
                    </ScrollView>

                    {/* Assignment list */}
                    <View style={{ flex: 1, paddingBottom: 120 }}>
                        {renderAssignments.length === 0 && (
                            <View style={S.emptyState}>
                                <Text style={S.emptyIcon}>📝</Text>
                                <Text style={S.emptyTitle}>No assignments</Text>
                                {(cls.isManual || hypothetical) && <Text style={S.emptySub}>Tap + to add an assignment</Text>}
                            </View>
                        )}
                        {/* TABLE VIEW (matches design) — non-hypothetical mode only */}
                        {!hypothetical && renderAssignments.length > 0 && (
                            <View style={{
                                marginHorizontal: 32, marginBottom: 14,
                                backgroundColor: theme.colors.surface,
                                borderRadius: theme.radii.lg,
                                borderWidth: 1, borderColor: theme.colors.border,
                                overflow: 'hidden',
                                ...theme.shadows.sm,
                            }}>
                                {/* Table header */}
                                <View style={{
                                    flexDirection: 'row',
                                    paddingVertical: 12, paddingHorizontal: 18,
                                    backgroundColor: theme.colors.surface2 + '60',
                                    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
                                }}>
                                    <Text style={{ flex: 2.5, fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' }}>
                                        Assignment
                                    </Text>
                                    <Text style={{ flex: 1, fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' }}>
                                        Category
                                    </Text>
                                    <Text style={{ flex: 1, fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' }}>
                                        Date
                                    </Text>
                                    <Text style={{ flex: 1, fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' }}>
                                        Score
                                    </Text>
                                    <Text style={{ flex: 1, fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600', textAlign: 'right' }}>
                                        Grade
                                    </Text>
                                </View>

                                {/* Table rows */}
                                {renderAssignments
                                    .filter(a => catFilter === 'All' || (a.category || 'Other') === catFilter)
                                    .map((a, i, arr) => {
                                        const s = numScore(a.score);
                                        const t = parseFloat(a.total);
                                        const hasPts = !isNaN(s) && !isNaN(t) && t > 0;
                                        const pct = hasPts ? (s / t) * 100 : null;
                                        const ac = pct !== null ? gradeColor(pct, theme) : theme.colors.ink4;
                                        const catColor = a.category === 'Summative' ? theme.colors.blue
                                            : a.category === 'Final' ? theme.colors.purple
                                            : a.category === 'Formative' ? theme.colors.orange
                                            : theme.colors.ink3;
                                        // Pick an icon based on category/name
                                        const lowerName = (a.name || a.title || '').toLowerCase();
                                        const iconChar = lowerName.includes('essay') ? '📄'
                                            : lowerName.includes('lab') ? '🧪'
                                            : lowerName.includes('quiz') ? '❓'
                                            : lowerName.includes('test') || lowerName.includes('exam') ? '✅'
                                            : '✏️';
                                        return (
                                            <View key={a.id || i} style={{
                                                flexDirection: 'row', alignItems: 'center',
                                                paddingVertical: 13, paddingHorizontal: 18,
                                                borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                                                borderBottomColor: theme.colors.border,
                                            }}>
                                                <View style={{ flex: 2.5, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                    <View style={{
                                                        width: 26, height: 26, borderRadius: 7,
                                                        backgroundColor: catColor + '15',
                                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                    }}>
                                                        <Text style={{ fontSize: 13 }}>{iconChar}</Text>
                                                    </View>
                                                    <Text style={{ flex: 1, fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '500', color: theme.colors.ink }} numberOfLines={1}>
                                                        {a.name || a.title}
                                                    </Text>
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <View style={{
                                                        alignSelf: 'flex-start',
                                                        paddingHorizontal: 8, paddingVertical: 3,
                                                        backgroundColor: theme.colors.surface2,
                                                        borderRadius: 6,
                                                    }}>
                                                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, fontWeight: '600', color: catColor }}>
                                                            {a.category || 'Other'}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <Text style={{ flex: 1, fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2 }}>
                                                    {a.date || '—'}
                                                </Text>
                                                <Text style={{ flex: 1, fontFamily: theme.fonts.mono, fontSize: 12, color: theme.colors.ink2 }}>
                                                    {hasPts ? `${s % 1 === 0 ? s : s.toFixed(1)}/${t % 1 === 0 ? t : t.toFixed(1)}` : '—'}
                                                </Text>
                                                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                                    {pct !== null ? (
                                                        <View style={{
                                                            paddingHorizontal: 8, paddingVertical: 3,
                                                            backgroundColor: ac + '18',
                                                            borderRadius: 6,
                                                        }}>
                                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, fontWeight: '700', color: ac }}>
                                                                {Math.round(pct)}%
                                                            </Text>
                                                        </View>
                                                    ) : (
                                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink4 }}>
                                                            Pending
                                                        </Text>
                                                    )}
                                                </View>
                                            </View>
                                        );
                                    })
                                }
                            </View>
                        )}

                        {/* What-if calculator hint card (matches design) */}
                        {!hypothetical && renderAssignments.length > 0 && (() => {
                            const curG = parseFloat(cls.grade) || 0;
                            const target = curG >= 90 ? 95 : 90;
                            const pending = (cls.assignments || []).filter(a => isNaN(numScore(a.score))).length;
                            return (
                                <View style={{
                                    marginHorizontal: 32, marginTop: 14, marginBottom: 14,
                                    padding: 18,
                                    borderRadius: theme.radii.lg,
                                    borderWidth: 1, borderColor: theme.colors.purple + '30',
                                    backgroundColor: theme.colors.purple + '06',
                                    flexDirection: 'row', alignItems: 'center', gap: 14,
                                }}>
                                    <View style={{
                                        width: 42, height: 42, borderRadius: 10,
                                        backgroundColor: theme.colors.purple + '20',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Sparkles size={20} color={theme.colors.purple} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink }}>
                                            What-if calculator
                                        </Text>
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 3 }}>
                                            {pending > 0
                                                ? `${pending} assignment${pending > 1 ? 's' : ''} ungraded. Try hypothetical mode to model your final grade.`
                                                : `Test scenarios with hypothetical scores to plan ahead.`
                                            }
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => setHypothetical(true)}
                                        style={{
                                            paddingHorizontal: 14, paddingVertical: 8,
                                            backgroundColor: theme.colors.purple,
                                            borderRadius: 10,
                                        }}
                                    >
                                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '600', color: '#fff' }}>
                                            Try it →
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })()}

                        {/* CARD VIEW (hypothetical mode only — preserves inline editing) */}
                        {hypothetical && renderAssignments
                            .filter(a => catFilter === 'All' || (a.category || 'Other') === catFilter)
                            .map((a, i) => {
                                // Current effective score/total in this render context
                                const realS = numScore(a.score);
                                const realT = parseFloat(a.total);
                                const edit = hypoEdits[a.id];
                                const editS = edit ? (edit.score === '' ? NaN : parseFloat(edit.score)) : NaN;
                                const editT = edit && edit.total !== undefined && edit.total !== '' ? parseFloat(edit.total) : NaN;
                                const s = hypothetical && edit && !isNaN(editS) ? editS : realS;
                                const t = hypothetical && edit && !isNaN(editT) ? editT : realT;
                                const hasPts = !isNaN(s) && !isNaN(t) && t > 0;
                                const pct = hasPts ? (s / t) * 100 : null;
                                const ac = pct !== null ? gradeColor(pct, theme) : theme.colors.border;
                                const impact = hasPts && !a.isHypothetical ? getGradeImpact(cls, a) : null;
                                const isNew = isAssignmentNew(gradeChanges, cls.name, a.name || a.title);
                                const isFakeHypo = !!a.isHypothetical;

                                // Color helpers for category badge (used in both Text and Pressable branches)
                                const catColor = a.category === 'Summative' ? theme.colors.blue
                                    : a.category === 'Final' ? theme.colors.purple
                                    : a.category === 'Formative' ? theme.colors.orange
                                    : theme.colors.ink3;

                                return (
                                    <View key={a.id || i} style={[S.asgnCard, { borderLeftColor: ac }]}>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                                                {isFakeHypo ? (
                                                    <TextInput
                                                        style={S.hypoNameInput}
                                                        placeholder="Assignment name"
                                                        placeholderTextColor={theme.colors.ink3}
                                                        value={a.name || ''}
                                                        onChangeText={(v) => updateHypoAssignment(a.id, { name: v, title: v })}
                                                    />
                                                ) : (
                                                    <Text style={S.asgnName} numberOfLines={2}>{a.name || a.title}</Text>
                                                )}
                                                {isNew && (
                                                    <View style={{ backgroundColor: theme.colors.green + '20', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 8, fontWeight: '700', color: theme.colors.green, letterSpacing: 0.5 }}>New</Text>
                                                    </View>
                                                )}
                                                {isFakeHypo && (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.colors.blue + '20', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                                        <Sparkles size={8} color={theme.colors.blue} />
                                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 8, fontWeight: '700', color: theme.colors.blue, letterSpacing: 0.5 }}>HYPO</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                {isFakeHypo ? (
                                                    <TouchableOpacity
                                                        onPress={() => cycleHypoCategory(a.id, a.category)}
                                                        style={[S.catBadge, { backgroundColor: catColor + '15', flexDirection: 'row', alignItems: 'center', gap: 3 }]}
                                                        activeOpacity={0.7}
                                                    >
                                                        <Text style={[S.catBadgeTxt, { color: catColor }]}>{a.category || 'Summative'}</Text>
                                                        <Text style={{ fontSize: 8, color: catColor }}>▾</Text>
                                                    </TouchableOpacity>
                                                ) : (
                                                    <View style={[S.catBadge, { backgroundColor: catColor + '15' }]}>
                                                        <Text style={[S.catBadgeTxt, { color: catColor }]}>{a.category || 'Other'}</Text>
                                                    </View>
                                                )}
                                                {a.date && !isFakeHypo ? <Text style={S.asgnDate}>{a.date}</Text> : null}
                                                {!hasPts && !hypothetical && <Text style={[S.catBadgeTxt, { color: theme.colors.ink3 }]}>Not Graded</Text>}
                                            </View>
                                            {hasPts && (
                                                <View style={S.progressTrack}>
                                                    <View style={[S.progressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: ac }]} />
                                                </View>
                                            )}
                                        </View>
                                        <View style={{ alignItems: 'flex-end', minWidth: 90 }}>
                                            {hypothetical ? (
                                                <>
                                                    {/* Hypothetical mode: always show editable score/total. Fake hypos
                                                        write directly into hypoAssignments; real assignments write to hypoEdits overrides. */}
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                        <TextInput
                                                            style={S.hypoInput}
                                                            placeholder="—"
                                                            placeholderTextColor={theme.colors.ink3}
                                                            value={
                                                                isFakeHypo
                                                                    ? String(a.score ?? '')
                                                                    : (edit && edit.score !== undefined
                                                                        ? String(edit.score)
                                                                        : (isNaN(realS) ? '' : String(realS)))
                                                            }
                                                            onChangeText={(v) => {
                                                                if (isFakeHypo) {
                                                                    updateHypoAssignment(a.id, { score: v, isGraded: v !== '' });
                                                                } else {
                                                                    setHypoEdits(prev => ({
                                                                        ...prev,
                                                                        [a.id]: {
                                                                            score: v,
                                                                            total: prev[a.id]?.total ?? (isNaN(realT) ? '' : String(realT)),
                                                                        },
                                                                    }));
                                                                }
                                                            }}
                                                            keyboardType="numeric"
                                                            selectTextOnFocus
                                                        />
                                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3 }}>/</Text>
                                                        <TextInput
                                                            style={S.hypoInput}
                                                            placeholder="—"
                                                            placeholderTextColor={theme.colors.ink3}
                                                            value={
                                                                isFakeHypo
                                                                    ? String(a.total ?? '')
                                                                    : (edit && edit.total !== undefined
                                                                        ? String(edit.total)
                                                                        : (isNaN(realT) || realT === 0 ? '' : String(realT)))
                                                            }
                                                            onChangeText={(v) => {
                                                                if (isFakeHypo) {
                                                                    updateHypoAssignment(a.id, { total: v });
                                                                } else {
                                                                    setHypoEdits(prev => ({
                                                                        ...prev,
                                                                        [a.id]: {
                                                                            score: prev[a.id]?.score ?? (isNaN(realS) ? '' : String(realS)),
                                                                            total: v,
                                                                        },
                                                                    }));
                                                                }
                                                            }}
                                                            keyboardType="numeric"
                                                            selectTextOnFocus
                                                        />
                                                    </View>
                                                    {hasPts && <Text style={[S.asgnPct, { color: ac }]}>{Math.round(pct)}%</Text>}
                                                </>
                                            ) : hasPts ? (
                                                <>
                                                    {impact !== null && (
                                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: impact >= 0 ? theme.colors.green : theme.colors.red, fontWeight: '600' }}>
                                                            {impact >= 0 ? '+' : ''}{impact.toFixed(2)}%
                                                        </Text>
                                                    )}
                                                    <Text style={[S.asgnScore, { color: ac }]}>{s % 1 === 0 ? s : s.toFixed(1)}/{t % 1 === 0 ? t : t.toFixed(1)}</Text>
                                                    <Text style={[S.asgnPct, { color: ac }]}>{Math.round(pct)}%</Text>
                                                </>
                                            ) : (
                                                <Text style={[S.asgnScore, { color: theme.colors.ink4, fontSize: 16 }]}>{t > 0 ? t : '—'}</Text>
                                            )}

                                            {/* Assignment reminder bell */}
                                            {(() => {
                                                const dateStr = a.due_date || a.date;
                                                if (!dateStr || Platform.OS === 'web' || isFakeHypo) return null;
                                                const parsed = new Date(dateStr);
                                                if (isNaN(parsed.getTime()) || parsed <= new Date()) return null;
                                                return (
                                                    <TouchableOpacity
                                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                        style={{ marginTop: 4 }}
                                                        onPress={async () => {
                                                            try {
                                                                const reminderDate = new Date(parsed.getTime() - 2 * 24 * 60 * 60 * 1000);
                                                                const now = new Date();
                                                                if (reminderDate <= now) {
                                                                    Alert.alert('Too Soon', 'This assignment is due in less than 2 days.');
                                                                    return;
                                                                }
                                                                await Notifications.scheduleNotificationAsync({
                                                                    content: { title: 'Assignment Due Soon', body: `"${a.name || a.title}" is due in 2 days` },
                                                                    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate },
                                                                });
                                                                Alert.alert('Reminder Set', `Reminder set for ${reminderDate.toLocaleDateString()}`);
                                                            } catch (err) {
                                                                console.warn('Failed to schedule reminder:', err);
                                                                Alert.alert('Error', 'Could not schedule reminder.');
                                                            }
                                                        }}
                                                    >
                                                        <Bell size={13} color={theme.colors.blue} />
                                                    </TouchableOpacity>
                                                );
                                            })()}

                                            {/* Delete button: real assignments on manual classes, OR fake hypo assignments */}
                                            {isFakeHypo ? (
                                                <TouchableOpacity onPress={() => deleteHypoAssignment(a.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 4 }}>
                                                    <Trash2 size={13} color={theme.colors.red} />
                                                </TouchableOpacity>
                                            ) : cls.isManual && (
                                                <TouchableOpacity onPress={() => deleteAssignment(a.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 4 }}>
                                                    <Trash2 size={13} color={theme.colors.red} />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                );
                            })
                        }
                    </View>

                    {cls.isManual && (
                        <TouchableOpacity style={S.deleteClassBtn} onPress={() => Alert.alert('Delete class?', `Remove "${cls.name}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteManualClass(cls.id) }])}>
                            <Trash2 size={14} color={theme.colors.red} />
                            <Text style={[S.deleteClassTxt]}>Delete Class</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>
            )}

            </View>{/* close two-panel container */}

            {/* FAB: Add class */}
            {(!cls || IS_WIDE) && (
                <TouchableOpacity style={S.fab} onPress={() => setShowAddClass(true)} activeOpacity={0.85}>
                    <Plus size={22} color="#fff" />
                </TouchableOpacity>
            )}

            {/* FAB: Add assignment
                - In hypothetical mode on ANY class → spawn a blank hypo assignment inline (no modal)
                - On a manual class (not in hypo mode) → open the modal for a real, persistent assignment */}
            {cls && (cls.isManual || hypothetical) && (
                <TouchableOpacity
                    style={S.fab}
                    onPress={() => {
                        if (hypothetical) {
                            addBlankHypoAssignment();
                        } else {
                            setShowAddAsgn(true);
                        }
                    }}
                    activeOpacity={0.85}
                >
                    <Plus size={22} color="#fff" />
                </TouchableOpacity>
            )}

            {/* ADD CLASS MODAL */}
            <Modal visible={showAddClass} transparent animationType="slide" onRequestClose={() => setShowAddClass(false)}>
                <Pressable style={S.modalOverlay} onPress={() => setShowAddClass(false)}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <Pressable style={S.modalSheet}>
                            <View style={S.modalHandle} />
                            <Text style={S.modalTitle}>Add Class</Text>
                            <Text style={S.inputLabel}>Class Name</Text>
                            <TextInput style={S.input} placeholder="e.g. AP Calculus BC" placeholderTextColor={theme.colors.ink3} value={newClassName} onChangeText={setNewClassName} autoFocus />
                            <Text style={S.inputLabel}>Teacher (optional)</Text>
                            <TextInput style={S.input} placeholder="e.g. Mr. Smith" placeholderTextColor={theme.colors.ink3} value={newClassTeacher} onChangeText={setNewClassTeacher} />
                            <Text style={S.inputLabel}>Type</Text>
                            <View style={S.segRow}>
                                {['AP', 'HN', 'ST'].map(t => (
                                    <TouchableOpacity key={t} style={[S.seg, newClassType === t && S.segActive]} onPress={() => setNewClassType(t)}>
                                        <Text style={[S.segTxt, newClassType === t && S.segTxtActive]}>{t}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TouchableOpacity style={[S.calcBtn, { marginTop: 18 }]} onPress={addManualClass}>
                                <Text style={S.calcBtnTxt}>Add Class</Text>
                            </TouchableOpacity>
                        </Pressable>
                    </KeyboardAvoidingView>
                </Pressable>
            </Modal>

            {/* ADD ASSIGNMENT MODAL */}
            <Modal visible={showAddAsgn} transparent animationType="slide" onRequestClose={() => setShowAddAsgn(false)}>
                <Pressable style={S.modalOverlay} onPress={() => setShowAddAsgn(false)}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <Pressable style={S.modalSheet}>
                            <View style={S.modalHandle} />
                            <Text style={S.modalTitle}>
                                {cls && !cls.isManual ? 'Add Hypothetical Assignment' : 'Add Assignment'}
                            </Text>
                            {cls && !cls.isManual && (
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, paddingHorizontal: 20, marginBottom: 4, marginTop: -4 }}>
                                    This assignment is only for "what if" calculations and won't be saved permanently.
                                </Text>
                            )}
                            <Text style={S.inputLabel}>Name</Text>
                            <TextInput style={S.input} placeholder="e.g. Unit Test" placeholderTextColor={theme.colors.ink3} value={newAsgnName} onChangeText={setNewAsgnName} autoFocus />
                            <Text style={S.inputLabel}>Score (leave blank for ungraded)</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TextInput style={[S.input, { flex: 1, marginRight: 0 }]} placeholder="Score" placeholderTextColor={theme.colors.ink3} keyboardType="numeric" value={newAsgnScore} onChangeText={setNewAsgnScore} />
                                <TextInput style={[S.input, { flex: 1, marginLeft: 0 }]} placeholder="Total" placeholderTextColor={theme.colors.ink3} keyboardType="numeric" value={newAsgnTotal} onChangeText={setNewAsgnTotal} />
                            </View>
                            <Text style={S.inputLabel}>Category</Text>
                            <View style={S.segRow}>
                                {['Summative', 'Formative', 'Final'].map(c => (
                                    <TouchableOpacity key={c} style={[S.seg, newAsgnCat === c && S.segActive]} onPress={() => setNewAsgnCat(c)}>
                                        <Text style={[S.segTxt, newAsgnCat === c && S.segTxtActive]}>{c}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={S.inputLabel}>Date (optional)</Text>
                            <TextInput style={S.input} placeholder="e.g. Mar 5" placeholderTextColor={theme.colors.ink3} value={newAsgnDate} onChangeText={setNewAsgnDate} />
                            <TouchableOpacity style={[S.calcBtn, { marginTop: 18 }]} onPress={addAssignment}>
                                <Text style={S.calcBtnTxt}>
                                    {cls && !cls.isManual ? 'Add Hypothetical' : 'Add Assignment'}
                                </Text>
                            </TouchableOpacity>
                        </Pressable>
                    </KeyboardAvoidingView>
                </Pressable>
            </Modal>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────
const getStyles = (theme) => StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 52, paddingBottom: 12 },
    title: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5 },
    titleSub: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    backTxt: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3 },
    headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    syncBtn: { padding: 8, borderRadius: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },

    tabsScroll: { paddingLeft: 24, marginBottom: 10, flexGrow: 0 },
    tabsContent: { gap: 8, paddingRight: 24 },
    qTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', ...theme.shadows.sm },
    qTabActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    qTabTxt: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2, fontWeight: '700' },
    qTabTxtActive: { color: theme.colors.bg, fontWeight: '700' },

    listContent: { paddingHorizontal: 20, paddingTop: 4 },
    gpaBanner: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 18, marginBottom: 16, ...theme.shadows.sm },
    gpaBannerLabel: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
    gpaBannerVal: { fontFamily: theme.fonts.d, fontSize: 28, fontWeight: '700', color: theme.colors.ink, letterSpacing: -1 },

    classCard: { backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 16, overflow: 'hidden', flexDirection: 'row', ...theme.shadows.sm },
    classCardAccent: { width: 5 },
    classCardBody: { flex: 1, padding: 16, flexDirection: 'row', alignItems: 'center' },
    classCardTags: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 },
    className: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700', color: theme.colors.ink, lineHeight: 22 },
    teacherTxt: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 3 },
    periodTxt: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3 },
    gradeBlock: { alignItems: 'flex-end', marginLeft: 12 },
    gradeLetterBig: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '700', letterSpacing: -1, lineHeight: 38 },
    gradePctSmall: { fontFamily: theme.fonts.m, fontSize: 11, fontWeight: '600' },

    tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border },
    tagAP: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
    tagHN: { backgroundColor: theme.colors.ink2, borderColor: theme.colors.ink2 },
    tagTxt: { fontFamily: theme.fonts.m, fontSize: 8, fontWeight: '700', color: theme.colors.ink2, letterSpacing: 0.5, textTransform: 'uppercase' },

    detailHeader: { margin: 20, marginBottom: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'flex-start', borderLeftWidth: 3, ...theme.shadows.md },
    detailName: { fontFamily: theme.fonts.d, fontSize: 24, fontWeight: '700', color: theme.colors.ink, marginBottom: 4, lineHeight: 28 },
    detailMeta: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginBottom: 8 },
    detailTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },

    gradeTrendCard: { marginHorizontal: 20, marginBottom: 12, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 14, ...theme.shadows.sm },

    controlsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginBottom: 8 },
    hypoToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: theme.radii.r, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
    hypoToggleActive: { backgroundColor: theme.colors.blue + '10', borderColor: theme.colors.blue + '40' },
    hypoCheckbox: { width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, borderColor: theme.colors.ink3, alignItems: 'center', justifyContent: 'center' },
    hypoLabel: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2 },

    filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radii.round, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
    filterChipActive: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
    filterDot: { width: 8, height: 8, borderRadius: 4 },
    filterChipTxt: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2 },
    filterChipTxtActive: { color: theme.colors.bg, fontWeight: '600' },

    asgnCard: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, marginHorizontal: 20, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 8, borderLeftWidth: 3, ...theme.shadows.sm },
    asgnName: { fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '500', color: theme.colors.ink, lineHeight: 18 },
    asgnDate: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3 },
    asgnScore: { fontFamily: theme.fonts.m, fontSize: 13, fontWeight: '700' },
    asgnPct: { fontFamily: theme.fonts.m, fontSize: 11, marginTop: 1 },
    catBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    catBadgeTxt: { fontFamily: theme.fonts.m, fontSize: 10, fontWeight: '600' },
    progressTrack: { height: 4, backgroundColor: theme.colors.surface2, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
    progressFill: { height: 4, borderRadius: 2 },
    hypoInput: { backgroundColor: theme.colors.blue + '10', borderWidth: 1, borderColor: theme.colors.blue, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.blue, textAlign: 'center', minWidth: 40, width: 44 },
    hypoNameInput: { flex: 1, minWidth: 140, fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '500', color: theme.colors.ink, backgroundColor: theme.colors.blue + '08', borderBottomWidth: 1, borderBottomColor: theme.colors.blue + '40', paddingVertical: 2, paddingHorizontal: 4, borderRadius: 4 },

    inputLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginTop: 14, paddingHorizontal: 20 },
    input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 13, fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink, marginHorizontal: 20, marginBottom: 0 },
    segRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 4 },
    seg: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border },
    segActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    segTxt: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink },
    segTxtActive: { color: theme.colors.bg, fontWeight: '700' },
    calcBtn: { backgroundColor: theme.colors.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginHorizontal: 20, marginTop: 12, ...theme.shadows.sm },
    calcBtnTxt: { fontFamily: theme.fonts.s, fontSize: 15, color: theme.colors.bg, letterSpacing: 0.5 },

    fab: { position: 'absolute', bottom: 32, right: 24, backgroundColor: theme.colors.accent, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: theme.colors.accent, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 0, paddingTop: 12, paddingBottom: 40 },
    modalHandle: { width: 36, height: 4, backgroundColor: theme.colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    modalTitle: { fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '700', color: theme.colors.ink, paddingHorizontal: 20, marginBottom: 8 },

    deleteClassBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 8, padding: 10 },
    deleteClassTxt: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.red },

    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyIcon: { fontSize: 42, marginBottom: 12 },
    emptyTitle: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700', color: theme.colors.ink, marginBottom: 6 },
    emptySub: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, textAlign: 'center', lineHeight: 18, paddingHorizontal: 32 },
});
