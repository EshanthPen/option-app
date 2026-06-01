import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Send, BookOpen, Compass, CheckSquare, Sparkles, Trophy, Settings as SettingsIcon } from 'lucide-react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../supabaseClient';
import { useNavigation } from '@react-navigation/native';

interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
  short?: string;
  end?: string;
  onClick: () => void;
}

export default function SearchModal({ onNavigate }: { onNavigate?: (route: string) => void }) {
  const navigation = useNavigation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Action[]>([]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
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
      const defaultPages = [
        { title: 'Gradebook', route: 'Gradebook', icon: BookOpen, short: '⌘G', desc: 'View grades and GPA' },
        { title: 'Calendar', route: 'Calendar', icon: Compass, short: '⌘C', desc: 'Schedule and tasks' },
        { title: 'Focus', route: 'Focus', icon: CheckSquare, short: '⌘F', desc: 'Pomodoro focus session' },
        { title: 'AI Tutor', route: 'AI', icon: Sparkles, short: '⌘A', desc: 'Get help with homework' },
      ];
      setResults(
        defaultPages.map((p) => {
          const Icon = p.icon;
          return {
            id: `route-${p.route}`,
            label: p.title,
            icon: <Icon className="h-4 w-4 text-orange-500" />,
            description: p.desc,
            short: p.short,
            end: "Page",
            onClick: () => {
              setIsOpen(false);
              if (onNavigate) onNavigate(p.route);
              else navigation.navigate(p.route as any);
            },
          };
        })
      );
    }
  }, [query, isOpen]);

  const searchData = async (q: string) => {
    const qLower = q.toLowerCase().trim();
    const newResults: Action[] = [];

    // Classes Search
    try {
      let classes = [];
      const classesData = await AsyncStorage.getItem('user_classes');
      const gradesData = await AsyncStorage.getItem('studentVueGrades');
      
      if (classesData) {
        classes = JSON.parse(classesData);
      } else if (gradesData) {
        classes = JSON.parse(gradesData);
      }

      if (classes && Array.isArray(classes)) {
        const filteredClasses = classes.filter((c: any) => c.name && c.name.toLowerCase().includes(qLower));
        filteredClasses.forEach((c: any) => {
          newResults.push({
            id: `class-${c.id || c.name}`,
            label: c.name,
            icon: <BookOpen className="h-4 w-4 text-blue-500" />,
            description: c.teacher ? `Teacher: ${c.teacher}` : "Class gradebook",
            end: "Class",
            onClick: () => {
              setIsOpen(false);
              if (onNavigate) onNavigate('Gradebook');
              else navigation.navigate('Gradebook' as any);
            },
          });
        });
      }
    } catch (e) {}

    // Tasks Search
    try {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .ilike('title', `%${qLower}%`)
        .limit(4);
      
      if (tasks) {
        tasks.forEach((t: any) => {
          newResults.push({
            id: `task-${t.id}`,
            label: t.title,
            icon: <CheckSquare className="h-4 w-4 text-green-500" />,
            description: t.due_date ? `Due ${t.due_date}` : "Task details",
            end: "Task",
            onClick: () => {
              setIsOpen(false);
              if (onNavigate) onNavigate('Calendar');
              else navigation.navigate('Calendar' as any);
            },
          });
        });
      }
    } catch (e) {}

    // Pages Search
    const pages = [
      { title: 'Gradebook', route: 'Gradebook', icon: BookOpen, short: '⌘G' },
      { title: 'Calendar', route: 'Calendar', icon: Compass, short: '⌘C' },
      { title: 'Focus', route: 'Focus', icon: CheckSquare, short: '⌘F' },
      { title: 'Leaderboard', route: 'Leaderboard', icon: Trophy, short: '⌘L' },
      { title: 'AI Tutor', route: 'AI', icon: Sparkles, short: '⌘A' },
      { title: 'Settings', route: 'Settings', icon: SettingsIcon, short: '⌘S' },
    ];
    const filteredPages = pages.filter((p) => p.title.toLowerCase().includes(qLower));
    filteredPages.forEach((p) => {
      const Icon = p.icon;
      newResults.push({
        id: `route-${p.route}`,
        label: p.title,
        icon: <Icon className="h-4 w-4 text-orange-500" />,
        description: "App Page",
        short: p.short,
        end: "Page",
        onClick: () => {
          setIsOpen(false);
          if (onNavigate) onNavigate(p.route);
          else navigation.navigate(p.route as any);
        },
      });
    });

    setResults(newResults.slice(0, 8));
  };

  const container = {
    hidden: { opacity: 0, height: 0 },
    show: {
      opacity: 1,
      height: "auto",
      transition: {
        height: { duration: 0.4 },
        staggerChildren: 0.05,
      },
    },
    exit: {
      opacity: 0,
      height: 0,
      transition: {
        height: { duration: 0.3 },
        opacity: { duration: 0.2 },
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
    exit: {
      opacity: 0,
      y: -10,
      transition: { duration: 0.2 },
    },
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[20vh] w-[100dvw] h-[100dvh]" onClick={() => setIsOpen(false)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="w-full max-w-lg bg-background border border-border shadow-lg rounded-[var(--radius)] overflow-hidden font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Input bar */}
          <div className="p-4 border-b border-border">
            <label className="text-xs font-medium text-muted-foreground mb-1 block" htmlFor="search">
              Search Commands
            </label>
            <div className="relative">
              <input
                id="search"
                type="text"
                autoFocus
                placeholder="What's up? (Type to search...)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full h-9 pl-3 pr-9 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all placeholder:text-muted-foreground"
              />
              
              <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4">
                <AnimatePresence mode="popLayout">
                  {query.length > 0 ? (
                    <motion.div
                      key="send"
                      initial={{ y: -20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 20, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Send className="w-4 h-4 text-muted-foreground" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="search"
                      initial={{ y: -20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 20, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Search className="w-4 h-4 text-muted-foreground" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Results list */}
          <div className="p-2 max-h-[60vh] overflow-y-auto">
            <AnimatePresence mode="wait">
              {results.length > 0 ? (
                <motion.div
                  variants={container}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="w-full"
                >
                  <motion.ul className="space-y-1">
                    {results.map((action) => (
                      <motion.li
                        key={action.id}
                        className="px-3 py-2 flex items-center justify-between hover:bg-muted cursor-pointer rounded-md transition-colors"
                        variants={item}
                        layout
                        onClick={action.onClick}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground flex items-center">{action.icon}</span>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">{action.label}</span>
                            {action.description && (
                              <span className="text-[11px] text-muted-foreground">{action.description}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {action.short && (
                            <kbd className="hidden md:inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-[9px] text-muted-foreground">
                              {action.short}
                            </kbd>
                          )}
                          <span className="text-[10px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/40 font-mono uppercase tracking-wide">
                            {action.end}
                          </span>
                        </div>
                      </motion.li>
                    ))}
                  </motion.ul>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-14 text-center text-sm text-muted-foreground"
                >
                  No results found.
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer hint */}
          <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Press ⌘K to open commands</span>
            <span>ESC to cancel</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
