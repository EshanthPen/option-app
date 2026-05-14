import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, CheckCircle2 } from 'lucide-react';

export default function SyncStatusBar() {
  const [isSyncing, setIsSyncing] = useState(false);

  // For demonstration, randomly trigger sync every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setIsSyncing(true);
      setTimeout(() => {
        setIsSyncing(false);
      }, 3000); // Sync takes 3 seconds
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
      <AnimatePresence mode="wait">
        {isSyncing ? (
          <motion.div
            key="syncing"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-full shadow-lg shadow-black/50 border border-border text-sm font-medium font-sans"
          >
            <RefreshCw className="w-4 h-4 animate-spin text-background/80" />
            <span>Syncing with portals...</span>
          </motion.div>
        ) : (
          <motion.div
            key="synced"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 px-4 py-2 bg-background/80 backdrop-blur-md text-muted-foreground rounded-full shadow-lg border border-border/50 text-xs font-mono"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            <span>All systems operational</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
