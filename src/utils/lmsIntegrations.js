import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ============================================================================
// Storage keys used across all integrations
// ============================================================================
const STORAGE_KEYS = {
  studentVue: 'studentVueGrades',
  googleClassroom: 'googleClassroomGrades',
  canvas: 'canvasGrades',
  pearson: 'pearsonGrades',
  deltaMath: 'deltaMathGrades',
  khanAcademy: 'khanAcademyProgress',
  manual: 'manualGrades',
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Infer course type (AP, Honors, Regular) from a course name string.
 */
function inferCourseType(name) {
  const lower = (name || '').toLowerCase();
  if (/\bap\b/.test(lower)) return 'AP';
  if (/\bhn\b|honor|hnr|adv|accelerat/.test(lower)) return 'HN';
  return 'REG';
}

/**
 * Format an ISO date string into a short human-readable date.
 */
function formatDate(raw) {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? raw : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return raw;
  }
}

/**
 * Safely parse a JSON response body, returning null on failure.
 */
async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Persist an array of class objects to AsyncStorage under the given key.
 */
async function saveGrades(key, classes) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(classes));
  } catch (e) {
    console.error(`[LMS] Failed to save grades to "${key}":`, e?.message);
  }
}

/**
 * Load and parse a JSON array from AsyncStorage, returning [] on failure.
 */
