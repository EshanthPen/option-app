import React, { useState, useEffect, useRef, CSSProperties } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Send, BookOpen, Compass, CheckSquare, Sparkles, Trophy, Settings as SettingsIcon } from "lucide-react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { supabase } from "../../supabaseClient"
import { useNavigation } from "@react-navigation/native"
import { useTheme } from "../../context/ThemeContext"

// --- Debounce hook ---
function useDebounce<T>(value: T, delay = 200): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

interface Action {
  id: string
  label: string
  icon: React.ReactNode
  description?: string
  short?: string
  end?: string
  onClick: () => void
}

export default function SearchDropdown() {
  const navigation = useNavigation()
  const { theme, isDarkMode } = useTheme()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [isFocused, setIsFocused] = useState(false)
  const [results, setResults] = useState<Action[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const debouncedQuery = useDebounce(query, 200)

  const c = theme.colors

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === "Escape") {
        inputRef.current?.blur()
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  // Click-outside to close
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false)
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [])

  // Build results list
  useEffect(() => {
    if (!isFocused) {
      setResults([])
      return
    }

    const defaultPages = [
      { title: "Gradebook", route: "Gradebook", icon: BookOpen, short: "⌘G", desc: "View grades and GPA" },
      { title: "Calendar",  route: "Calendar",  icon: Compass,   short: "⌘C", desc: "Schedule and tasks"  },
      { title: "Focus",     route: "Focus",     icon: CheckSquare, short: "⌘F", desc: "Pomodoro focus session" },
      { title: "AI Tutor",  route: "AI",        icon: Sparkles,  short: "⌘A", desc: "Get help with homework" },
    ]

    if (!debouncedQuery) {
      setResults(
        defaultPages.map((p) => {
          const Icon = p.icon
          return {
            id: `route-${p.route}`,
            label: p.title,
            icon: <Icon size={14} color={c.orange} strokeWidth={2} />,
            description: p.desc,
            short: p.short,
            end: "Page",
            onClick: () => { navigation.navigate(p.route as any); inputRef.current?.blur() },
          }
        })
      )
      return
    }

    const searchData = async () => {
      const qLower = debouncedQuery.toLowerCase().trim()
      const newResults: Action[] = []

      // Classes search
      try {
        let classes: any[] = []
        const classesData = await AsyncStorage.getItem("user_classes")
        const gradesData = await AsyncStorage.getItem("studentVueGrades")
        if (classesData) classes = JSON.parse(classesData)
        else if (gradesData) classes = JSON.parse(gradesData)
        if (Array.isArray(classes)) {
          classes
            .filter((cl: any) => cl.name && cl.name.toLowerCase().includes(qLower))
            .forEach((cl: any) => {
              newResults.push({
                id: `class-${cl.id || cl.name}`,
                label: cl.name,
                icon: <BookOpen size={14} color={c.blue} strokeWidth={2} />,
                description: cl.teacher ? `Teacher: ${cl.teacher}` : "Class gradebook",
                end: "Class",
                onClick: () => { navigation.navigate("Gradebook" as any); inputRef.current?.blur() },
              })
            })
        }
      } catch {}

      // Tasks search
      try {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("*")
          .ilike("title", `%${qLower}%`)
          .limit(4)
        if (tasks) {
          tasks.forEach((t: any) => {
            newResults.push({
              id: `task-${t.id}`,
              label: t.title,
              icon: <CheckSquare size={14} color={c.green} strokeWidth={2} />,
              description: t.due_date ? `Due ${t.due_date}` : "Task details",
              end: "Task",
              onClick: () => { navigation.navigate("Calendar" as any); inputRef.current?.blur() },
            })
          })
        }
      } catch {}

      // Pages search
      const pages = [
        { title: "Gradebook",   route: "Gradebook",   icon: BookOpen,     short: "⌘G" },
        { title: "Calendar",    route: "Calendar",    icon: Compass,      short: "⌘C" },
        { title: "Focus",       route: "Focus",       icon: CheckSquare,  short: "⌘F" },
        { title: "Leaderboard", route: "Leaderboard", icon: Trophy,       short: "⌘L" },
        { title: "AI Tutor",    route: "AI",          icon: Sparkles,     short: "⌘A" },
        { title: "Settings",    route: "Settings",    icon: SettingsIcon, short: "⌘S" },
      ]
      pages
        .filter((p) => p.title.toLowerCase().includes(qLower))
        .forEach((p) => {
          const Icon = p.icon
          newResults.push({
            id: `route-${p.route}`,
            label: p.title,
            icon: <Icon size={14} color={c.orange} strokeWidth={2} />,
            description: "App page",
            short: p.short,
            end: "Page",
            onClick: () => { navigation.navigate(p.route as any); inputRef.current?.blur() },
          })
        })

      setResults(newResults.slice(0, 7))
    }

    searchData()
  }, [debouncedQuery, isFocused, c])

  // Keyboard navigation inside the dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((prev) => (prev + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      results[activeIndex]?.onClick()
    }
  }

  const showDropdown = isFocused && results.length > 0

  // ─── Styles (all inline, no Tailwind dependency) ───────────────────────

  const containerStyle: CSSProperties = {
    position: "relative",
    width: 260,
    marginRight: 8,   // breathing room so the panel never kisses the viewport edge
    fontFamily: (theme.fonts?.m || "Geist") + ", sans-serif",
  }

  const inputWrapStyle: CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
  }

  const inputStyle: CSSProperties = {
    width: "100%",
    height: 36,
    paddingLeft: 34,
    paddingRight: 40,
    paddingTop: 0,
    paddingBottom: 0,
    fontSize: 13,
    fontFamily: (theme.fonts?.m || "Geist") + ", sans-serif",
    borderRadius: 8,
    border: `1px solid ${isFocused ? c.border2 : c.border}`,
    backgroundColor: isFocused ? c.surface : c.surface2,
    color: c.ink,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s ease, background-color 0.15s ease",
    boxShadow: isFocused
      ? `0 0 0 2px ${c.border2}22`
      : "0 1px 2px 0 rgba(0,0,0,0.04)",
  }

  const iconLeftStyle: CSSProperties = {
    position: "absolute",
    left: 10,
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    pointerEvents: "none",
    zIndex: 1,
  }

  const iconRightStyle: CSSProperties = {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    zIndex: 1,
    pointerEvents: "none",
  }

  const kbdStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    height: 18,
    padding: "0 5px",
    borderRadius: 4,
    border: `1px solid ${c.border}`,
    backgroundColor: c.surface2,
    fontFamily: (theme.fonts?.mono || "monospace") + ", monospace",
    fontSize: 10,
    color: c.ink3,
    gap: 1,
    letterSpacing: "0.02em",
    userSelect: "none" as const,
  }

  const panelStyle: CSSProperties = {
    position: "absolute",
    top: "calc(100% + 8px)",
    // Anchor to the RIGHT edge of the input and let the panel expand leftward.
    // Do NOT set left:0 — that would push the extra width rightward off screen.
    right: 0,
    width: 320,
    backgroundColor: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: 10,
    boxShadow: isDarkMode
      ? "0 16px 40px -8px rgba(0,0,0,0.7), 0 8px 16px -4px rgba(0,0,0,0.5)"
      : "0 16px 40px -8px rgba(0,0,0,0.15), 0 4px 8px -2px rgba(0,0,0,0.08)",
    overflow: "hidden",
    zIndex: 99999,
  }

  const listStyle: CSSProperties = {
    margin: 0,
    padding: "6px",
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  }

  const getItemStyle = (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "9px 12px",
    borderRadius: 7,
    cursor: "pointer",
    backgroundColor: active ? c.surface2 : "transparent",
    transition: "background-color 0.1s ease",
    listStyle: "none",
  })

  const itemLabelStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: c.ink,
    fontFamily: (theme.fonts?.s || "Geist-SemiBold") + ", sans-serif",
    lineHeight: "1",
  }

  const itemDescStyle: CSSProperties = {
    fontSize: 11,
    color: c.ink3,
    marginTop: 2,
    lineHeight: "1",
  }

  const badgeStyle: CSSProperties = {
    fontSize: 9,
    fontWeight: 600,
    color: c.ink3,
    backgroundColor: c.surface2,
    padding: "2px 6px",
    borderRadius: 4,
    border: `1px solid ${c.border}`,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    userSelect: "none" as const,
  }

  const footerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "7px 12px",
    borderTop: `1px solid ${c.border}`,
    backgroundColor: c.surface2 + "55",
    fontSize: 10,
    color: c.ink3,
    fontFamily: (theme.fonts?.m || "Geist") + ", sans-serif",
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      {/* Input row */}
      <div style={inputWrapStyle}>
        {/* Left search icon */}
        <span style={iconLeftStyle}>
          <Search size={14} color={c.ink3} strokeWidth={2} />
        </span>

        <input
          ref={inputRef}
          type="text"
          placeholder="Search classes, tasks…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(0) }}
          onFocus={() => { setIsFocused(true); setActiveIndex(0) }}
          onBlur={() => {
            // Small delay to let click on a result register
            setTimeout(() => setIsFocused(false), 150)
          }}
          onKeyDown={handleKeyDown}
          style={inputStyle}
          autoComplete="off"
          spellCheck={false}
        />

        {/* Right slot: send icon when typing, ⌘K badge when idle */}
        <span style={iconRightStyle}>
          <AnimatePresence mode="popLayout" initial={false}>
            {query.length > 0 ? (
              <motion.span
                key="send"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.12 }}
                style={{ display: "flex" }}
              >
                <Send size={13} color={c.ink3} strokeWidth={2} />
              </motion.span>
            ) : (
              <motion.span
                key="kbd"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                style={kbdStyle}
              >
                <span>⌘</span><span>K</span>
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </div>

      {/* Dropdown panel */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: -4, scaleY: 0.97 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -4, scaleY: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ ...panelStyle, transformOrigin: "top center" }}
          >
            <ul style={listStyle}>
              {results.map((action, index) => {
                const active = index === activeIndex
                return (
                  <li
                    key={action.id}
                    style={getItemStyle(active)}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(e) => {
                      // Prevent blur before click fires
                      e.preventDefault()
                      action.onClick()
                    }}
                  >
                    {/* Left: icon + text */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                      <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                        {action.icon}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span style={itemLabelStyle}>{action.label}</span>
                        {action.description && (
                          <span style={itemDescStyle}>{action.description}</span>
                        )}
                      </div>
                    </div>

                    {/* Right: kbd shortcut + type badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                      {action.short && (
                        <kbd style={kbdStyle}>
                          {action.short}
                        </kbd>
                      )}
                      {action.end && (
                        <span style={badgeStyle}>{action.end}</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            <div style={footerStyle}>
              <span>↑↓ navigate</span>
              <span>↵ open · ESC close</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
