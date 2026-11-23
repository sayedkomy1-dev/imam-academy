/* eslint-disable no-restricted-globals */
/**
 * ============================================================================
 * أكاديمية الإمام لتحفيظ القرآن الكريم — بالقرآن نحيا
 * Service Worker مخصص للتنبيهات الفورية وتذكيرات الحصص ونظام teacherAlerts (sw-push.js)
 * ============================================================================
 * يعمل في الخلفية (Background) لضمان وصول:
 * 1) تذكيرات الحصص القرآنية (قبل الحصة بـ 30 دقيقة، 10 دقائق، وعند بدء الحصة)
 * 2) تنبيهات نظام المعلم والمتابعة (teacherAlerts: المهام المستحقة/المتأخرة، والطلاب الذين يحتاجون متابعة عاجلة أو مراجعة الكلمات الخاطئة)
 * للطلاب وأولياء الأمور والمعلمين حتى عند إغلاق التطبيق أو قفل الشاشة.
 * ============================================================================
 */

const SW_VERSION = 'v14.0.0-push-teacher-alerts';
const DB_NAME = 'ImamAcademyDB';
const DB_VERSION = 1;
const STORE_NAME = 'state';
const ROOT_KEY = 'root';
const REMINDERS_META_KEY = 'push_reminders_meta';

const DEFAULT_ICON = '/assets/aistudio/icon-192_29a1c2ce.png';
const DEFAULT_BADGE = '/assets/aistudio/icon-96_3bce66e2.png';

// خريطة مؤقتات التذكير المجدولة في الذاكرة الحية لعامل الخدمة
const scheduledTimers = new Map();

/**
 * فتح قاعدة بيانات IndexedDB المشتركة مع تطبيق الـ PWA
 */
function openAcademyDB() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * قراءة سجل من مخزن الحالة في IndexedDB
 */
async function readFromIDB(key) {
  const db = await openAcademyDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        resolve(null);
        return;
      }
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * كتابة سجل في مخزن الحالة في IndexedDB
 */
async function writeToIDB(id, payload) {
  const db = await openAcademyDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        resolve(false);
        return;
      }
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ id, ...payload, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * تنسيق التاريخ المحلي بصيغة YYYY-MM-DD
 */
function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * تنسيق التاريخ قبل عدد من الأيام بصيغة YYYY-MM-DD
 */
function getOffsetDateKey(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return getLocalDateKey(d);
}

/**
 * تحليل نص الوقت مثل "17:00" أو "05:30 PM" إلى ساعات ودقائق (نظام 24 ساعة)
 */
function parseScheduleTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const cleaned = timeStr.trim();
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

/**
 * إرسال إشعار فوري للنظام عبر ServiceWorkerRegistration
 */