async function loadGrades(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ============================================================================
// Google Classroom Integration
// Uses the official Google Classroom REST API (v1).
// Requires an OAuth2 access token with classroom.courses.readonly and
// classroom.coursework.students.readonly scopes.
// ============================================================================

const CLASSROOM_BASE = 'https://classroom.googleapis.com/v1';

/**
 * Fetch all active courses for the authenticated student.
 * @param {string} accessToken OAuth2 access token
 * @returns {Promise<Array<{id: string, name: string, section: string, grade: number|null}>>}
 */
export async function fetchGoogleClassroomCourses(accessToken) {
  if (!accessToken) throw new Error('Google Classroom: access token is required');

  const courses = [];
  let pageToken = null;

  try {
    do {
      const url = new URL(`${CLASSROOM_BASE}/courses`);
      url.searchParams.set('courseStates', 'ACTIVE');
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Google Classroom API ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      for (const c of data.courses || []) {
        courses.push({
          id: c.id,
          name: c.name || 'Untitled Course',
          section: c.section || '',
          grade: null, // Google Classroom does not expose an overall grade directly
        });
      }

      pageToken = data.nextPageToken || null;
    } while (pageToken);
  } catch (e) {
    console.error('[Google Classroom] fetchCourses error:', e?.message);
    throw e;
  }

  return courses;
}

/**
 * Fetch all coursework (assignments) for a given course, including the
 * student's submissions so we can extract grades.
 * @param {string} accessToken OAuth2 access token
 * @param {string} courseId    Course ID from fetchGoogleClassroomCourses
 * @returns {Promise<Array<{title, dueDate, maxPoints, grade, status, link}>>}
 */
export async function fetchGoogleClassroomAssignments(accessToken, courseId) {
  if (!accessToken) throw new Error('Google Classroom: access token is required');
  if (!courseId) throw new Error('Google Classroom: courseId is required');

  const assignments = [];

  try {
    // 1. Fetch all coursework items
    let pageToken = null;
    const courseworkItems = [];

    do {
      const url = new URL(`${CLASSROOM_BASE}/courses/${courseId}/courseWork`);
      url.searchParams.set('pageSize', '100');
      url.searchParams.set('orderBy', 'dueDate desc');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.status === 404) break; // No coursework for this course
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Coursework API ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      courseworkItems.push(...(data.courseWork || []));
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    // 2. Fetch student submissions for each coursework item
    for (const cw of courseworkItems) {
      let submission = null;

      try {
        const subUrl = `${CLASSROOM_BASE}/courses/${courseId}/courseWork/${cw.id}/studentSubmissions?pageSize=1`;
        const subRes = await fetch(subUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (subRes.ok) {
          const subData = await subRes.json();
          submission = (subData.studentSubmissions || [])[0] || null;
        }
      } catch {
        // Continue without submission data
      }

      const dueDate = cw.dueDate
        ? `${cw.dueDate.year}-${String(cw.dueDate.month).padStart(2, '0')}-${String(cw.dueDate.day).padStart(2, '0')}`
        : null;

      assignments.push({
        title: cw.title || 'Untitled',
        dueDate,
        maxPoints: cw.maxPoints || null,
        grade: submission?.assignedGrade ?? submission?.draftGrade ?? null,
        status: submission?.state || 'NEW',
        link: cw.alternateLink || null,
      });
    }
  } catch (e) {
    console.error('[Google Classroom] fetchAssignments error:', e?.message);
    throw e;
  }

  return assignments;
}

/**
 * Sync all Google Classroom courses and assignments into the app's standard
 * class format and persist to AsyncStorage.
 * @param {string} accessToken OAuth2 access token
 * @returns {Promise<Array>} The array of classes saved
 */
export async function syncGoogleClassroom(accessToken) {
  const courses = await fetchGoogleClassroomCourses(accessToken);
  const classes = [];

  for (const course of courses) {
    let assignments = [];
    try {
      assignments = await fetchGoogleClassroomAssignments(accessToken, course.id);
    } catch (e) {
      console.warn(`[Google Classroom] Could not fetch assignments for "${course.name}":`, e?.message);
    }

    // Convert to standard format
    const stdAssignments = assignments.map((a) => ({
      name: a.title,
      score: a.grade,
      total: a.maxPoints,
      category: a.status === 'TURNED_IN' ? 'Submitted' : a.status === 'RETURNED' ? 'Graded' : 'Assigned',
      date: formatDate(a.dueDate),
    }));

    // Compute an overall grade from graded assignments
    let grade = 0;
    const graded = stdAssignments.filter((a) => a.score != null && a.total != null && a.total > 0);
    if (graded.length > 0) {
      const totalEarned = graded.reduce((sum, a) => sum + a.score, 0);
      const totalPossible = graded.reduce((sum, a) => sum + a.total, 0);
      grade = totalPossible > 0 ? +((totalEarned / totalPossible) * 100).toFixed(1) : 0;
    }

    classes.push({
      name: course.name,
      grade,
      type: inferCourseType(course.name),
      assignments: stdAssignments,
    });
  }

  await saveGrades(STORAGE_KEYS.googleClassroom, classes);
  return classes;
}

// ============================================================================
// Canvas LMS Integration
// Uses the Canvas REST API (v1). Requires the school's Canvas base URL and
// an API access token generated from the user's Canvas account settings.
// ============================================================================

/**
 * Fetch active courses from a Canvas instance.
 * @param {string} baseUrl     School's Canvas URL (e.g. "https://school.instructure.com")
 * @param {string} accessToken Canvas API access token
 * @returns {Promise<Array<{id, name, courseCode, enrollmentType}>>}
 */
export async function fetchCanvasCourses(baseUrl, accessToken) {
  if (!baseUrl || !accessToken) throw new Error('Canvas: baseUrl and accessToken are required');

  const base = baseUrl.replace(/\/+$/, '');
  const courses = [];
  let page = 1;

  try {
    while (true) {
      const url = `${base}/api/v1/courses?enrollment_state=active&per_page=50&page=${page}&include[]=total_scores`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Canvas courses API ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;

      for (const c of data) {
        // Skip courses without a name (deleted / concluded shells)
        if (!c.name) continue;

        const enrollment = (c.enrollments || []).find((e) => e.type === 'student') || {};
        courses.push({
          id: c.id,
          name: c.name,
          courseCode: c.course_code || '',
          enrollmentType: enrollment.type || 'student',
          currentScore: enrollment.computed_current_score ?? null,
          currentGrade: enrollment.computed_current_grade ?? null,
        });
      }

      // Check for pagination via Link header
      const linkHeader = res.headers.get('Link') || '';
      if (!linkHeader.includes('rel="next"')) break;
      page++;
    }
  } catch (e) {
    console.error('[Canvas] fetchCourses error:', e?.message);
    throw e;
  }

  return courses;
}

/**
 * Fetch assignments with submissions for a Canvas course.
 * @param {string} baseUrl     School's Canvas URL
 * @param {string} accessToken Canvas API access token
 * @param {string|number} courseId Course ID
 * @returns {Promise<Array<{name, dueDate, pointsPossible, score, grade, status}>>}
 */
export async function fetchCanvasAssignments(baseUrl, accessToken, courseId) {
  if (!baseUrl || !accessToken || !courseId) {
    throw new Error('Canvas: baseUrl, accessToken, and courseId are required');
  }

  const base = baseUrl.replace(/\/+$/, '');
  const assignments = [];
  let page = 1;

  try {
    while (true) {
      const url = `${base}/api/v1/courses/${courseId}/assignments?per_page=50&page=${page}&include[]=submission&order_by=due_at`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Canvas assignments API ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;

      for (const a of data) {
        const sub = a.submission || {};
        assignments.push({
          name: a.name || 'Untitled Assignment',
          dueDate: a.due_at || null,
          pointsPossible: a.points_possible || null,
          score: sub.score ?? null,
          grade: sub.grade ?? null,
          status: sub.workflow_state || 'unsubmitted',
        });
      }

      const linkHeader = res.headers.get('Link') || '';
      if (!linkHeader.includes('rel="next"')) break;
      page++;
    }
  } catch (e) {
    console.error('[Canvas] fetchAssignments error:', e?.message);
    throw e;
  }

  return assignments;
}

/**
 * Sync all Canvas courses and assignments into the app's standard class format.
 * @param {string} baseUrl     School's Canvas URL
 * @param {string} accessToken Canvas API access token
 * @returns {Promise<Array>} The array of classes saved
 */
export async function syncCanvas(baseUrl, accessToken) {
  const courses = await fetchCanvasCourses(baseUrl, accessToken);
  const classes = [];

  for (const course of courses) {
    let rawAssignments = [];
    try {
      rawAssignments = await fetchCanvasAssignments(baseUrl, accessToken, course.id);
    } catch (e) {
      console.warn(`[Canvas] Could not fetch assignments for "${course.name}":`, e?.message);
    }

    const stdAssignments = rawAssignments.map((a) => ({
      name: a.name,
      score: a.score,
      total: a.pointsPossible,
      category: a.status === 'graded' ? 'Graded' : a.status === 'submitted' ? 'Submitted' : 'Assigned',
      date: formatDate(a.dueDate),
    }));

    // Use Canvas-computed score if available, otherwise compute from assignments
    let grade = course.currentScore ?? 0;
    if (grade === 0 || grade == null) {
      const graded = stdAssignments.filter((a) => a.score != null && a.total != null && a.total > 0);
      if (graded.length > 0) {
        const earned = graded.reduce((s, a) => s + a.score, 0);
        const possible = graded.reduce((s, a) => s + a.total, 0);
        grade = possible > 0 ? +((earned / possible) * 100).toFixed(1) : 0;
      }
    }

    classes.push({
      name: course.name,
      grade,
      type: inferCourseType(course.name),
      assignments: stdAssignments,
    });
  }

  await saveGrades(STORAGE_KEYS.canvas, classes);
  return classes;
}

// ============================================================================
// Pearson Realize Integration
//
// NOTE: Pearson Realize does NOT offer a public API for third-party apps.
// This integration requires a backend proxy server that authenticates with
// Pearson on the student's behalf using their session cookie. The proxy
// should expose a POST /api/pearson endpoint that accepts { sessionCookie }
// and returns grade data. This is a best-effort integration and may break
// if Pearson changes their internal endpoints or session handling.
// ============================================================================

/**
 * Sync grades from Pearson Realize via a backend proxy.
 * @param {string} sessionCookie The student's Pearson session cookie
 * @param {string} baseUrl       Base URL of the proxy server (defaults to current origin on web)
 * @returns {Promise<Array>} The array of classes saved
 */
export async function syncPearson(sessionCookie, baseUrl) {
  if (!sessionCookie) throw new Error('Pearson: session cookie is required');

  // On web, default to same origin; on native, a proxy URL must be provided.
  const proxyBase = baseUrl
    ? baseUrl.replace(/\/+$/, '')
    : Platform.OS === 'web'
      ? ''
      : null;

  if (!proxyBase && Platform.OS !== 'web') {
    throw new Error('Pearson: a proxy base URL is required on native platforms');
  }

  try {
    const res = await fetch(`${proxyBase}/api/pearson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCookie }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Pearson proxy returned ${res.status}: ${errBody}`);
    }

    const data = await safeJson(res);
    if (!data || !Array.isArray(data.courses)) {
      throw new Error('Pearson proxy returned unexpected data format');
    }

    // Normalize into standard class format
    const classes = data.courses.map((course) => {
      const stdAssignments = (course.assignments || []).map((a) => ({
        name: a.title || a.name || 'Untitled',
        score: a.score ?? a.pointsEarned ?? null,
        total: a.totalPoints ?? a.pointsPossible ?? null,
        category: a.category || a.type || 'Assignment',
        date: formatDate(a.dueDate || a.date),
      }));

      // Compute grade from assignments if not provided
      let grade = course.grade ?? course.overallScore ?? 0;
      if ((grade === 0 || grade == null) && stdAssignments.length > 0) {
        const graded = stdAssignments.filter((a) => a.score != null && a.total != null && a.total > 0);
        if (graded.length > 0) {
          const earned = graded.reduce((s, a) => s + a.score, 0);
          const possible = graded.reduce((s, a) => s + a.total, 0);
          grade = possible > 0 ? +((earned / possible) * 100).toFixed(1) : 0;
        }
      }

      return {
        name: course.name || course.title || 'Pearson Course',
        grade,
        type: inferCourseType(course.name || course.title),
        assignments: stdAssignments,
      };
    });

    await saveGrades(STORAGE_KEYS.pearson, classes);
    return classes;
  } catch (e) {
    console.error('[Pearson] sync error:', e?.message);
    throw e;
  }
}

// ============================================================================
// DeltaMath Integration
//
// NOTE: DeltaMath does NOT provide a public API. This integration requires a
// backend proxy server that can authenticate with DeltaMath using the
// student's session token. The proxy should expose a POST /api/deltamath
// endpoint that accepts { sessionToken } and returns assignment/grade data.
// This is a best-effort integration and may break if DeltaMath changes
// their internal API or authentication scheme.
// ============================================================================

/**
 * Sync grades from DeltaMath via a backend proxy.
 * @param {string} sessionToken The student's DeltaMath session/auth token
 * @param {string} [proxyUrl]   Optional proxy base URL (defaults to same origin on web)
 * @returns {Promise<Array>} The array of classes saved
 */
export async function syncDeltaMath(sessionToken, proxyUrl) {
  if (!sessionToken) throw new Error('DeltaMath: session token is required');

  const proxyBase = proxyUrl
    ? proxyUrl.replace(/\/+$/, '')
    : Platform.OS === 'web'
      ? ''
      : null;

  if (!proxyBase && Platform.OS !== 'web') {
    throw new Error('DeltaMath: a proxy base URL is required on native platforms');
  }

  try {
    const res = await fetch(`${proxyBase}/api/deltamath`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`DeltaMath proxy returned ${res.status}: ${errBody}`);
    }

    const data = await safeJson(res);
    if (!data) {
      throw new Error('DeltaMath proxy returned invalid JSON');
    }

    // DeltaMath typically organizes by teacher/class, then assignments
    const rawClasses = Array.isArray(data.classes) ? data.classes : Array.isArray(data) ? data : [];

    const classes = rawClasses.map((cls) => {
      const stdAssignments = (cls.assignments || []).map((a) => ({
        name: a.name || a.title || 'DeltaMath Assignment',
        score: a.score ?? a.percent ?? null,
        total: a.total ?? a.maxScore ?? 100,
        category: a.category || 'Practice',
        date: formatDate(a.dueDate || a.date || a.assignedDate),
      }));

      // DeltaMath scores are often percentages; compute overall from assignments
      let grade = cls.grade ?? cls.overallPercent ?? 0;
      if ((grade === 0 || grade == null) && stdAssignments.length > 0) {
        const graded = stdAssignments.filter((a) => a.score != null && a.total != null && a.total > 0);
        if (graded.length > 0) {
          const earned = graded.reduce((s, a) => s + a.score, 0);
          const possible = graded.reduce((s, a) => s + a.total, 0);
          grade = possible > 0 ? +((earned / possible) * 100).toFixed(1) : 0;
        }
      }

      return {
        name: cls.name || cls.className || 'DeltaMath Class',
        grade,
        type: inferCourseType(cls.name || cls.className),
        assignments: stdAssignments,
      };
    });

    await saveGrades(STORAGE_KEYS.deltaMath, classes);
    return classes;
  } catch (e) {
    console.error('[DeltaMath] sync error:', e?.message);
    throw e;
  }
}

