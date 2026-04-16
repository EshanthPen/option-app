/**
 * AI Assistant API Endpoint
 *
 * Receives student context (tasks, grades, focus data) and uses
 * Google Gemini 2.0 Flash to generate personalized academic coaching.
 *
 * Free tier: 1,500 requests/day — perfect for beta.
 * PRO feature — caller must send a valid Supabase auth token.
 */

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'AI service not configured' });
  }

  try {
    const { studentContext, requestType } = req.body;

    if (!studentContext) {
      return res.status(400).json({ error: 'Missing studentContext' });
    }

    // Build the system instruction
    const systemPrompt = `You are Option AI — a smart, friendly academic coach built into the Option student productivity app. You speak directly to the student in a supportive, concise tone. You're data-driven but encouraging.

RULES:
- Be specific and actionable. Don't give generic advice.
- Reference their actual task names, class names, and grades when available.
- Keep responses focused and scannable — use short paragraphs and bullet points.
- If grades are dropping, be honest but supportive. Never shame.
- Prioritize what matters most TODAY.
- When suggesting study blocks, be specific about times and durations.
- Format your response as valid JSON matching the requested schema.
- ONLY output the JSON object — no markdown fences, no explanation, just the JSON.`;

    let userPrompt;
    let responseSchema;

    switch (requestType) {
      case 'daily_briefing':
        userPrompt = buildDailyBriefingPrompt(studentContext);
        responseSchema = 'daily_briefing';
        break;
      case 'weekly_report':
        userPrompt = buildWeeklyReportPrompt(studentContext);
        responseSchema = 'weekly_report';
        break;
      case 'study_plan':
        userPrompt = buildStudyPlanPrompt(studentContext);
        responseSchema = 'study_plan';
        break;
      case 'reschedule':
        userPrompt = buildReschedulePrompt(studentContext);
        responseSchema = 'reschedule';
        break;
      case 'chat':
        userPrompt = buildChatPrompt(studentContext);
        responseSchema = 'chat';
        break;
      default:
        userPrompt = buildDailyBriefingPrompt(studentContext);
        responseSchema = 'daily_briefing';
    }

    // Call Google Gemini 2.0 Flash
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini error:', geminiRes.status, errBody);
      return res.status(502).json({ error: 'AI service error', details: geminiRes.status });
    }

    const data = await geminiRes.json();

    // Extract the text from Gemini's response structure
    const aiMessage = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiMessage) {
      console.error('Empty Gemini response:', JSON.stringify(data));
      return res.status(502).json({ error: 'Empty AI response' });
    }

    // Parse JSON response — strip markdown fences if present
    let parsed;
    try {
      const cleaned = aiMessage.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { raw: aiMessage };
    }

    // Map Gemini usage metadata to a familiar shape
    const usage = data.usageMetadata ? {
      prompt_tokens: data.usageMetadata.promptTokenCount,
      completion_tokens: data.usageMetadata.candidatesTokenCount,
      total_tokens: data.usageMetadata.totalTokenCount,
    } : null;

    return res.status(200).json({
      success: true,
      type: responseSchema,
      data: parsed,
      usage,
    });

  } catch (err) {
    console.error('AI assistant error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ── Prompt Builders ─────────────────────────────────────────────

function buildDailyBriefingPrompt(ctx) {
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return `It's ${dayName}, ${dateStr}. Generate a personalized daily briefing for this student.

STUDENT DATA:
${JSON.stringify(ctx, null, 2)}

Respond with this exact JSON schema:
{
  "greeting": "A warm, personalized 1-sentence greeting mentioning what's most important today",
  "summary": "2-3 sentence overview of today's priorities and workload",
  "priorities": [
    {
      "title": "task name",
      "reason": "why this is priority #1 today (be specific)",
      "suggestedAction": "exactly what to do and for how long",
      "urgency": "critical|high|medium|low"
    }
  ],
  "studyPlan": [
    {
      "time": "suggested time like 3:00 PM",
      "task": "what to work on",
      "duration": "45 min",
      "tip": "a specific study technique for this task"
    }
  ],
  "alerts": [
    {
      "type": "danger|warning|info|success",
      "message": "specific alert about grades, deadlines, or patterns"
    }
  ],
  "motivation": "A short, genuine motivational message based on their actual progress (reference specific data like streak, grades, or completed tasks)",
  "topTip": "One high-value actionable tip personalized to their current situation"
}`;
}

function buildWeeklyReportPrompt(ctx) {
  return `Generate a detailed weekly performance report for this student.

STUDENT DATA:
${JSON.stringify(ctx, null, 2)}

Respond with this exact JSON schema:
{
  "headline": "One-sentence week summary (be specific, reference actual numbers)",
  "overallGrade": "A+|A|A-|B+|B|B-|C+|C|C-|D|F — grade their week",
  "wins": ["specific things they did well this week"],
  "improvements": ["specific areas to improve with actionable advice"],
  "gradeAnalysis": "2-3 sentences analyzing their grade trends. Be specific about which classes are concerning and which are strong.",
  "studyPatternInsight": "Analysis of when and how they study — are they cramming or spacing? Morning or night? Consistent or sporadic?",
  "nextWeekPlan": [
    {
      "goal": "specific goal for next week",
      "action": "concrete steps to achieve it"
    }
  ],
  "focusScoreExplanation": "Explain what their focus score means and how to improve it",
  "encouragement": "Genuine encouragement that references their specific achievements or progress"
}`;
}

function buildStudyPlanPrompt(ctx) {
  return `Create an optimal study plan for today based on this student's data.

STUDENT DATA:
${JSON.stringify(ctx, null, 2)}

Consider their working hours, existing schedule, task priorities, and energy levels. Place harder tasks during peak focus hours.

Respond with this exact JSON schema:
{
  "overview": "Brief summary of the plan",
  "totalStudyTime": "e.g. 2h 30m",
  "blocks": [
    {
      "startTime": "3:00 PM",
      "endTime": "3:50 PM",
      "task": "exact task name from their list",
      "technique": "specific study technique (e.g. active recall, practice problems, outline essay, review notes)",
      "reason": "why this task at this time",
      "breakAfter": "10 min break — stretch and hydrate"
    }
  ],
  "tips": ["study tips specific to today's tasks"]
}`;
}

function buildReschedulePrompt(ctx) {
  return `The student needs help rescheduling. Analyze their current schedule and suggest changes.

STUDENT DATA:
${JSON.stringify(ctx, null, 2)}

Respond with this exact JSON schema:
{
  "analysis": "What's wrong with the current schedule",
  "changes": [
    {
      "action": "move|add|remove|split",
      "task": "task name",
      "from": "original time/day or null if new",
      "to": "new suggested time/day",
      "reason": "why this change helps"
    }
  ],
  "balanceAdvice": "How to better balance their workload across the week"
}`;
}

function buildChatPrompt(ctx) {
  return `The student is asking for help. Answer their question based on their academic data.

STUDENT DATA & QUESTION:
${JSON.stringify(ctx, null, 2)}

Respond with this exact JSON schema:
{
  "response": "Your helpful, personalized response to their question. Be specific and reference their actual data. Keep it conversational but actionable.",
  "suggestions": ["1-3 follow-up actions they could take"],
  "relatedTip": "One bonus tip related to their question"
}`;
}
