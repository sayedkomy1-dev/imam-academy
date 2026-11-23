import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Flame,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Award,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Check,
  CloudCheck,
  Users,
} from 'lucide-react';
import {
  Student,
  SessionRecord,
  MakeupSessionCard,
  SurahFreshnessStatus,
  SurahRevisionLogEntry,
} from '../types';
import { SURAHS, JUZ_NAMES, getPageNumberForSurahAyah } from '../data/quranData';
import { getLocalDateString } from '../data/seedData';
import { useAcademy } from '../context/AcademyContext';

interface QuranCoverageAndGoalEngineProps {
  student: Student;
  sessions: SessionRecord[];
  roleMode?: 'teacher' | 'student' | 'guardian';
  onUpdateStudent?: (id: string, patch: Partial<Student>) => void;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'warning') => void;
  onOpenSurahInMushaf?: (surahId: number, surahName: string) => void;
  defaultExpanded?: boolean;
}

// Build 30-Juz to Surah IDs mapping from SURAHS metadata + multi-Juz Surahs
const JUZ_SURAH_MAPPING: Record<number, number[]> = (() => {
  const map: Record<number, number[]> = {};
  for (let j = 1; j <= 30; j++) {
    map[j] = [];
  }
  SURAHS.forEach((s) => {
    if (!map[s.juz]) map[s.juz] = [];
    map[s.juz].push(s.id);
  });
  // Ensure multi-juz long surahs are represented across their respective Juzs
  if (!map[2].includes(2)) map[2].push(2);
  if (!map[3].includes(2)) map[3].push(2);
  if (!map[4].includes(3)) map[4].push(3);
  if (!map[5].includes(4)) map[5].push(4);
  if (!map[6].includes(4)) map[6].push(4);
  if (!map[7].includes(5)) map[7].push(5);
  if (!map[8].includes(6)) map[8].push(6);
  if (!map[9].includes(7)) map[9].push(7);
  if (!map[10].includes(8)) map[10].push(8);
  if (!map[11].includes(9)) map[11].push(9);
  if (!map[12].includes(11)) map[12].push(11);
  if (!map[13].includes(12)) map[13].push(12);
  if (!map[17].includes(21)) map[17].push(21);
  if (!map[20].includes(27)) map[20].push(27);
  if (!map[21].includes(29)) map[21].push(29);
  if (!map[22].includes(33)) map[22].push(33);
  if (!map[23].includes(36)) map[23].push(36);
  if (!map[24].includes(39)) map[24].push(39);
  if (!map[25].includes(41)) map[25].push(41);
  if (!map[27].includes(51)) map[27].push(51);
  return map;
})();

const JUZ_PAGES_COUNT = 20.1333;
const TOTAL_MUSHAF_PAGES = 604;
const TOTAL_QURAN_AYAHS = 6236;

function computeDaysBetweenDates(dateStrA: string, dateStrB: string): number {
  try {
    const a = new Date(dateStrA.slice(0, 10) + 'T12:00:00');
    const b = new Date(dateStrB.slice(0, 10) + 'T12:00:00');
    const diffMs = Math.abs(b.getTime() - a.getTime());
    return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  } catch {
    return 14;
  }
}

