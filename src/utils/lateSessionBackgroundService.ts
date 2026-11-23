import {
  CircleGroup,
  LateSessionAlertRecord,
  SessionRecord,
  Student,
} from '../types';
import { getLocalDateString } from '../data/seedData';
import {
  fetchAcademyCloudBackupFromFirestore,
  LATE_SESSION_ALERTS_STORAGE_KEY,
  subscribeToLateSessionAlertsFromFirestore,
  syncLateSessionAlertToFirestore,
} from './firebaseClient';
import {
  ensurePushServiceWorkerRegistered,
  sendLocalPushNotification,
} from './notificationService';

const NOTIFIED_LATE_KEYS_STORAGE = 'imam_notified_late_sessions_v1';

export function parseScheduleTimeString(
  rawTime?: string
): { hours: number; minutes: number } | null {
  if (!rawTime || typeof rawTime !== 'string') return null;
  const cleaned = rawTime.trim();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM|ص|م))?/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3] ? match[3].toUpperCase() : null;

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (meridiem === 'PM' || meridiem === 'م') {
    if (hours < 12) hours += 12;
  } else if (meridiem === 'AM' || meridiem === 'ص') {
    if (hours === 12) hours = 0;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function getNotifiedLateMap(todayStr: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(NOTIFIED_LATE_KEYS_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith(todayStr)) {
        cleaned[k] = v;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function saveNotifiedLateMap(map: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NOTIFIED_LATE_KEYS_STORAGE, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

export interface LateSessionCheckResult {
  checkedAt: string;
  source: 'firestore' | 'local_cloud_cache' | 'live_state';
  activeLateAlerts: LateSessionAlertRecord[];
  newlyDispatchedCount: number;
}

/**
 * Evaluates scheduled circle times for today against recorded sessions (from Firestore + local state)
 * to detect students who are late by 5+ minutes (`late_5m`) or 15+ minutes (`late_15m`),
 * syncs the alert records to Firestore (`/late_session_alerts/{alertId}`), and sends Push Notifications via Service Worker.
 */
export async function evaluateAndDispatchFirestoreLateSessionAlerts(params: {
  students: Student[];
  circles: CircleGroup[];
  sessions: SessionRecord[];
  teacherEmail?: string;
  portalRole?: 'teacher' | 'guardian' | 'student';
  guardianStudentIds?: string[];
  notificationsEnabled?: boolean;
  pullFromFirestoreFirst?: boolean;
}): Promise<LateSessionCheckResult> {
  const now = new Date();
  const todayStr = getLocalDateString(0);
  const currentDay = now.getDay();
  const nowMs = now.getTime();

  let effectiveStudents = params.students;
  let effectiveCircles = params.circles;
  let effectiveSessions = params.sessions;
  let dataSource: 'firestore' | 'local_cloud_cache' | 'live_state' = 'live_state';

  // Optionally pull fresh snapshot from Firestore so background checks reflect cross-device attendance updates
  if (params.pullFromFirestoreFirst) {
    try {
      const cloudSnap = await fetchAcademyCloudBackupFromFirestore(
        params.teacherEmail
      );
      if (cloudSnap.payload) {
        if (
          Array.isArray(cloudSnap.payload.students) &&
          cloudSnap.payload.students.length > 0
        ) {
          effectiveStudents = cloudSnap.payload.students as Student[];
        }
        if (
          Array.isArray(cloudSnap.payload.circles) &&
          cloudSnap.payload.circles.length > 0
        ) {
          effectiveCircles = cloudSnap.payload.circles as CircleGroup[];
        }
        if (Array.isArray(cloudSnap.payload.sessions)) {
          // Merge cloud sessions with local sessions for today
          const cloudSessions = cloudSnap.payload.sessions as SessionRecord[];
          const sessionMap = new Map<string, SessionRecord>();
          effectiveSessions.forEach((s) =>
            sessionMap.set(`${s.studentId}_${s.date}`, s)
          );
          cloudSessions.forEach((s) =>
            sessionMap.set(`${s.studentId}_${s.date}`, s)
          );
          effectiveSessions = Array.from(sessionMap.values());
        }
        if (cloudSnap.source) {
          dataSource = cloudSnap.source;
        }
      }
    } catch {
      // Fallback to live_state if offline
    }
  }

  const notifiedMap = getNotifiedLateMap(todayStr);
  const activeLateAlerts: LateSessionAlertRecord[] = [];
  let newlyDispatchedCount = 0;

  const guardianFilter =
    params.guardianStudentIds && params.guardianStudentIds.length > 0
      ? new Set(params.guardianStudentIds)
      : null;

  for (const st of effectiveStudents) {
    if (!st || st.accountStatus === 'مؤرشف' || st.accountStatus === 'متوقف') {
      continue;
    }

    if (guardianFilter && !guardianFilter.has(st.id)) {
      continue;
    }

    const circleObj = effectiveCircles.find(
      (c) => c.name === st.circle || c.id === st.circleId
    );

    const scheduleDays =
      Array.isArray(st.scheduleDays) && st.scheduleDays.length > 0
        ? st.scheduleDays
        : Array.isArray(circleObj?.scheduleDays)
        ? circleObj!.scheduleDays
        : [];

    if (!scheduleDays.includes(currentDay)) {
      continue;
    }

    const rawTime = st.scheduleTime || circleObj?.scheduleTime || '';
    const parsedTime = parseScheduleTimeString(rawTime);
    if (!parsedTime) continue;

    const scheduledDateObj = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      parsedTime.hours,
      parsedTime.minutes,
      0,
      0
    );

    const diffMinutes = Math.floor((nowMs - scheduledDateObj.getTime()) / 60000);

    // Check if the student already has a session recorded today OR logged in today
    const hasSessionToday = effectiveSessions.some(
      (ses) =>
        ses.studentId === st.id &&
        ses.date === todayStr &&
        (ses.status === 'حضر' || ses.status === 'غاب' || ses.status === 'إجازة')
    );
    const hasLoggedInToday =
      st.lastLoginDate === todayStr ||
      Boolean(st.lastStudentLoginAt && st.lastStudentLoginAt.startsWith(todayStr));

    const cleanStudentId = st.id.replace(/[^a-zA-Z0-9_-]/g, '');
    const alertId = `late_${todayStr}_${cleanStudentId}`;

    if (hasSessionToday) {
      // If previously marked late today, resolve it in Firestore & local storage
      try {
        const rawStored = window.localStorage.getItem(
          LATE_SESSION_ALERTS_STORAGE_KEY
        );
        if (rawStored) {
          const list = JSON.parse(rawStored) as LateSessionAlertRecord[];
          const existingAlert = list.find(
            (a) => a.id === alertId && a.status === 'active'
          );
          if (existingAlert) {
            void syncLateSessionAlertToFirestore({
              ...existingAlert,
              status: 'resolved',
            }).catch(() => {});
          }
        }
      } catch {
        // ignore
      }
      continue;
    }

    // Student is considered late if current time is between 0 and 120 minutes past scheduled circle time without recorded recitation or login
    if (diffMinutes >= 0 && diffMinutes <= 120 && (!hasLoggedInToday || !hasSessionToday)) {
      const stage: 'late_5m' | 'late_15m' =
        diffMinutes >= 15 ? 'late_15m' : 'late_5m';
      const surahName =
        st.currentStop?.surahName || st.currentSurah || 'الورد المقرر';
      const ayahNumber = st.currentStop?.ayah || st.currentAyah || 1;
      const circleTitle = st.circle || circleObj?.name || 'الحلقة القرآنية';

      const lateRecord: LateSessionAlertRecord = {
        id: alertId,
        studentId: st.id,
        studentName: st.name,
        circleName: circleTitle,
        scheduledTime: rawTime,
        date: todayStr,
        minutesLate: Math.max(1, diffMinutes),
        stage,
        status: 'active',
        surahName,
        ayahNumber,
        guardianPhone: st.whatsappPhone || st.guardianPhone,
        meetingUrl: st.permanentMeetingUrl || circleObj?.permanentMeetingUrl,
        missingLogin: !hasLoggedInToday,
        missingRecitation: !hasSessionToday,
        notifiedAt: now.toISOString(),
      };

      activeLateAlerts.push(lateRecord);

      // Sync the late session alert to Firestore (/late_session_alerts/{alertId})
      void syncLateSessionAlertToFirestore(lateRecord).catch(() => {
        // Non-blocking if user is not authenticated with Firebase popup
      });

      const dedupeKey = `${todayStr}::${st.id}::${stage}`;
      if (!notifiedMap[dedupeKey] && params.notificationsEnabled !== false) {
        const missingReasonText =
          !hasLoggedInToday && !hasSessionToday
            ? 'لم يقم بتسجيل الدخول ولم يُسجل له تسميع'
            : !hasLoggedInToday
            ? 'لم يقم بتسجيل الدخول للحلقة'
            : 'لم يتم تسجيل تسميع له';
        const title =
          stage === 'late_15m'
            ? `🚨 تأخر ١٥+ دقيقة عن الحلقة — ${st.name}`
            : `⏰ حلول موعد الحلقة دون تسميع/دخول — ${st.name}`;
        const body = `موعد حلقة (${circleTitle}) الساعة ${rawTime}: الطالب (${st.name}) ${missingReasonText} في Firestore • الورد: سورة ${surahName} (آية ${ayahNumber}).`;

        const sent = await sendLocalPushNotification({
          title,
          body,
          tag: `imam-firestore-late-${st.id}-${stage}`,
          targetTab: 'session',
          studentId: st.id,
          portalRoute: params.portalRole || 'teacher',
          notificationsEnabled: params.notificationsEnabled,
        });

        // Also notify Service Worker directly so background actions are attached
        try {
          const reg = await ensurePushServiceWorkerRegistered();
          const worker =
            reg?.active ||
            reg?.waiting ||
            navigator.serviceWorker?.controller;
          if (worker) {
            worker.postMessage({
              type: 'TRIGGER_LOCAL_PUSH',
              payload: {
                title,
                body,
                tag: `imam-firestore-late-${st.id}-${stage}`,
                targetTab: 'session',
                studentId: st.id,
                studentName: st.name,
                circleName: circleTitle,
                meetingUrl: lateRecord.meetingUrl || null,
                portalRoute: params.portalRole || 'teacher',
                reminderType: stage,
                alertId: lateRecord.id,
                alertCategory: 'late_session',
              },
            });
          }
        } catch {
          // ignore SW postMessage error
        }

        if (sent) {
          notifiedMap[dedupeKey] = nowMs;
          newlyDispatchedCount += 1;
        }
      }
    }
  }

  saveNotifiedLateMap(notifiedMap);

  return {
    checkedAt: now.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    source: dataSource,
    activeLateAlerts,
    newlyDispatchedCount,
  };
}

/**
 * Starts the browser Background Service that monitors Firestore schedule & attendance data
 * and dispatches Push Notifications whenever a student is late for their scheduled circle.
 */
export function startFirestoreLateSessionBackgroundService(params: {
  getState: () => {
    students: Student[];
    circles: CircleGroup[];
    sessions: SessionRecord[];
    teacherEmail?: string;
    portalRole?: 'teacher' | 'guardian' | 'student';
    guardianStudentIds?: string[];
    notificationsEnabled?: boolean;
  };
  onAlertsUpdated?: (result: LateSessionCheckResult) => void;
  intervalMs?: number;
}): () => void {
  let stopped = false;
  const checkInterval = Math.max(45000, params.intervalMs ?? 60000); // Every 60 seconds

  const runCheck = async (pullFirestore: boolean) => {
    if (stopped) return;
    const state = params.getState();
    const res = await evaluateAndDispatchFirestoreLateSessionAlerts({
      ...state,
      pullFromFirestoreFirst: pullFirestore,
    });
    if (!stopped && params.onAlertsUpdated) {
      params.onAlertsUpdated(res);
    }
  };

  // Initial check shortly after startup
  const initialTimer = window.setTimeout(() => {
    void runCheck(true);
  }, 2500);

  // Periodic background timer
  const intervalId = window.setInterval(() => {
    void runCheck(true);
  }, checkInterval);

  // Also subscribe to real-time Firestore `/late_session_alerts` updates
  const unsubFirestore = subscribeToLateSessionAlertsFromFirestore((remoteAlerts) => {
    if (stopped) return;
    const todayStr = getLocalDateString(0);
    const activeToday = remoteAlerts.filter(
      (a) => a.date === todayStr && a.status === 'active'
    );
    if (params.onAlertsUpdated && activeToday.length > 0) {
      params.onAlertsUpdated({
        checkedAt: new Date().toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        source: 'firestore',
        activeLateAlerts: activeToday,
        newlyDispatchedCount: 0,
      });
    }
  });

  // Re-evaluate immediately when tab regains visibility or network reconnects
  const handleVisibilityOrOnline = () => {
    if (document.visibilityState === 'visible') {
      void runCheck(true);
    }
  };
  window.addEventListener('visibilitychange', handleVisibilityOrOnline);
  window.addEventListener('online', handleVisibilityOrOnline);

  return () => {
    stopped = true;
    window.clearTimeout(initialTimer);
    window.clearInterval(intervalId);
    unsubFirestore();
    window.removeEventListener('visibilitychange', handleVisibilityOrOnline);
    window.removeEventListener('online', handleVisibilityOrOnline);
  };
}
