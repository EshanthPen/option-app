import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Animated, TextInput, KeyboardAvoidingView,
  Platform, RefreshControl,
} from 'react-native';
import {
  Sparkles, Brain, AlertTriangle, TrendingUp, Clock, ChevronRight,
  CheckCircle, Target, Flame, BarChart3, Calendar, Zap, ArrowRight,
  AlertCircle, Crown, Send, MessageCircle, BookOpen, RefreshCw,
  Lock,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';
import { useNavigation } from '@react-navigation/native';
import {
  generateAIDailyBriefing,
  generateAIWeeklyReport,
  generateAIStudyPlan,
  generateAIReschedule,
  chatWithAI,
} from '../utils/aiEngine';

export default function AIAssistantScreen() {
  const { theme } = useTheme();
  const { isPro } = usePremium();
  const navigation = useNavigation();
  const styles = getStyles(theme);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('briefing');
  const [briefing, setBriefing] = useState(null);
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [studyPlan, setStudyPlan] = useState(null);
  const [reschedule, setReschedule] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    if (isPro) loadBriefing();
    else setLoading(false);
  }, [isPro]);

  // ── If not pro, show paywall ──────────────────────────────────

  if (!isPro) {
    return (
      <View style={[styles.container, styles.paywallContainer]}>
        <Animated.View style={[styles.paywallContent, { opacity: fadeAnim }]}>
          <View style={styles.paywallIconWrap}>
            <Sparkles size={36} color="#FFB800" />
          </View>
          <Text style={styles.paywallTitle}>AI Assistant</Text>
          <Text style={styles.paywallSubtitle}>
            Your personal AI-powered academic coach. Get daily briefings, study plans, weekly reports, and chat with AI about your academics.
          </Text>

          <View style={styles.paywallFeatures}>
            {[
              { icon: Brain, text: 'AI-generated daily briefings & priorities' },
              { icon: Calendar, text: 'Smart study plans tailored to your schedule' },
              { icon: BarChart3, text: 'Detailed weekly performance reports' },
              { icon: MessageCircle, text: 'Chat with AI about your academics' },
              { icon: RefreshCw, text: 'Auto-reschedule when plans change' },
              { icon: TrendingUp, text: 'Grade impact predictions' },
            ].map((feature, i) => (
              <View key={i} style={styles.paywallFeatureRow}>
                <feature.icon size={18} color={theme.colors.accent} />
                <Text style={styles.paywallFeatureText}>{feature.text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.paywallCta}
            onPress={() => navigation.navigate('Premium')}
            activeOpacity={0.8}
          >
            <Crown size={18} color="#121212" />
            <Text style={styles.paywallCtaText}>Upgrade to Pro</Text>
          </TouchableOpacity>

          <Text style={styles.paywallNote}>7-day free trial · Cancel anytime</Text>
        </Animated.View>
      </View>
    );
  }

  // ── Data Loading ──────────────────────────────────────────────

  const loadBriefing = async () => {
    setLoading(true);
    try {
      const data = await generateAIDailyBriefing();
      setBriefing(data);
    } catch (err) {
      console.error('Briefing error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTab = async (tab) => {
    setActiveTab(tab);
    if (tab === 'briefing' && !briefing) return loadBriefing();
    if (tab === 'report' && !weeklyReport) {
      setTabLoading(true);
      try {
        const data = await generateAIWeeklyReport();
        setWeeklyReport(data);
      } catch (err) { console.error(err); }
      finally { setTabLoading(false); }
    }
    if (tab === 'plan' && !studyPlan) {
      setTabLoading(true);
      try {
        const data = await generateAIStudyPlan();
        setStudyPlan(data);
      } catch (err) { console.error(err); }
      finally { setTabLoading(false); }
    }
    if (tab === 'reschedule' && !reschedule) {
      setTabLoading(true);
      try {
        const data = await generateAIReschedule();
        setReschedule(data);
      } catch (err) { console.error(err); }
      finally { setTabLoading(false); }
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);

    try {
      const response = await chatWithAI(msg);
      setChatMessages(prev => [...prev, {
        role: 'ai',
        content: response.response,
        suggestions: response.suggestions,
        tip: response.relatedTip,
      }]);
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'ai',
        content: "Sorry, I couldn't process that. Please try again.",
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setBriefing(null);
    setWeeklyReport(null);
    setStudyPlan(null);
    setReschedule(null);
    await loadBriefing();
    setRefreshing(false);
  };

  // ── Render Helpers ────────────────────────────────────────────

  const alertColor = (type) => {
    switch (type) {
      case 'danger': return theme.colors.red;
      case 'warning': return theme.colors.orange;
      case 'success': case 'info': return theme.colors.green;
      default: return theme.colors.blue;
    }
  };

  const urgencyColor = (u) => {
    switch (u) {
      case 'critical': return theme.colors.red;
      case 'high': return theme.colors.orange;
      case 'medium': return theme.colors.blue;
      default: return theme.colors.ink3;
    }
  };

  // ── Loading State ─────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <View style={styles.loadingWrap}>
          <Sparkles size={28} color="#FFB800" />
          <Text style={styles.loadingTitle}>Analyzing your data...</Text>
          <Text style={styles.loadingSubtext}>AI is building your personalized plan</Text>
          <ActivityIndicator size="small" color={theme.colors.ink3} style={{ marginTop: 12 }} />
        </View>
      </View>
    );
  }

  // ── Tab Content ───────────────────────────────────────────────

  const renderBriefing = () => {
    if (!briefing) return null;

    // Handle AI-powered response format
    const isAI = briefing.source === 'ai';

    return (
      <View style={styles.tabContent}>
        {/* Greeting */}
        <View style={styles.greetingCard}>
          <View style={styles.aiBadge}>
            <Sparkles size={12} color="#FFB800" />
            <Text style={styles.aiBadgeText}>
              {isAI ? 'AI-Powered' : 'Smart Analysis'}
            </Text>
          </View>
          <Text style={styles.greetingText}>
            {isAI ? briefing.greeting : briefing.greeting + '!'}
          </Text>
          <Text style={styles.summaryText}>
            {isAI ? briefing.summary : briefing.summary}
          </Text>
        </View>

        {/* Priorities (AI format) */}
        {isAI && briefing.priorities?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Target size={16} color={theme.colors.accent} /> Today's Priorities
            </Text>
            {briefing.priorities.map((p, i) => (
              <View key={i} style={styles.priorityCard}>
                <View style={styles.priorityHeader}>
                  <View style={[styles.urgencyDot, { backgroundColor: urgencyColor(p.urgency) }]} />
                  <Text style={styles.priorityTitle}>{p.title}</Text>
                  <View style={[styles.urgencyBadge, { backgroundColor: urgencyColor(p.urgency) + '18' }]}>
                    <Text style={[styles.urgencyText, { color: urgencyColor(p.urgency) }]}>
                      {p.urgency}
                    </Text>
                  </View>
                </View>
                <Text style={styles.priorityReason}>{p.reason}</Text>
                <View style={styles.actionRow}>
                  <Zap size={12} color={theme.colors.accent} />
                  <Text style={styles.actionText}>{p.suggestedAction}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Heuristic fallback: todaysPlan */}
        {!isAI && briefing.todaysPlan?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Plan</Text>
            {briefing.todaysPlan.map((task, i) => (
              <View key={i} style={styles.priorityCard}>
                <View style={styles.priorityHeader}>
                  <View style={[styles.urgencyDot, { backgroundColor: urgencyColor(task.priorityLabel?.toLowerCase()) }]} />
                  <Text style={styles.priorityTitle}>{task.title}</Text>
                </View>
                <Text style={styles.priorityReason}>
                  {task.isOverdue ? 'OVERDUE' : `Due in ${task.daysUntilDue} day${task.daysUntilDue !== 1 ? 's' : ''}`} · {task.duration}m
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Study Plan (AI) */}
        {isAI && briefing.studyPlan?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Clock size={16} color={theme.colors.blue} /> Suggested Schedule
            </Text>
            {briefing.studyPlan.map((block, i) => (
              <View key={i} style={styles.blockCard}>
                <View style={styles.blockTime}>
                  <Text style={styles.blockTimeText}>{block.time}</Text>
                  <Text style={styles.blockDuration}>{block.duration}</Text>
                </View>
                <View style={styles.blockInfo}>
                  <Text style={styles.blockTask}>{block.task}</Text>
                  <Text style={styles.blockTip}>{block.tip}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Alerts */}
        {briefing.alerts?.length > 0 && (
          <View style={styles.section}>
            {briefing.alerts.map((alert, i) => (
              <View key={i} style={[styles.alertCard, { borderLeftColor: alertColor(alert.type) }]}>
                <AlertCircle size={14} color={alertColor(alert.type)} />
                <Text style={styles.alertText}>{alert.message}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Motivation */}
        {isAI && briefing.motivation && (
          <View style={styles.motivationCard}>
            <Sparkles size={14} color="#FFB800" />
            <Text style={styles.motivationText}>{briefing.motivation}</Text>
          </View>
        )}

        {/* Top Tip */}
        {isAI && briefing.topTip && (
          <View style={styles.tipCard}>
            <Text style={styles.tipLabel}>AI Tip</Text>
            <Text style={styles.tipText}>{briefing.topTip}</Text>
          </View>
        )}

        {/* Heuristic tips */}
        {!isAI && briefing.tips?.length > 0 && (
          <View style={styles.tipCard}>
            <Text style={styles.tipLabel}>Tips</Text>
            {briefing.tips.map((tip, i) => (
              <Text key={i} style={styles.tipText}>• {tip}</Text>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderReport = () => {
    if (tabLoading) return <LoadingIndicator theme={theme} message="Generating weekly report..." />;
    if (!weeklyReport) return null;

    const isAI = weeklyReport.source === 'ai';

    return (
      <View style={styles.tabContent}>
        {isAI ? (
          <>
            <View style={styles.reportGradeCard}>
              <Text style={styles.reportGradeLabel}>Week Grade</Text>
              <Text style={styles.reportGradeValue}>{weeklyReport.overallGrade}</Text>
            </View>
            <Text style={styles.reportHeadline}>{weeklyReport.headline}</Text>

            {weeklyReport.wins?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Wins</Text>
                {weeklyReport.wins.map((w, i) => (
                  <View key={i} style={styles.winRow}>
                    <CheckCircle size={14} color={theme.colors.green} />
                    <Text style={styles.winText}>{w}</Text>
                  </View>
                ))}
              </View>
            )}

            {weeklyReport.improvements?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Areas to Improve</Text>
                {weeklyReport.improvements.map((imp, i) => (
                  <View key={i} style={styles.winRow}>
                    <ArrowRight size={14} color={theme.colors.orange} />
                    <Text style={styles.winText}>{imp}</Text>
                  </View>
                ))}
              </View>
            )}

            {weeklyReport.gradeAnalysis && (
              <View style={styles.analysisCard}>
                <BookOpen size={14} color={theme.colors.accent} />
                <Text style={styles.analysisText}>{weeklyReport.gradeAnalysis}</Text>
              </View>
            )}

            {weeklyReport.studyPatternInsight && (
              <View style={styles.analysisCard}>
                <Clock size={14} color={theme.colors.blue} />
                <Text style={styles.analysisText}>{weeklyReport.studyPatternInsight}</Text>
              </View>
            )}

            {weeklyReport.nextWeekPlan?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Next Week Goals</Text>
                {weeklyReport.nextWeekPlan.map((g, i) => (
                  <View key={i} style={styles.goalCard}>
                    <Text style={styles.goalTitle}>{g.goal}</Text>
                    <Text style={styles.goalAction}>{g.action}</Text>
                  </View>
                ))}
              </View>
            )}

            {weeklyReport.encouragement && (
              <View style={styles.motivationCard}>
                <Sparkles size={14} color="#FFB800" />
                <Text style={styles.motivationText}>{weeklyReport.encouragement}</Text>
              </View>
            )}
          </>
        ) : (
          // Heuristic fallback
          <>
            <Text style={styles.reportHeadline}>{weeklyReport.assessment}</Text>
            {weeklyReport.recommendations?.map((rec, i) => (
              <View key={i} style={styles.analysisCard}>
                <ArrowRight size={14} color={theme.colors.accent} />
                <Text style={styles.analysisText}>{rec.message}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    );
  };

  const renderStudyPlan = () => {
    if (tabLoading) return <LoadingIndicator theme={theme} message="Creating study plan..." />;
    if (!studyPlan) return null;

    const isAI = studyPlan.source === 'ai';

    return (
      <View style={styles.tabContent}>
        {isAI ? (
          <>
            <View style={styles.planHeader}>
              <Text style={styles.planOverview}>{studyPlan.overview}</Text>
              <View style={styles.planTimeBadge}>
                <Clock size={14} color={theme.colors.accent} />
                <Text style={styles.planTimeText}>{studyPlan.totalStudyTime}</Text>
              </View>
            </View>

            {studyPlan.blocks?.map((block, i) => (
              <View key={i} style={styles.studyBlock}>
                <View style={styles.studyBlockTime}>
                  <Text style={styles.studyBlockTimeText}>{block.startTime}</Text>
                  <View style={styles.studyBlockLine} />
                  <Text style={styles.studyBlockEndText}>{block.endTime}</Text>
                </View>
                <View style={styles.studyBlockContent}>
                  <Text style={styles.studyBlockTask}>{block.task}</Text>
                  <View style={styles.techniqueRow}>
                    <Brain size={12} color={theme.colors.purple} />
                    <Text style={styles.techniqueText}>{block.technique}</Text>
                  </View>
                  <Text style={styles.studyBlockReason}>{block.reason}</Text>
                  {block.breakAfter && (
                    <Text style={styles.breakText}>{block.breakAfter}</Text>
                  )}
                </View>
              </View>
            ))}

            {studyPlan.tips?.length > 0 && (
              <View style={styles.tipCard}>
                <Text style={styles.tipLabel}>Study Tips</Text>
                {studyPlan.tips.map((tip, i) => (
                  <Text key={i} style={styles.tipText}>• {tip}</Text>
                ))}
              </View>
            )}
          </>
        ) : (
          // Heuristic fallback
          <>
            <Text style={styles.planOverview}>{studyPlan.message}</Text>
            {studyPlan.blocks?.map((block, i) => (
              <View key={i} style={styles.studyBlock}>
                <View style={styles.studyBlockTime}>
                  <Text style={styles.studyBlockTimeText}>{block.suggestedStart}</Text>
                </View>
                <View style={styles.studyBlockContent}>
                  <Text style={styles.studyBlockTask}>{block.title}</Text>
                  <Text style={styles.studyBlockReason}>{block.reason}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </View>
    );
  };

  const renderChat = () => (
    <View style={styles.chatContainer}>
      <ScrollView
        ref={scrollRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd?.({ animated: true })}
      >
        {chatMessages.length === 0 && (
          <View style={styles.chatEmpty}>
            <MessageCircle size={32} color={theme.colors.ink4} />
            <Text style={styles.chatEmptyTitle}>Ask me anything</Text>
            <Text style={styles.chatEmptyText}>
              I know your tasks, grades, schedule, and study patterns. Ask me for advice, study tips, or help planning.
            </Text>
            <View style={styles.chatSuggestions}>
              {[
                "What should I focus on this week?",
                "How can I improve my grades in my lowest class?",
                "Create a study plan for my upcoming test",
                "Am I on track with my assignments?",
              ].map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.chatSuggestionChip}
                  onPress={() => { setChatInput(s); }}
                >
                  <Text style={styles.chatSuggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {chatMessages.map((msg, i) => (
          <View key={i} style={[
            styles.chatBubble,
            msg.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAI,
          ]}>
            {msg.role === 'ai' && (
              <View style={styles.chatAILabel}>
                <Sparkles size={12} color="#FFB800" />
                <Text style={styles.chatAILabelText}>Option AI</Text>
              </View>
            )}
            <Text style={[
              styles.chatBubbleText,
              msg.role === 'user' && styles.chatBubbleTextUser,
            ]}>
              {msg.content}
            </Text>
            {msg.suggestions?.length > 0 && (
              <View style={styles.chatSuggestionsInline}>
                {msg.suggestions.map((s, j) => (
                  <View key={j} style={styles.chatSuggestionInline}>
                    <ArrowRight size={10} color={theme.colors.accent} />
                    <Text style={styles.chatSuggestionInlineText}>{s}</Text>
                  </View>
                ))}
              </View>
            )}
            {msg.tip && (
              <View style={styles.chatTipInline}>
                <Sparkles size={10} color="#FFB800" />
                <Text style={styles.chatTipInlineText}>{msg.tip}</Text>
              </View>
            )}
          </View>
        ))}

        {chatLoading && (
          <View style={[styles.chatBubble, styles.chatBubbleAI]}>
            <View style={styles.chatAILabel}>
              <Sparkles size={12} color="#FFB800" />
              <Text style={styles.chatAILabelText}>Option AI</Text>
            </View>
            <View style={styles.typingIndicator}>
              <View style={styles.typingDot} />
              <View style={[styles.typingDot, { opacity: 0.6 }]} />
              <View style={[styles.typingDot, { opacity: 0.3 }]} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Chat Input */}
      <View style={styles.chatInputRow}>
        <TextInput
          style={styles.chatInput}
          placeholder="Ask about your academics..."
          placeholderTextColor={theme.colors.ink4}
          value={chatInput}
          onChangeText={setChatInput}
          onSubmitEditing={handleSendChat}
          returnKeyType="send"
          multiline={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !chatInput.trim() && styles.sendBtnDisabled]}
          onPress={handleSendChat}
          disabled={!chatInput.trim() || chatLoading}
        >
          <Send size={18} color={chatInput.trim() ? '#121212' : theme.colors.ink4} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Main Render ───────────────────────────────────────────────

  const TABS = [
    { key: 'briefing', label: 'Briefing', icon: Sparkles },
    { key: 'plan', label: 'Study Plan', icon: Calendar },
    { key: 'report', label: 'Report', icon: BarChart3 },
    { key: 'chat', label: 'Chat', icon: MessageCircle },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.aiIconWrap}>
              <Sparkles size={20} color="#FFB800" />
            </View>
            <View>
              <Text style={styles.headerTitle}>AI Assistant</Text>
              <Text style={styles.headerSubtitle}>Powered by AI</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
            <RefreshCw size={18} color={theme.colors.ink3} />
          </TouchableOpacity>
        </View>

        {/* Tab Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => loadTab(tab.key)}
              activeOpacity={0.7}
            >
              <tab.icon size={14} color={activeTab === tab.key ? theme.colors.ink : theme.colors.ink3} />
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Content */}
        {activeTab === 'chat' ? renderChat() : (
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.ink3} />
            }
          >
            {activeTab === 'briefing' && renderBriefing()}
            {activeTab === 'report' && renderReport()}
            {activeTab === 'plan' && renderStudyPlan()}
          </ScrollView>
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

// ── Loading Indicator Component ─────────────────────────────────

const LoadingIndicator = ({ theme, message }) => (
  <View style={{ alignItems: 'center', padding: 40 }}>
    <Sparkles size={24} color="#FFB800" />
    <Text style={{ fontSize: 13, color: theme.colors.ink3, marginTop: 10, fontFamily: theme.fonts.m }}>
      {message}
    </Text>
    <ActivityIndicator size="small" color={theme.colors.ink3} style={{ marginTop: 8 }} />
  </View>
);

// ── Styles ──────────────────────────────────────────────────────

const getStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },

  // Paywall
  paywallContainer: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  paywallContent: { maxWidth: 420, alignItems: 'center' },
  paywallIconWrap: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  paywallTitle: { fontSize: 28, fontFamily: theme.fonts.b, fontWeight: '800', color: theme.colors.ink, marginBottom: 8 },
  paywallSubtitle: { fontSize: 14, fontFamily: theme.fonts.m, color: theme.colors.ink3, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  paywallFeatures: { width: '100%', gap: 12, marginBottom: 28 },
  paywallFeatureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.colors.surface, padding: 14, borderRadius: theme.radii.r,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  paywallFeatureText: { fontSize: 13, fontFamily: theme.fonts.m, color: theme.colors.ink2, flex: 1 },
  paywallCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFB800', paddingVertical: 16, borderRadius: 14, width: '100%',
  },
  paywallCtaText: { fontSize: 16, fontWeight: '700', color: '#121212' },
  paywallNote: { fontSize: 12, color: theme.colors.ink4, marginTop: 10 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  aiIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontFamily: theme.fonts.b, fontWeight: '700', color: theme.colors.ink },
  headerSubtitle: { fontSize: 11, fontFamily: theme.fonts.m, color: '#FFB800', marginTop: 1 },
  refreshBtn: { padding: 8 },

  // Loading
  loadingWrap: { alignItems: 'center' },
  loadingTitle: { fontSize: 15, fontFamily: theme.fonts.s, fontWeight: '600', color: theme.colors.ink, marginTop: 12 },
  loadingSubtext: { fontSize: 12, fontFamily: theme.fonts.m, color: theme.colors.ink3, marginTop: 4 },

  // Tab Bar
  tabBar: { paddingHorizontal: 16, marginBottom: 4, flexGrow: 0 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: theme.colors.surface, marginRight: 8,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  tabActive: { backgroundColor: theme.colors.accent + '18', borderColor: theme.colors.accent + '40' },
  tabLabel: { fontSize: 12, fontFamily: theme.fonts.m, color: theme.colors.ink3 },
  tabLabelActive: { color: theme.colors.ink, fontWeight: '600' },

  scrollContent: { flex: 1 },
  tabContent: { padding: 16, gap: 14 },

  // Greeting
  greetingCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
    padding: 18, borderWidth: 1, borderColor: theme.colors.border,
  },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 10,
  },
  aiBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFB800' },
  greetingText: { fontSize: 16, fontFamily: theme.fonts.s, fontWeight: '600', color: theme.colors.ink, lineHeight: 24, marginBottom: 6 },
  summaryText: { fontSize: 13, fontFamily: theme.fonts.m, color: theme.colors.ink2, lineHeight: 20 },

  // Sections
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontFamily: theme.fonts.s, fontWeight: '600', color: theme.colors.ink, marginBottom: 4 },

  // Priority Cards
  priorityCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.r,
    padding: 14, borderWidth: 1, borderColor: theme.colors.border,
  },
  priorityHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  urgencyDot: { width: 8, height: 8, borderRadius: 4 },
  priorityTitle: { fontSize: 14, fontFamily: theme.fonts.m, fontWeight: '600', color: theme.colors.ink, flex: 1 },
  urgencyBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  urgencyText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  priorityReason: { fontSize: 12, fontFamily: theme.fonts.m, color: theme.colors.ink3, lineHeight: 18, marginBottom: 6 },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  actionText: { fontSize: 12, fontFamily: theme.fonts.m, color: theme.colors.accent, lineHeight: 18, flex: 1 },

  // Blocks
  blockCard: {
    flexDirection: 'row', gap: 12,
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.r,
    padding: 12, borderWidth: 1, borderColor: theme.colors.border,
  },
  blockTime: { alignItems: 'center', width: 50 },
  blockTimeText: { fontSize: 12, fontFamily: theme.fonts.s, fontWeight: '600', color: theme.colors.accent },
  blockDuration: { fontSize: 10, fontFamily: theme.fonts.m, color: theme.colors.ink3 },
  blockInfo: { flex: 1 },
  blockTask: { fontSize: 13, fontFamily: theme.fonts.m, fontWeight: '500', color: theme.colors.ink },
  blockTip: { fontSize: 11, fontFamily: theme.fonts.m, color: theme.colors.ink3, marginTop: 3, fontStyle: 'italic' },

  // Alerts
  alertCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.r,
    padding: 12, borderLeftWidth: 3, borderWidth: 1, borderColor: theme.colors.border,
  },
  alertText: { fontSize: 12, fontFamily: theme.fonts.m, color: theme.colors.ink2, lineHeight: 18, flex: 1 },

  // Motivation
  motivationCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(255, 184, 0, 0.06)', borderRadius: theme.radii.lg,
    padding: 16, borderWidth: 1, borderColor: 'rgba(255, 184, 0, 0.15)',
  },
  motivationText: { fontSize: 13, fontFamily: theme.fonts.m, color: theme.colors.ink, lineHeight: 20, flex: 1 },

  // Tips
  tipCard: {
    backgroundColor: theme.colors.surface2, borderRadius: theme.radii.lg,
    padding: 16, borderWidth: 1, borderColor: theme.colors.border,
  },
  tipLabel: { fontSize: 12, fontFamily: theme.fonts.s, fontWeight: '600', color: '#FFB800', marginBottom: 6 },
  tipText: { fontSize: 12, fontFamily: theme.fonts.m, color: theme.colors.ink2, lineHeight: 18, marginBottom: 4 },

  // Report
  reportGradeCard: {
    alignItems: 'center', padding: 20,
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  reportGradeLabel: { fontSize: 11, fontFamily: theme.fonts.m, color: theme.colors.ink3, marginBottom: 4 },
  reportGradeValue: { fontSize: 48, fontFamily: theme.fonts.b, fontWeight: '800', color: theme.colors.ink },
  reportHeadline: { fontSize: 14, fontFamily: theme.fonts.m, color: theme.colors.ink2, lineHeight: 22, textAlign: 'center' },

  winRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  winText: { fontSize: 13, fontFamily: theme.fonts.m, color: theme.colors.ink2, lineHeight: 20, flex: 1 },

  analysisCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.r,
    padding: 14, borderWidth: 1, borderColor: theme.colors.border,
  },
  analysisText: { fontSize: 12, fontFamily: theme.fonts.m, color: theme.colors.ink2, lineHeight: 18, flex: 1 },

  goalCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.r,
    padding: 12, borderWidth: 1, borderColor: theme.colors.border,
  },
  goalTitle: { fontSize: 13, fontFamily: theme.fonts.s, fontWeight: '600', color: theme.colors.ink },
  goalAction: { fontSize: 12, fontFamily: theme.fonts.m, color: theme.colors.ink3, marginTop: 3, lineHeight: 18 },

  // Study Plan
  planHeader: { gap: 8, marginBottom: 8 },
  planOverview: { fontSize: 14, fontFamily: theme.fonts.m, color: theme.colors.ink2, lineHeight: 22 },
  planTimeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  planTimeText: { fontSize: 13, fontFamily: theme.fonts.s, fontWeight: '600', color: theme.colors.accent },

  studyBlock: {
    flexDirection: 'row', gap: 12,
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.r,
    padding: 14, borderWidth: 1, borderColor: theme.colors.border, borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent,
  },
  studyBlockTime: { alignItems: 'center', width: 55, gap: 4 },
  studyBlockTimeText: { fontSize: 12, fontFamily: theme.fonts.s, fontWeight: '600', color: theme.colors.accent },
  studyBlockLine: { width: 1, height: 12, backgroundColor: theme.colors.border },
  studyBlockEndText: { fontSize: 11, fontFamily: theme.fonts.m, color: theme.colors.ink3 },
  studyBlockContent: { flex: 1 },
  studyBlockTask: { fontSize: 14, fontFamily: theme.fonts.s, fontWeight: '600', color: theme.colors.ink },
  techniqueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  techniqueText: { fontSize: 11, fontFamily: theme.fonts.m, color: theme.colors.purple },
  studyBlockReason: { fontSize: 11, fontFamily: theme.fonts.m, color: theme.colors.ink3, marginTop: 4, lineHeight: 16 },
  breakText: { fontSize: 11, fontFamily: theme.fonts.m, color: theme.colors.green, marginTop: 6, fontStyle: 'italic' },

  // Chat
  chatContainer: { flex: 1 },
  chatScroll: { flex: 1 },
  chatContent: { padding: 16, gap: 10 },
  chatEmpty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  chatEmptyTitle: { fontSize: 16, fontFamily: theme.fonts.s, fontWeight: '600', color: theme.colors.ink },
  chatEmptyText: { fontSize: 13, fontFamily: theme.fonts.m, color: theme.colors.ink3, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  chatSuggestions: { gap: 8, marginTop: 16, width: '100%' },
  chatSuggestionChip: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.r,
    padding: 12, borderWidth: 1, borderColor: theme.colors.border,
  },
  chatSuggestionText: { fontSize: 13, fontFamily: theme.fonts.m, color: theme.colors.ink2 },

  chatBubble: { maxWidth: '85%', borderRadius: 16, padding: 14 },
  chatBubbleUser: {
    alignSelf: 'flex-end', backgroundColor: theme.colors.accent,
    borderBottomRightRadius: 4,
  },
  chatBubbleAI: {
    alignSelf: 'flex-start', backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.colors.border,
  },
  chatBubbleText: { fontSize: 14, fontFamily: theme.fonts.m, color: theme.colors.ink, lineHeight: 22 },
  chatBubbleTextUser: { color: theme.colors.bg },
  chatAILabel: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6,
  },
  chatAILabelText: { fontSize: 10, fontWeight: '700', color: '#FFB800' },
  chatSuggestionsInline: { marginTop: 10, gap: 4 },
  chatSuggestionInline: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  chatSuggestionInlineText: { fontSize: 12, fontFamily: theme.fonts.m, color: theme.colors.accent, lineHeight: 18 },
  chatTipInline: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8,
    borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 8,
  },
  chatTipInlineText: { fontSize: 11, fontFamily: theme.fonts.m, color: '#FFB800', lineHeight: 16, flex: 1 },

  typingIndicator: { flexDirection: 'row', gap: 4, paddingVertical: 4 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.ink3 },

  chatInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  chatInput: {
    flex: 1, backgroundColor: theme.colors.surface, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 14,
    fontFamily: theme.fonts.m, color: theme.colors.ink,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#FFB800', justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: theme.colors.surface },
});