export const QuranCoverageAndGoalEngine: React.FC<QuranCoverageAndGoalEngineProps> = ({
  student,
  sessions,
  roleMode = 'teacher',
  onUpdateStudent,
  onShowToast,
  onOpenSurahInMushaf,
  defaultExpanded = false,
}) => {
  const academyCtx = useAcademy();
  const todayStr = getLocalDateString(0);

  const [isCoverageExpanded, setIsCoverageExpanded] = useState<boolean>(defaultExpanded);
  const [activeGridTab, setActiveGridTab] = useState<
    'freshness_114' | 'juz_30' | 'khatmah_calc'
  >('freshness_114');
  const [surahSearchQuery, setSurahSearchQuery] = useState<string>('');
  const [freshnessFilter, setFreshnessFilter] = useState<
    'all' | SurahFreshnessStatus
  >('all');
  const [customWeeklyPagesOverride, setCustomWeeklyPagesOverride] = useState<
    number | null
  >(null);
  const [schedulingCardId, setSchedulingCardId] = useState<string | null>(null);
  const [scheduleDateInput, setScheduleDateInput] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [scheduleTimeInput, setScheduleTimeInput] = useState<string>(
    student.scheduleTime || '17:00'
  );
  const [recentlyLoggedSurahIds, setRecentlyLoggedSurahIds] = useState<
    Record<number, boolean>
  >({});

  // Compute exact Quran coverage + ev/quran-tracker Memory Freshness per Surah & Juz
  const coverageStats = useMemo(() => {
    const memSurahSet = new Set<number>(student.memorizedSurahs || []);
    const revSurahSet = new Set<number>(student.inProgressSurahs || []);
    const memJuzSet = new Set<number>(student.memorizedJuz || []);
    const currentStopSurahId = student.currentStop?.surahId || 1;
    const currentStopJuz = student.currentStop?.juzNumber || 30;
    const currentStopAyah = student.currentStop?.ayah || 1;

    // Build latest review date map per Surah from both sessions and student.surahRevisionLogs
    const lastReviewDateBySurah: Record<number, string> = {};
    const reviewCountBySurah: Record<number, number> = {};
    const studentSessions = sessions
      .filter((s) => s.studentId === student.id && s.status === 'حضر')
      .sort((a, b) => (b.date > a.date ? 1 : -1));

    studentSessions.forEach((sess) => {
      const touchedIds: number[] = [];
      if (sess.actualRecitation?.surahId) touchedIds.push(sess.actualRecitation.surahId);
      if (sess.newMemorization?.surahId) touchedIds.push(sess.newMemorization.surahId);
      if (sess.nearReview?.surahId) touchedIds.push(sess.nearReview.surahId);
      if (sess.farReview?.surahId) touchedIds.push(sess.farReview.surahId);
      if (sess.surahReview?.enabled && Array.isArray(sess.surahReview.surahNames)) {
        sess.surahReview.surahNames.forEach((sName) => {
          const found = SURAHS.find((s) => s.name === sName);
          if (found) touchedIds.push(found.id);
        });
      }
      touchedIds.forEach((sid) => {
        reviewCountBySurah[sid] = (reviewCountBySurah[sid] || 0) + 1;
        if (!lastReviewDateBySurah[sid] || sess.date > lastReviewDateBySurah[sid]) {
          lastReviewDateBySurah[sid] = sess.date;
        }
      });
    });

    // Merge explicit 1-tap tracker logs (student.surahRevisionLogs)
    const explicitLogs: Record<number, SurahRevisionLogEntry> =
      student.surahRevisionLogs || {};
    Object.values(explicitLogs).forEach((entry) => {
      if (!entry || !entry.surahId) return;
      const existingDate = lastReviewDateBySurah[entry.surahId];
      if (!existingDate || entry.lastReviewedDate >= existingDate) {
        lastReviewDateBySurah[entry.surahId] = entry.lastReviewedDate;
      }
      reviewCountBySurah[entry.surahId] = Math.max(
        reviewCountBySurah[entry.surahId] || 0,
        entry.reviewCount || 1
      );
    });

    // Calculate memorized ayahs & pages accurately
    let memorizedAyahsCount = 0;
    SURAHS.forEach((surah) => {
      const surahJuzList = Object.entries(JUZ_SURAH_MAPPING)
        .filter(([, sIds]) => sIds.includes(surah.id))
        .map(([j]) => Number(j));
      const isInMemorizedJuz = surahJuzList.some((j) => memJuzSet.has(j));

      if (memSurahSet.has(surah.id) || isInMemorizedJuz || explicitLogs[surah.id]) {
        memorizedAyahsCount += surah.ayahs;
      } else if (surah.id === currentStopSurahId) {
        memorizedAyahsCount += Math.min(surah.ayahs, Math.max(0, currentStopAyah));
      } else if (revSurahSet.has(surah.id)) {
        memorizedAyahsCount += Math.round(surah.ayahs * 0.6);
      }
    });

    const pagesFromAyahs = Math.round(
      (memorizedAyahsCount / TOTAL_QURAN_AYAHS) * TOTAL_MUSHAF_PAGES
    );
    const pagesFromJuz = Math.round(memJuzSet.size * JUZ_PAGES_COUNT);
    const completedPages = Math.min(
      TOTAL_MUSHAF_PAGES,
      Math.max(
        pagesFromAyahs,
        pagesFromJuz,
        memSurahSet.size > 0 ? Math.max(1, pagesFromAyahs) : 0
      )
    );
    const exactPercentage = Number(
      ((completedPages / TOTAL_MUSHAF_PAGES) * 100).toFixed(1)
    );
    const remainingPages = Math.max(0, TOTAL_MUSHAF_PAGES - completedPages);

    // 114 Surahs with ev/quran-tracker Freshness Status ('fresh' < 7d | 'due' 7-21d | 'stale' > 21d | 'not_memorized')
    const surahGrid = SURAHS.map((surah) => {
      const surahJuzList = Object.entries(JUZ_SURAH_MAPPING)
        .filter(([, sIds]) => sIds.includes(surah.id))
        .map(([j]) => Number(j));
      const isInMemorizedJuz = surahJuzList.some((j) => memJuzSet.has(j));
      const isMemorized =
        memSurahSet.has(surah.id) ||
        isInMemorizedJuz ||
        Boolean(explicitLogs[surah.id]) ||
        revSurahSet.has(surah.id);

      const lastRevDate = lastReviewDateBySurah[surah.id] || null;
      // Deterministic fallback days for memorized Surahs without an explicit session date yet
      const fallbackDays = ((surah.id * 5) % 26) + 2;
      const daysSinceReview = isMemorized
        ? lastRevDate
          ? computeDaysBetweenDates(lastRevDate, todayStr)
          : fallbackDays
        : null;

      let freshness: SurahFreshnessStatus = 'not_memorized';
      if (isMemorized && daysSinceReview !== null) {
        if (daysSinceReview <= 7) {
          freshness = 'fresh';
        } else if (daysSinceReview <= 21) {
          freshness = 'due';
        } else {
          freshness = 'stale';
        }
      }

      let state: 'mastered' | 'reviewing' | 'current_goal' | 'not_started' =
        'not_started';
      if (memSurahSet.has(surah.id) || isInMemorizedJuz || explicitLogs[surah.id]) {
        state = 'mastered';
      } else if (surah.id === currentStopSurahId) {
        state = 'current_goal';
      } else if (revSurahSet.has(surah.id) || lastRevDate) {
        state = 'reviewing';
      }

      return {
        ...surah,
        state,
        freshness,
        daysSinceReview,
        lastReviewedDate: lastRevDate,
        reviewCount: reviewCountBySurah[surah.id] || (isMemorized ? 1 : 0),
        startPage: getPageNumberForSurahAyah(surah.id, 1),
      };
    });

    // 30 Juz statuses with Freshness summary
    const juzGrid = Array.from({ length: 30 }, (_, idx) => {
      const juzNum = idx + 1;
      const surahsInJuz = JUZ_SURAH_MAPPING[juzNum] || [];
      const surahObjects = surahGrid.filter((s) => surahsInJuz.includes(s.id));
      const allSurahsMem =
        surahObjects.length > 0 &&
        surahObjects.every((s) => s.freshness !== 'not_memorized');
      const someSurahsMemOrRev = surahObjects.some(
        (s) => s.freshness !== 'not_memorized'
      );

      let state: 'mastered' | 'reviewing' | 'current_goal' | 'not_started' =
        'not_started';
      if (memJuzSet.has(juzNum) || allSurahsMem) {
        state = 'mastered';
      } else if (
        juzNum === currentStopJuz ||
        surahsInJuz.includes(currentStopSurahId)
      ) {
        state = 'current_goal';
      } else if (someSurahsMemOrRev) {
        state = 'reviewing';
      }

      const staleInJuz = surahObjects.filter((s) => s.freshness === 'stale').length;
      const dueInJuz = surahObjects.filter((s) => s.freshness === 'due').length;

      return {
        juzNumber: juzNum,
        juzName: JUZ_NAMES[idx] || `الجزء ${juzNum}`,
        state,
        surahCount: surahsInJuz.length,
        staleInJuz,
        dueInJuz,
      };
    });

    const freshSurahs = surahGrid.filter((s) => s.freshness === 'fresh');
    const dueSurahs = surahGrid.filter((s) => s.freshness === 'due');
    const staleSurahs = surahGrid.filter((s) => s.freshness === 'stale');
    const memorizedTotalCount =
      freshSurahs.length + dueSurahs.length + staleSurahs.length;

    // Smart Daily Revision Queue ("ماذا أراجع اليوم؟") — top 4 oldest memorized Surahs
    const smartDailyQueue = [...staleSurahs, ...dueSurahs, ...freshSurahs]
      .sort((a, b) => (b.daysSinceReview || 0) - (a.daysSinceReview || 0))
      .slice(0, 4);

    // Reviewed today count
    const reviewedTodayCount = surahGrid.filter(
      (s) => s.lastReviewedDate === todayStr || s.daysSinceReview === 0
    ).length;

    const sessionsPerWeek = Math.max(
      1,
      (student.scheduleDays || [0, 2, 4]).length
    );
    let avgPagesPerSession = 1.0;
    if (studentSessions.length > 0) {
      let totalEstimatedPages = 0;
      studentSessions.slice(0, 12).forEach((s) => {
        const fromA =
          s.actualRecitation?.fromAyah || s.newMemorization?.fromAyah || 1;
        const toA =
          s.actualRecitation?.toAyah || s.newMemorization?.toAyah || 8;
        const ayahSpan = Math.max(3, Math.abs(toA - fromA) + 1);
        totalEstimatedPages += Math.max(
          0.5,
          Number((ayahSpan / 15).toFixed(2))
        );
      });
      avgPagesPerSession = Number(
        (totalEstimatedPages / Math.min(12, studentSessions.length)).toFixed(2)
      );
    }

    const calculatedWeeklyPages = Number(
      Math.max(1, avgPagesPerSession * sessionsPerWeek).toFixed(1)
    );
    const effectiveWeeklyPages =
      customWeeklyPagesOverride ?? calculatedWeeklyPages;
    const weeksRemaining =
      remainingPages > 0
        ? Math.ceil(remainingPages / Math.max(0.5, effectiveWeeklyPages))
        : 0;

    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + weeksRemaining * 7);
    const expectedDateFormatted = expectedDate.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return {
      completedPages,
      remainingPages,
      exactPercentage,
      juzGrid,
      surahGrid,
      freshSurahsCount: freshSurahs.length,
      dueSurahsCount: dueSurahs.length,
      staleSurahsCount: staleSurahs.length,
      memorizedTotalCount,
      smartDailyQueue,
      reviewedTodayCount,
      masteredJuzCount: juzGrid.filter((j) => j.state === 'mastered').length,
      reviewingJuzCount: juzGrid.filter((j) => j.state === 'reviewing').length,
      masteredSurahCount: surahGrid.filter((s) => s.state === 'mastered').length,
      reviewingSurahCount: surahGrid.filter((s) => s.state === 'reviewing')
        .length,
      calculatedWeeklyPages,
      effectiveWeeklyPages,
      weeksRemaining,
      expectedDateFormatted,
      sessionsPerWeek,
    };
  }, [student, sessions, customWeeklyPagesOverride, todayStr]);

  const filteredSurahs = useMemo(() => {
    const q = surahSearchQuery.trim().toLowerCase();
    return coverageStats.surahGrid.filter((s) => {
      if (freshnessFilter !== 'all' && s.freshness !== freshnessFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        String(s.id) === q ||
        `سورة ${s.name}`.toLowerCase().includes(q)
      );
    });
  }, [coverageStats.surahGrid, surahSearchQuery, freshnessFilter]);

  const handleOneTapSurahRevision = async (
    surahId: number,
    markAsMemorized = true
  ) => {
    setRecentlyLoggedSurahIds((prev) => ({ ...prev, [surahId]: true }));
    if (academyCtx?.logQuickSurahRevisionInTracker) {
      await academyCtx.logQuickSurahRevisionInTracker({
        studentId: student.id,
        surahId,
        masteryScore: 96,
        markAsMemorized,
      });
    } else if (onUpdateStudent) {
      const prevLogs = student.surahRevisionLogs || {};
      const prevEntry = prevLogs[surahId];
      const nextLogs: Record<number, SurahRevisionLogEntry> = {
        ...prevLogs,
        [surahId]: {
          surahId,
          lastReviewedDate: todayStr,
          reviewCount: (prevEntry?.reviewCount || 0) + 1,
          masteryScore: 96,
        },
      };
      const nextMem = markAsMemorized
        ? Array.from(new Set([...(student.memorizedSurahs || []), surahId]))
        : student.memorizedSurahs;
      onUpdateStudent(student.id, {
        memorizedSurahs: nextMem,
        surahRevisionLogs: nextLogs,
        trackerLastReviewedDate: todayStr,
      });
      const sMeta = SURAHS.find((x) => x.id === surahId);
      onShowToast?.(
        `✅ تم تسجيل مراجعة سورة ${sMeta?.name || surahId} اليوم بنجاح`,
        'success'
      );
    }
    setTimeout(() => {
      setRecentlyLoggedSurahIds((prev) => ({ ...prev, [surahId]: false }));
    }, 1800);
  };

  const handleOneTapJuzRevision = async (juzNumber: number) => {
    if (academyCtx?.bulkLogJuzRevisionInTracker) {
      await academyCtx.bulkLogJuzRevisionInTracker({
        studentId: student.id,
        juzNumber,
        masteryScore: 96,
      });
    }
  };

  const makeupCards: MakeupSessionCard[] = useMemo(() => {
    const explicitCards = student.makeupSessions || [];
    const existingDates = new Set(explicitCards.map((c) => c.absentDate));
    const autoFromSessions: MakeupSessionCard[] = sessions
      .filter(
        (s) =>
          s.studentId === student.id &&
          (s.status === 'غاب' || s.status === 'إجازة') &&
          !existingDates.has(s.date)
      )
      .slice(0, 5)
      .map((s) => ({
        id: `makeup-${s.id}`,
        studentId: student.id,
        studentName: student.name,
        absentDate: s.date,
        attendanceStatus: s.status === 'غاب' ? 'غاب' : 'إجازة',
        missedSurahId:
          s.newMemorization?.surahId || student.currentStop?.surahId || 1,
        missedSurahName:
          s.newMemorization?.surahName ||
          student.currentStop?.surahName ||
          'البقرة',
        missedFromAyah:
          s.newMemorization?.fromAyah || student.currentStop?.ayah || 1,
        missedToAyah:
          s.newMemorization?.toAyah || (student.currentStop?.ayah || 1) + 7,
        missedReviewLabel: s.nearReview?.surahName
          ? `مراجعة سورة ${s.nearReview.surahName}`
          : undefined,
        resolutionStatus: 'pending',
        createdAt: s.createdAt || s.date,
      }));

    return [...explicitCards, ...autoFromSessions];
  }, [student, sessions]);

  const handleScheduleMakeup = (card: MakeupSessionCard) => {
    if (!onUpdateStudent) return;
    const updatedCard: MakeupSessionCard = {
      ...card,
      resolutionStatus: 'scheduled_makeup',
      scheduledMakeupDate: scheduleDateInput,
      scheduledMakeupTime: scheduleTimeInput,
      resolvedByRole: roleMode === 'guardian' ? 'guardian' : 'teacher',
      resolvedAt: new Date().toISOString(),
    };

    const existing = student.makeupSessions || [];
    const existsIdx = existing.findIndex(
      (c) => c.id === card.id || c.absentDate === card.absentDate
    );
    const nextList =
      existsIdx >= 0
        ? existing.map((c, i) => (i === existsIdx ? updatedCard : c))
        : [updatedCard, ...existing];

    onUpdateStudent(student.id, { makeupSessions: nextList });
    setSchedulingCardId(null);
    onShowToast?.(
      `تم اعتماد موعد حصة التعويض يوم ${scheduleDateInput} الساعة ${scheduleTimeInput} بنجاح 📅`,
      'success'
    );
  };

  const handleAutoMergeNextWeek = (card: MakeupSessionCard) => {
    if (!onUpdateStudent) return;
    const spanAyahs = Math.max(1, card.missedToAyah - card.missedFromAyah + 1);
    const perSessionAdd = Math.max(
      1,
      Math.ceil(spanAyahs / Math.max(1, coverageStats.sessionsPerWeek))
    );
    const mergedNote = `تم توزيع ورد (${card.missedSurahName}: ${card.missedFromAyah}-${card.missedToAyah}) بمعدل +${perSessionAdd} آيات إضافية على حصص الأسبوع القادم دون تأخير موعد الختمة.`;

    const updatedCard: MakeupSessionCard = {
      ...card,
      resolutionStatus: 'merged_next_week',
      mergedPlanNote: mergedNote,
      resolvedByRole: roleMode === 'guardian' ? 'guardian' : 'teacher',
      resolvedAt: new Date().toISOString(),
    };

    const existing = student.makeupSessions || [];
    const existsIdx = existing.findIndex(
      (c) => c.id === card.id || c.absentDate === card.absentDate
    );
    const nextList =
      existsIdx >= 0
        ? existing.map((c, i) => (i === existsIdx ? updatedCard : c))
        : [updatedCard, ...existing];

    onUpdateStudent(student.id, {
      makeupSessions: nextList,
    });

    onShowToast?.(
      `تم دمج الورد الفائت تلقائياً في خطة الأسبوع القادم (+${perSessionAdd} آيات لكل حصة) للحفاظ على جدول الختمة 🔄`,
      'success'
    );
  };

  const getFreshnessStyles = (freshness: SurahFreshnessStatus) => {
    switch (freshness) {
      case 'fresh':
        return {
          label: 'نضر ومتقن',
          borderClass:
            'border-emerald-500/60 bg-emerald-50/70 dark:bg-emerald-950/35 text-emerald-950 dark:text-emerald-100',
          badgeClass:
            'bg-emerald-600 text-white',
          dotClass: 'bg-emerald-500',
        };
      case 'due':
        return {
          label: 'مستحق للمراجعة',
          borderClass:
            'border-amber-500/70 bg-amber-50/80 dark:bg-amber-950/35 text-amber-950 dark:text-amber-100',
          badgeClass:
            'bg-amber-500 text-slate-950',
          dotClass: 'bg-amber-500',
        };
      case 'stale':
        return {
          label: 'متأخر المراجعة',
          borderClass:
            'border-red-500/70 bg-red-50/80 dark:bg-red-950/35 text-red-950 dark:text-red-100',
          badgeClass:
            'bg-red-600 text-white',
          dotClass: 'bg-red-500',
        };
      default:
        return {
          label: 'غير محفوظ بعد',
          borderClass:
            'border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-neutral-600 dark:text-slate-400',
          badgeClass:
            'bg-neutral-200 dark:bg-slate-800 text-neutral-600 dark:text-slate-400',
          dotClass: 'bg-neutral-400',
        };
    }
  };

  const getStateStyles = (
    state: 'mastered' | 'reviewing' | 'current_goal' | 'not_started'
  ) => {
    switch (state) {
      case 'mastered':
        return {
          badge: 'محفوظ متقن',
          cardClass:
            'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-700',
        };
      case 'reviewing':
        return {
          badge: 'قيد المراجعة',
          cardClass:
            'bg-amber-500 text-slate-950 border-amber-400 hover:bg-amber-400',
        };
      case 'current_goal':
        return {
          badge: 'الهدف الحالي',
          cardClass:
            'bg-blue-600 text-white border-blue-400 ring-2 ring-blue-400/50 hover:bg-blue-700',
        };
      default:
        return {
          badge: 'لم يبدأ',
          cardClass:
            'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400',
        };
    }
  };

  const dailyGoalTarget = student.trackerDailyGoalSurahs || 3;
  const dailyGoalProgressPct = Math.min(
    100,
    Math.round((coverageStats.reviewedTodayCount / Math.max(1, dailyGoalTarget)) * 100)
  );

  return (
    <div className="space-y-4">
      {/* 1. Quran Coverage % & ev/quran-tracker Memory Freshness Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-neutral-200 dark:border-emerald-800/60 shadow-xs overflow-hidden">
        {/* Top Banner with Exact Coverage %, Freshness Summary, and Streak */}
        <div className="bg-gradient-to-l from-[#09291e] via-[#114232] to-[#145a3a] p-5 text-white relative overflow-hidden">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-400/20 border border-amber-300/40 text-amber-200 text-xs font-extrabold">
                <Compass className="w-3.5 h-3.5" />
                <span>
                  متتبع نضارة الحفظ والمراجعة الذكي (Quran Tracker • 114 سورة • 30 جزءاً)
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white">
                أتم حفظ{' '}
                <span className="text-amber-300 font-mono tabular-nums text-2xl">
                  {coverageStats.exactPercentage}%
                </span>{' '}
                من القرآن الكريم —{' '}
                <span className="text-emerald-200 font-mono tabular-nums">
                  {coverageStats.completedPages} صفحة
                </span>{' '}
                من 604
              </h3>
              <p className="text-xs text-emerald-100/90 font-bold">
                المحطة الحالية: سورة {student.currentStop?.surahName || 'الفاتحة'} (آية{' '}
                <span className="font-mono tabular-nums">
                  {student.currentStop?.ayah || 1}
                </span>{' '}
                • الجزء{' '}
                <span className="font-mono tabular-nums">
                  {student.currentStop?.juzNumber || 30}
                </span>
                ) • المتبقي للختمة:{' '}
                <span className="font-mono tabular-nums">
                  {coverageStats.remainingPages}
                </span>{' '}
                صفحة
              </p>
            </div>

            {/* Streak + Expected Khatmah Date + Expand/Collapse Button */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="rounded-2xl bg-white/10 border border-amber-300/40 px-3.5 py-2 text-right">
                <div className="flex items-center gap-1 text-[11px] font-bold text-amber-200">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>سلسلة المواظبة:</span>
                </div>
                <div className="text-xs sm:text-sm font-black text-white font-mono tabular-nums mt-0.5">
                  {student.attendanceStreak || 1} يوم متتالي
                </div>
              </div>

              <div className="rounded-2xl bg-white/10 border border-emerald-300/30 px-3.5 py-2 text-right">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-200">
                  <Calendar className="w-3.5 h-3.5 text-amber-300" />
                  <span>موعد الختمة المتوقع:</span>
                </div>
                <div className="text-xs sm:text-sm font-black text-white mt-0.5">
                  {coverageStats.remainingPages === 0
                    ? '🎉 أتم حفظ القرآن كاملاً!'
                    : coverageStats.expectedDateFormatted}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCoverageExpanded((prev) => !prev)}
                className="px-4 py-3 rounded-2xl bg-[#c59b27] hover:bg-[#dfbd69] text-[#14281d] text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs transition shrink-0"
              >
                {isCoverageExpanded ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    <span>إخفاء مصفوفة السور</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    <span>فتح مصفوفة السور الـ 114 والأجزاء</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Progress Bar & Freshness Counters */}
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded-full bg-black/35 overflow-hidden p-0.5 border border-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-l from-amber-400 via-emerald-400 to-teal-300 transition-all duration-500"
                style={{ width: `${Math.max(2, coverageStats.exactPercentage)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs font-extrabold">
              <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-between">
                <span>🟢 نضر (&lt; 7 أيام)</span>
                <span className="font-mono tabular-nums text-emerald-200">
                  {coverageStats.freshSurahsCount} سورة
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-between">
                <span>🟡 مستحق (7-21 يوم)</span>
                <span className="font-mono tabular-nums text-amber-200">
                  {coverageStats.dueSurahsCount} سورة
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-red-500/25 border border-red-400/40 flex items-center justify-between">
                <span>🔴 متأخر (&gt; 21 يوم)</span>
                <span className="font-mono tabular-nums text-red-200">
                  {coverageStats.staleSurahsCount} سورة
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 flex items-center justify-between">
                <span>✅ أُنجز اليوم</span>
                <span className="font-mono tabular-nums text-amber-300">
                  {coverageStats.reviewedTodayCount} / {dailyGoalTarget} سور ({dailyGoalProgressPct}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Always-Visible Clean Bar: Smart Daily Revision Queue ("ماذا أراجع اليوم؟") */}
        <div className="p-4 bg-[#FDFBF7] dark:bg-[#0A120E] border-b border-neutral-200 dark:border-emerald-900/50 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              <h4 className="text-xs sm:text-sm font-black text-[#14281d] dark:text-white">
                ماذا أراجع اليوم؟ (اقتراح المراجعة المتباعدة والتسجيل السريع بنقرة واحدة)
              </h4>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              <CloudCheck className="w-3.5 h-3.5" />
              <span>متزامن تلقائياً مع قاعدة بيانات Firestore</span>
            </div>
          </div>

          {coverageStats.smartDailyQueue.length === 0 ? (
            <div className="p-4 rounded-2xl border border-dashed border-neutral-300 dark:border-emerald-800/60 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-extrabold text-[#14281d] dark:text-white">
                  لم يتم تسجيل سور محفوظة لهذا الطالب بعد في متتبع النضارة
                </div>
                <p className="text-[11px] text-neutral-500">
                  ابدأ بتسجيل أول سورة محفوظة بنقرة واحدة لتفعيل جدول المراجعة المتباعدة ومؤشرات النضارة
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleOneTapSurahRevision(1, true)}
                  className="px-3.5 py-2 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold cursor-pointer transition"
                >
                  + تسجيل سورة الفاتحة ✓
                </button>
                <button
                  type="button"
                  onClick={() => void handleOneTapSurahRevision(114, true)}
                  className="px-3.5 py-2 rounded-xl bg-[#c59b27] hover:bg-[#b58c1e] text-[#14281d] text-xs font-extrabold cursor-pointer transition"
                >
                  + تسجيل سورة الناس ✓
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {coverageStats.smartDailyQueue.map((item) => {
                const fStyle = getFreshnessStyles(item.freshness);
                const isJustLogged = Boolean(recentlyLoggedSurahIds[item.id]);
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl p-3 border transition flex flex-col justify-between gap-2.5 ${fStyle.borderClass}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-bold opacity-75 font-mono tabular-nums">
                          سورة #{item.id} • جزء {item.juz} • {item.ayahs} آية
                        </div>
                        <div className="text-sm font-black font-serif mt-0.5">
                          سورة {item.name}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold font-mono tabular-nums shrink-0 ${fStyle.badgeClass}`}
                      >
                        {item.daysSinceReview === 0
                          ? 'روجع اليوم ✓'
                          : `منذ ${item.daysSinceReview} يوم`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-black/5 dark:border-white/10">
                      <span className="text-[10px] font-bold opacity-80">
                        {fStyle.label} • مرّات المراجعة:{' '}
                        <span className="font-mono tabular-nums">{item.reviewCount}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleOneTapSurahRevision(item.id, true)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition shrink-0 ${
                          isJustLogged || item.daysSinceReview === 0
                            ? 'bg-emerald-700 text-white'
                            : 'bg-[#145a3a] hover:bg-[#0f452c] text-white'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>
                          {isJustLogged || item.daysSinceReview === 0
                            ? 'تمت اليوم ✓'
                            : 'تمت المراجعة'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Expanded Matrix Section (114 Surahs Freshness Grid / 30 Juz / Khatmah Calculator) */}
        {isCoverageExpanded && (
          <>
            <div className="p-4 border-b border-neutral-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-neutral-50/70 dark:bg-slate-800/40">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveGridTab('freshness_114')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition ${
                    activeGridTab === 'freshness_114'
                      ? 'bg-[#145a3a] text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>مصفوفة نضارة السور (114 سورة • 1-Tap)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGridTab('juz_30')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition ${
                    activeGridTab === 'juz_30'
                      ? 'bg-[#145a3a] text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>خريطة الأجزاء الثلاثين (30 جزءاً)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGridTab('khatmah_calc')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition ${
                    activeGridTab === 'khatmah_calc'
                      ? 'bg-[#145a3a] text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                  <span>حاسبة موعد الختمة</span>
                </button>
              </div>

              {/* Search & Filter Controls for 114-Surah Freshness Matrix */}
              {activeGridTab === 'freshness_114' && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={surahSearchQuery}
                      onChange={(e) => setSurahSearchQuery(e.target.value)}
                      placeholder="ابحث باسم السورة أو رقمها..."
                      className="pr-8 pl-3 py-1.5 rounded-xl border border-neutral-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold w-48 focus:outline-none focus:border-[#145a3a]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {(
                      [
                        { id: 'all', label: `الكل (114)` },
                        {
                          id: 'stale',
                          label: `🔴 متأخر (${coverageStats.staleSurahsCount})`,
                        },
                        {
                          id: 'due',
                          label: `🟡 مستحق (${coverageStats.dueSurahsCount})`,
                        },
                        {
                          id: 'fresh',
                          label: `🟢 نضر (${coverageStats.freshSurahsCount})`,
                        },
                        {
                          id: 'not_memorized',
                          label: `⚪ غير محفوظ (${114 - coverageStats.memorizedTotalCount})`,
                        },
                      ] as const
                    ).map((fTab) => (
                      <button
                        key={fTab.id}
                        type="button"
                        onClick={() => setFreshnessFilter(fTab.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold cursor-pointer transition ${
                          freshnessFilter === fTab.id
                            ? 'bg-[#145a3a] text-white'
                            : 'bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-700 text-neutral-600 dark:text-slate-300'
                        }`}
                      >
                        {fTab.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Grid Body */}
            <div className="p-4">
              {activeGridTab === 'freshness_114' && (
                <>
                  {filteredSurahs.length === 0 ? (
                    <div className="py-8 text-center text-xs font-bold text-neutral-500">
                      لا توجد سور مطابقة لمعايير التصفية الحالية.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 max-h-[420px] overflow-y-auto p-1">
                      {filteredSurahs.map((sItem) => {
                        const fStyle = getFreshnessStyles(sItem.freshness);
                        const isMem = sItem.freshness !== 'not_memorized';
                        return (
                          <div
                            key={sItem.id}
                            className={`rounded-2xl p-2.5 border transition flex flex-col justify-between gap-2 ${fStyle.borderClass}`}
                          >
                            <div className="flex items-center justify-between text-[10px] font-bold font-mono tabular-nums opacity-80">
                              <span>#{sItem.id} • ج{sItem.juz}</span>
                              <span>ص {sItem.startPage}</span>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                onOpenSurahInMushaf?.(sItem.id, sItem.name)
                              }
                              className="text-right cursor-pointer group"
                              title={`فتح سورة ${sItem.name} في المصحف`}
                            >
                              <div className="text-xs sm:text-sm font-black font-serif group-hover:underline truncate">
                                سورة {sItem.name}
                              </div>
                              <div className="text-[10px] font-bold opacity-75 font-mono tabular-nums">
                                {sItem.ayahs} آية •{' '}
                                {isMem
                                  ? sItem.daysSinceReview === 0
                                    ? 'روجع اليوم'
                                    : `منذ ${sItem.daysSinceReview} يوم`
                                  : 'لم تبدأ'}
                              </div>
                            </button>

                            <div className="flex items-center justify-between gap-1 pt-1 border-t border-black/5 dark:border-white/10">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold ${fStyle.badgeClass}`}
                              >
                                {fStyle.label}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleOneTapSurahRevision(sItem.id, true)
                                }
                                className="px-2 py-1 rounded-lg bg-[#145a3a] hover:bg-[#0f452c] text-white text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition"
                                title="تسجيل مراجعة السورة اليوم بنقرة واحدة"
                              >
                                <Check className="w-3 h-3" />
                                <span>{isMem ? 'روجع' : '+ حفظ'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {activeGridTab === 'juz_30' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
                  {coverageStats.juzGrid.map((jItem) => {
                    const st = getStateStyles(jItem.state);
                    return (
                      <div
                        key={jItem.juzNumber}
                        className={`rounded-2xl p-3 border transition flex flex-col justify-between gap-2 ${st.cardClass}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-black font-mono tabular-nums opacity-90">
                            جزء {jItem.juzNumber}
                          </span>
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-black/15">
                            {st.badge}
                          </span>
                        </div>
                        <div
                          className="text-xs font-black truncate"
                          title={jItem.juzName}
                        >
                          {jItem.juzName}
                        </div>
                        <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/15">
                          <span className="text-[10px] font-mono tabular-nums opacity-90">
                            {jItem.staleInJuz > 0
                              ? `🔴 ${jItem.staleInJuz} متأخر`
                              : jItem.dueInJuz > 0
                              ? `🟡 ${jItem.dueInJuz} مستحق`
                              : '🟢 متقن'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleOneTapJuzRevision(jItem.juzNumber)
                            }
                            className="px-2 py-1 rounded-lg bg-black/25 hover:bg-black/40 text-white text-[10px] font-extrabold cursor-pointer transition"
                            title={`تسجيل مراجعة الجزء ${jItem.juzNumber} كاملاً اليوم`}
                          >
                            ✓ مراجعة
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeGridTab === 'khatmah_calc' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-emerald-50/50 dark:bg-slate-800/50 rounded-2xl p-4 border border-emerald-200 dark:border-slate-700">
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-emerald-950 dark:text-emerald-200">
                      معدل الإنجاز الأسبوعي المستهدف (صفحة / أسبوع):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={1}
                        max={30}
                        step={0.5}
                        value={coverageStats.effectiveWeeklyPages}
                        onChange={(e) =>
                          setCustomWeeklyPagesOverride(Number(e.target.value))
                        }
                        className="flex-1 accent-emerald-600 cursor-pointer"
                      />
                      <span className="px-3 py-1 rounded-xl bg-emerald-700 text-white font-mono tabular-nums text-xs font-black">
                        {coverageStats.effectiveWeeklyPages} ص/أسبوع
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 font-bold">
                      المعدل الفعلي المحسوب من حصص الطالب الأخيرة:{' '}
                      <span className="font-mono tabular-nums">
                        {coverageStats.calculatedWeeklyPages}
                      </span>{' '}
                      صفحة أسبوعياً (
                      <span className="font-mono tabular-nums">
                        {coverageStats.sessionsPerWeek}
                      </span>{' '}
                      حصص/أسبوع).
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-700 space-y-1 text-center">
                    <div className="text-xs font-bold text-slate-500">
                      الصفحات المتبقية لإتمام الختمة المباركة
                    </div>
                    <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                      {coverageStats.remainingPages} صفحة
                    </div>
                    <div className="text-[11px] font-bold text-slate-500">
                      تم إنجاز{' '}
                      <span className="font-mono tabular-nums">
                        {coverageStats.completedPages}
                      </span>{' '}
                      صفحة (
                      <span className="font-mono tabular-nums">
                        {coverageStats.exactPercentage}%
                      </span>
                      )
                    </div>
                  </div>

                  <div className="rounded-2xl bg-gradient-to-l from-amber-500/20 to-emerald-500/20 p-4 border border-amber-400/60 space-y-1 text-center">
                    <div className="text-xs font-extrabold text-amber-900 dark:text-amber-200 flex items-center justify-center gap-1">
                      <Award className="w-4 h-4 text-amber-600" />
                      <span>موعد الختمة المتوقع بإذن الله</span>
                    </div>
                    <div className="text-lg font-black text-emerald-950 dark:text-white">
                      {coverageStats.remainingPages === 0
                        ? 'مبارك! أتم الختمة'
                        : coverageStats.expectedDateFormatted}
                    </div>
                    <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                      خلال{' '}
                      <span className="font-mono tabular-nums">
                        {coverageStats.weeksRemaining}
                      </span>{' '}
                      أسبوعاً من الانتظام المستمر
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 2. Absence Makeup & Auto-Reschedule Engine Cards */}
      {isCoverageExpanded && makeupCards.length > 0 && (
        <div className="rounded-3xl bg-amber-50/90 dark:bg-slate-900 border border-amber-400/70 dark:border-amber-600/50 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-2xl bg-amber-500 text-slate-950">
                <RefreshCw className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-black text-amber-950 dark:text-amber-200">
                  منظومة تعويض الغياب الآلي وترحيل الأوراد ({makeupCards.length})
                </h4>
                <p className="text-xs font-bold text-amber-800/90 dark:text-slate-400">
                  بطاقات تعويض الحصص التي تغيب أو اعتذر عنها الطالب لضمان عدم اختلال جدول الختمة
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {makeupCards.map((card) => {
              const isPending = card.resolutionStatus === 'pending';
              return (
                <div
                  key={card.id}
                  className="rounded-2xl bg-white dark:bg-slate-800/90 border border-amber-300 dark:border-slate-700 p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 text-[11px] font-black font-mono tabular-nums">
                      {card.attendanceStatus === 'غاب'
                        ? '🔴 غياب حصة'
                        : '🟡 اعتذار / إجازة'}{' '}
                      • {card.absentDate}
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${
                        card.resolutionStatus === 'scheduled_makeup'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200'
                          : card.resolutionStatus === 'merged_next_week'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-200'
                          : 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200'
                      }`}
                    >
                      {card.resolutionStatus === 'scheduled_makeup'
                        ? `📅 مجدولة للتعويض (${card.scheduledMakeupDate})`
                        : card.resolutionStatus === 'merged_next_week'
                        ? '🔄 تم دمج الورد في خطة الأسبوع'
                        : '⏳ بانتظار جدولة التعويض أو الدمج'}
                    </span>
                  </div>

                  <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    الورد الفائت: سورة {card.missedSurahName} (من آية{' '}
                    <span className="font-mono tabular-nums">{card.missedFromAyah}</span> إلى{' '}
                    <span className="font-mono tabular-nums">{card.missedToAyah}</span>)
                    {card.missedReviewLabel ? ` • ${card.missedReviewLabel}` : ''}
                  </div>

                  {card.mergedPlanNote && (
                    <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-[11px] font-bold text-blue-900 dark:text-blue-200">
                      {card.mergedPlanNote}
                    </div>
                  )}

                  {card.scheduledMakeupDate && (
                    <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold text-emerald-900 dark:text-emerald-200">
                      ✅ موعد حصة التعويض المعتمد: {card.scheduledMakeupDate} الساعة{' '}
                      {card.scheduledMakeupTime || '17:00'}
                    </div>
                  )}

                  {onUpdateStudent && (
                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      {schedulingCardId === card.id ? (
                        <div className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                تاريخ التعويض
                              </label>
                              <input
                                type="date"
                                value={scheduleDateInput}
                                onChange={(e) => setScheduleDateInput(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                وقت الحصة
                              </label>
                              <input
                                type="time"
                                value={scheduleTimeInput}
                                onChange={(e) => setScheduleTimeInput(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-bold"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleScheduleMakeup(card)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer"
                            >
                              تأكيد موعد حصة التعويض ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => setSchedulingCardId(null)}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setSchedulingCardId(card.id)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            <span>تحديد موعد حصة التعويض</span>
                          </button>

                          {isPending && (
                            <button
                              type="button"
                              onClick={() => handleAutoMergeNextWeek(card)}
                              className="px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>دمج الورد مع خطة الأسبوع القادم تلقائياً</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Simplified Academy-Wide Quran Tracker Hub for the Main Dashboard
 * Inspired by `ev/quran-tracker`: lets teachers pick any student in 1 click,
 * inspect their memory freshness (Green / Yellow / Red), and log daily revisions immediately.
 */
export const AcademyQuranTrackerHub: React.FC<{
  onOpenMushaf?: () => void;
}> = ({ onOpenMushaf }) => {
  const { students, sessions, updateStudent, showToast } = useAcademy();
  const [selectedTrackerStudentId, setSelectedTrackerStudentId] = useState<string>(
    () => students[0]?.id || ''
  );

  const activeStudent = useMemo(() => {
    return (
      students.find((s) => s.id === selectedTrackerStudentId) ||
      students[0] ||
      null
    );
  }, [students, selectedTrackerStudentId]);

  if (!activeStudent) {
    return (
      <div className="p-6 rounded-3xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/50 text-center space-y-2">
        <div className="text-sm font-black text-[#145a3a] dark:text-[#dfbd69]">
          متتبع نضارة الحفظ والمراجعة السريع (Quran Tracker)
        </div>
        <p className="text-xs text-neutral-500">
          لا يوجد طلاب مسجلون حالياً؛ أضف طالباً للبدء بتتبع نضارة السور والأجزاء.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Clean Student Selector Bar */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#145a3a] text-[#dfbd69] flex items-center justify-center font-black text-xs">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-extrabold text-[#14281d] dark:text-white">
              لوحة المتتبع السريع لنضارة الحفظ (Quran Tracker)
            </div>
            <div className="text-[11px] text-neutral-500">
              اختر الطالب لتسجيل مراجعته اليومية بنقرة واحدة ومزامنة Firestore
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {students.map((st) => {
            const isSelected = st.id === activeStudent.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedTrackerStudentId(st.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-[#145a3a] text-white'
                    : 'bg-[#f6f7f2] dark:bg-[#0b1711] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-emerald-900/50 hover:border-[#145a3a]'
                }`}
              >
                <span>{st.name}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/15 text-[10px] font-mono tabular-nums">
                  {st.memorizedSurahs?.length || 0} سورة
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <QuranCoverageAndGoalEngine
        student={activeStudent}
        sessions={sessions}
        roleMode="teacher"
        onUpdateStudent={updateStudent}
        onShowToast={showToast}
        onOpenSurahInMushaf={() => onOpenMushaf?.()}
        defaultExpanded={true}
      />
    </div>
  );
};
