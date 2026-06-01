import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BookOpen, CheckCircle2, Loader2, ChevronRight, Info } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getDeviceId } from '../utils/auth';
import ICAL from 'ical.js';

export default function SetupSchoologyScreenWeb({ onComplete }) {
  const [schoologyUrl, setSchoologyUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [deviceId, setDeviceId] = useState(null);

  useEffect(() => {
    (async () => {
      const id = await getDeviceId();
      setDeviceId(id);
      const saved = await AsyncStorage.getItem('schoologyUrl');
      if (saved) setSchoologyUrl(saved);
    })();
  }, []);

  const handleSync = async (e) => {
    e?.preventDefault();
    if (!schoologyUrl.trim()) {
      setSyncResult({ type: 'error', message: 'Please enter your Schoology calendar link first.' });
      return;
    }

    setIsSyncing(true);
    setSyncResult(null);

    const input = schoologyUrl.trim();
    const urlRegex = /(?:webcal|https?):\/\/[^\s"'<>]+(?:\.(?:ics|php)[^\s"'<>]*|\/calendar\/feed\/ical\/[^\s"'<>]*)/gi;
    const matches = input.match(urlRegex);
    let cleanUrl = matches ? matches[matches.length - 1] : input;
    if (!cleanUrl.includes('://') && cleanUrl.includes('.ics')) {
      cleanUrl = 'https://' + cleanUrl.split('http').pop().replace(/^\/+/, '');
    }
    const fetchUrl = cleanUrl.replace(/^webcal:\/\//i, 'https://');

    let icsData = '';

    try {
      const directResponse = await fetch(fetchUrl);
      if (!directResponse.ok) throw new Error('Direct fetch failed');
      icsData = await directResponse.text();
      if (icsData.includes('<html')) throw new Error('HTML returned');
    } catch {
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://optionapp.online';
        const proxyUrl = origin.includes('localhost')
          ? `http://localhost:3001/?url=${encodeURIComponent(fetchUrl)}`
          : `/api/schoology?url=${encodeURIComponent(fetchUrl)}`;
        const proxyResp = await fetch(proxyUrl);
        if (!proxyResp.ok) throw new Error(`Proxy HTTP ${proxyResp.status}`);
        icsData = await proxyResp.text();
      } catch {
        setSyncResult({ type: 'error', message: 'Sync failed — make sure you copied the Private Link from Schoology.' });
        setIsSyncing(false);
        return;
      }
    }

    try {
      if (!icsData) throw new Error('Empty response from Schoology.');
      if (icsData.includes('<html') || icsData.includes('<!DOCTYPE html')) {
        throw new Error("Schoology returned a login page. Make sure to copy the 'Private Link'.");
      }
      if (!icsData.includes('BEGIN:VCALENDAR')) {
        throw new Error('Invalid calendar data. Check that the link is a webcal:// feed.');
      }

      await AsyncStorage.setItem('schoologyUrl', schoologyUrl.trim());
      if (deviceId) {
        await supabase
          .from('settings')
          .upsert({ user_id: deviceId, schoology_url: schoologyUrl.trim() }, { onConflict: 'user_id' });
      }

      const jcalData = ICAL.parse(icsData);
      const comp = new ICAL.Component(jcalData);
      const events = comp.getAllSubcomponents('vevent');
      const now = new Date();

      const imported = events.map((ve) => {
        const ev = new ICAL.Event(ve);
        const tl = (ev.summary || '').toLowerCase();
        const desc = (ev.description || '').toLowerCase();
        const dueDate = ev.startDate ? ev.startDate.toJSDate() : new Date();
        if (desc.includes('completed') || desc.includes('submitted') || dueDate < new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)) return null;
        const diffDays = (dueDate - now) / (1000 * 60 * 60 * 24);
        const u = diffDays <= 7 ? 9 : 5;
        let points = 0;
        const ptsMatch = desc.match(/(\d+)\s*pts/) || tl.match(/(\d+)\s*pts/);
        if (ptsMatch) points = parseInt(ptsMatch[1]);
        let im = points > 50 ? 10 : points > 20 ? 8 : 5;
        if (tl.includes('test') || tl.includes('exam') || tl.includes('quiz')) im = Math.max(im, 9);
        if (tl.includes('project') || tl.includes('essay')) im = Math.max(im, 8);
        return {
          title: ev.summary || 'Untitled',
          urgency: u,
          importance: im,
          duration: 60,
          due_date: dueDate.toISOString().split('T')[0],
          source: 'schoology_import',
          user_id: deviceId,
        };
      }).filter(Boolean);

      if (imported.length > 0 && deviceId) {
        const { data: existing } = await supabase
          .from('tasks')
          .select('title, due_date')
          .eq('user_id', deviceId)
          .eq('source', 'schoology_import');
        const existingKeys = new Set((existing || []).map(t => `${t.title}::${t.due_date}`));
        const newOnly = imported.filter(t => !existingKeys.has(`${t.title}::${t.due_date}`));
        if (newOnly.length > 0) {
          const { error } = await supabase.from('tasks').insert(newOnly);
          if (error) throw error;
          const skipped = imported.length - newOnly.length;
          setSyncResult({
            type: 'success',
            message: skipped > 0
              ? `Connected — ${newOnly.length} new assignments imported (${skipped} duplicates skipped).`
              : `Connected — ${newOnly.length} assignments imported.`,
          });
        } else {
          setSyncResult({ type: 'success', message: `Connected — all ${imported.length} assignments already imported.` });
        }
      } else {
        setSyncResult({ type: 'success', message: 'Connected — no upcoming assignments found yet.' });
      }
    } catch (err) {
      setSyncResult({ type: 'error', message: err.message || 'Sync failed.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('setup_schoology_done', 'skipped');
    onComplete();
  };

  const handleContinue = async () => {
    await AsyncStorage.setItem('setup_schoology_done', 'true');
    onComplete();
  };

  const canContinue = syncResult?.type === 'success';

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background text-foreground font-sans p-6">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md glass-panel rounded-[var(--radius)] p-8"
      >
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          <span className="h-1 w-8 rounded-full bg-primary/30" />
          <span className="h-1 w-8 rounded-full bg-primary" />
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider ml-1">Step 2 of 2</span>
        </div>

        {/* Icon + heading */}
        <div className="mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius)] border border-border bg-foreground/5 mb-4 shadow-sm">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-serif font-bold">Connect Schoology</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Paste your Schoology calendar feed URL to automatically import assignments.
          </p>
        </div>

        {/* How-to hint */}
        <div className="flex gap-3 bg-foreground/5 border border-border rounded-[var(--radius)] p-3 mb-5 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 text-primary mt-px" />
          <span>
            <span className="font-semibold text-foreground">How to find it:</span> Schoology → Calendar → Subscribe → Copy the{' '}
            <span className="font-semibold text-foreground">"Private Link"</span> (starts with <span className="font-mono">webcal://</span>)
          </span>
        </div>

        <form onSubmit={handleSync} className="space-y-4">
          {/* URL input */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Calendar Feed URL
            </label>
            <input
              type="text"
              className="w-full bg-background border border-border px-3 py-3 rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm text-foreground"
              placeholder="webcal://app.schoology.com/..."
              value={schoologyUrl}
              onChange={(e) => { setSchoologyUrl(e.target.value); setSyncResult(null); }}
              autoCapitalize="off"
              autoComplete="off"
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

          {/* Action button */}
          {canContinue ? (
            <button
              type="button"
              onClick={handleContinue}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground font-medium rounded-[var(--radius)] hover:bg-primary/90 transition-colors shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              Go to Option
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-foreground text-background font-medium rounded-[var(--radius)] hover:bg-foreground/90 transition-colors shadow-sm disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Sync'}
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
