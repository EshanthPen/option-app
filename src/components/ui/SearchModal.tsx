import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, BookOpen, CheckSquare, Compass } from 'lucide-react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../supabaseClient';

export default function SearchModal({ onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (query.length > 0) {
      searchData(query);
    } else {
      setResults([
        { id: 'nav-1', type: 'page', title: 'Gradebook', icon: BookOpen, route: 'Gradebook' },
        { id: 'nav-2', type: 'page', title: 'Calendar', icon: Compass, route: 'Calendar' },
        { id: 'nav-3', type: 'page', title: 'Focus', icon: CheckSquare, route: 'Focus' },
      ]);
    }
  }, [query]);

  const searchData = async (q) => {
    const qLower = q.toLowerCase();
    const newResults = [];

    try {
      const classesData = await AsyncStorage.getItem('user_classes');
      if (classesData) {
        const classes = JSON.parse(classesData);
        const filteredClasses = classes.filter(c => c.name.toLowerCase().includes(qLower));
        filteredClasses.forEach(c => {
          newResults.push({ id: `class-${c.id}`, type: 'class', title: c.name, icon: BookOpen, route: 'Gradebook' });
        });
      }
    } catch (e) {}

    try {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .ilike('title', `%${qLower}%`)
        .limit(5);
      
      if (tasks) {
        tasks.forEach(t => {
          newResults.push({ id: `task-${t.id}`, type: 'task', title: t.title, icon: CheckSquare, route: 'Calendar' });
        });
      }
    } catch (e) {}

    const routes = ['Gradebook', 'Calendar', 'Focus', 'Leaderboard', 'AI', 'Settings'].filter(r => r.toLowerCase().includes(qLower));
    routes.forEach(r => {
      newResults.push({ id: `route-${r}`, type: 'page', title: r, icon: Compass, route: r });
    });

    setResults(newResults.slice(0, 8));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[20vh] w-[100dvw] h-[100dvh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="w-full max-w-lg bg-background border border-border shadow-2xl rounded-xl overflow-hidden font-sans"
        >
          <div className="flex items-center px-4 py-3 border-b border-border">
            <Search className="w-5 h-5 text-muted-foreground mr-3" />
            <input
              autoFocus
              className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-lg font-sans"
              placeholder="Type a command or search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd className="hidden md:inline-flex h-6 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <span className="text-xs">esc</span>
            </kbd>
          </div>
          
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {results.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              results.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setIsOpen(false);
                    onNavigate && onNavigate(item.route);
                  }}
                  className="w-full flex items-center px-3 py-3 text-sm rounded-md hover:bg-foreground/10 hover:text-foreground transition-colors group"
                >
                  <item.icon className="w-4 h-4 mr-3 text-muted-foreground group-hover:text-foreground" />
                  <span className="font-medium text-foreground">{item.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground capitalize bg-foreground/5 px-2 py-0.5 rounded">
                    {item.type}
                  </span>
                </button>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