// ============================================================================
// Khan Academy Integration
//
// Uses Khan Academy's API to retrieve course progress and mastery levels.
// Khan Academy's API landscape has changed over time. This integration
// targets the internal GraphQL-style API at /api/internal. A valid auth
// token (KAAS cookie or bearer token) is required.
// ============================================================================

const KHAN_API_BASE = 'https://www.khanacademy.org/api/internal';

/**
 * Sync Khan Academy course progress and mastery data.
 * @param {string} khanToken Auth token (KAAS cookie value or bearer token)
 * @returns {Promise<Array>} The array of classes saved
 */
export async function syncKhanAcademy(khanToken) {
  if (!khanToken) throw new Error('Khan Academy: auth token is required');

  // Use a CORS proxy on web since Khan Academy blocks cross-origin requests
  const CORS_PROXY = Platform.OS === 'web' ? 'https://corsproxy.io/?' : '';

  try {
    // Fetch the student's course progress / assigned content
    const progressRes = await fetch(`${CORS_PROXY}${KHAN_API_BASE}/user/progress/summary`, {
      headers: {
        Authorization: `Bearer ${khanToken}`,
        Cookie: `KAAS=${khanToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!progressRes.ok) {
      const errBody = await progressRes.text();
      throw new Error(`Khan Academy progress API ${progressRes.status}: ${errBody}`);
    }

    const progressData = await safeJson(progressRes);
    if (!progressData) {
      throw new Error('Khan Academy returned invalid JSON');
    }

    // Khan Academy structures data differently from traditional LMS:
    // - "courses" or "topics" with mastery levels, not letter grades
    // - Progress is measured in mastery points and skill levels
    const rawCourses = progressData.courses
      || progressData.topicProgressSummaries
      || progressData.subjects
      || [];

    const classes = [];

    for (const course of (Array.isArray(rawCourses) ? rawCourses : [])) {
      const courseName = course.title || course.name || course.slug || 'Khan Academy Course';

      // Khan uses mastery levels: practiced, level_one, level_two, mastered
      // Convert mastery percentage to a 0-100 scale for consistency
      const masteryPercent = course.masteryPercentage
        ?? course.percentComplete
        ?? course.progress
        ?? 0;
      const grade = +(Number(masteryPercent) || 0).toFixed(1);

      // Fetch unit/skill-level detail if available
      let stdAssignments = [];

      const units = course.units || course.skills || course.topics || [];
      for (const unit of units) {
        stdAssignments.push({
          name: unit.title || unit.name || 'Unit',
          score: unit.masteryPoints ?? unit.pointsEarned ?? unit.correct ?? null,
          total: unit.totalPoints ?? unit.pointsPossible ?? unit.total ?? null,
          category: unit.type || unit.kind || 'Mastery',
          date: formatDate(unit.lastAttempted || unit.lastActivity || ''),
        });
      }

      // If no unit-level data, try to pull from assignments endpoint
      if (stdAssignments.length === 0 && course.id) {
        try {
          const assignUrl = `${CORS_PROXY}${KHAN_API_BASE}/user/assignments?courseId=${course.id}`;
          const assignRes = await fetch(assignUrl, {
            headers: {
              Authorization: `Bearer ${khanToken}`,
              Cookie: `KAAS=${khanToken}`,
            },
          });

          if (assignRes.ok) {
            const assignData = await safeJson(assignRes);
            const items = assignData?.assignments || assignData || [];
            for (const a of (Array.isArray(items) ? items : [])) {
              stdAssignments.push({
                name: a.title || a.name || 'Assignment',
                score: a.score ?? a.pointsEarned ?? null,
                total: a.totalPoints ?? a.pointsPossible ?? null,
                category: a.kind || a.type || 'Assignment',
                date: formatDate(a.dueDate || a.completedDate || ''),
              });
            }
          }
        } catch {
          // Non-fatal: continue without assignment detail
        }
      }

      classes.push({
        name: courseName,
        grade,
        type: inferCourseType(courseName),
        assignments: stdAssignments,
      });
    }

    await saveGrades(STORAGE_KEYS.khanAcademy, classes);
    return classes;
  } catch (e) {
    console.error('[Khan Academy] sync error:', e?.message);
    throw e;
  }
}

// ============================================================================
// Unified Grade Aggregator
// Reads from all known integration storage keys and returns a combined view
// of the student's classes across all platforms.
// ============================================================================

/**
 * Load grades from every connected integration and return a single unified
 * array of class objects in the app's standard format.
 * @returns {Promise<Array<{name, grade, type, assignments, source}>>}
 */
export async function getAllGrades() {
  const sourceMap = {
    [STORAGE_KEYS.studentVue]: 'StudentVUE',
    [STORAGE_KEYS.googleClassroom]: 'Google Classroom',
    [STORAGE_KEYS.canvas]: 'Canvas',
    [STORAGE_KEYS.pearson]: 'Pearson',
    [STORAGE_KEYS.deltaMath]: 'DeltaMath',
    [STORAGE_KEYS.khanAcademy]: 'Khan Academy',
    [STORAGE_KEYS.manual]: 'Manual',
  };

  const allClasses = [];

  for (const [key, source] of Object.entries(sourceMap)) {
    try {
      const classes = await loadGrades(key);
      for (const cls of classes) {
        allClasses.push({
          ...cls,
          source,
        });
      }
    } catch (e) {
      console.warn(`[Aggregator] Failed to load from "${key}":`, e?.message);
    }
  }

  return allClasses;
}

/**
 * Check which integrations have stored data (i.e., are "connected").
 * @returns {Promise<Object>} Map of integration name to { connected: boolean, classCount: number }
 */
export async function getIntegrationStatus() {
  const integrations = {
    studentVue: STORAGE_KEYS.studentVue,
    googleClassroom: STORAGE_KEYS.googleClassroom,
    canvas: STORAGE_KEYS.canvas,
    pearson: STORAGE_KEYS.pearson,
    deltaMath: STORAGE_KEYS.deltaMath,
    khanAcademy: STORAGE_KEYS.khanAcademy,
    manual: STORAGE_KEYS.manual,
  };

  const status = {};

  for (const [name, key] of Object.entries(integrations)) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        status[name] = {
          connected: true,
          classCount: Array.isArray(parsed) ? parsed.length : 0,
        };
      } else {
        status[name] = { connected: false, classCount: 0 };
      }
    } catch {
      status[name] = { connected: false, classCount: 0 };
    }
  }

  return status;
}
