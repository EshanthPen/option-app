import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    Alert, ScrollView, Modal, ActivityIndicator, Platform,
    KeyboardAvoidingView, Pressable
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, RefreshCw, Plus, Wand2, Target, BookOpen, Trash2 } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

const webAlert = (title, message, buttons) => {
    if (Platform.OS === 'web') {
        if (buttons && buttons.length > 1) {
            const confirmed = window.confirm(`${title}\n\n${message}`);
            if (confirmed) {
                const destructive = buttons.find(b => b.style === 'destructive');
                if (destructive?.onPress) destructive.onPress();
            }
        } else {
            window.alert(`${title}: ${message}`);
        }
    } else {
        Alert.alert(title, message, buttons);
    }
};
import { parseStudentVueGradebook } from '../utils/studentVueParser';

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

// ── Grade calculation (weighted: Summative 70%, Formative 30%, Final 20% of total) ──
const calcGrade = (assignments) => {
    const cats = { Summative: { e: 0, p: 0 }, Formative: { e: 0, p: 0 }, Final: { e: 0, p: 0 } };
    (assignments || []).forEach(a => {
        const s = parseFloat(a.score), t = parseFloat(a.total);
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
    const [periods, setPeriods] = useState([]);
    const [curPeriodIdx, setCurPeriodIdx] = useState(null);
    const [curPeriodName, setCurPeriodName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);

    // Navigation
    const [selectedClass, setSelectedClass] = useState(null);
    const [viewMode, setViewMode] = useState('assignments');

    // What-If
    const [wiScore, setWiScore] = useState('');
    const [wiTotal, setWiTotal] = useState('');
    const [wiCat, setWiCat] = useState('Summative');
    const [wiResult, setWiResult] = useState(null);

    // Target
    const [tGrade, setTGrade] = useState('');
    const [tPts, setTPts] = useState('');
    const [tCat, setTCat] = useState('Summative');
    const [tResult, setTResult] = useState(null);

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
                const [svRaw, perRaw, pName, pIdx, manRaw] = await Promise.all([
                    AsyncStorage.getItem('studentVueGrades'),
                    AsyncStorage.getItem('studentVuePeriods'),
                    AsyncStorage.getItem('studentVuePeriodName'),
                    AsyncStorage.getItem('studentVuePeriodIndex'),
                    AsyncStorage.getItem(MANUAL_KEY),
                ]);
                if (svRaw) setSvClasses(JSON.parse(svRaw));
                if (perRaw) setPeriods(JSON.parse(perRaw));
                if (pName) setCurPeriodName(pName);
                if (pIdx !== null) setCurPeriodIdx(parseInt(pIdx));
                if (manRaw) setManClasses(JSON.parse(manRaw));
            } catch (e) { console.error(e); }
            finally { setIsLoading(false); }
        })();
    }, []));

    const allClasses = [...svClasses, ...manClasses];

    // ── Sync quarter ──────────────────────────────────────────
    const syncPeriod = async (periodIndex) => {
        try {
            const isDemo = await AsyncStorage.getItem('isDemoData') === 'true';

            // Check if we have credentials; if so, we should probably be in real mode
            const [svUser, svPass, svUrl] = await Promise.all([
                AsyncStorage.getItem('svUsername'),
                AsyncStorage.getItem('svPassword'),
                AsyncStorage.getItem('svDistrictUrl'),
            ]);

            if (isDemo && (!svUser || !svPass)) {
                setIsSyncing(true);
                await new Promise(r => setTimeout(r, 500));
                
                // For demo mode, we might want to load specific Q data if it exists
                const raw = await AsyncStorage.getItem(`studentVueGradesQ${periodIndex}`);
                const perRaw = await AsyncStorage.getItem('studentVuePeriods');
                const ps = JSON.parse(perRaw || '[]');
                const pName = ps.find(p => p.index === periodIndex)?.name || `Quarter ${periodIndex + 1}`;
                
                if (raw) {
                    const g = JSON.parse(raw);
                    setSvClasses(g);
                    await AsyncStorage.setItem('studentVueGrades', raw);
                } else if (periodIndex === 0) {
                    // Fallback to whatever is in studentVueGrades if Q0 is requested and no Q0 specific data
                    const currentGrades = await AsyncStorage.getItem('studentVueGrades');
                    if (currentGrades) setSvClasses(JSON.parse(currentGrades));
                }

                setCurPeriodName(pName);
                setCurPeriodIdx(periodIndex);
                await AsyncStorage.setItem('studentVuePeriodName', pName);
                await AsyncStorage.setItem('studentVuePeriodIndex', String(periodIndex));
                setSelectedClass(null);
                setIsSyncing(false);
                return;
            }

            if (!svUser || !svPass || !svUrl) {
                webAlert('Not configured', 'Enter credentials in Settings first.');
                return;
            }
            setIsSyncing(true);
            const finalUrl = svUrl.endsWith('Service/PXPCommunication.asmx') ? svUrl : `${svUrl}/Service/PXPCommunication.asmx`;
            const soap = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>${svUser}</userID><password>${svPass}</password><skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;${periodIndex}&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>`;
            const base = Platform.OS === 'web' ? '' : 'https://optionapp.online';
            const res = await fetch(`${base}/api/studentvue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUrl: finalUrl, soapPayload: soap }) });
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.cause || res.statusText); }
            const xml = await res.text();
            if (!xml.includes('Gradebook') && xml.includes('RT_ERROR')) throw new Error('No grade data for this period.');
            const { classes: parsed, periods: fetchedPeriods } = parseStudentVueGradebook(xml);
            if (parsed?.length > 0) {
                setSvClasses(parsed);
                await AsyncStorage.setItem('studentVueGrades', JSON.stringify(parsed));
                await AsyncStorage.setItem('isDemoData', 'false'); // Ensure demo mode is off if we get real data
                
                let ps = JSON.parse(await AsyncStorage.getItem('studentVuePeriods') || '[]');
                if (ps.length === 0 && fetchedPeriods?.length > 0) {
                    await AsyncStorage.setItem('studentVuePeriods', JSON.stringify(fetchedPeriods));
                    setPeriods(fetchedPeriods);
                    ps = fetchedPeriods;
                }
                const pName = ps.find(p => p.index === periodIndex)?.name || `Quarter ${periodIndex + 1}`;
                setCurPeriodName(pName); setCurPeriodIdx(periodIndex);
                await AsyncStorage.setItem('studentVuePeriodName', pName);
                await AsyncStorage.setItem('studentVuePeriodIndex', String(periodIndex));
                setSelectedClass(null);
            } else { webAlert('No Data', 'No grades found for this period.'); }
        } catch (e) { webAlert('Sync Error', e.message); }
        finally { setIsSyncing(false); }
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
        setViewMode('assignments');
    };

    const deleteManualClass = async (id) => {
        const updated = manClasses.filter(c => c.id !== id);
        setManClasses(updated);
        await saveManual(updated);
        setSelectedClass(null);
    };

    const addAssignment = async () => {
        if (!selectedClass?.isManual) return;
        if (!newAsgnName.trim() || !newAsgnScore || !newAsgnTotal) return;
        const asgn = {
            id: uid(), name: newAsgnName.trim(), title: newAsgnName.trim(),
            score: parseFloat(newAsgnScore), total: parseFloat(newAsgnTotal),
            category: newAsgnCat, date: newAsgnDate || new Date().toLocaleDateString(),
        };
        const updatedAsgns = [...(selectedClass.assignments || []), asgn];
        const newGrade = calcGrade(updatedAsgns) ?? 0;
        const gp = buildGP(newGrade, selectedClass.type);
        const updatedCls = { ...selectedClass, assignments: updatedAsgns, grade: +newGrade.toFixed(1), ...gp };
        const updated = manClasses.map(c => c.id === selectedClass.id ? updatedCls : c);
        setManClasses(updated);
        setSelectedClass(updatedCls);
        await saveManual(updated);
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

    // ── What-If calc ──────────────────────────────────────────
    const runWhatIf = () => {
        if (!selectedClass) return;
        const score = parseFloat(wiScore), total = parseFloat(wiTotal);
        if (isNaN(score) || isNaN(total) || total <= 0) return;
        const base = calcGrade(selectedClass.assignments);
        const hypo = [...(selectedClass.assignments || []), { id: 'wi', score, total, category: wiCat }];
        const proj = calcGrade(hypo);
        setWiResult({ base: base?.toFixed(2) ?? '—', proj: proj?.toFixed(2) ?? '—', diff: proj !== null && base !== null ? (proj - base).toFixed(2) : '0' });
    };

    // ── Target calc ───────────────────────────────────────────
    const runTarget = () => {
        if (!selectedClass) return;
        const target = parseFloat(tGrade), possible = parseFloat(tPts);
        if (isNaN(target) || isNaN(possible) || possible <= 0) return;
        let lo = 0, hi = possible * 2, best = 0;
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            const proj = calcGrade([...(selectedClass.assignments || []), { id: 't', score: mid, total: possible, category: tCat }]);
            if ((proj ?? 0) < target) lo = mid; else hi = mid;
            best = mid;
        }
        setTResult({ score: best.toFixed(1), pct: ((best / possible) * 100).toFixed(1) });
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

    return (
        <View style={S.root}>
            {/* Header */}
            <View style={S.header}>
                {cls ? (
                    <TouchableOpacity style={S.backBtn} onPress={() => { setSelectedClass(null); setWiResult(null); setTResult(null); }}>
                        <ChevronLeft size={18} color={theme.colors.ink3} />
                        <Text style={S.backTxt}>Gradebook</Text>
                    </TouchableOpacity>
                ) : (
                    <View>
                        <Text style={S.title}>Gradebook</Text>
                        {curPeriodName ? <Text style={S.titleSub}>{curPeriodName}</Text> : null}
                    </View>
                )}
                <View style={S.headerRight}>
                    {!cls && (
                        <TouchableOpacity style={S.syncBtn} onPress={() => syncPeriod(curPeriodIdx ?? 0)} disabled={isSyncing}>
                            {isSyncing ? <ActivityIndicator size="small" color={theme.colors.ink3} /> : <RefreshCw size={15} color={theme.colors.ink3} />}
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Quarter tabs */}
            {!cls && periods.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.tabsScroll} contentContainerStyle={S.tabsContent}>
                    {periods.map(p => {
                        const active = p.index === curPeriodIdx;
                        return (
                            <TouchableOpacity key={p.index} style={[S.qTab, active && S.qTabActive]} onPress={() => syncPeriod(p.index)} disabled={isSyncing}>
                                {isSyncing && active ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 5 }} /> : null}
                                <Text style={[S.qTabTxt, active && S.qTabTxtActive]}>{p.name}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            {/* CLASS LIST */}
            {!cls && (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={S.listContent} showsVerticalScrollIndicator={false}>
                    {/* GPA Banner */}
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

                    {/* No data state */}
                    {allClasses.length === 0 && (
                        <View style={S.emptyState}>
                            <Text style={S.emptyIcon}>📚</Text>
                            <Text style={S.emptyTitle}>No grades yet</Text>
                            <Text style={S.emptySub}>Connect StudentVUE in Settings or add classes manually with the + button</Text>
                        </View>
                    )}

                    {/* Cards */}
                    {allClasses.map((item) => {
                        const g = parseFloat(item.grade) || 0;
                        const color = gradeColor(g, theme);
                        const letter = gradeLetter(g);
                        return (
                            <TouchableOpacity key={item.id} style={S.classCard} onPress={() => { setSelectedClass(item); setViewMode('assignments'); setWiResult(null); setTResult(null); }} activeOpacity={0.75}>
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
                <View style={{ flex: 1 }}>
                    {/* Class header card */}
                    <View style={[S.detailHeader, { borderLeftColor: gColor }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={S.detailName} numberOfLines={2}>{cls.name}</Text>
                            {cls.teacher ? <Text style={S.detailMeta}>{cls.teacher}{cls.period ? ` · Period ${cls.period}` : ''}</Text> : null}
                            <View style={S.detailTags}>
                                <View style={[S.tag, cls.type === 'AP' && S.tagAP, cls.type === 'HN' && S.tagHN]}>
                                    <Text style={[S.tagTxt, (cls.type === 'AP' || cls.type === 'HN') && { color: '#fff' }]}>{cls.type || 'ST'}</Text>
                                </View>
                                <View style={S.tag}><Text style={S.tagTxt}>W{cls.wGP || '—'} / U{cls.uGP || '—'}</Text></View>
                            </View>
                        </View>
                        <View style={S.gradeBlock}>
                            <Text style={[S.gradeLetterBig, { color: gColor, fontSize: 56 }]}>{gradeLetter(parseFloat(cls.grade) || 0)}</Text>
                            <Text style={[S.gradePctSmall, { color: gColor, fontSize: 14 }]}>{(parseFloat(cls.grade) || 0).toFixed(1)}%</Text>
                        </View>
                    </View>

                    {/* Tab row */}
                    <View style={S.detailTabRow}>
                        {[['assignments', BookOpen, 'Assignments'], ['whatif', Wand2, 'What-If'], ['target', Target, 'Target']].map(([mode, Icon, label]) => (
                            <TouchableOpacity key={mode} style={[S.detailTab, viewMode === mode && S.detailTabActive]} onPress={() => setViewMode(mode)}>
                                <Icon size={13} color={viewMode === mode ? theme.colors.accent : theme.colors.ink3} />
                                <Text style={[S.detailTabTxt, viewMode === mode && S.detailTabTxtActive]}>{label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* ASSIGNMENTS TAB */}
                    {viewMode === 'assignments' && (
                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                            {(!cls.assignments || cls.assignments.length === 0) && (
                                <View style={S.emptyState}>
                                    <Text style={S.emptyIcon}>📝</Text>
                                    <Text style={S.emptyTitle}>No assignments</Text>
                                    {cls.isManual && <Text style={S.emptySub}>Tap + to add an assignment</Text>}
                                </View>
                            )}
                            {(() => {
                                const groups = {};
                                (cls.assignments || []).forEach(a => {
                                    const k = a.category || 'Other';
                                    if (!groups[k]) groups[k] = [];
                                    groups[k].push(a);
                                });
                                return Object.keys(groups).map(cat => {
                                    const items = groups[cat];
                                    const scored = items.filter(a => parseFloat(a.total) > 0 && !isNaN(parseFloat(a.score)));
                                    const avg = scored.length ? scored.reduce((s, a) => s + parseFloat(a.score) / parseFloat(a.total), 0) / scored.length * 100 : null;
                                    const avgColor = avg !== null ? gradeColor(avg, theme) : theme.colors.ink3;
                                    return (
                                        <View key={cat} style={{ marginBottom: 20 }}>
                                            <View style={S.catHeader}>
                                                <Text style={S.catLabel}>{cat.toUpperCase()}</Text>
                                                {avg !== null && <Text style={[S.catAvg, { color: avgColor }]}>{avg.toFixed(1)}%</Text>}
                                            </View>
                                            {items.map((a, i) => {
                                                const s = parseFloat(a.score), t = parseFloat(a.total);
                                                const hasPts = !isNaN(s) && !isNaN(t) && t > 0;
                                                const pct = hasPts ? (s / t) * 100 : null;
                                                const ac = pct !== null ? gradeColor(pct, theme) : theme.colors.border;
                                                return (
                                                    <View key={a.id || i} style={[S.asgnRow, { borderLeftColor: ac }]}>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={S.asgnName} numberOfLines={2}>{a.name || a.title}</Text>
                                                            {a.date ? <Text style={S.asgnDate}>{a.date}</Text> : null}
                                                        </View>
                                                        <View style={{ alignItems: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                            {hasPts ? (
                                                                <View style={{ alignItems: 'flex-end' }}>
                                                                    <Text style={[S.asgnScore, { color: ac }]}>{s % 1 === 0 ? s : s.toFixed(1)}/{t % 1 === 0 ? t : t.toFixed(1)}</Text>
                                                                    <Text style={[S.asgnPct, { color: ac }]}>{Math.round(pct)}%</Text>
                                                                </View>
                                                            ) : (
                                                                <Text style={[S.asgnScore, { color: theme.colors.ink4 }]}>—</Text>
                                                            )}
                                                            {cls.isManual && (
                                                                <TouchableOpacity onPress={() => deleteAssignment(a.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                                                    <Trash2 size={13} color={theme.colors.red} />
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    );
                                });
                            })()}
                        </ScrollView>
                    )}

                    {/* WHAT-IF TAB */}
                    {viewMode === 'whatif' && (
                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 0, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
                            {/* Current breakdown */}
                            {(() => {
                                const cats = { Summative: { e: 0, p: 0 }, Formative: { e: 0, p: 0 }, Final: { e: 0, p: 0 } };
                                (cls.assignments || []).forEach(a => {
                                    const s = parseFloat(a.score), t = parseFloat(a.total);
                                    if (isNaN(s) || isNaN(t) || t <= 0) return;
                                    const k = cats[a.category] ? a.category : 'Formative';
                                    cats[k].e += s; cats[k].p += t;
                                });
                                return (
                                    <View style={S.wiBreakdown}>
                                        <Text style={S.wiBreakdownTitle}>Current Breakdown</Text>
                                        {Object.entries(cats).map(([cat, { e, p }]) => {
                                            const pct = p > 0 ? (e / p * 100) : null;
                                            const weights = { Summative: '70%', Formative: '30%', Final: '20% of total' };
                                            return (
                                                <View key={cat} style={S.wiCatRow}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={S.wiCatName}>{cat}</Text>
                                                        <Text style={S.wiCatWeight}>{weights[cat]}</Text>
                                                    </View>
                                                    {pct !== null ? (
                                                        <Text style={[S.wiCatPct, { color: gradeColor(pct, theme) }]}>{pct.toFixed(1)}%</Text>
                                                    ) : (
                                                        <Text style={[S.wiCatPct, { color: theme.colors.ink4 }]}>—</Text>
                                                    )}
                                                </View>
                                            );
                                        })}
                                    </View>
                                );
                            })()}

                            <Text style={S.inputLabel}>What if you get…</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                                <TextInput style={[S.input, { flex: 1 }]} placeholder="Score" placeholderTextColor={theme.colors.ink3} keyboardType="numeric" value={wiScore} onChangeText={setWiScore} />
                                <Text style={[S.input, { paddingHorizontal: 6, textAlignVertical: 'center', color: theme.colors.ink3 }]}>/</Text>
                                <TextInput style={[S.input, { flex: 1 }]} placeholder="Total" placeholderTextColor={theme.colors.ink3} keyboardType="numeric" value={wiTotal} onChangeText={setWiTotal} />
                            </View>
                            <Text style={S.inputLabel}>Category</Text>
                            <View style={S.segRow}>
                                {['Summative', 'Formative', 'Final'].map(c => (
                                    <TouchableOpacity key={c} style={[S.seg, wiCat === c && S.segActive]} onPress={() => setWiCat(c)}>
                                        <Text style={[S.segTxt, wiCat === c && S.segTxtActive]}>{c}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TouchableOpacity style={S.calcBtn} onPress={runWhatIf}>
                                <Text style={S.calcBtnTxt}>Calculate</Text>
                            </TouchableOpacity>
                            {wiResult && (
                                <View style={S.resultCard}>
                                    <View style={S.resultRow}>
                                        <View style={S.resultCol}>
                                            <Text style={S.resultColLabel}>Current</Text>
                                            <Text style={[S.resultColVal, { color: gradeColor(parseFloat(wiResult.base) || 0, theme) }]}>{wiResult.base}%</Text>
                                        </View>
                                        <View style={[S.resultDivider]} />
                                        <View style={S.resultCol}>
                                            <Text style={S.resultColLabel}>Projected</Text>
                                            <Text style={[S.resultColVal, { color: gradeColor(parseFloat(wiResult.proj) || 0, theme) }]}>{wiResult.proj}%</Text>
                                        </View>
                                        <View style={[S.resultDivider]} />
                                        <View style={S.resultCol}>
                                            <Text style={S.resultColLabel}>Change</Text>
                                            <Text style={[S.resultColVal, { color: parseFloat(wiResult.diff) >= 0 ? theme.colors.green : theme.colors.red }]}>{parseFloat(wiResult.diff) >= 0 ? '+' : ''}{wiResult.diff}%</Text>
                                        </View>
                                    </View>
                                </View>
                            )}
                        </ScrollView>
                    )}

                    {/* TARGET TAB */}
                    {viewMode === 'target' && (
                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
                            <Text style={S.inputLabel}>I want to reach</Text>
                            <TextInput style={S.input} placeholder="e.g. 90" placeholderTextColor={theme.colors.ink3} keyboardType="numeric" value={tGrade} onChangeText={setTGrade} />
                            <Text style={S.inputLabel}>On an assignment worth</Text>
                            <TextInput style={S.input} placeholder="e.g. 50 pts" placeholderTextColor={theme.colors.ink3} keyboardType="numeric" value={tPts} onChangeText={setTPts} />
                            <Text style={S.inputLabel}>In this category</Text>
                            <View style={S.segRow}>
                                {['Summative', 'Formative', 'Final'].map(c => (
                                    <TouchableOpacity key={c} style={[S.seg, tCat === c && S.segActive]} onPress={() => setTCat(c)}>
                                        <Text style={[S.segTxt, tCat === c && S.segTxtActive]}>{c}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TouchableOpacity style={S.calcBtn} onPress={runTarget}>
                                <Text style={S.calcBtnTxt}>Calculate</Text>
                            </TouchableOpacity>
                            {tResult && (
                                <View style={S.resultCard}>
                                    <Text style={S.resultColLabel}>To get {tGrade}%, you need at least:</Text>
                                    <Text style={[S.resultBig, { color: parseFloat(tResult.pct) > 100 ? theme.colors.red : theme.colors.green }]}>
                                        {tResult.score} / {tPts}
                                    </Text>
                                    <Text style={S.resultColLabel}>{tResult.pct}% on this assignment</Text>
                                    {parseFloat(tResult.pct) > 100 && (
                                        <Text style={[S.resultColLabel, { color: theme.colors.red, marginTop: 6 }]}>⚠ Score exceeds possible points</Text>
                                    )}
                                </View>
                            )}
                        </ScrollView>
                    )}

                    {/* Delete manual class */}
                    {cls.isManual && viewMode === 'assignments' && (
                        <TouchableOpacity style={S.deleteClassBtn} onPress={() => webAlert('Delete class?', `Remove "${cls.name}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteManualClass(cls.id) }])}>
                            <Trash2 size={14} color={theme.colors.red} />
                            <Text style={[S.deleteClassTxt]}>Delete Class</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* FAB: Add class */}
            {!cls && (
                <TouchableOpacity style={S.fab} onPress={() => setShowAddClass(true)} activeOpacity={0.85}>
                    <Plus size={22} color="#fff" />
                </TouchableOpacity>
            )}

            {/* FAB: Add assignment */}
            {cls?.isManual && viewMode === 'assignments' && (
                <TouchableOpacity style={S.fab} onPress={() => setShowAddAsgn(true)} activeOpacity={0.85}>
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
                            <Text style={S.modalTitle}>Add Assignment</Text>
                            <Text style={S.inputLabel}>Name</Text>
                            <TextInput style={S.input} placeholder="e.g. Unit Test" placeholderTextColor={theme.colors.ink3} value={newAsgnName} onChangeText={setNewAsgnName} autoFocus />
                            <Text style={S.inputLabel}>Score / Total</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TextInput style={[S.input, { flex: 1 }]} placeholder="Score" placeholderTextColor={theme.colors.ink3} keyboardType="numeric" value={newAsgnScore} onChangeText={setNewAsgnScore} />
                                <TextInput style={[S.input, { flex: 1 }]} placeholder="Total" placeholderTextColor={theme.colors.ink3} keyboardType="numeric" value={newAsgnTotal} onChangeText={setNewAsgnTotal} />
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
                                <Text style={S.calcBtnTxt}>Add Assignment</Text>
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

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 52, paddingBottom: 12 },
    title: { fontFamily: theme.fonts.d, fontSize: 36, fontWeight: '700', color: theme.colors.ink, letterSpacing: -1 },
    titleSub: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    backTxt: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3 },
    headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    syncBtn: { padding: 8, borderRadius: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },

    // Quarter tabs
    tabsScroll: { paddingLeft: 24, marginBottom: 10, flexGrow: 0 },
    tabsContent: { gap: 8, paddingRight: 24 },
    qTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.colors.surface, borderWidth: 2, borderColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', shadowColor: theme.colors.border, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
    qTabActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    qTabTxt: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2, fontWeight: '700' },
    qTabTxtActive: { color: theme.colors.bg, fontWeight: '700' },

    // Class list
    listContent: { paddingHorizontal: 20, paddingTop: 4 },
    gpaBanner: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: theme.colors.surface, borderWidth: 2, borderColor: theme.colors.border, borderRadius: 16, padding: 18, marginBottom: 16, shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
    gpaBannerLabel: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
    gpaBannerVal: { fontFamily: theme.fonts.d, fontSize: 28, fontWeight: '900', color: theme.colors.ink, letterSpacing: -1 },

    // Class card
    classCard: { backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 2, borderColor: theme.colors.border, marginBottom: 16, overflow: 'hidden', flexDirection: 'row', shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
    classCardAccent: { width: 5 },
    classCardBody: { flex: 1, padding: 16, flexDirection: 'row', alignItems: 'center' },
    classCardTags: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 },
    className: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700', color: theme.colors.ink, lineHeight: 22 },
    teacherTxt: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 3 },
    periodTxt: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3 },
    gradeBlock: { alignItems: 'flex-end', marginLeft: 12 },
    gradeLetterBig: { fontFamily: theme.fonts.d, fontSize: 42, fontWeight: '900', letterSpacing: -1, lineHeight: 48 },
    gradePctSmall: { fontFamily: theme.fonts.m, fontSize: 11, fontWeight: '600' },

    // Tags
    tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border },
    tagAP: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
    tagHN: { backgroundColor: theme.colors.ink2, borderColor: theme.colors.ink2 },
    tagTxt: { fontFamily: theme.fonts.m, fontSize: 8, fontWeight: '700', color: theme.colors.ink2, letterSpacing: 0.5, textTransform: 'uppercase' },

    // Detail view
    detailHeader: { margin: 20, marginBottom: 12, backgroundColor: theme.colors.surface, borderWidth: 2, borderColor: theme.colors.border, borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'flex-start', borderLeftWidth: 5, shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
    detailName: { fontFamily: theme.fonts.d, fontSize: 24, fontWeight: '700', color: theme.colors.ink, marginBottom: 4, lineHeight: 28 },
    detailMeta: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginBottom: 8 },
    detailTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    detailTabRow: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, backgroundColor: theme.colors.surface2, borderRadius: 12, padding: 3, gap: 3 },
    detailTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
    detailTabActive: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
    detailTabTxt: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3 },
    detailTabTxtActive: { color: theme.colors.ink, fontWeight: '700' },

    // Assignments
    catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: theme.colors.border, marginBottom: 6 },
    catLabel: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink, letterSpacing: 2 },
    catAvg: { fontFamily: theme.fonts.m, fontSize: 10, fontWeight: '700' },
    asgnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 16, marginHorizontal: 20, backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 2, borderColor: theme.colors.border, marginBottom: 8, borderLeftWidth: 4, shadowColor: theme.colors.border, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
    asgnName: { fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '500', color: theme.colors.ink, lineHeight: 18 },
    asgnDate: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 2 },
    asgnScore: { fontFamily: theme.fonts.m, fontSize: 12, fontWeight: '700' },
    asgnPct: { fontFamily: theme.fonts.m, fontSize: 10 },

    // What-If
    wiBreakdown: { marginHorizontal: 20, marginBottom: 16, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 2, borderColor: theme.colors.border, padding: 16, shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
    wiBreakdownTitle: { fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '700', color: theme.colors.ink, marginBottom: 12 },
    wiCatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    wiCatName: { fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink },
    wiCatWeight: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3 },
    wiCatPct: { fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '800' },

    // Inputs
    inputLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginTop: 14, paddingHorizontal: 20 },
    input: { backgroundColor: theme.colors.surface, borderWidth: 2, borderColor: theme.colors.border, borderRadius: 10, padding: 13, fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink, marginHorizontal: 20, marginBottom: 0, shadowColor: theme.colors.border, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
    segRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 4 },
    seg: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: theme.colors.surface2, borderWidth: 2, borderColor: theme.colors.border, shadowColor: theme.colors.border, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
    segActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    segTxt: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink },
    segTxtActive: { color: theme.colors.bg, fontWeight: '700' },
    calcBtn: { backgroundColor: theme.colors.accent, borderRadius: 12, padding: 15, alignItems: 'center', marginHorizontal: 20, marginTop: 12, borderWidth: 2, borderColor: theme.colors.border, shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
    calcBtnTxt: { fontFamily: theme.fonts.b, fontSize: 22, color: theme.colors.bg, letterSpacing: 1.5 },

    // Result card
    resultCard: { marginHorizontal: 20, marginTop: 24, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 2, borderColor: theme.colors.border, padding: 20, alignItems: 'center', shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
    resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', width: '100%' },
    resultCol: { alignItems: 'center', flex: 1 },
    resultColLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, textAlign: 'center' },
    resultColVal: { fontFamily: theme.fonts.d, fontSize: 26, fontWeight: '900', letterSpacing: -1 },
    resultDivider: { width: 1, height: 40, backgroundColor: theme.colors.border },
    resultBig: { fontFamily: theme.fonts.d, fontSize: 40, fontWeight: '900', letterSpacing: -1, marginVertical: 10 },

    // FAB
    fab: { position: 'absolute', bottom: 32, right: 24, backgroundColor: theme.colors.accent, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: theme.colors.accent, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 0, paddingTop: 12, paddingBottom: 40 },
    modalHandle: { width: 36, height: 4, backgroundColor: theme.colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    modalTitle: { fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '700', color: theme.colors.ink, paddingHorizontal: 20, marginBottom: 8 },

    // Delete
    deleteClassBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 8, padding: 10 },
    deleteClassTxt: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.red },

    // Empty
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyIcon: { fontSize: 42, marginBottom: 12 },
    emptyTitle: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700', color: theme.colors.ink, marginBottom: 6 },
    emptySub: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, textAlign: 'center', lineHeight: 18, paddingHorizontal: 32 },
});
