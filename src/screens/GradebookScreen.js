import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    Alert, ScrollView, Modal, ActivityIndicator, Platform,
    KeyboardAvoidingView, Pressable
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, RefreshCw, Plus, BookOpen, Trash2 } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { parseStudentVueGradebook } from '../utils/studentVueParser';
import { getRecentGradeChanges, dismissGradeChanges, isAssignmentNew, isClassGradeChanged, saveGradeSnapshot, checkForGradeChanges, formatChangeMessage } from '../utils/gradeNotifications';

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
    const [gradeChanges, setGradeChanges] = useState(null);

    // Navigation
    const [selectedClass, setSelectedClass] = useState(null);
    const [catFilter, setCatFilter] = useState('All');
    const [hypothetical, setHypothetical] = useState(false);
    const [hypoEdits, setHypoEdits] = useState({}); // { asgnId: { score, total } }

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
                // Load grade change indicators
                const changes = await getRecentGradeChanges();
                if (changes) setGradeChanges(changes.changes);
            } catch (e) { console.error(e); }
            finally { setIsLoading(false); }
        })();
    }, []));

    const allClasses = [...svClasses, ...manClasses];

    // ── Sync quarter ──────────────────────────────────────────
    const syncPeriod = async (periodIndex) => {
        try {
            // Save snapshot before syncing for grade diff detection
            await saveGradeSnapshot();

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
                Alert.alert('Not configured', 'Enter credentials in Settings first.');
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
            } else { Alert.alert('No Data', 'No grades found for this period.'); }
        } catch (e) { Alert.alert('Sync Error', e.message); }
        finally {
            setIsSyncing(false);
            // Check for grade changes after sync
            const changes = await checkForGradeChanges();
            if (changes && changes.length > 0) {
                setGradeChanges(changes);
                const msg = changes.length === 1
                    ? formatChangeMessage(changes[0])
                    : `${changes.length} grade updates detected`;
                if (Platform.OS === 'web') window.alert(`Grade Update: ${msg}`);
                else Alert.alert('Grade Update', msg);
            }
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

    // ── Hypothetical grade calc ──────────────────────────────
    const getHypoGrade = (cls) => {
        if (!hypothetical || !cls?.assignments) return null;
        const editedAssignments = cls.assignments.map(a => {
            const edit = hypoEdits[a.id];
            if (edit) return { ...a, score: edit.score, total: edit.total || a.total };
            return a;
        });
        return calcGrade(editedAssignments);
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

    return (
        <View style={S.root}>
            {/* Header */}
            <View style={S.header}>
                {cls ? (
                    <TouchableOpacity style={S.backBtn} onPress={() => { setSelectedClass(null); setHypothetical(false); setHypoEdits({}); setCatFilter('All'); }}>
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
                            <Text style={[S.gradeLetterBig, { color: gColor, fontSize: 42 }]}>{gradeLetter(parseFloat(cls.grade) || 0)}</Text>
                            <Text style={[S.gradePctSmall, { color: gColor, fontSize: 14 }]}>{(parseFloat(cls.grade) || 0).toFixed(1)}%</Text>
                            {hypothetical && getHypoGrade(cls) !== null && (
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.blue, marginTop: 2 }}>
                                    Hypo: {getHypoGrade(cls).toFixed(1)}%
                                </Text>
                            )}
                        </View>
                    </View>

                    {/* Controls row: Hypothetical + Category filter */}
                    <View style={S.controlsBar}>
                        <TouchableOpacity
                            style={[S.hypoToggle, hypothetical && S.hypoToggleActive]}
                            onPress={() => { setHypothetical(!hypothetical); if (hypothetical) setHypoEdits({}); }}
                        >
                            <View style={[S.hypoCheckbox, hypothetical && { backgroundColor: theme.colors.blue, borderColor: theme.colors.blue }]}>
                                {hypothetical && <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✓</Text>}
                            </View>
                            <Text style={[S.hypoLabel, hypothetical && { color: theme.colors.blue }]}>Hypothetical Mode</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Category filter tabs */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: 20, marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
                        {(() => {
                            const cats = new Set(['All']);
                            (cls.assignments || []).forEach(a => cats.add(a.category || 'Other'));
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
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                        {(!cls.assignments || cls.assignments.length === 0) && (
                            <View style={S.emptyState}>
                                <Text style={S.emptyIcon}>📝</Text>
                                <Text style={S.emptyTitle}>No assignments</Text>
                                {cls.isManual && <Text style={S.emptySub}>Tap + to add an assignment</Text>}
                            </View>
                        )}
                        {(cls.assignments || [])
                            .filter(a => catFilter === 'All' || (a.category || 'Other') === catFilter)
                            .map((a, i) => {
                                const rawS = hypothetical && hypoEdits[a.id] ? hypoEdits[a.id].score : parseFloat(a.score);
                                const s = parseFloat(rawS), t = parseFloat(a.total);
                                const hasPts = !isNaN(s) && !isNaN(t) && t > 0;
                                const pct = hasPts ? (s / t) * 100 : null;
                                const ac = pct !== null ? gradeColor(pct, theme) : theme.colors.border;
                                const impact = hasPts ? getGradeImpact(cls, a) : null;
                                const isNew = isAssignmentNew(gradeChanges, cls.name, a.name || a.title);
                                return (
                                    <View key={a.id || i} style={[S.asgnCard, { borderLeftColor: ac }]}>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                                <Text style={S.asgnName} numberOfLines={2}>{a.name || a.title}</Text>
                                                {isNew && (
                                                    <View style={{ backgroundColor: theme.colors.green + '20', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 8, fontWeight: '700', color: theme.colors.green, letterSpacing: 0.5 }}>New</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <View style={[S.catBadge, { backgroundColor: (a.category === 'Summative' ? theme.colors.blue : a.category === 'Final' ? theme.colors.purple : theme.colors.orange) + '15' }]}>
                                                    <Text style={[S.catBadgeTxt, { color: a.category === 'Summative' ? theme.colors.blue : a.category === 'Final' ? theme.colors.purple : theme.colors.orange }]}>{a.category || 'Other'}</Text>
                                                </View>
                                                {a.date ? <Text style={S.asgnDate}>{a.date}</Text> : null}
                                                {!hasPts && <Text style={[S.catBadgeTxt, { color: theme.colors.ink3 }]}>Not Graded</Text>}
                                            </View>
                                            {/* Progress bar */}
                                            {hasPts && (
                                                <View style={S.progressTrack}>
                                                    <View style={[S.progressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: ac }]} />
                                                </View>
                                            )}
                                        </View>
                                        <View style={{ alignItems: 'flex-end', minWidth: 80 }}>
                                            {hasPts ? (
                                                <>
                                                    {impact !== null && (
                                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: impact >= 0 ? theme.colors.green : theme.colors.red, fontWeight: '600' }}>
                                                            {impact >= 0 ? '+' : ''}{impact.toFixed(2)}%
                                                        </Text>
                                                    )}
                                                    {hypothetical ? (
                                                        <TextInput
                                                            style={S.hypoInput}
                                                            value={hypoEdits[a.id]?.score?.toString() ?? s.toString()}
                                                            onChangeText={(v) => setHypoEdits(prev => ({ ...prev, [a.id]: { score: v, total: t } }))}
                                                            keyboardType="numeric"
                                                            selectTextOnFocus
                                                        />
                                                    ) : (
                                                        <Text style={[S.asgnScore, { color: ac }]}>{s % 1 === 0 ? s : s.toFixed(1)}/{t % 1 === 0 ? t : t.toFixed(1)}</Text>
                                                    )}
                                                    <Text style={[S.asgnPct, { color: ac }]}>{Math.round(pct)}%</Text>
                                                </>
                                            ) : (
                                                <Text style={[S.asgnScore, { color: theme.colors.ink4, fontSize: 16 }]}>{t > 0 ? t : '—'}</Text>
                                            )}
                                            {cls.isManual && (
                                                <TouchableOpacity onPress={() => deleteAssignment(a.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 4 }}>
                                                    <Trash2 size={13} color={theme.colors.red} />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                );
                            })
                        }
                    </ScrollView>

                    {/* Delete manual class */}
                    {cls.isManual && viewMode === 'assignments' && (
                        <TouchableOpacity style={S.deleteClassBtn} onPress={() => Alert.alert('Delete class?', `Remove "${cls.name}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteManualClass(cls.id) }])}>
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
    title: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5 },
    titleSub: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    backTxt: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3 },
    headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    syncBtn: { padding: 8, borderRadius: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },

    // Quarter tabs
    tabsScroll: { paddingLeft: 24, marginBottom: 10, flexGrow: 0 },
    tabsContent: { gap: 8, paddingRight: 24 },
    qTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', ...theme.shadows.sm },
    qTabActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    qTabTxt: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2, fontWeight: '700' },
    qTabTxtActive: { color: theme.colors.bg, fontWeight: '700' },

    // Class list
    listContent: { paddingHorizontal: 20, paddingTop: 4 },
    gpaBanner: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 18, marginBottom: 16, ...theme.shadows.sm },
    gpaBannerLabel: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
    gpaBannerVal: { fontFamily: theme.fonts.d, fontSize: 28, fontWeight: '700', color: theme.colors.ink, letterSpacing: -1 },

    // Class card
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

    // Tags
    tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border },
    tagAP: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
    tagHN: { backgroundColor: theme.colors.ink2, borderColor: theme.colors.ink2 },
    tagTxt: { fontFamily: theme.fonts.m, fontSize: 8, fontWeight: '700', color: theme.colors.ink2, letterSpacing: 0.5, textTransform: 'uppercase' },

    // Detail view
    detailHeader: { margin: 20, marginBottom: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'flex-start', borderLeftWidth: 3, ...theme.shadows.md },
    detailName: { fontFamily: theme.fonts.d, fontSize: 24, fontWeight: '700', color: theme.colors.ink, marginBottom: 4, lineHeight: 28 },
    detailMeta: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginBottom: 8 },
    detailTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },

    // Controls bar
    controlsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginBottom: 8 },
    hypoToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: theme.radii.r, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
    hypoToggleActive: { backgroundColor: theme.colors.blue + '10', borderColor: theme.colors.blue + '40' },
    hypoCheckbox: { width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, borderColor: theme.colors.ink3, alignItems: 'center', justifyContent: 'center' },
    hypoLabel: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2 },

    // Category filter chips
    filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radii.round, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
    filterChipActive: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
    filterDot: { width: 8, height: 8, borderRadius: 4 },
    filterChipTxt: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2 },
    filterChipTxtActive: { color: theme.colors.bg, fontWeight: '600' },

    // Assignment card (GradeCompass-inspired)
    asgnCard: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, marginHorizontal: 20, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 8, borderLeftWidth: 3, ...theme.shadows.sm },
    asgnName: { fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '500', color: theme.colors.ink, lineHeight: 18 },
    asgnDate: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3 },
    asgnScore: { fontFamily: theme.fonts.m, fontSize: 13, fontWeight: '700' },
    asgnPct: { fontFamily: theme.fonts.m, fontSize: 11, marginTop: 1 },
    catBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    catBadgeTxt: { fontFamily: theme.fonts.m, fontSize: 10, fontWeight: '600' },
    progressTrack: { height: 4, backgroundColor: theme.colors.surface2, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
    progressFill: { height: 4, borderRadius: 2 },
    hypoInput: { backgroundColor: theme.colors.blue + '10', borderWidth: 1, borderColor: theme.colors.blue, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.blue, textAlign: 'right', width: 60 },

    // Inputs (for modals)
    inputLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginTop: 14, paddingHorizontal: 20 },
    input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 13, fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink, marginHorizontal: 20, marginBottom: 0 },
    segRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 4 },
    seg: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border },
    segActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    segTxt: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink },
    segTxtActive: { color: theme.colors.bg, fontWeight: '700' },
    calcBtn: { backgroundColor: theme.colors.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginHorizontal: 20, marginTop: 12, ...theme.shadows.sm },
    calcBtnTxt: { fontFamily: theme.fonts.s, fontSize: 15, color: theme.colors.bg, letterSpacing: 0.5 },

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
