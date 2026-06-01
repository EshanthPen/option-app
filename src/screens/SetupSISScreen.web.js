import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Database, CheckCircle2, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import { parseStudentVueGradebook, parseStudentVuePeriods } from '../utils/studentVueParser';
import { parseFocusSISGrades } from '../utils/focusSISParser';
import { KNOWN_DISTRICTS } from '../components/DistrictPickerModal';

export default function SetupSISScreenWeb({ onComplete }) {
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [customUrl, setCustomUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  useEffect(() => {
    (async () => {
      const savedUser = await AsyncStorage.getItem('svUsername');
      if (savedUser) setUsername(savedUser);
      const savedPass = await AsyncStorage.getItem('svPassword');
      if (savedPass) setPassword(savedPass);
    })();
  }, []);

  const handleDistrictChange = (e) => {
    const id = e.target.value;
    const district = KNOWN_DISTRICTS.find(d => d.id === id) || null;
    setSelectedDistrict(district);
    setSyncResult(null);
  };

  const handleFocusSISLogin = async (baseUrl) => {
    try {
      await AsyncStorage.setItem('svUsername', username);
      await AsyncStorage.setItem('svPassword', password);
      await AsyncStorage.setItem('svDistrictUrl', baseUrl);
      await AsyncStorage.setItem('svDistrictType', 'focus-sis');

      const resp = await fetch('/api/focus-sis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, username, password }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Focus SIS sync failed');

      const { classes: parsedClasses } = parseFocusSISGrades(data.html);
      if (parsedClasses?.length > 0) {
        await AsyncStorage.setItem('studentVueGrades', JSON.stringify(parsedClasses));
        await AsyncStorage.setItem('isDemoData', 'false');
        const totalAssignments = parsedClasses.reduce((sum, c) => sum + (c.assignments?.length || 0), 0);
        setSyncResult({
          type: 'success',
          message: `Synced — ${parsedClasses.length} classes and ${totalAssignments} assignments imported.`,
        });
      } else {
        setSyncResult({ type: 'error', message: 'Connected but no grade data could be parsed. You can still continue.' });
      }
    } catch (err) {
      throw err;
    }
  };

  const handleStudentVueLogin = async (baseUrl) => {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const finalTargetUrl = baseUrl.endsWith('Service/PXPCommunication.asmx')
      ? baseUrl
      : `${baseUrl}/Service/PXPCommunication.asmx`;

    const periodsSoap = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>${esc(username)}</userID><password>${esc(password)}</password><skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;0&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>`;

    const periodsResp = await fetch('/api/studentvue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl: finalTargetUrl, soapPayload: periodsSoap }),
    });

    if (!periodsResp.ok) {
      const errData = await periodsResp.json().catch(() => ({}));
      throw new Error(errData?.cause || 'Network error');
    }

    const periodsXml = await periodsResp.text();
    if (periodsXml.includes('RT_ERROR') || !periodsXml.includes('Gradebook')) {
      throw new Error('Invalid credentials or district URL.');
    }

    const { currentPeriodIndex, currentPeriodName } = parseStudentVuePeriods(periodsXml);
    let finalXml = periodsXml;

    if (currentPeriodIndex !== 0) {
      const gradesSoap = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>${esc(username)}</userID><password>${esc(password)}</password><skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;${currentPeriodIndex}&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>`;
      const gradesResp = await fetch('/api/studentvue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: finalTargetUrl, soapPayload: gradesSoap }),
      });
      if (gradesResp.ok) finalXml = await gradesResp.text();
    }

    const { classes: formattedClasses } = parseStudentVueGradebook(finalXml, currentPeriodName);
    if (formattedClasses?.length > 0) {
      await AsyncStorage.setItem('studentVueGrades', JSON.stringify(formattedClasses));
      await AsyncStorage.setItem('isDemoData', 'false');
      const totalAssignments = formattedClasses.reduce((sum, c) => sum + (c.assignments?.length || 0), 0);
      setSyncResult({
        type: 'success',
        message: `Synced — ${formattedClasses.length} classes and ${totalAssignments} assignments imported.`,
      });
    } else {
      throw new Error("Connected but couldn't find any grade data.");
    }
  };

  const handleSync = async (e) => {
    e?.preventDefault();

    let baseUrl = '';
    if (selectedDistrict) {
      baseUrl = selectedDistrict.id === 'custom' ? customUrl.trim() : selectedDistrict.url;
    }

    if (!baseUrl || !username || !password) {
      setSyncResult({ type: 'error', message: 'Please select your district and enter your credentials.' });
      return;
    }

    setIsSyncing(true);
    setSyncResult(null);

    try {
      await AsyncStorage.setItem('svUsername', username);
      await AsyncStorage.setItem('svPassword', password);
      await AsyncStorage.setItem('svDistrictUrl', baseUrl);

      if (selectedDistrict?.focusSIS) {
        await handleFocusSISLogin(baseUrl);
      } else {
        await handleStudentVueLogin(baseUrl);
      }
    } catch (err) {
      setSyncResult({ type: 'error', message: err.message || 'Sync failed. Check your credentials and try again.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('setup_sis_done', 'skipped');
    onComplete();
  };

  const handleContinue = async () => {
    await AsyncStorage.setItem('setup_sis_done', 'true');
    onComplete();
  };

  const canContinue = syncResult?.type === 'success';

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background text-foreground font-sans p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md glass-panel rounded-[var(--radius)] p-8"
      >
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          <span className="h-1 w-8 rounded-full bg-primary" />
          <span className="h-1 w-8 rounded-full bg-border" />
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider ml-1">Step 1 of 2</span>
        </div>

        {/* Icon + heading */}
        <div className="mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius)] border border-border bg-foreground/5 mb-4 shadow-sm">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-serif font-bold">Connect your SIS</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Link StudentVUE or Focus SIS to automatically sync your grades into Option.
          </p>
        </div>

        <form onSubmit={handleSync} className="space-y-4">
          {/* District select */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              School District
            </label>
            <div className="relative">
              <select
                className="w-full appearance-none bg-background border border-border px-3 py-3 pr-10 rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm text-foreground"
                value={selectedDistrict?.id || ''}
                onChange={handleDistrictChange}
              >
                <option value="" disabled>Select your school district...</option>
                {KNOWN_DISTRICTS.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {/* Custom URL */}
          <AnimatePresence>
            {selectedDistrict?.id === 'custom' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-1 overflow-hidden"
              >
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Portal URL
                </label>
                <input
                  type="url"
                  className="w-full bg-background border border-border px-3 py-3 rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm text-foreground"
                  placeholder="https://sis.yourdistrict.org"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  autoComplete="off"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Focus SIS notice */}
          <AnimatePresence>
            {selectedDistrict?.focusSIS && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-primary/5 border border-primary/20 rounded-[var(--radius)] p-3 text-xs text-muted-foreground">
                  This school uses <span className="font-semibold text-foreground">Focus SIS</span>. Credentials go directly to your school's server — never stored by Option.
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Username */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Username / Student ID
            </label>
            <input
              type="text"
              className="w-full bg-background border border-border px-3 py-3 rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm text-foreground"
              placeholder="Enter your student ID or username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setSyncResult(null); }}
              autoCapitalize="off"
              autoComplete="username"
            />
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              className="w-full bg-background border border-border px-3 py-3 rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm text-foreground"
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setSyncResult(null); }}
              autoComplete="current-password"
            />
          </div>

          {/* Result banner */}
          <AnimatePresence>
            {syncResult && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div
                  className={`rounded-[var(--radius)] border px-4 py-3 text-sm font-medium ${
                    syncResult.type === 'success'
                      ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'border-destructive/30 bg-destructive/10 text-destructive'
                  }`}
                >
                  {syncResult.message}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons */}
          {canContinue ? (
            <button
              type="button"
              onClick={handleContinue}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground font-medium rounded-[var(--radius)] hover:bg-primary/90 transition-colors shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              Continue to Step 2
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-foreground text-background font-medium rounded-[var(--radius)] hover:bg-foreground/90 transition-colors shadow-sm disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sync Grades'}
            </button>
          )}
        </form>

        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Skip for now
          </button>
        </div>
      </motion.div>
    </div>
  );
}