async function displayPushNotification(payload) {
  if (!self.registration || typeof self.registration.showNotification !== 'function') {
    return false;
  }

  const title =
    payload.title || 'أكاديمية الإمام لتحفيظ القرآن الكريم — بالقرآن نحيا';
  const body =
    payload.body ||
    'حان موعد حصة التسميع والمراجعة القرآنية. اضغط للدخول إلى البوابة الآن.';
  const tag = payload.tag || `imam-push-${Date.now()}`;
  const targetUrl = payload.url || '/';

  const actions = Array.isArray(payload.actions) && payload.actions.length > 0
    ? payload.actions
    : [
        {
          action: 'join_session',
          title: '📖 دخول الحصة الآن',
        },
        {
          action: 'snooze_5m',
          title: '⏰ تذكير بعد 5 دقائق',
        },
      ];

  const options = {
    body,
    dir: 'rtl',
    lang: 'ar',
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    tag,
    renotify: true,
    requireInteraction: payload.requireInteraction !== false,
    vibrate: [200, 100, 200, 100, 300],
    timestamp: payload.timestamp || Date.now(),
    actions,
    data: {
      url: targetUrl,
      targetTab: payload.targetTab || 'session',
      studentId: payload.studentId || null,
      studentName: payload.studentName || null,
      circleName: payload.circleName || null,
      meetingUrl: payload.meetingUrl || null,
      portalRoute: payload.portalRoute || null,
      reminderType: payload.reminderType || 'session_reminder',
      alertId: payload.alertId || null,
      alertCategory: payload.alertCategory || null,
      taskId: payload.taskId || null,
      originalTitle: title,
      originalBody: body,
    },
  };

  try {
    await self.registration.showNotification(title, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * جدولة مؤقت تذكير دقيق داخل عامل الخدمة للحصص القريبة
 */
function scheduleInMemoryReminder(reminderKey, delayMs, notificationPayload) {
  if (delayMs < 0) return;
  if (scheduledTimers.has(reminderKey)) {
    clearTimeout(scheduledTimers.get(reminderKey));
  }
  // جدولة المؤقت إذا كان خلال الـ 6 ساعات القادمة
  if (delayMs <= 6 * 60 * 60 * 1000) {
    const timerId = setTimeout(async () => {
      scheduledTimers.delete(reminderKey);
      const meta = (await readFromIDB(REMINDERS_META_KEY)) || {};
      const notifiedKeys = meta.notifiedKeys || {};
      if (notifiedKeys[reminderKey]) return;

      const shown = await displayPushNotification(notificationPayload);
      if (shown) {
        notifiedKeys[reminderKey] = Date.now();
        await writeToIDB(REMINDERS_META_KEY, {
          ...meta,
          notifiedKeys,
        });
      }
    }, delayMs);

    scheduledTimers.set(reminderKey, timerId);
  }
}

/**
 * حساب تنبيهات نظام teacherAlerts مباشرة داخل عامل الخدمة في حال كان التطبيق مغلقاً
 * لضمان توافق تام مع computeTeacherAlerts في notificationService.ts
 */
function computeTeacherAlertsInSW(rootState) {
  if (!rootState) return [];
  const students = Array.isArray(rootState.students) ? rootState.students : [];
  const sessions = Array.isArray(rootState.sessions) ? rootState.sessions : [];
  const tasks = Array.isArray(rootState.tasks) ? rootState.tasks : [];
  const circles = Array.isArray(rootState.circles) ? rootState.circles : [];
  const settings = rootState.settings || {};

  const notifyOverdueTasks = settings.notifyOverdueTasks !== false;
  const notifyUrgentStudents = settings.notifyUrgentStudents !== false;

  const today = getLocalDateKey(new Date());
  const cutoff30Days = getOffsetDateKey(-30);
  const alerts = [];

  // 1) المهام المتأخرة والمستحقة اليوم (overdue_task)
  if (notifyOverdueTasks) {
    tasks
      .filter((t) => t && !t.completed && t.dueDate && t.dueDate <= today)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
      .forEach((task) => {
        const isOverdue = task.dueDate < today;
        const st = task.studentId
          ? students.find((s) => s && s.id === task.studentId)
          : null;
        const circleObj = st
          ? circles.find((c) => c && (c.name === st.circle || c.id === st.circleId))
          : null;
        alerts.push({
          id: `alert-task-${task.id}`,
          category: 'overdue_task',
          title: isOverdue
            ? `⚠️ مهمة متأخرة: ${task.title}`
            : `📋 مهمة مستحقة اليوم: ${task.title}`,
          body: `${st ? `الطالب: ${st.name} — ` : ''}تاريخ الاستحقاق: ${task.dueDate}${
            task.notes ? ` (${task.notes})` : ''
          }`,
          priority: isOverdue || task.priority === 'مرتفع' ? 'critical' : 'high',
          taskId: task.id,
          studentId: task.studentId || null,
          studentName: st ? st.name : null,
          circleName: st ? st.circle || (circleObj && circleObj.name) || null : null,
          meetingUrl:
            (st && st.permanentMeetingUrl) ||
            (circleObj && circleObj.permanentMeetingUrl) ||
            null,
          targetPortal: task.studentId ? 'all' : 'teacher',
          timestamp: task.dueDate,
        });
      });
  }

  // 2) الطلاب الذين يحتاجون متابعة عاجلة أو مراجعة الكلمات الخاطئة (urgent_student)
  if (notifyUrgentStudents) {
    students.forEach((st) => {
      if (!st || st.accountStatus === 'مؤرشف' || st.accountStatus === 'متوقف') {
        return;
      }
      const recentSessions = sessions.filter(
        (s) => s && s.studentId === st.id && s.date >= cutoff30Days
      );
      const attended = recentSessions.filter((s) => s.status === 'حضر');
      const absentCount = recentSessions.filter((s) => s.status === 'غاب').length;
      const avgMastery =
        attended.length > 0
          ? Math.round(
              attended.reduce((acc, s) => acc + (Number(s.masteryScore) || 0), 0) /
                attended.length
            )
          : 100;
      const totalErrors = recentSessions.reduce(
        (acc, s) => acc + (Array.isArray(s.errors) ? s.errors.length : 0),
        0
      );

      const reasons = [];
      if (avgMastery < 78) reasons.push(`متوسط إتقان منخفض (${avgMastery}%)`);
      if (absentCount >= 1) reasons.push(`غياب متكرر (${absentCount})`);
      if (totalErrors >= 3) reasons.push(`كلمات تحتاج تثبيت ومراجعة (${totalErrors} أخطاء)`);
      if (Array.isArray(st.disciplineWarnings) && st.disciplineWarnings.length > 0) {
        reasons.push(`إنذار انضباط (${st.disciplineWarnings[0].level})`);
      }

      if (reasons.length > 0) {
        const circleObj = circles.find(
          (c) => c && (c.name === st.circle || c.id === st.circleId)
        );
        const stopSurah = (st.currentStop && st.currentStop.surahName) || 'الورد الحالي';
        const stopAyah = (st.currentStop && st.currentStop.ayah) || 1;
        alerts.push({
          id: `alert-student-${st.id}`,
          category: 'urgent_student',
          title: `🔔 متابعة قرآنية للطالب: ${st.name}`,
          body: `${reasons.join(' • ')} — الموضع الحالي: سورة ${stopSurah} آية ${stopAyah}`,
          priority: avgMastery < 75 || absentCount >= 1 ? 'critical' : 'high',
          studentId: st.id,
          studentName: st.name,
          circleName: st.circle || (circleObj && circleObj.name) || null,
          meetingUrl:
            st.permanentMeetingUrl ||
            (circleObj && circleObj.permanentMeetingUrl) ||
            null,
          targetPortal: 'all',
          timestamp: today,
        });
      }
    });
  }

  return alerts;
}

/**
 * فحص وإرسال تنبيهات نظام teacherAlerts للطلاب وأولياء الأمور والمعلمين في الخلفية
 */
async function checkAndDispatchTeacherAlerts(rootState, meta, notifiedKeys, todayDateStr) {
  const computedAlerts = computeTeacherAlertsInSW(rootState);
  const syncedAlerts = Array.isArray(meta.teacherAlerts)
    ? meta.teacherAlerts
    : Array.isArray(rootState && rootState.teacherAlerts)
    ? rootState.teacherAlerts
    : [];

  // دمج التنبيهات المزامنة والمحسوبة بدون تكرار
  const alertsMap = new Map();
  computedAlerts.forEach((a) => {
    if (a && a.id) alertsMap.set(a.id, a);
  });
  syncedAlerts.forEach((a) => {
    if (a && a.id) {
      alertsMap.set(a.id, { ...(alertsMap.get(a.id) || {}), ...a });
    }
  });

  const allAlerts = Array.from(alertsMap.values());
  if (allAlerts.length === 0) return false;

  const acknowledgedIds = new Set(
    Array.isArray(meta.acknowledgedAlertIds) ? meta.acknowledgedAlertIds : []
  );
  const activePortalRole = meta.portalRole || 'guardian';
  const guardianStudentIds = Array.isArray(meta.guardianStudentIds)
    ? meta.guardianStudentIds
    : [];
  const selectedStudentId = meta.selectedStudentId || null;

  // تصفية التنبيهات بحسب دور المستخدم (طالب / ولي أمر / معلم)
  const relevantAlerts = allAlerts.filter((alert) => {
    if (!alert || !alert.id || acknowledgedIds.has(alert.id)) return false;

    if (activePortalRole === 'student' || activePortalRole === 'guardian') {
      // الطالب أو ولي الأمر يستقبل التنبيهات المرتبطة به أو بأبنائه
      if (!alert.studentId) return false;
      if (guardianStudentIds.length > 0) {
        return guardianStudentIds.includes(alert.studentId);
      }
      if (selectedStudentId) {
        return alert.studentId === selectedStudentId;
      }
      return true;
    }

    // المعلم أو المشرف يستقبل كافة تنبيهات teacherAlerts
    return true;
  });

  if (relevantAlerts.length === 0) return false;

  let anyDispatched = false;
  const portalUrl =
    activePortalRole === 'student'
      ? '/Student'
      : activePortalRole === 'guardian'
      ? '/Guardian'
      : '/';

  // نرسل أهم التنبيهات العاجلة التي لم يتم إشعارها اليوم بعد
  const topAlerts = relevantAlerts.slice(0, 3);
  for (const alert of topAlerts) {
    const dedupeKey = `${todayDateStr}::teacherAlert::${activePortalRole}::${alert.id}`;
    if (notifiedKeys[dedupeKey]) continue;

    const targetTab =
      alert.category === 'overdue_task'
        ? 'tasks'
        : activePortalRole === 'student' || activePortalRole === 'guardian'
        ? 'session'
        : 'struggling';

    const customTitle =
      activePortalRole === 'student' && alert.studentName
        ? `📖 تذكير متابعة ومراجعة للبطل ${alert.studentName}`
        : activePortalRole === 'guardian' && alert.studentName
        ? `👨‍👩‍👧 تنبيه متابعة لولي أمر الطالب ${alert.studentName}`
        : alert.title;

    const shown = await displayPushNotification({
      title: customTitle,
      body: alert.body,
      tag: `imam-teacher-alert-${alert.id}`,
      targetTab,
      studentId: alert.studentId || null,
      studentName: alert.studentName || null,
      circleName: alert.circleName || null,
      meetingUrl: alert.meetingUrl || null,
      portalRoute: activePortalRole,
      url: portalUrl,
      reminderType: 'teacher_alert',
      alertId: alert.id,
      alertCategory: alert.category,
      taskId: alert.taskId || null,
      actions: [
        {
          action: 'open_alert',
          title:
            activePortalRole === 'student' || activePortalRole === 'guardian'
              ? '📖 فتح الورد والمراجعة'
              : '📋 فتح المتابعة الآن',
        },
        {
          action: 'acknowledge_alert',
          title: '✅ تم الاطلاع',
        },
      ],
    });

    if (shown) {
      notifiedKeys[dedupeKey] = Date.now();
      anyDispatched = true;
    }
  }

  return anyDispatched;
}

/**
 * فحص جداول حصص الطلاب والحلقات + نظام teacherAlerts من IndexedDB وإطلاق التذكيرات الفورية
 */
async function checkAndDispatchUpcomingSessionReminders() {
  try {
    const rootState = await readFromIDB(ROOT_KEY);
    const meta = (await readFromIDB(REMINDERS_META_KEY)) || {};
    const notifiedKeys = { ...(meta.notifiedKeys || {}) };

    const now = new Date();
    const todayDateStr = getLocalDateKey(now);
    const currentDayIndex = now.getDay(); // 0 = الأحد ... 6 = السبت
    const nowMs = now.getTime();

    // تنظيف مفاتيح الأيام السابقة لتوفير الذاكرة
    let keysCleaned = false;
    for (const k of Object.keys(notifiedKeys)) {
      if (!k.startsWith(todayDateStr)) {
        delete notifiedKeys[k];
        keysCleaned = true;
      }
    }

    // التحقق من تفعيل الإشعارات في إعدادات الأكاديمية
    const notificationsEnabled =
      rootState?.settings?.notificationsEnabled !== undefined
        ? Boolean(rootState.settings.notificationsEnabled)
        : true;

    if (!notificationsEnabled) {
      if (keysCleaned) {
        await writeToIDB(REMINDERS_META_KEY, { ...meta, notifiedKeys });
      }
      return;
    }

    // 1. فحص التذكيرات المجدولة صراحةً من واجهة الطالب أو ولي الأمر أو المعلم
    const customReminders = Array.isArray(meta.scheduledReminders)
      ? meta.scheduledReminders
      : [];
    const remainingCustomReminders = [];

    for (const item of customReminders) {
      if (!item || !item.id) continue;
      const dedupeKey = `${todayDateStr}::custom::${item.id}`;
      if (notifiedKeys[dedupeKey]) {
        continue;
      }

      const triggerAtMs = Number(item.triggerAt) || 0;
      const diffMinutes = (triggerAtMs - nowMs) / 60000;

      if (diffMinutes <= 1 && diffMinutes >= -45) {
        const shown = await displayPushNotification({
          title: item.title,
          body: item.body,
          tag: item.tag || `imam-custom-${item.id}`,
          url: item.url || '/',
          targetTab: item.targetTab || 'session',
          studentId: item.studentId || null,
          studentName: item.studentName || null,
          circleName: item.circleName || null,
          meetingUrl: item.meetingUrl || null,
          portalRoute: item.portalRoute || null,
          reminderType: 'custom_scheduled',
        });
        if (shown) {
          notifiedKeys[dedupeKey] = nowMs;
          keysCleaned = true;
        }
      } else if (diffMinutes > 1) {
        remainingCustomReminders.push(item);
        scheduleInMemoryReminder(dedupeKey, triggerAtMs - nowMs, item);
      }
    }

    // 2. فحص جداول الطلاب والحلقات المحفوظة في قاعدة البيانات المحلية (ImamAcademyDB)
    const students = Array.isArray(rootState?.students) ? rootState.students : [];
    const circles = Array.isArray(rootState?.circles) ? rootState.circles : [];
    const filterStudentIds = Array.isArray(meta.guardianStudentIds)
      ? meta.guardianStudentIds
      : null;

    for (const student of students) {
      if (
        !student ||
        student.accountStatus === 'مؤرشف' ||
        student.accountStatus === 'متوقف'
      ) {
        continue;
      }

      if (
        filterStudentIds &&
        filterStudentIds.length > 0 &&
        !filterStudentIds.includes(student.id)
      ) {
        continue;
      }

      const circleObj = circles.find(
        (c) => c && (c.name === student.circle || c.id === student.circleId)
      );

      const scheduleDays =
        Array.isArray(student.scheduleDays) && student.scheduleDays.length > 0
          ? student.scheduleDays
          : Array.isArray(circleObj?.scheduleDays)
          ? circleObj.scheduleDays
          : [];

      if (!scheduleDays.includes(currentDayIndex)) {
        continue;
      }

      const rawTime = student.scheduleTime || circleObj?.scheduleTime || '';
      const parsedTime = parseScheduleTime(rawTime);
      if (!parsedTime) continue;

      const sessionDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        parsedTime.hours,
        parsedTime.minutes,
        0,
        0
      );
      const sessionMs = sessionDate.getTime();
      const minutesUntilSession = (sessionMs - nowMs) / 60000;

      const surahName =
        student.currentStop?.surahName || student.currentSurah || 'الورد المقرر';
      const ayahNum = student.currentStop?.ayah || student.currentAyah || 1;
      const circleTitle = student.circle || circleObj?.name || 'الحلقة القرآنية';
      const meetingUrl =
        student.permanentMeetingUrl || circleObj?.permanentMeetingUrl || null;
      const activePortalRole = meta.portalRole || 'guardian';
      const portalUrl =
        activePortalRole === 'student'
          ? '/Student'
          : activePortalRole === 'guardian'
          ? '/Guardian'
          : '/';

      // التحقق مما إذا كان الطالب قد سجل حضوره أو غيابه أو إجازته اليوم في بيانات Firestore/IndexedDB
      const sessionsList = Array.isArray(rootState?.sessions) ? rootState.sessions : [];
      const hasSessionRecordedToday = sessionsList.some(
        (ses) =>
          ses &&
          ses.studentId === student.id &&
          ses.date === todayDateStr &&
          (ses.status === 'حضر' || ses.status === 'غاب' || ses.status === 'إجازة')
      );

      // مراحل التذكير قبل الحصة وعند البدء + مراحل رصد التأخر عن موعد الحلقة المجدول (بناءً على بيانات Firestore)
      const stages = [
        {
          id: 'before_30m',
          offsetMinutes: 30,
          windowMin: 18,
          windowMax: 33,
          skipIfAttended: false,
          title: `⏰ تذكير بحصة القرآن بعد 30 دقيقة — ${student.name}`,
          body: `موعد حلقة (${circleTitle}) الساعة ${rawTime} • الورد: سورة ${surahName} (آية ${ayahNum}). نرجو الاستعداد ومراجعة الحصون الخمسة.`,
        },
        {
          id: 'before_10m',
          offsetMinutes: 10,
          windowMin: 3,
          windowMax: 14,
          skipIfAttended: false,
          title: `🕌 اقترب موعد حصة الطالب ${student.name} (خلال 10 دقائق)`,
          body: `تبدأ حلقة (${circleTitle}) الساعة ${rawTime} • سورة ${surahName} (آية ${ayahNum}). اضغط للدخول وتجهيز المصحف.`,
        },
        {
          id: 'start_now',
          offsetMinutes: 0,
          windowMin: -4,
          windowMax: 2,
          skipIfAttended: true,
          title: `🟢 حان الآن موعد حصة القرآن الكريم — ${student.name}`,
          body: `بدأت الآن حلقة (${circleTitle}) • المقرر: سورة ${surahName} (آية ${ayahNum}). بارك الله في همتكم، اضغط للدخول مباشرة.`,
        },
        {
          id: 'late_5m',
          offsetMinutes: -5,
          windowMin: -14,
          windowMax: -5,
          skipIfAttended: true,
          title: `⏳ تأخر الطالب عن موعد الحلقة (5 دقائق) — ${student.name}`,
          body: `تجاوز موعد حلقة (${circleTitle} - ${rawTime}) ولم يُسجل حضور الطالب في Firestore بعد • الورد: سورة ${surahName} (آية ${ayahNum}). اضغط لبدء التسميع أو التواصل.`,
        },
        {
          id: 'late_15m',
          offsetMinutes: -15,
          windowMin: -90,
          windowMax: -15,
          skipIfAttended: true,
          title: `🚨 تنبيه تأخر ١٥ دقيقة عن الحلقة — ${student.name}`,
          body: `تأخر الطالب (${student.name}) عن موعد حلقة (${circleTitle} - ${rawTime}) لأكثر من ١٥ دقيقة دون تسجيل جلسة في Firestore • اضغط لفتح شاشة التسميع أو تسجيل عذر/تعويض.`,
        },
      ];

      for (const stage of stages) {
        if (stage.skipIfAttended && hasSessionRecordedToday) {
          continue;
        }
        const dedupeKey = `${todayDateStr}::${student.id}::${stage.id}`;
        if (notifiedKeys[dedupeKey]) continue;

        const isLateStage = stage.id === 'late_5m' || stage.id === 'late_15m';
        const payload = {
          title: stage.title,
          body: stage.body,
          tag: `imam-session-${student.id}-${stage.id}`,
          targetTab: 'session',
          studentId: student.id,
          studentName: student.name,
          circleName: circleTitle,
          meetingUrl,
          portalRoute: activePortalRole,
          url: portalUrl,
          reminderType: stage.id,
          alertCategory: isLateStage ? 'late_session' : null,
          actions: isLateStage
            ? [
                {
                  action: 'join_session',
                  title: '📖 بدء الحصة / تسجيل الحضور',
                },
                {
                  action: 'snooze_5m',
                  title: '⏰ إمهال 5 دقائق إضافية',
                },
              ]
            : undefined,
        };

        if (
          minutesUntilSession <= stage.windowMax &&
          minutesUntilSession >= stage.windowMin
        ) {
          const shown = await displayPushNotification(payload);
          if (shown) {
            notifiedKeys[dedupeKey] = nowMs;
            keysCleaned = true;
          }
        } else if (minutesUntilSession > stage.offsetMinutes) {
          const targetTriggerMs = sessionMs - stage.offsetMinutes * 60 * 1000;
          const delayMs = targetTriggerMs - nowMs;
          scheduleInMemoryReminder(dedupeKey, delayMs, payload);
        }
      }
    }

    // 3. فحص وإرسال تنبيهات نظام teacherAlerts المرتبطة بالمعلم والطالب وولي الأمر
    const teacherAlertsDispatched = await checkAndDispatchTeacherAlerts(
      rootState,
      meta,
      notifiedKeys,
      todayDateStr
    );
    if (teacherAlertsDispatched) {
      keysCleaned = true;
    }

    if (
      keysCleaned ||
      remainingCustomReminders.length !== customReminders.length
    ) {
      await writeToIDB(REMINDERS_META_KEY, {
        ...meta,
        notifiedKeys,
        scheduledReminders: remainingCustomReminders,
        lastCheckedAt: now.toISOString(),
      });
    }
  } catch {
    // تجاهل الأخطاء غير الحرجة في الخلفية لضمان استمرارية عامل الخدمة
  }
}

/**
 * 1. حدث التثبيت (Install): التفعيل الفوري دون انتظار إغلاق النوافذ
 */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

/**
 * 2. حدث التفعيل (Activate): السيطرة على كافة النوافذ وفحص التذكيرات وتنبيهات teacherAlerts فوراً
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients
      .claim()
      .then(() => checkAndDispatchUpcomingSessionReminders())
  );
});

/**
 * 3. استقبال إشعارات Web Push القياسية من الخادم (Push Event) حتى عند إغلاق التطبيق بالكامل
 */
self.addEventListener('push', (event) => {
  let pushData = {};
  if (event.data) {
    try {
      pushData = event.data.json();
    } catch {
      try {
        pushData = { body: event.data.text() };
      } catch {
        pushData = {};
      }
    }
  }

  event.waitUntil(
    (async () => {
      if (pushData && (pushData.title || pushData.body)) {
        await displayPushNotification({
          title:
            pushData.title ||
            'أكاديمية الإمام لتحفيظ القرآن الكريم — تذكير الحصة والمتابعة',
          body: pushData.body,
          tag: pushData.tag || `imam-webpush-${Date.now()}`,
          url: pushData.url || '/',
          targetTab: pushData.targetTab || 'session',
          studentId: pushData.studentId || null,
          studentName: pushData.studentName || null,
          circleName: pushData.circleName || null,
          meetingUrl: pushData.meetingUrl || null,
          portalRoute: pushData.portalRoute || null,
          reminderType: pushData.reminderType || 'web_push',
          alertId: pushData.alertId || null,
          alertCategory: pushData.alertCategory || null,
        });
      }
      await checkAndDispatchUpcomingSessionReminders();
    })()
  );
});

/**
 * 4. المزامنة الدورية في الخلفية (Periodic Background Sync) لفحص مواعيد الحصص وتنبيهات teacherAlerts عند إغلاق التطبيق
 */
self.addEventListener('periodicsync', (event) => {
  if (
    event.tag === 'imam-session-reminders-periodic' ||
    event.tag === 'imam-teacher-alerts-periodic' ||
    event.tag.startsWith('imam-')
  ) {
    event.waitUntil(checkAndDispatchUpcomingSessionReminders());
  }
});

/**
 * 5. المزامنة الخلفية عند عودة الاتصال (Background Sync)
 */
self.addEventListener('sync', (event) => {
  if (
    event.tag === 'imam-session-reminders-sync' ||
    event.tag === 'imam-teacher-alerts-sync' ||
    event.tag.startsWith('imam-')
  ) {
    event.waitUntil(checkAndDispatchUpcomingSessionReminders());
  }
});

/**
 * 6. استقبال الرسائل من واجهة التطبيق (Message Event) لمزامنة الحصص ونظام teacherAlerts أو جدولة تنبيه فوري
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // عرض إشعار فوري مباشر عبر عامل الخدمة
  if (data.type === 'TRIGGER_LOCAL_PUSH') {
    event.waitUntil(displayPushNotification(data.payload || data));
    return;
  }

  // ربط مباشر مع نظام teacherAlerts: مزامنة قائمة التنبيهات وفحصها/إرسالها بالخلفية
  if (data.type === 'SYNC_TEACHER_ALERTS') {
    event.waitUntil(
      (async () => {
        const currentMeta = (await readFromIDB(REMINDERS_META_KEY)) || {};
        const nextMeta = {
          ...currentMeta,
          teacherAlerts: Array.isArray(data.teacherAlerts)
            ? data.teacherAlerts
            : currentMeta.teacherAlerts || [],
          portalRole: data.portalRole || currentMeta.portalRole || 'guardian',
          guardianStudentIds: Array.isArray(data.guardianStudentIds)
            ? data.guardianStudentIds
            : currentMeta.guardianStudentIds || [],
          selectedStudentId:
            data.selectedStudentId !== undefined
              ? data.selectedStudentId
              : currentMeta.selectedStudentId || null,
          updatedAt: new Date().toISOString(),
        };
        await writeToIDB(REMINDERS_META_KEY, nextMeta);

        if (data.dispatchImmediately) {
          const rootState = await readFromIDB(ROOT_KEY);
          const notifiedKeys = { ...(nextMeta.notifiedKeys || {}) };
          const todayDateStr = getLocalDateKey(new Date());
          await checkAndDispatchTeacherAlerts(
            rootState,
            nextMeta,
            notifiedKeys,
            todayDateStr
          );
          await writeToIDB(REMINDERS_META_KEY, {
            ...nextMeta,
            notifiedKeys,
          });
        }
      })()
    );
    return;
  }

  // إطلاق إشعار فوري لتنبيه محدد من نظام teacherAlerts
  if (data.type === 'DISPATCH_TEACHER_ALERT') {
    event.waitUntil(
      (async () => {
        const alert = data.alert;
        if (!alert) return;
        const portalRole = data.portalRole || 'teacher';
        const portalUrl =
          portalRole === 'student'
            ? '/Student'
            : portalRole === 'guardian'
            ? '/Guardian'
            : '/';
        const targetTab =
          alert.category === 'overdue_task'
            ? 'tasks'
            : portalRole === 'student' || portalRole === 'guardian'
            ? 'session'
            : 'struggling';

        await displayPushNotification({
          title: alert.title || '🔔 تنبيه متابعة — أكاديمية الإمام',
          body: alert.body || 'يرجى مراجعة قسم المهام والمتابعة في البوابة.',
          tag: `imam-teacher-alert-manual-${alert.id || Date.now()}`,
          targetTab,
          studentId: alert.studentId || null,
          studentName: alert.studentName || null,
          circleName: alert.circleName || null,
          meetingUrl: alert.meetingUrl || null,
          portalRoute: portalRole,
          url: portalUrl,
          reminderType: 'teacher_alert',
          alertId: alert.id || null,
          alertCategory: alert.category || null,
          taskId: alert.taskId || null,
          actions: [
            {
              action: 'open_alert',
              title:
                portalRole === 'student' || portalRole === 'guardian'
                  ? '📖 فتح الورد والمراجعة'
                  : '📋 فتح المتابعة الآن',
            },
            {
              action: 'acknowledge_alert',
              title: '✅ تم الاطلاع',
            },
          ],
        });
      })()
    );
    return;
  }

  // مزامنة إعدادات وتذكيرات الطالب/ولي الأمر مع قاعدة بيانات الخلفية
  if (data.type === 'SYNC_SESSION_REMINDERS') {
    event.waitUntil(
      (async () => {
        const currentMeta = (await readFromIDB(REMINDERS_META_KEY)) || {};
        const nextMeta = {
          ...currentMeta,
          portalRole: data.portalRole || currentMeta.portalRole || 'guardian',
          guardianStudentIds: Array.isArray(data.guardianStudentIds)
            ? data.guardianStudentIds
            : currentMeta.guardianStudentIds || [],
          scheduledReminders: Array.isArray(data.scheduledReminders)
            ? data.scheduledReminders
            : currentMeta.scheduledReminders || [],
          updatedAt: new Date().toISOString(),
        };
        await writeToIDB(REMINDERS_META_KEY, nextMeta);
        await checkAndDispatchUpcomingSessionReminders();
      })()
    );
    return;
  }

  // جدولة تذكير مخصص بعد عدد محدد من الدقائق (حتى لو أُغلق التطبيق بعد الجدولة)
  if (data.type === 'SCHEDULE_SESSION_REMINDER') {
    event.waitUntil(
      (async () => {
        const delayMinutes = Math.max(0.1, Number(data.delayMinutes) || 5);
        const triggerAt = Date.now() + Math.round(delayMinutes * 60 * 1000);
        const reminderId = data.id || `sched-${Date.now()}`;
        const item = {
          id: reminderId,
          title:
            data.title ||
            '⏰ تذكير بحصة القرآن الكريم — أكاديمية الإمام',
          body:
            data.body ||
            'حان موعد الاستعداد لحصة التسميع والمراجعة القرآنية.',
          tag: data.tag || `imam-sched-${reminderId}`,
          url: data.url || '/',
          targetTab: data.targetTab || 'session',
          studentId: data.studentId || null,
          studentName: data.studentName || null,
          circleName: data.circleName || null,
          meetingUrl: data.meetingUrl || null,
          portalRoute: data.portalRoute || null,
          triggerAt,
        };

        const currentMeta = (await readFromIDB(REMINDERS_META_KEY)) || {};
        const list = Array.isArray(currentMeta.scheduledReminders)
          ? currentMeta.scheduledReminders.filter((r) => r && r.id !== reminderId)
          : [];
        list.push(item);

        await writeToIDB(REMINDERS_META_KEY, {
          ...currentMeta,
          scheduledReminders: list,
        });

        const todayDateStr = getLocalDateKey(new Date());
        const dedupeKey = `${todayDateStr}::custom::${reminderId}`;
        scheduleInMemoryReminder(dedupeKey, triggerAt - Date.now(), item);
      })()
    );
    return;
  }

  if (data.type === 'CHECK_REMINDERS_NOW') {
    event.waitUntil(checkAndDispatchUpcomingSessionReminders());
  }
});

/**
 * 7. التفاعل مع نقر الطالب أو ولي الأمر أو المعلم على الإشعار (Notification Click)
 */
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  const action = event.action;

  notification.close();

  // إذا اختار المستخدم "تم الاطلاع" على تنبيه teacherAlert
  if (action === 'acknowledge_alert') {
    event.waitUntil(
      (async () => {
        if (data.alertId) {
          const currentMeta = (await readFromIDB(REMINDERS_META_KEY)) || {};
          const ackList = Array.isArray(currentMeta.acknowledgedAlertIds)
            ? currentMeta.acknowledgedAlertIds
            : [];
          if (!ackList.includes(data.alertId)) {
            ackList.push(data.alertId);
          }
          await writeToIDB(REMINDERS_META_KEY, {
            ...currentMeta,
            acknowledgedAlertIds: ackList,
          });
        }
        const windowClients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        for (const client of windowClients) {
          client.postMessage({
            type: 'TEACHER_ALERT_ACKNOWLEDGED',
            alertId: data.alertId || null,
            studentId: data.studentId || null,
            taskId: data.taskId || null,
          });
        }
      })()
    );
    return;
  }

  // إذا اختار المستخدم "تذكير بعد 5 دقائق" (Snooze)
  if (action === 'snooze_5m') {
    event.waitUntil(
      (async () => {
        const snoozeMs = 5 * 60 * 1000;
        const snoozeId = `snooze-${Date.now()}`;
        const snoozeItem = {
          id: snoozeId,
          title: data.originalTitle || '⏰ تذكير بحصة القرآن الكريم (بعد التأجيل)',
          body:
            data.originalBody ||
            'حان الآن موعد الدخول لحصة التسميع والمراجعة في أكاديمية الإمام.',
          tag: `imam-snooze-${data.studentId || 'general'}`,
          url: data.url || '/',
          targetTab: data.targetTab || 'session',
          studentId: data.studentId || null,
          studentName: data.studentName || null,
          circleName: data.circleName || null,
          meetingUrl: data.meetingUrl || null,
          portalRoute: data.portalRoute || null,
          triggerAt: Date.now() + snoozeMs,
        };

        const currentMeta = (await readFromIDB(REMINDERS_META_KEY)) || {};
        const list = Array.isArray(currentMeta.scheduledReminders)
          ? currentMeta.scheduledReminders
          : [];
        list.push(snoozeItem);
        await writeToIDB(REMINDERS_META_KEY, {
          ...currentMeta,
          scheduledReminders: list,
        });

        scheduleInMemoryReminder(
          `${getLocalDateKey(new Date())}::custom::${snoozeId}`,
          snoozeMs,
          snoozeItem
        );
      })()
    );
    return;
  }

  // فتح التطبيق أو التركيز على النافذة المفتوحة وتوجيه المستخدم مباشرة للحصة أو التنبيه
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        const targetPath = data.url || '/';

        for (const client of windowClients) {
          if ('focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              targetTab: data.targetTab || 'session',
              studentId: data.studentId || null,
              portalRoute: data.portalRoute || null,
              meetingUrl: data.meetingUrl || null,
              alertId: data.alertId || null,
              alertCategory: data.alertCategory || null,
              taskId: data.taskId || null,
            });
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetPath);
        }
        return null;
      })
  );
});
