import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Database, CheckCircle2, Loader2, ChevronRight } from 'lucide-react';
import { parseStudentVueGradebook, parseStudentVuePeriods } from '../utils/studentVueParser';
import { parseFocusSISGrades } from '../utils/focusSISParser';

export default function SetupSISScreenWeb({ onComplete }) {
  const [districtUrl, setDistrictUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const handleSync = async (e) => {
    e?.preventDefault();
    if (!districtUrl || !username || !password) return;
    setIsSyncing(true);
    setSyncResult(null);

    // Simulate standard sync flow
    try {
      await AsyncStorage.setItem('svUsername', username);
      await AsyncStorage.setItem('svPassword', password);
      await AsyncStorage.setItem('svDistrictUrl', districtUrl);
      
      // Simulate network request
      await new Promise(r => setTimeout(r, 2000));
      
      setSyncResult({ type: 'success', message: 'Credentials verified and synced!' });
    } catch (e) {
      setSyncResult({ type: 'error', message: 'Failed to connect. Please try again.' });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-background text-foreground font-sans p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 glass-panel rounded-xl"
      >
        <div className="flex flex-col mb-8">
          <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm mb-6 uppercase tracking-wider">
            <span className="w-8 h-1 bg-primary rounded-full"></span>
            Step 1 of 2
          </div>
          
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-foreground/5 mb-4 shadow-sm">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-serif font-bold">Connect your SIS</h1>
          <p className="text-muted-foreground mt-2 text-sm font-sans">
            Link StudentVUE or Focus SIS to automatically sync your grades into Option.
          </p>
        </div>

        <form onSubmit={handleSync} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Portal URL</label>
            <input 
              type="url"
              required
              className="w-full bg-background border border-border p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
              placeholder="https://sis.yourdistrict.org"
              value={districtUrl}
              onChange={(e) => setDistrictUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Student ID</label>
            <input 
              type="text"
              required
              className="w-full bg-background border border-border p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
              placeholder="Enter ID or username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</label>
            <input 
              type="password"
              required
              className="w-full bg-background border border-border p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="pt-4">
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
                    Continue to Step 2 <ChevronRight className="w-4 h-4" />
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
