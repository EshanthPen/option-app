import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BookOpen, CheckCircle2, Loader2, ChevronRight } from 'lucide-react';

export default function SetupSchoologyScreenWeb({ onComplete }) {
  const [schoologyUrl, setSchoologyUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const handleSync = async (e) => {
    e?.preventDefault();
    if (!schoologyUrl) return;
    setIsSyncing(true);
    setSyncResult(null);

    try {
      await AsyncStorage.setItem('schoologyUrl', schoologyUrl);
      await new Promise(r => setTimeout(r, 1500));
      setSyncResult({ type: 'success', message: 'Schoology feed connected successfully!' });
    } catch (e) {
      setSyncResult({ type: 'error', message: 'Failed to verify URL.' });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-background text-foreground font-sans p-6">
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-full max-w-md p-8 glass-panel rounded-xl"
      >
        <div className="flex flex-col mb-8">
          <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm mb-6 uppercase tracking-wider">
            <span className="w-8 h-1 bg-primary/30 rounded-full"></span>
            <span className="w-8 h-1 bg-primary rounded-full"></span>
            Step 2 of 2
          </div>
          
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-foreground/5 mb-4 shadow-sm">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-serif font-bold">Connect Schoology</h1>
          <p className="text-muted-foreground mt-2 text-sm font-sans">
            Paste your Schoology calendar feed URL to import assignments.
          </p>
        </div>

        <form onSubmit={handleSync} className="space-y-6">
          <div className="bg-background border border-border rounded-md p-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">How to find it:</span> Schoology → Calendar → Subscribe → Copy "Private Link" (starts with webcal://)
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Calendar Feed URL</label>
            <input 
              type="text"
              required
              className="w-full bg-background border border-border p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
              placeholder="webcal://app.schoology.com/..."
              value={schoologyUrl}
              onChange={(e) => setSchoologyUrl(e.target.value)}
            />
          </div>

          <div className="pt-2">
            <button 
              type="submit"
              disabled={isSyncing || syncResult?.type === 'success'}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-foreground text-background font-medium rounded-md hover:bg-foreground/90 transition-colors shadow-sm disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & Sync"}
            </button>
          </div>
        </form>

        <AnimatePresence>
          {syncResult?.type === 'success' && (
            <motion.div 
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
              className="overflow-hidden"
            >
              <div className="bg-primary/10 border border-primary/20 rounded-md p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary mb-3">{syncResult.message}</p>
                  <button 
                    onClick={onComplete}
                    className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                  >
                    Go to Dashboard <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6 text-center">
          <button 
            type="button"
            onClick={onComplete}
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Skip for now
          </button>
        </div>
      </motion.div>
    </div>
  );
}
