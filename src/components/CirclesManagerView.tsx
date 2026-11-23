import React, { useMemo, useState } from 'react';
import { useAcademy } from '../context/AcademyContext';
import { DAY_NAMES, SURAHS } from '../data/quranData';
import { getLocalDateString } from '../data/seedData';
import {
  computeStudentGamification,
  MUTASHABIHAT_DB,
} from '../data/smartSuiteData';
import {
  AttendanceStatus,
  CircleGroup,
  GradeType,
  SeasonalModeType,
  Student,
} from '../types';
import { formatGregorianAndHijri } from '../utils/dateUtils';
import { SEASONAL_PROGRAM_PRESETS } from '../data/educationalInnovationsData';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import { OFFICIAL_ACADEMY_WHATSAPP } from '../data/hybridFoundationData';
import { ScheduleBoard } from './ScheduleBoard';
import {
  AlertTriangle,
  ArrowLeftRight,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  Flame,
  Layers,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trophy,
  Trash2,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';

type MosqueQueueStatus = 'waiting' | 'completed' | 'retry';

interface PeerPair {
  id: string;
  studentAId: string;
  studentBId?: string;
  completed: boolean;
  focusSurah: string;
}

interface CircleStudentLessonDraft {
  status: AttendanceStatus;
  recitationSurahId: number;
  recitationFromAyah: number;
  recitationToAyah: number;
  recitationGrade: GradeType;
  newMemSurahId: number;
  newMemFromAyah: number;
  newMemToAyah: number;
  nearRevSurahId: number;
  nearRevFromAyah: number;
  nearRevToAyah: number;
  nearRevGrade: GradeType;
  farRevSurahId: number;
  farRevGrade: GradeType;
  parentNotes: string;
}

export const CirclesManagerView: React.FC = () => {
  const {
    circles,
    students,
    sessions,
    settings,
    saveCircle,
    deleteCircle,
    assignStudentToCircle,
    saveSession,
    addDisciplineWarning,
    updateCircleSubstituteAndSeason,
    setSelectedStudentId,
    setActiveTab,
    showToast,
  } = useAcademy();

  const [selectedCircleName, setSelectedCircleName] = useState<string>(
    circles[0]?.name || ''
  );
  const [attendanceDate, setAttendanceDate] = useState<string>(getLocalDateString(0));
  const [activeSubTab, setActiveSubTab] = useState<
    | 'mosqueRapidQueue'
    | 'substituteAndSeasons'
    | 'peerRecitation'
    | 'gamification'
    | 'attendance'
    | 'distribution'
    | 'groupRecitation'
    | 'discipline'
    | 'schedules'
  >('distribution');
  const [fastCircleMode, setFastCircleMode] = useState<boolean>(true);
  const [circleFocusMode, setCircleFocusMode] = useState<boolean>(false);
  const [showAdvancedCircleTools, setShowAdvancedCircleTools] = useState(false);
  const [studentLessonDrafts, setStudentLessonDrafts] = useState<
    Record<string, CircleStudentLessonDraft>
  >({});

  // Quick Active Circles Filter & Search State
  const [circleFilterMode, setCircleFilterMode] = useState<
    'activeOnly' | 'todayOnly' | 'all' | 'paused'
  >('activeOnly');
  const [circleLevelFilter, setCircleLevelFilter] = useState<string>('الكل');
  const [circleSearchQuery, setCircleSearchQuery] = useState<string>('');
  const [distSearchQuery, setDistSearchQuery] = useState<string>('');
  const [distActiveStudentsOnly, setDistActiveStudentsOnly] = useState<boolean>(true);

  // Mosque Rapid Queue State
  const [queueFilter, setQueueFilter] = useState<'all' | MosqueQueueStatus>('all');
  const [manualQueueOverrides, setManualQueueOverrides] = useState<
    Record<string, MosqueQueueStatus>
  >({});

  // Peer-to-Peer Recitation Pairs State
  const [peerPairs, setPeerPairs] = useState<PeerPair[]>([]);
  const [pairingStrategy, setPairingStrategy] = useState<'mentor' | 'sameLevel'>('mentor');

  // Collective Khatmah Target State
  const [khatmahTargetDays, setKhatmahTargetDays] = useState<number>(18);

  // Group Recitation State
  const [batchSurahId, setBatchSurahId] = useState<number>(67);
  const [batchFromAyah, setBatchFromAyah] = useState<number>(1);
  const [batchToAyah, setBatchToAyah] = useState<number>(15);
  const [batchGrades, setBatchGrades] = useState<Record<string, GradeType>>({});

  // Discipline Form State
  const [warnStudentId, setWarnStudentId] = useState<string>(students[0]?.id || '');
  const [warnLevel, setWarnLevel] = useState<'تنبيه' | 'إنذار أول' | 'إنذار نهائي'>('تنبيه');
  const [warnReason, setWarnReason] = useState<string>('');

  // Distribution Filter State
  const [distLevelFilter, setDistLevelFilter] = useState<string>('الكل');

  // Create / Edit Circle Modal State
  const [circleModalOpen, setCircleModalOpen] = useState(false);
  const [editingCircleId, setEditingCircleId] = useState<string | undefined>(undefined);
  const [circleName, setCircleName] = useState('');
  const [circleTeacher, setCircleTeacher] = useState(settings.teacherName);
  const [circleLevel, setCircleLevel] = useState('متوسط');
  const [circleDays, setCircleDays] = useState<number[]>([0, 2, 4]);
  const [circleTime, setCircleTime] = useState('17:00');
  const [circleDuration, setCircleDuration] = useState<number>(45);
  const [circleDesc, setCircleDesc] = useState('');
  const [selectedStudentIdsForCircle, setSelectedStudentIdsForCircle] = useState<string[]>([]);

  const effectiveCircleName = useMemo(() => {
    if (circles.some((c) => c.name === selectedCircleName)) {
      return selectedCircleName;
    }
    return circles[0]?.name || '';
  }, [circles, selectedCircleName]);

  const activeCircleObj = useMemo(
    () => circles.find((c) => c.name === effectiveCircleName) || circles[0],
    [circles, effectiveCircleName]
  );

  // Substitute Teacher & Seasonal Mode Local Controls
  const [subTeacherInput, setSubTeacherInput] = useState('');
  const [subNotesInput, setSubNotesInput] = useState('');
  const [customSeasonGoalInput, setCustomSeasonGoalInput] = useState('');

  React.useEffect(() => {
    if (activeCircleObj) {
      setSubTeacherInput(activeCircleObj.substituteTeacherName || '');
      setSubNotesInput(
        activeCircleObj.substituteHandoverNotes ||
          'التركيز على تسميع الحفظ الجديد من موضع التوقف ومراجعة آخر سورة مع ضبط أحكام المدود.'
      );
      setCustomSeasonGoalInput(activeCircleObj.seasonalTargetLabel || '');
    }
  }, [activeCircleObj]);

  const circleStudents = useMemo(() => {
    if (!effectiveCircleName) return students;
    return students.filter((s) => s.circle === effectiveCircleName);
  }, [students, effectiveCircleName]);

  // Compute each student's queue status for today's mosque circle
  const studentQueueStatusMap = useMemo(() => {
    const map: Record<string, MosqueQueueStatus> = {};
    circleStudents.forEach((st) => {
      if (manualQueueOverrides[st.id]) {
        map[st.id] = manualQueueOverrides[st.id];
        return;
      }
      const todaySession = sessions.find(
        (s) => s.studentId === st.id && s.date === attendanceDate
      );
      if (!todaySession || todaySession.status !== 'حضر') {
        map[st.id] = 'waiting';
      } else if (
        todaySession.previousEvaluation?.newGrade === 'إعادة' ||
        todaySession.previousEvaluation?.newGrade === 'ضعيف' ||
        todaySession.masteryScore < 75
      ) {
        map[st.id] = 'retry';
      } else {
        map[st.id] = 'completed';
      }
    });
    return map;
  }, [circleStudents, sessions, attendanceDate, manualQueueOverrides]);

  // Rapid <15s One-Click Recitation Evaluation in Mosque Mode
  const handleRapidMosqueRecitation = (
    studentId: string,
    grade: GradeType,
    queueTarget: MosqueQueueStatus
  ) => {
    const st = students.find((x) => x.id === studentId);
    if (!st) return;
    const existing = sessions.find(
      (s) => s.studentId === studentId && s.date === attendanceDate
    );
    const score =
      grade === 'ممتاز'
        ? 97
        : grade === 'جيد جداً'
        ? 89
        : grade === 'جيد'
        ? 79
        : 65;

    const stopSurah =
      SURAHS.find((s) => s.id === st.currentStop.surahId) || SURAHS[0];
    const nextToAyah = Math.min(stopSurah.ayahs, st.currentStop.ayah + 10);

    saveSession({
      id: existing?.id,
      studentId: st.id,
      date: attendanceDate,
      status: 'حضر',
      masteryScore: score,
      previousEvaluation: { newGrade: grade },
      errors: existing?.errors || [],
      newMemorization: {
        enabled: true,
        surahId: stopSurah.id,
        surahName: stopSurah.name,
        isFullSurah: false,
        fromAyah: st.currentStop.ayah,
        toAyah: nextToAyah,
        direction: 'asc',
        grade,
      },
      juzReview: existing?.juzReview || { enabled: false, items: [], direction: 'desc' },
      surahReview: existing?.surahReview || {
        enabled: false,
        surahNames: [],
        direction: 'desc',
      },
      parentNotes:
        queueTarget === 'retry'
          ? 'يحتاج الطالب إلى تثبيت وإعادة تسميع المقرر في الحلقة.'
          : `أتم التسميع السريع في المسجد بتقدير (${grade}) ونسبة إتقان ${score}%.`,
    });

    setManualQueueOverrides((prev) => ({
      ...prev,
      [studentId]: queueTarget,
    }));
  };

  // Generate Peer-to-Peer Recitation Dyads
  const handleGeneratePeerPairs = () => {
    const list = [...circleStudents];
    if (list.length === 0) return;

    if (pairingStrategy === 'mentor') {
      // Sort advanced first, then pair top with bottom for mentorship
      const rank = { متقدم: 3, متوسط: 2, مبتدئ: 1 };
      list.sort((a, b) => rank[b.level] - rank[a.level]);
      const pairs: PeerPair[] = [];
      let left = 0;
      let right = list.length - 1;
      while (left <= right) {
        if (left === right) {
          pairs.push({
            id: `pair-${Date.now()}-${left}`,
            studentAId: list[left].id,
            completed: false,
            focusSurah: list[left].currentStop.surahName,
          });
        } else {
          pairs.push({
            id: `pair-${Date.now()}-${left}`,
            studentAId: list[left].id,
            studentBId: list[right].id,
            completed: false,
            focusSurah: list[right].currentStop.surahName,
          });
        }
        left++;
        right--;
      }
      setPeerPairs(pairs);
    } else {
      // Same-level sequential pairs
      const rank = { متقدم: 3, متوسط: 2, مبتدئ: 1 };
      list.sort((a, b) => rank[b.level] - rank[a.level]);
      const pairs: PeerPair[] = [];
      for (let i = 0; i < list.length; i += 2) {
        pairs.push({
          id: `pair-${Date.now()}-${i}`,
          studentAId: list[i].id,
          studentBId: list[i + 1]?.id,
          completed: false,
          focusSurah: list[i].currentStop.surahName,
        });
      }
      setPeerPairs(pairs);
    }
    showToast(
      `تم توزيع طلاب ${effectiveCircleName} في ثنائيات للتسميع المتبادل بنجاح`,
      'success'
    );
  };

  // Gamification & Leaderboard Computation
  const circleLeaderboard = useMemo(
    () => computeStudentGamification(circleStudents, sessions),
    [circleStudents, sessions]
  );

  const collectiveKhatmahStats = useMemo(() => {
    const uniqueJuzSet = new Set<number>();
    let totalJuzSum = 0;
    circleStudents.forEach((st) => {
      totalJuzSum += st.memorizedJuz.length;
      st.memorizedJuz.forEach((j) => uniqueJuzSet.add(j));
    });
    const completedKhatmahCount = Math.floor(totalJuzSum / 30);
    const currentKhatmahJuz = totalJuzSum % 30;
    const progressPercent = Math.min(100, Math.round((currentKhatmahJuz / 30) * 100));
    const remainingJuz = 30 - currentKhatmahJuz;
    return {
      totalJuzSum,
      completedKhatmahCount,
      currentKhatmahJuz,
      progressPercent,
      remainingJuz,
      uniqueJuzCovered: uniqueJuzSet.size,
    };
  }, [circleStudents]);

  const batchSurahMutashabihat = useMemo(
    () => MUTASHABIHAT_DB.filter((m) => m.surahId === batchSurahId),
    [batchSurahId]
  );

  const openCreateCircleModal = () => {
    setEditingCircleId(undefined);
    setCircleName('');
    setCircleTeacher(settings.teacherName);
    setCircleLevel('متوسط');
    setCircleDays([0, 2, 4]);
    setCircleTime('17:00');
    setCircleDuration(45);
    setCircleDesc('');
    setSelectedStudentIdsForCircle([]);
    setCircleModalOpen(true);
  };

  const openEditCircleModal = (circle: CircleGroup) => {
    setEditingCircleId(circle.id);
    setCircleName(circle.name);
    setCircleTeacher(circle.teacherName || settings.teacherName);
    setCircleLevel(circle.level);
    setCircleDays(circle.scheduleDays.length > 0 ? circle.scheduleDays : [0, 2, 4]);
    setCircleTime(circle.scheduleTime);
    setCircleDuration(circle.duration || 45);
    setCircleDesc(circle.description);
    setSelectedStudentIdsForCircle(
      students.filter((s) => s.circle === circle.name).map((s) => s.id)
    );
    setCircleModalOpen(true);
  };

  const handleToggleCircleDay = (dayIdx: number) => {
    setCircleDays((prev) =>
      prev.includes(dayIdx)
        ? prev.filter((d) => d !== dayIdx)
        : [...prev, dayIdx].sort((a, b) => a - b)
    );
  };

  const handleToggleStudentInModal = (studentId: string) => {
    setSelectedStudentIdsForCircle((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSaveCircleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!circleName.trim()) return;
    saveCircle(
      {
        id: editingCircleId,
        name: circleName.trim(),
        teacherName: circleTeacher.trim() || settings.teacherName,
        level: circleLevel,
        scheduleDays: circleDays.length > 0 ? circleDays : [0, 2, 4],
        scheduleTime: circleTime,
        duration: Number(circleDuration) || 45,
        description: circleDesc.trim() || 'حلقة تحفيظ وتثبيت قرآني.',
      },
      selectedStudentIdsForCircle
    );
    setSelectedCircleName(circleName.trim());
    setCircleModalOpen(false);
  };

  const handleAutoDistributeByLevel = () => {
    students.forEach((st) => {
      const matchingCircle =
        circles.find((c) => c.level === st.level) || circles[0];
      if (matchingCircle && st.circle !== matchingCircle.name) {
        assignStudentToCircle(st.id, matchingCircle.name);
      }
    });
    showToast(
      'تم توزيع الطلاب تلقائياً على الحلقات الموافقة لمستوياتهم (مبتدئ / متوسط / متقدم)',
      'success'
    );
  };

  const handleMarkAttendance = (studentId: string, status: AttendanceStatus) => {
    const existing = sessions.find(
      (s) => s.studentId === studentId && s.date === attendanceDate
    );
    const st = students.find((x) => x.id === studentId);
    saveSession({
      id: existing?.id,
      studentId,
      date: attendanceDate,
      status,
      masteryScore: status === 'حضر' ? existing?.masteryScore || 92 : 0,
      previousEvaluation: existing?.previousEvaluation || { newGrade: 'ممتاز' },
      errors: existing?.errors || [],
      newMemorization:
        existing?.newMemorization ||
        (st
          ? {
              enabled: true,
              surahId: st.currentStop.surahId,
              surahName: st.currentStop.surahName,
              isFullSurah: false,
              fromAyah: st.currentStop.ayah,
              toAyah: st.currentStop.ayah + 10,
              direction: 'asc',
            }
          : undefined),
      juzReview: existing?.juzReview || { enabled: false, items: [], direction: 'desc' },
      surahReview: existing?.surahReview || {
        enabled: false,
        surahNames: [],
        direction: 'desc',
      },
      parentNotes:
        status === 'حضر'
          ? 'تم تسجيل الحضور في كشف الحلقة اليومي.'
          : 'غاب الطالب؛ تم ترحيل التكليف تلقائياً.',
    });
  };

  const handleMarkAllPresent = () => {
    circleStudents.forEach((st) => handleMarkAttendance(st.id, 'حضر'));
    showToast(`تم تسجيل حضور جميع طلاب ${effectiveCircleName}`, 'success');
  };

  const handleSaveGroupRecitation = () => {
    const surahMeta = SURAHS.find((s) => s.id === batchSurahId) || SURAHS[0];
    circleStudents.forEach((st) => {
      const grade = batchGrades[st.id] || 'ممتاز';
      const score =
        grade === 'ممتاز'
          ? 96
          : grade === 'جيد جداً'
          ? 88
          : grade === 'جيد'
          ? 78
          : 65;

      saveSession({
        studentId: st.id,
        date: attendanceDate,
        status: 'حضر',
        masteryScore: score,
        previousEvaluation: { newGrade: grade },
        errors: [],
        newMemorization: {
          enabled: true,
          surahId: surahMeta.id,
          surahName: surahMeta.name,
          isFullSurah: false,
          fromAyah: batchFromAyah,
          toAyah: batchToAyah,
          direction: 'asc',
          grade,
        },
        juzReview: { enabled: false, items: [], direction: 'desc' },
        surahReview: { enabled: false, surahNames: [], direction: 'desc' },
        parentNotes: `تسميع جماعي في ${effectiveCircleName}: سورة ${surahMeta.name} (${batchFromAyah}-${batchToAyah}) بتقدير ${grade}.`,
      });
    });
    showToast('تم حفظ نتائج التسميع الجماعي لجميع طلاب الحلقة بنجاح', 'success');
  };

  const todayDayIndex = useMemo(() => new Date().getDay(), []);

  const isCircleConsideredActive = (c: CircleGroup) => {
    if (c.isActive === false) return false;
    if (c.isActive === true) return true;
    const activeStCount = students.filter(
      (s) => s.circle === c.name && (s.accountStatus || 'نشط') === 'نشط'
    ).length;
    return activeStCount > 0;
  };

  const handleToggleCircleActive = (c: CircleGroup) => {
    const currentlyActive = isCircleConsideredActive(c);
    saveCircle({
      ...c,
      isActive: !currentlyActive,
    });
  };

  const circleCounts = useMemo(() => {
    let active = 0;
    let todayActive = 0;
    let paused = 0;
    circles.forEach((c) => {
      const act = isCircleConsideredActive(c);
      if (act) {
        active++;
        if ((c.scheduleDays || []).includes(todayDayIndex)) {
          todayActive++;
        }
      } else {
        paused++;
      }
    });
    return { active, todayActive, paused, all: circles.length };
  }, [circles, students, todayDayIndex]);

  const filteredCircles = useMemo(() => {
    return circles.filter((c) => {
      const isAct = isCircleConsideredActive(c);
      if (circleFilterMode === 'activeOnly' && !isAct) return false;
      if (
        circleFilterMode === 'todayOnly' &&
        (!isAct || !(c.scheduleDays || []).includes(todayDayIndex))
      ) {
        return false;
      }
      if (circleFilterMode === 'paused' && isAct) return false;
      if (circleLevelFilter !== 'الكل' && c.level !== circleLevelFilter) return false;
      if (circleSearchQuery.trim()) {
        const q = circleSearchQuery.trim().toLowerCase();
        const cStudents = students.filter((s) => s.circle === c.name);
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesTeacher = (c.teacherName || '').toLowerCase().includes(q);
        const matchesStudent = cStudents.some((s) =>
          s.name.toLowerCase().includes(q)
        );
        if (!matchesName && !matchesTeacher && !matchesStudent) return false;
      }
      return true;
    });
  }, [
    circles,
    students,
    circleFilterMode,
    circleLevelFilter,
    circleSearchQuery,
    todayDayIndex,
  ]);

  const filteredDistributionStudents = useMemo(() => {
    return students.filter((s) => {
      if (distActiveStudentsOnly && (s.accountStatus || 'نشط') !== 'نشط') {
        return false;
      }
      if (distLevelFilter !== 'الكل' && s.level !== distLevelFilter) {
        return false;
      }
      if (distSearchQuery.trim()) {
        const q = distSearchQuery.trim().toLowerCase();
        if (
          !s.name.toLowerCase().includes(q) &&
          !s.circle.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [students, distLevelFilter, distActiveStudentsOnly, distSearchQuery]);

  // Build or retrieve a student's 4-pillar lesson draft (matching SessionEngineView pattern)
  const getStudentLessonDraft = (st: Student): CircleStudentLessonDraft => {
    const existingDraft = studentLessonDrafts[st.id];
    if (existingDraft) return existingDraft;

    const todaySes = sessions.find(
      (s) => s.studentId === st.id && s.date === attendanceDate
    );
    const stopSurah =
      SURAHS.find((s) => s.id === st.currentStop.surahId) || SURAHS[0];
    const recFrom =
      todaySes?.actualRecitation?.fromAyah || st.currentStop.ayah || 1;
    const recTo =
      todaySes?.actualRecitation?.toAyah ||
      Math.min(stopSurah.ayahs, recFrom + 6);
    const newFrom =
      todaySes?.newMemorization?.fromAyah ||
      Math.min(stopSurah.ayahs, recTo + 1);
    const newTo =
      todaySes?.newMemorization?.toAyah ||
      Math.min(stopSurah.ayahs, newFrom + 7);
    const nearFrom =
      todaySes?.nearReview?.fromAyah || Math.max(1, recFrom - 10);
    const nearTo = todaySes?.nearReview?.toAyah || recFrom;
    const farSurahId =
      todaySes?.farReview?.surahId ||
      st.memorizedSurahs[st.memorizedSurahs.length - 1] ||
      114;

    return {
      status: todaySes?.status || 'حضر',
      recitationSurahId:
        todaySes?.actualRecitation?.surahId || stopSurah.id,
      recitationFromAyah: recFrom,
      recitationToAyah: recTo,
      recitationGrade:
        todaySes?.actualRecitation?.grade ||
        todaySes?.previousEvaluation?.newGrade ||
        'ممتاز',
      newMemSurahId: todaySes?.newMemorization?.surahId || stopSurah.id,
      newMemFromAyah: newFrom,
      newMemToAyah: newTo,
      nearRevSurahId: todaySes?.nearReview?.surahId || stopSurah.id,
      nearRevFromAyah: nearFrom,
      nearRevToAyah: nearTo,
      nearRevGrade: todaySes?.nearReview?.grade || 'ممتاز',
      farRevSurahId: farSurahId,
      farRevGrade: todaySes?.farReview?.grade || 'ممتاز',
      parentNotes:
        todaySes?.parentNotes ||
        `أتم الطالب حصة الحلقة (${effectiveCircleName}) بنجاح؛ نرجو متابعة تكليف الحفظ الجديد في المنزل.`,
    };
  };

  const updateStudentLessonDraft = (
    st: Student,
    patch: Partial<CircleStudentLessonDraft>
  ) => {
    setStudentLessonDrafts((prev) => ({
      ...prev,
      [st.id]: {
        ...getStudentLessonDraft(st),
        ...patch,
      },
    }));
  };

  const handleSaveStudentCircleLesson = (
    st: Student,
    openWhatsApp?: boolean
  ) => {
    const draft = getStudentLessonDraft(st);
    const existing = sessions.find(
      (s) => s.studentId === st.id && s.date === attendanceDate
    );
    const recSurah =
      SURAHS.find((s) => s.id === draft.recitationSurahId) || SURAHS[0];
    const newSurah =
      SURAHS.find((s) => s.id === draft.newMemSurahId) || SURAHS[0];
    const nearSurah =
      SURAHS.find((s) => s.id === draft.nearRevSurahId) || SURAHS[0];
    const farSurah =
      SURAHS.find((s) => s.id === draft.farRevSurahId) || SURAHS[0];

    const score =
      draft.status !== 'حضر'
        ? 0
        : draft.recitationGrade === 'ممتاز'
        ? 97
        : draft.recitationGrade === 'جيد جداً'
        ? 89
        : draft.recitationGrade === 'جيد'
        ? 79
        : 65;

    saveSession({
      id: existing?.id,
      studentId: st.id,
      date: attendanceDate,
      status: draft.status,
      masteryScore: score,
      previousEvaluation: {
        newGrade: draft.recitationGrade,
        nearGrade: draft.nearRevGrade,
        farGrade: draft.farRevGrade,
      },
      errors: existing?.errors || [],
      actualRecitation: {
        enabled: true,
        surahId: recSurah.id,
        surahName: recSurah.name,
        isFullSurah: false,
        fromAyah: draft.recitationFromAyah,
        toAyah: draft.recitationToAyah,
        direction: 'asc',
        grade: draft.recitationGrade,
      },
      newMemorization: {
        enabled: true,
        surahId: newSurah.id,
        surahName: newSurah.name,
        isFullSurah: false,
        fromAyah: draft.newMemFromAyah,
        toAyah: draft.newMemToAyah,
        direction: 'asc',
        grade: draft.recitationGrade,
      },
      nearReview: {
        enabled: true,
        surahId: nearSurah.id,
        surahName: nearSurah.name,
        isFullSurah: false,
        fromAyah: draft.nearRevFromAyah,
        toAyah: draft.nearRevToAyah,
        direction: 'asc',
        grade: draft.nearRevGrade,
      },
      farReview: {
        enabled: true,
        surahId: farSurah.id,
        surahName: farSurah.name,
        isFullSurah: true,
        fromAyah: 1,
        toAyah: farSurah.ayahs,
        direction: 'asc',
        grade: draft.farRevGrade,
      },
      juzReview: existing?.juzReview || {
        enabled: false,
        items: [],
        direction: 'desc',
      },
      surahReview: existing?.surahReview || {
        enabled: false,
        surahNames: [],
        direction: 'desc',
      },
      parentNotes: draft.parentNotes,
    });

    if (openWhatsApp && st.whatsappPhone) {
      const msg = `${settings.whatsappHeader}\n\n📋 *تقرير حصة الحلقة القرآنية (${effectiveCircleName})*\n👤 الطالب: *${st.name}*\n📅 التاريخ: ${formatGregorianAndHijri(
        attendanceDate,
        settings.showHijriDates ?? true
      )}\n📌 الحالة: *${draft.status}* (نسبة الإتقان: ${score}%)\n\n١) *التسميع الفعلي*: سورة ${recSurah.name} (${draft.recitationFromAyah} - ${draft.recitationToAyah}) — التقدير: *${draft.recitationGrade}*\n٢) *تكليف الحفظ الجديد*: سورة ${newSurah.name} (${draft.newMemFromAyah} - ${draft.newMemToAyah})\n٣) *المراجعة القريبة*: سورة ${nearSurah.name} (${draft.nearRevFromAyah} - ${draft.nearRevToAyah}) — *${draft.nearRevGrade}*\n٤) *المراجعة البعيدة*: سورة ${farSurah.name} — *${draft.farRevGrade}*\n\n💬 *ملاحظة المعلم*: ${draft.parentNotes}\n\n${settings.whatsappFooter}`;
      const url = buildWhatsAppUrl(st.whatsappPhone, msg);
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }
  };

  const handleSaveAllCircleLessons = () => {
    const activeInCircle = circleStudents.filter(
      (s) => (s.accountStatus || 'نشط') === 'نشط'
    );
    activeInCircle.forEach((st) => handleSaveStudentCircleLesson(st, false));
    showToast(
      `تم حفظ واعتماد حصص جميع طلاب «${effectiveCircleName}» (${activeInCircle.length} طلاب) بنجاح`,
      'success'
    );
  };

  // 1-Click Focus Mode Evaluation: ممتاز / جيد / بحاجة لمراجعة
  const handleQuickFocusEvaluation = (
    st: Student,
    evalType: 'ممتاز' | 'جيد' | 'بحاجة لمراجعة'
  ) => {
    const mappedGrade: GradeType =
      evalType === 'ممتاز'
        ? 'ممتاز'
        : evalType === 'جيد'
        ? 'جيد'
        : 'إعادة';
    const queueTarget: MosqueQueueStatus =
      evalType === 'بحاجة لمراجعة' ? 'retry' : 'completed';

    updateStudentLessonDraft(st, {
      status: 'حضر',
      recitationGrade: mappedGrade,
      parentNotes:
        evalType === 'بحاجة لمراجعة'
          ? 'بحاجة لمراجعة وتثبيت المقرر قبل الانتقال للجديد.'
          : `أتم التسميع في الحلقة بتقدير (${evalType}).`,
    });

    handleRapidMosqueRecitation(st.id, mappedGrade, queueTarget);
  };

  return (
    <div className="space-y-6">
      {/* ⚡ Quiet Fast-Path Bar & Segmented Mode Switcher (Exact Same Pattern as SessionEngineView) */}
      <div className="no-print rounded-2xl bg-[#fcfaf2] dark:bg-[#0d1d15] px-4 py-3 border border-[#c59b27]/50 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-[#145a3a] text-[#dfbd69] font-black text-[11px]">
            ⚡ مسار الحلقة السريع (نفس نمط الحصة)
          </span>
          {(
            [
              {
                step: '1',
                label: 'اختيار الحلقة النشطة',
                done: Boolean(effectiveCircleName),
                targetId: 'circle-selector-cards-zone',
              },
              {
                step: '2',
                label: 'الحضور والتسميع الفعلي',
                done: circleStudents.some((st) =>
                  sessions.some(
                    (s) => s.studentId === st.id && s.date === attendanceDate
                  )
                ),
                targetId: 'circle-session-cards-zone',
              },
              {
                step: '3',
                label: 'الحفظ الجديد والمراجعة',
                done: circleStudents.some((st) =>
                  sessions.some(
                    (s) =>
                      s.studentId === st.id &&
                      s.date === attendanceDate &&
                      s.newMemorization?.enabled
                  )
                ),
                targetId: 'circle-session-cards-zone',
              },
              {
                step: '4',
                label: 'الملاحظات والحفظ / واتساب',
                done:
                  circleStudents.length > 0 &&
                  circleStudents.every((st) =>
                    sessions.some(
                      (s) => s.studentId === st.id && s.date === attendanceDate
                    )
                  ),
                targetId: 'circle-batch-save-footer',
              },
            ] as const
          ).map((item, idx) => (
            <React.Fragment key={item.step}>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById(item.targetId);
                  if (el)
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className={`px-2.5 py-1 rounded-lg font-extrabold text-[11px] flex items-center gap-1 cursor-pointer transition ${
                  item.done
                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-[#145a3a] dark:text-emerald-300 border border-emerald-400/50'
                    : 'bg-white dark:bg-[#12231a] text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-emerald-900'
                }`}
              >
                <span className="font-mono">{item.step}.</span>
                <span>{item.label}</span>
                {item.done && <span>✓</span>}
              </button>
              {idx < 3 && (
                <span className="text-neutral-400 dark:text-emerald-700 font-bold text-[10px]">
                  ←
                </span>
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-extrabold shrink-0">
          {/* زر تبديل وضع التركيز (Focus Mode Toggle) */}
          <button
            type="button"
            role="switch"
            aria-checked={circleFocusMode}
            onClick={() => setCircleFocusMode((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-black border-2 flex items-center gap-1.5 cursor-pointer transition-all ${
              circleFocusMode
                ? 'bg-gradient-to-l from-[#145a3a] to-emerald-700 text-white border-[#c59b27] shadow-sm ring-2 ring-[#c59b27]/30'
                : 'bg-white dark:bg-[#12231a] border-[#c59b27]/60 text-[#145a3a] dark:text-[#dfbd69] hover:border-[#145a3a]'
            }`}
            title="تفعيل وضع التركيز: إخفاء تفاصيل الطلاب الجانبية وإظهار أسماء الطلاب فقط مع زر سريع لتقييم حفظهم (ممتاز / جيد / بحاجة لمراجعة)"
          >
            <span>🎯 وضع التركيز</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                circleFocusMode
                  ? 'bg-[#c59b27] text-[#14281d]'
                  : 'bg-neutral-100 dark:bg-emerald-950 text-neutral-500'
              }`}
            >
              {circleFocusMode ? 'مفعّل' : 'إيقاف'}
            </span>
          </button>

          <div className="inline-flex items-center p-0.5 rounded-xl bg-white dark:bg-[#12231a] border border-[#c59b27]/60">
            <button
              type="button"
              onClick={() => {
                setFastCircleMode(true);
                setActiveSubTab('distribution');
              }}
              className={`px-3 py-1 rounded-lg text-[11px] font-black cursor-pointer transition ${
                fastCircleMode
                  ? 'bg-[#145a3a] text-[#dfbd69] shadow-2xs'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              ⚡ الواجهة المبسطة
            </button>
            <button
              type="button"
              onClick={() => setFastCircleMode(false)}
              className={`px-3 py-1 rounded-lg text-[11px] font-black cursor-pointer transition ${
                !fastCircleMode
                  ? 'bg-[#c59b27] text-[#14281d] shadow-2xs'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              🎛️ الأدوات المتقدمة
            </button>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/30 text-[#145a3a] dark:text-[#dfbd69]">
            🕌 {effectiveCircleName || 'الحلقات'}
          </span>
        </div>
      </div>

      {/* Header & Circle Selector */}
      <div className="rounded-3xl bg-white dark:bg-[#12231a] p-5 border border-neutral-200 dark:border-emerald-900/50 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-[#145a3a] dark:text-[#dfbd69] flex items-center gap-2">
            <Users className="w-5 h-5" />
            <span>إدارة الحلقات وحصص الطلاب (بنفس نمط الحصة المبسط)</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            اختر الحلقة النشطة من الكروت، وسجّل لطلابها (الحضور، التسميع الفعلي، الحفظ الجديد، المراجعة القريبة والبعيدة، وواتساب) في شاشة واحدة هادئة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={effectiveCircleName}
            onChange={(e) => setSelectedCircleName(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-extrabold"
          >
            {circles.map((c) => {
              const count = students.filter((s) => s.circle === c.name).length;
              return (
                <option key={c.id} value={c.name}>
                  {c.name} ({count} طلاب)
                </option>
              );
            })}
          </select>

          <input
            type="date"
            value={attendanceDate}
            onChange={(e) => setAttendanceDate(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono tabular-nums"
          />

          <button
            type="button"
            onClick={() => setActiveSubTab('schedules')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/50 text-[#145a3a] dark:text-[#dfbd69] text-xs font-extrabold cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-[#c59b27]" />
            <span>🗓️ لوحة الجدولة (ScheduleBoard)</span>
          </button>

          <button
            type="button"
            onClick={openCreateCircleModal}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#145a3a] text-white text-xs font-bold hover:bg-[#0f452c] cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#dfbd69]" />
            <span>إنشاء حلقة / مجموعة جديدة</span>
          </button>
        </div>
      </div>

      {/* Active Seasonal / Substitute Status Banner */}
      {activeCircleObj &&
        (activeCircleObj.substituteActive ||
          (activeCircleObj.seasonalMode && activeCircleObj.seasonalMode !== 'عادي')) && (
          <div className="rounded-2xl bg-gradient-to-l from-[#145a3a] to-[#0f452c] text-white p-4 border border-[#c59b27]/60 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {activeCircleObj.substituteActive && (
                <span className="px-3 py-1 rounded-xl bg-amber-400 text-[#14281d] font-extrabold">
                  🔄 المعلم البديل النشط: {activeCircleObj.substituteTeacherName || 'معلم مناوب'}
                </span>
              )}
              {activeCircleObj.seasonalMode &&
                activeCircleObj.seasonalMode !== 'عادي' && (
                  <span className="px-3 py-1 rounded-xl bg-white/15 border border-[#dfbd69]/50 text-[#dfbd69] font-extrabold">
                    🌙 وضع الموسم النشط: {activeCircleObj.seasonalMode} (مع الحفاظ التام على خطة كل طالب الأصلية)
                  </span>
                )}
            </div>
            <button
              type="button"
              onClick={() => setActiveSubTab('substituteAndSeasons')}
              className="px-3.5 py-1.5 rounded-xl bg-[#c59b27] text-[#14281d] text-xs font-extrabold cursor-pointer"
            >
              عرض بطاقة تسليم الحلقة وإعدادات الموسم ←
            </button>
          </div>
        )}

      {/* Simplified Sub-navigation Tabs (Shown only when Advanced Tools mode is active) */}
      {!fastCircleMode && (
        <div className="rounded-2xl bg-white dark:bg-[#12231a] p-3 border border-neutral-200 dark:border-emerald-900/50 shadow-2xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'distribution', label: '🕌 بطاقات الحلقات وتوزيع الطلاب' },
                { id: 'mosqueRapidQueue', label: '⚡ التسميع الميداني السريع' },
                { id: 'attendance', label: '📋 كشف الحضور اليومي' },
                { id: 'schedules', label: '🗓️ لوحة الجدولة (ScheduleBoard)' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveSubTab(t.id as typeof activeSubTab)}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    activeSubTab === t.id
                      ? 'bg-[#145a3a] text-white shadow-xs'
                      : 'bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-900/50 text-neutral-700 dark:text-neutral-200 hover:border-[#145a3a]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedCircleTools((p) => !p)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                showAdvancedCircleTools ||
                [
                  'substituteAndSeasons',
                  'peerRecitation',
                  'gamification',
                  'groupRecitation',
                  'discipline',
                ].includes(activeSubTab)
                  ? 'bg-[#c59b27] text-[#14281d] border-[#c59b27]'
                  : 'bg-[#fcfaf2] dark:bg-[#0b1711] border-[#c59b27]/40 text-[#145a3a] dark:text-[#dfbd69]'
              }`}
            >
              {showAdvancedCircleTools
                ? '⚡ إخفاء الأدوات الإضافية'
                : '🎛️ أدوات الحلقة الإضافية (5)'}
            </button>
          </div>

          {(showAdvancedCircleTools ||
            [
              'substituteAndSeasons',
              'peerRecitation',
              'gamification',
              'groupRecitation',
              'discipline',
            ].includes(activeSubTab)) && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-100 dark:border-emerald-900/40">
              {[
                { id: 'groupRecitation', label: '📖 التسميع الجماعي والمتشابهات' },
                { id: 'peerRecitation', label: '🤝 التسميع بالأقران (الثنائيات)' },
                {
                  id: 'substituteAndSeasons',
                  label: '🔄 المعلم البديل والمواسم المكثفة',
                },
                { id: 'gamification', label: '🏆 فرسان القرآن وعداد الختمة' },
                { id: 'discipline', label: '🛡️ متابعة الانضباط' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveSubTab(t.id as typeof activeSubTab)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeSubTab === t.id
                      ? 'bg-[#145a3a] text-[#dfbd69] shadow-xs'
                      : 'bg-neutral-100 dark:bg-[#0b1711] text-neutral-600 dark:text-neutral-300 hover:text-[#145a3a]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* NEW Tab: Substitute Teacher Handover Card & Seasonal Intensive Modes */}
      {activeSubTab === 'substituteAndSeasons' && activeCircleObj && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 5 cols: Substitute Assignment & Seasonal Mode Selector */}
            <div className="lg:col-span-5 space-y-5">
              {/* Substitute Teacher Assignment Box */}
              <div className="rounded-3xl bg-white dark:bg-[#12231a] p-5 border border-neutral-200 dark:border-emerald-900/50 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                      🔄 نظام «المعلم البديل» للحلقة
                    </h3>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      تكليف معلم بديل مؤقت عند غياب الشيخ مع توليد بطاقة تسليم فورية
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold ${
                      activeCircleObj.substituteActive
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-neutral-100 text-neutral-500 dark:bg-emerald-950'
                    }`}
                  >
                    {activeCircleObj.substituteActive ? 'مُفعّل حالياً' : 'غير مفعل'}
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">
                      اسم المعلم البديل المكلف بالحلقة
                    </label>
                    <input
                      type="text"
                      value={subTeacherInput}
                      onChange={(e) => setSubTeacherInput(e.target.value)}
                      placeholder="مثال: الشيخ عبد الرحمن محمود (معلم مناوب)"
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1">
                      توجيهات الشيخ للمعلم البديل (تظهر في بطاقة التسليم)
                    </label>
                    <textarea
                      rows={2}
                      value={subNotesInput}
                      onChange={(e) => setSubNotesInput(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateCircleSubstituteAndSeason(activeCircleObj.id, {
                          substituteTeacherName:
                            subTeacherInput.trim() || 'الشيخ المناوب بالحلقة',
                          substituteActive: true,
                          substituteHandoverNotes: subNotesInput.trim(),
                        })
                      }
                      className="flex-1 py-2.5 px-3 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold cursor-pointer"
                    >
                      ✅ تفعيل المعلم البديل وتوليد بطاقة التسليم
                    </button>
                    {activeCircleObj.substituteActive && (
                      <button
                        type="button"
                        onClick={() =>
                          updateCircleSubstituteAndSeason(activeCircleObj.id, {
                            substituteActive: false,
                          })
                        }
                        className="py-2.5 px-3 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-xs font-extrabold cursor-pointer"
                      >
                        إنهاء التكليف
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Seasonal & Intensive Modes Box */}
              <div className="rounded-3xl bg-white dark:bg-[#12231a] p-5 border border-neutral-200 dark:border-emerald-900/50 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                    🌙 أوضاع المواسم والدورات المكثفة
                  </h3>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    تبديل الحلقة لوضع موسمي مؤقت (رمضان / الصيف / عشر ذي الحجة) دون المساس بخطة الطالب الأصلية
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {SEASONAL_PROGRAM_PRESETS.map((preset) => {
                    const isSelected =
                      (activeCircleObj.seasonalMode || 'عادي') === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          updateCircleSubstituteAndSeason(activeCircleObj.id, {
                            seasonalMode: preset.id as SeasonalModeType,
                            seasonalTargetLabel:
                              customSeasonGoalInput.trim() || preset.dailyTargetRecommendation,
                          })
                        }
                        className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#145a3a] text-white border-[#145a3a] shadow-xs'
                            : 'bg-[#f6f7f2] dark:bg-[#0b1711] border-neutral-200 dark:border-emerald-900/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold">{preset.title}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              isSelected
                                ? 'bg-[#c59b27] text-[#14281d]'
                                : 'bg-white dark:bg-[#12231a] text-[#145a3a] dark:text-[#dfbd69]'
                            }`}
                          >
                            {preset.badge}
                          </span>
                        </div>
                        <p
                          className={`text-[11px] mt-1 ${
                            isSelected ? 'text-emerald-100' : 'text-neutral-500'
                          }`}
                        >
                          {preset.description}
                        </p>
                        <div
                          className={`text-[10px] font-bold mt-1 ${
                            isSelected ? 'text-[#dfbd69]' : 'text-[#145a3a] dark:text-[#dfbd69]'
                          }`}
                        >
                          🎯 المقرر المقترح: {preset.dailyTargetRecommendation}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right 7 cols: Instant Substitute Handover Card (بطاقة تسليم الحلقة السريعة) */}
            <div className="lg:col-span-7">
              <div className="rounded-3xl bg-[#fcfaf2] dark:bg-[#12231a] p-6 border-2 border-[#c59b27]/60 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#c59b27]/30">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#145a3a] text-[#dfbd69] text-[10px] font-extrabold mb-1">
                      <span>بطاقة تسليم الحلقة الفورية (Substitute Handover Card)</span>
                    </div>
                    <h3 className="text-base font-extrabold text-[#14281d] dark:text-white">
                      {effectiveCircleName} — المعلم الأصلي: {activeCircleObj.teacherName}
                    </h3>
                    <p className="text-xs text-neutral-500">
                      المعلم البديل:{' '}
                      <strong className="text-[#145a3a] dark:text-[#dfbd69]">
                        {activeCircleObj.substituteTeacherName || subTeacherInput || 'غير محدد بعد'}
                      </strong>{' '}
                      • وضع الحلقة:{' '}
                      <strong className="text-amber-700 dark:text-amber-300">
                        {activeCircleObj.seasonalMode || 'عادي'}
                      </strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={buildWhatsAppUrl(
                        OFFICIAL_ACADEMY_WHATSAPP,
                        `📋 *بطاقة تسليم حلقة (${effectiveCircleName}) للمعلم البديل*\n• المعلم الأصلي: ${activeCircleObj.teacherName}\n• المعلم البديل: ${
                          activeCircleObj.substituteTeacherName || subTeacherInput || 'معلم مناوب'
                        }\n• وضع الموسم: ${activeCircleObj.seasonalMode || 'عادي'}\n• توجيهات الحلقة: ${subNotesInput}\n\n*بيان مواضع توقف الطلاب وأخطاء المتابعة المفتوحة:*\n${circleStudents
                          .map((st, idx) => {
                            const stErrs = sessions
                              .filter((s) => s.studentId === st.id)
                              .flatMap((s) => s.errors || [])
                              .slice(0, 2);
                            const errSummary =
                              stErrs.length > 0
                                ? stErrs
                                    .map((e) => `${e.type}${e.word ? ` (${e.word})` : ''}`)
                                    .join(' + ')
                                : 'لا توجد أخطاء متابعة مفتوحة';
                            return `${idx + 1}. *${st.name}* — توقف: سورة ${
                              st.currentStop.surahName
                            } آية ${st.currentStop.ayah} | أخطاء المتابعة: ${errSummary} | ملاحظة: ${
                              st.notes || 'منتظم'
                            }`;
                          })
                          .join('\n')}\n\n📞 واتساب الأكاديمية الرسمي: ${OFFICIAL_ACADEMY_WHATSAPP}`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                    >
                      📲 إرسال بطاقة التسليم عبر واتساب
                    </a>
                  </div>
                </div>

                {subNotesInput && (
                  <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300/60 text-xs text-amber-900 dark:text-amber-200">
                    <strong>📌 توجيهات الشيخ للمعلم البديل:</strong> {subNotesInput}
                  </div>
                )}

                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  {circleStudents.map((st, idx) => {
                    const stSessions = sessions
                      .filter((s) => s.studentId === st.id)
                      .sort((a, b) => b.date.localeCompare(a.date));
                    const openErrors = stSessions
                      .flatMap((s) => s.errors || [])
                      .slice(0, 3);

                    return (
                      <div
                        key={st.id}
                        className="p-4 rounded-2xl bg-white dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-[#145a3a] text-[#dfbd69] text-xs font-mono font-extrabold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-sm font-extrabold text-[#14281d] dark:text-white">
                              {st.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-[#145a3a]/10 dark:bg-emerald-950 text-[#145a3a] dark:text-[#dfbd69] text-[10px] font-extrabold">
                              خطة أصلية: {st.plan} ({st.level})
                            </span>
                          </div>

                          <div className="text-xs font-bold text-[#145a3a] dark:text-[#dfbd69]">
                            📍 أين توقف الطالب: سورة {st.currentStop.surahName} — الآية{' '}
                            {st.currentStop.ayah} (الجزء {st.currentStop.juzNumber}) • الربط:{' '}
                            {st.linkLogic}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="font-bold text-neutral-500">
                              أخطاء المتابعة المفتوحة:
                            </span>
                            {openErrors.length > 0 ? (
                              openErrors.map((err) => (
                                <span
                                  key={err.id}
                                  className="px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 font-bold"
                                >
                                  {err.type}
                                  {err.word ? ` ﴿${err.word}﴾` : ''}
                                  {err.surah ? ` (${err.surah}:${err.ayah || ''})` : ''}
                                </span>
                              ))
                            ) : (
                              <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                                ✓ لا توجد أخطاء متراكمة
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-neutral-500">
                            💡 <strong>ملاحظات التعامل التربوي:</strong>{' '}
                            {st.notes || 'يحب التشجيع الصوتي والبدء بمراجعة آخر آيتين.'}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStudentId(st.id);
                            setActiveTab('session');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold cursor-pointer shrink-0"
                        >
                          بدء الحصة كمعلم بديل ←
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW Tab A: Rapid Circle Queue & Multi-Student Grid (وضع الحلقة الجماعية السريع في المسجد) */}
      {activeSubTab === 'mosqueRapidQueue' && (
        <div className="space-y-5">
          {/* Queue Summary Bar */}
          <div className="rounded-3xl bg-white dark:bg-[#12231a] p-5 border border-neutral-200 dark:border-emerald-900/50 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#145a3a] text-[#dfbd69] flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#14281d] dark:text-white">
                  شبكة التسميع الميداني السريع — {effectiveCircleName}
                </h3>
                <p className="text-xs text-neutral-500">
                  سجّل تسميع الطالب وانتقل للتالي في أقل من 15 ثانية بضغطة زر واحدة مع متابعة صف الانتظار الذكي
                </p>
              </div>
            </div>

            {/* Smart Queue Filter Pills + Focus Mode Toggle */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={circleFocusMode}
                onClick={() => setCircleFocusMode((p) => !p)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border-2 transition-all cursor-pointer ${
                  circleFocusMode
                    ? 'bg-[#145a3a] text-[#dfbd69] border-[#c59b27] shadow-xs'
                    : 'bg-[#fcfaf2] dark:bg-[#0b1711] text-[#145a3a] dark:text-[#dfbd69] border-[#c59b27]/50'
                }`}
              >
                {circleFocusMode ? '🎯 وضع التركيز: مفعّل' : '🎯 تفعيل وضع التركيز'}
              </button>
              {[
                {
                  id: 'all',
                  label: `الكل (${circleStudents.length})`,
                  badgeClass: 'bg-neutral-100 dark:bg-emerald-950 text-neutral-700 dark:text-neutral-200',
                },
                {
                  id: 'waiting',
                  label: `ينتظر التسميع (${
                    circleStudents.filter((s) => studentQueueStatusMap[s.id] === 'waiting').length
                  })`,
                  badgeClass: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
                },
                {
                  id: 'completed',
                  label: `سَمّع وأتقن (${
                    circleStudents.filter((s) => studentQueueStatusMap[s.id] === 'completed').length
                  })`,
                  badgeClass: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
                },
                {
                  id: 'retry',
                  label: `يعيد التسميع (${
                    circleStudents.filter((s) => studentQueueStatusMap[s.id] === 'retry').length
                  })`,
                  badgeClass: 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300',
                },
              ].map((flt) => (
                <button
                  key={flt.id}
                  type="button"
                  onClick={() => setQueueFilter(flt.id as typeof queueFilter)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                    queueFilter === flt.id
                      ? 'bg-[#145a3a] text-white border-[#145a3a]'
                      : `${flt.badgeClass} border-neutral-200 dark:border-emerald-900/50`
                  }`}
                >
                  {flt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-Student Rapid Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {circleStudents
              .filter(
                (st) =>
                  queueFilter === 'all' || studentQueueStatusMap[st.id] === queueFilter
              )
              .map((st, idx) => {
                const qStatus = studentQueueStatusMap[st.id];
                const todaySes = sessions.find(
                  (s) => s.studentId === st.id && s.date === attendanceDate
                );
                const savedGrade = todaySes?.previousEvaluation?.newGrade;
                const surahAlerts = MUTASHABIHAT_DB.filter(
                  (m) => m.surahId === st.currentStop.surahId
                );

                if (circleFocusMode) {
                  return (
                    <div
                      key={st.id}
                      className={`rounded-2xl bg-white dark:bg-[#12231a] p-4 border transition-all flex items-center justify-between gap-3 shadow-2xs ${
                        qStatus === 'completed'
                          ? 'border-emerald-500/60 dark:border-emerald-700'
                          : qStatus === 'retry'
                          ? 'border-amber-500/70 dark:border-amber-700'
                          : 'border-neutral-200 dark:border-emerald-900/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-[#145a3a]/10 dark:bg-emerald-950 text-[#145a3a] dark:text-[#dfbd69] font-mono text-xs font-extrabold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <h4 className="text-sm font-extrabold text-[#14281d] dark:text-white truncate">
                          {st.name}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleQuickFocusEvaluation(st, 'ممتاز')}
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold cursor-pointer transition-colors ${
                            todaySes && savedGrade === 'ممتاز'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-600 hover:text-white text-emerald-800 dark:text-emerald-300 border border-emerald-400/40'
                          }`}
                        >
                          ممتاز
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickFocusEvaluation(st, 'جيد')}
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold cursor-pointer transition-colors ${
                            todaySes && (savedGrade === 'جيد' || savedGrade === 'جيد جداً')
                              ? 'bg-[#145a3a] text-white shadow-xs'
                              : 'bg-[#f6f7f2] dark:bg-[#0b1711] hover:bg-[#145a3a] hover:text-white text-[#145a3a] dark:text-[#dfbd69] border border-neutral-200 dark:border-emerald-800'
                          }`}
                        >
                          جيد
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickFocusEvaluation(st, 'بحاجة لمراجعة')}
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold cursor-pointer transition-colors ${
                            todaySes && (savedGrade === 'إعادة' || savedGrade === 'ضعيف')
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-600 hover:text-white text-amber-800 dark:text-amber-300 border border-amber-400/40'
                          }`}
                        >
                          بحاجة لمراجعة
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={st.id}
                    className={`rounded-3xl bg-white dark:bg-[#12231a] p-5 border transition-all flex flex-col justify-between gap-4 shadow-xs ${
                      qStatus === 'completed'
                        ? 'border-emerald-500/60 dark:border-emerald-700'
                        : qStatus === 'retry'
                        ? 'border-red-400/70 dark:border-red-800'
                        : 'border-neutral-200 dark:border-emerald-900/50'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-xl bg-[#145a3a]/10 dark:bg-emerald-950 text-[#145a3a] dark:text-[#dfbd69] font-mono text-xs font-extrabold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div>
                            <h4 className="text-sm font-extrabold text-[#14281d] dark:text-white">
                              {st.name}
                            </h4>
                            <span className="text-[11px] text-neutral-500">
                              المستوى: {st.level} · المحفوظ: {st.memorizedJuz.length} جزء
                            </span>
                          </div>
                        </div>

                        {/* Queue Status Badge */}
                        <span
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold ${
                            qStatus === 'completed'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                              : qStatus === 'retry'
                              ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {qStatus === 'completed'
                            ? '✓ سَمّع'
                            : qStatus === 'retry'
                            ? '↻ يعيد التسميع'
                            : '⏳ ينتظر'}
                        </span>
                      </div>

                      {/* Current Stop & Quick Open in Session Engine / Smart Board */}
                      <div className="p-3 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200/70 dark:border-emerald-900/40 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-500 font-bold">موضع التسميع الحالي:</span>
                          <span className="font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                            سورة {st.currentStop.surahName} (آية {st.currentStop.ayah})
                          </span>
                        </div>
                        {todaySes && (
                          <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                            <span>تقييم اليوم المسجل:</span>
                            <span>
                              {todaySes.previousEvaluation?.newGrade || 'ممتاز'} ({todaySes.masteryScore}%)
                            </span>
                          </div>
                        )}
                        {surahAlerts.length > 0 && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1 pt-1 border-t border-neutral-200/60 dark:border-emerald-900/40">
                            <Sparkles className="w-3 h-3 shrink-0 text-[#c59b27]" />
                            <span>
                              متشابهات السورة: آية ({surahAlerts[0].ayahNumber}) مع {surahAlerts[0].similarSurahName}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 1-Click <15s Grading Buttons */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold text-neutral-400">
                        رصد سريع بضغطة واحدة (&lt;15 ثانية):
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuickFocusEvaluation(st, 'ممتاز')}
                          className="py-2 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold cursor-pointer transition-colors"
                        >
                          ✓ ممتاز
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickFocusEvaluation(st, 'جيد')}
                          className="py-2 px-2 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-[11px] font-extrabold cursor-pointer transition-colors"
                        >
                          ✓ جيد
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickFocusEvaluation(st, 'بحاجة لمراجعة')}
                          className="py-2 px-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-extrabold cursor-pointer transition-colors"
                        >
                          ↻ بحاجة لمراجعة
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStudentId(st.id);
                            setActiveTab('smartboard');
                          }}
                          className="flex-1 py-1.5 rounded-xl bg-[#f6f7f2] dark:bg-[#0b1711] hover:border-[#145a3a] border border-neutral-200 dark:border-emerald-900 text-[11px] font-bold text-[#145a3a] dark:text-[#dfbd69] cursor-pointer"
                        >
                          فتح في سبورة الإمام
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStudentId(st.id);
                            setActiveTab('session');
                          }}
                          className="flex-1 py-1.5 rounded-xl bg-[#f6f7f2] dark:bg-[#0b1711] hover:border-[#145a3a] border border-neutral-200 dark:border-emerald-900 text-[11px] font-bold text-neutral-600 dark:text-neutral-300 cursor-pointer"
                        >
                          محرك الحصة التفصيلي
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* NEW Tab B: Peer-to-Peer Recitation (وضع التسميع بالأقران - الثنائيات) */}
      {activeSubTab === 'peerRecitation' && (
        <div className="rounded-3xl bg-white dark:bg-[#12231a] p-6 border border-neutral-200 dark:border-emerald-900/50 shadow-xs space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-100 dark:border-emerald-950">
            <div>
              <h3 className="text-base font-extrabold text-[#145a3a] dark:text-[#dfbd69] flex items-center gap-2">
                <UserCheck className="w-5 h-5" />
                <span>توزيع التسميع بالأقران (Peer-to-Peer Recitation) — {effectiveCircleName}</span>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                توزيع طلاب الحلقة الحاضرين في ثنائيات للتسميع المتبادل والمراجعة قبل العرض على الشيخ بضغطة زر
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={pairingStrategy}
                onChange={(e) =>
                  setPairingStrategy(e.target.value as 'mentor' | 'sameLevel')
                }
                className="px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
              >
                <option value="mentor">إقران مؤاخاة (متقدم مع مبتدئ/متوسط)</option>
                <option value="sameLevel">إقران متماثل (نفس المستوى الدراسي)</option>
              </select>

              <button
                type="button"
                onClick={handleGeneratePeerPairs}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#dfbd69]" />
                <span>توليد ثنائيات التسميع الآن</span>
              </button>
            </div>
          </div>

          {peerPairs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {peerPairs.map((pair, idx) => {
                const stA = students.find((s) => s.id === pair.studentAId);
                const stB = students.find((s) => s.id === pair.studentBId);
                if (!stA) return null;

                return (
                  <div
                    key={pair.id}
                    className={`p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 ${
                      pair.completed
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/30 border-emerald-500/60'
                        : 'bg-[#f6f7f2]/70 dark:bg-[#0b1711]/70 border-neutral-200 dark:border-emerald-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-lg bg-[#145a3a] text-[#dfbd69] text-xs font-extrabold">
                        الثنائية #{idx + 1}
                      </span>
                      <span className="text-xs font-bold text-neutral-500">
                        مقرر المراجعة المشترك: سورة {pair.focusSurah}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                      <div className="p-3 rounded-xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/50">
                        <div className="text-[10px] font-bold text-[#c59b27]">الطالب الأول (مُسمِّع)</div>
                        <div className="text-sm font-extrabold mt-0.5">{stA.name}</div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          {stA.level} · سورة {stA.currentStop.surahName} ({stA.currentStop.ayah})
                        </div>
                      </div>

                      {stB ? (
                        <div className="p-3 rounded-xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/50">
                          <div className="text-[10px] font-bold text-emerald-600">الطالب الثاني (مُراجع)</div>
                          <div className="text-sm font-extrabold mt-0.5">{stB.name}</div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            {stB.level} · سورة {stB.currentStop.surahName} ({stB.currentStop.ayah})
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-dashed border-amber-300 text-xs font-bold text-amber-800 dark:text-amber-300">
                          طالب منفرد — يُراجع مباشرة مع المعلم أو عريف الحلقة
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-neutral-200/60 dark:border-emerald-900/40">
                      <span className="text-[11px] text-neutral-500">
                        {pair.completed
                          ? '✓ أتمّا التسميع المتبادل وجاهزان للعرض على الشيخ'
                          : 'جارٍ التسميع المتبادل وتصحيح الأخطاء بين الطالبين...'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPeerPairs((prev) =>
                            prev.map((p) =>
                              p.id === pair.id ? { ...p, completed: !p.completed } : p
                            )
                          );
                          if (!pair.completed) {
                            showToast('تم اعتماد إتمام المراجعة الثنائية؛ الطالبان جاهزان للتسميع', 'success');
                          }
                        }}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer ${
                          pair.completed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#145a3a] text-white hover:bg-[#0f452c]'
                        }`}
                      >
                        {pair.completed ? '✓ جاهزان للشيخ' : 'اعتماد إتمام المراجعة الثنائية'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-10 text-center rounded-2xl bg-[#f6f7f2]/50 dark:bg-[#0b1711]/50 border border-dashed border-neutral-300 dark:border-emerald-900 space-y-3">
              <Users className="w-8 h-8 text-[#c59b27] mx-auto" />
              <div className="text-sm font-extrabold">
                اضغط على «توليد ثنائيات التسميع الآن» لتوزيع طلاب {effectiveCircleName} ({circleStudents.length} طلاب)
              </div>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                يقوم النظام بتوزيع الطلاب تلقائياً إلى ثنائيات متوازنة ليسمّع كل طالب لزميله قبل العرض على المعلم، مما يضاعف إنتاجية الحلقة في المسجد.
              </p>
              <button
                type="button"
                onClick={handleGeneratePeerPairs}
                className="px-5 py-2.5 rounded-xl bg-[#145a3a] text-white text-xs font-extrabold cursor-pointer"
              >
                توزيع الطلاب في ثنائيات الآن
              </button>
            </div>
          )}
        </div>
      )}

      {/* NEW Tab C: Gamification, Collective Khatmah Countdown & Honor Roll Leaderboard */}
      {activeSubTab === 'gamification' && (
        <div className="space-y-6">
          {/* Collective Circle Khatmah Progress & Countdown Card */}
          <div className="rounded-3xl bg-gradient-to-l from-[#145a3a] to-[#0f3d27] text-white p-6 shadow-md border border-[#c59b27]/40 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c59b27] text-[#14281d] text-xs font-extrabold">
                  <Flame className="w-3.5 h-3.5" />
                  <span>عداد الختمة الجماعية للحلقة</span>
                </span>
                <h3 className="text-xl font-extrabold mt-2">
                  مسيرة ختم القرآن الكريم في «{effectiveCircleName}»
                </h3>
                <p className="text-xs text-emerald-100 mt-0.5">
                  مجموع الأجزاء المحفوظة والمثبتة لطلاب الحلقة: {collectiveKhatmahStats.totalJuzSum} جزءاً ({collectiveKhatmahStats.completedKhatmahCount} ختمة مكتملة + {collectiveKhatmahStats.currentKhatmahJuz} جزءاً في الختمة الحالية)
                </p>
              </div>

              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-xs p-3.5 rounded-2xl border border-white/15">
                <Clock className="w-6 h-6 text-[#dfbd69]" />
                <div>
                  <div className="text-[11px] text-emerald-100">العد التنازلي للختمة الجماعية</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-lg font-extrabold font-mono text-[#dfbd69]">
                      متبقي {collectiveKhatmahStats.remainingJuz} جزءاً ({khatmahTargetDays} يوماً)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setKhatmahTargetDays((d) => (d <= 5 ? 30 : d - 5))
                      }
                      className="px-2 py-0.5 rounded-lg bg-white/15 hover:bg-white/25 text-[10px] font-bold cursor-pointer"
                    >
                      تعديل المدة
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Khatmah Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span>نسبة إنجاز الختمة الجماعية الحالية ({collectiveKhatmahStats.currentKhatmahJuz} / 30 جزءاً)</span>
                <span className="font-mono text-[#dfbd69]">{collectiveKhatmahStats.progressPercent}%</span>
              </div>
              <div className="w-full h-3.5 rounded-full bg-black/30 overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-[#dfbd69] to-emerald-400 transition-all duration-500"
                  style={{ width: `${Math.max(8, collectiveKhatmahStats.progressPercent)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Honor Roll Leaderboard (لوحة شرف فرسان القرآن والأوسمة التلقائية) */}
          <div className="rounded-3xl bg-white dark:bg-[#12231a] p-6 border border-neutral-200 dark:border-emerald-900/50 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-emerald-950">
              <div className="flex items-center gap-2.5">
                <Trophy className="w-5 h-5 text-[#c59b27]" />
                <div>
                  <h3 className="text-base font-extrabold text-[#14281d] dark:text-white">
                    لوحة شرف «فرسان القرآن» وأوسمة التميز التلقائية
                  </h3>
                  <p className="text-xs text-neutral-500">
                    تُحتسب النقاط والأوسمة تلقائياً بناءً على الأجزاء المحفوظة، المواظبة على الحضور، ونسب الإتقان
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {circleLeaderboard.map((entry, idx) => (
                <div
                  key={entry.student.id}
                  className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    idx === 0
                      ? 'bg-gradient-to-l from-[#c59b27]/15 to-transparent border-[#c59b27]'
                      : 'bg-[#f6f7f2]/70 dark:bg-[#0b1711]/70 border-neutral-200 dark:border-emerald-900/40'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-2xl font-mono text-sm font-extrabold flex items-center justify-center shrink-0 ${
                        idx === 0
                          ? 'bg-[#c59b27] text-[#14281d]'
                          : idx === 1
                          ? 'bg-[#145a3a] text-white'
                          : idx === 2
                          ? 'bg-emerald-700 text-white'
                          : 'bg-neutral-200 dark:bg-emerald-950 text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      #{idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-[#14281d] dark:text-white">
                          {entry.student.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-[#145a3a]/10 dark:bg-emerald-950 text-[#145a3a] dark:text-[#dfbd69] text-[10px] font-extrabold">
                          مستوى {entry.student.level} ({entry.juzCount} جزء)
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        الحصص الحاضرة: {entry.attendedCount} حصص · متوسط الإتقان: {entry.avgMastery}%
                      </div>
                    </div>
                  </div>

                  {/* Automatic Badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {entry.badges.map((badge) => (
                      <span
                        key={badge.id}
                        className={`px-2.5 py-1 rounded-xl border border-[#c59b27]/40 text-[11px] font-bold ${badge.colorClass}`}
                      >
                        {badge.icon} {badge.title}
                      </span>
                    ))}
                  </div>

                  {/* Points */}
                  <div className="text-left md:min-w-[110px]">
                    <div className="text-[10px] text-neutral-500 font-bold">نقاط التميز</div>
                    <div className="text-base font-extrabold font-mono tabular-nums text-[#145a3a] dark:text-[#dfbd69]">
                      {entry.points} نقطة
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 1: Fast Daily Attendance Sheet */}
      {activeSubTab === 'attendance' && (
        <div className="rounded-3xl bg-white dark:bg-[#12231a] p-6 border border-neutral-200 dark:border-emerald-900/50 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-100 dark:border-emerald-950">
            <div>
              <h3 className="text-base font-extrabold">
                كشف حضور: {effectiveCircleName} ({circleStudents.length} طلاب)
              </h3>
              <p className="text-xs text-neutral-500">
                تاريخ الكشف:{' '}
                <span className="font-mono tabular-nums">
                  {formatGregorianAndHijri(
                    attendanceDate,
                    settings.showHijriDates ?? true
                  )}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubTab('distribution')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-emerald-900 text-xs font-bold hover:border-[#145a3a] cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-[#c59b27]" />
                <span>توزيع أو نقل الطلاب</span>
              </button>
              <button
                type="button"
                onClick={handleMarkAllPresent}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تحضير جميع طلاب الحلقة بضغطة واحدة</span>
              </button>
            </div>
          </div>

          {circleStudents.length > 0 ? (
            <div className="space-y-2.5">
              {circleStudents.map((st) => {
                const ses = sessions.find(
                  (s) => s.studentId === st.id && s.date === attendanceDate
                );
                return (
                  <div
                    key={st.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#f6f7f2]/70 dark:bg-[#0b1711]/70 border border-neutral-200 dark:border-emerald-900/40"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{st.name}</span>
                        <span className="px-2 py-0.5 rounded-md bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900 text-[10px] font-bold text-[#145a3a] dark:text-[#dfbd69]">
                          {st.level} ({st.memorizedJuz.length} جزء)
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        موعده: {st.scheduleTime} · توقف عند: سورة {st.currentStop.surahName} (
                        {st.currentStop.ayah})
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {(['حضر', 'غاب', 'إجازة'] as AttendanceStatus[]).map((stVal) => (
                        <button
                          key={stVal}
                          type="button"
                          onClick={() => handleMarkAttendance(st.id, stVal)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-colors cursor-pointer ${
                            ses?.status === stVal
                              ? stVal === 'حضر'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : stVal === 'غاب'
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-[#c59b27] text-[#14281d] border-[#c59b27]'
                              : 'bg-white dark:bg-[#12231a] border-neutral-200 dark:border-emerald-900'
                          }`}
                        >
                          {stVal}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center rounded-2xl bg-[#f6f7f2]/50 dark:bg-[#0b1711]/50 border border-dashed border-neutral-300 dark:border-emerald-900 space-y-2">
              <p className="text-xs font-bold text-neutral-500">
                لا يوجد طلاب مسجلون في هذه الحلقة حالياً.
              </p>
              <button
                type="button"
                onClick={() => setActiveSubTab('distribution')}
                className="px-4 py-2 rounded-xl bg-[#145a3a] text-white text-xs font-bold cursor-pointer"
              >
                ضم وتوزيع طلاب إلى هذه الحلقة
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Simplified Card-Based Circles Management & Active Circles Quick Filter */}
      {activeSubTab === 'distribution' && (
        <div className="space-y-6">
          {/* Quick Active Circles Filter Bar */}
          <div className="rounded-3xl bg-white dark:bg-[#12231a] p-4 border border-neutral-200 dark:border-emerald-900/50 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Fast Filter Pills: Active Only / Today's Circles / All / Paused */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69] ml-1">
                فلترة سريعة:
              </span>
              {[
                {
                  id: 'activeOnly',
                  label: `🟢 الحلقات النشطة فقط (${circleCounts.active})`,
                },
                {
                  id: 'todayOnly',
                  label: `📅 حلقات اليوم النشطة (${circleCounts.todayActive})`,
                },
                {
                  id: 'all',
                  label: `📋 جميع الحلقات (${circleCounts.all})`,
                },
                ...(circleCounts.paused > 0
                  ? [
                      {
                        id: 'paused',
                        label: `⏸️ متوقفة / فارغة (${circleCounts.paused})`,
                      },
                    ]
                  : []),
              ].map((flt) => (
                <button
                  key={flt.id}
                  type="button"
                  onClick={() =>
                    setCircleFilterMode(flt.id as typeof circleFilterMode)
                  }
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                    circleFilterMode === flt.id
                      ? 'bg-[#145a3a] text-white border-[#145a3a] shadow-2xs'
                      : 'bg-[#f6f7f2] dark:bg-[#0b1711] border-neutral-200 dark:border-emerald-900/60 text-neutral-700 dark:text-neutral-200 hover:border-[#145a3a]'
                  }`}
                >
                  {flt.label}
                </button>
              ))}
            </div>

            {/* Search & Level Quick Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={circleSearchQuery}
                onChange={(e) => setCircleSearchQuery(e.target.value)}
                placeholder="ابحث باسم الحلقة أو المعلم أو الطالب..."
                className="px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold min-w-[210px]"
              />
              <select
                value={circleLevelFilter}
                onChange={(e) => setCircleLevelFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-extrabold"
              >
                <option value="الكل">كل المستويات</option>
                <option value="مبتدئ">مستوى مبتدئ</option>
                <option value="متوسط">مستوى متوسط</option>
                <option value="متقدم">مستوى متقدم</option>
              </select>
            </div>
          </div>

          {/* Simple Circle Cards Grid */}
          <div
            id="circle-selector-cards-zone"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filteredCircles.map((c) => {
              const cStudents = students.filter((s) => s.circle === c.name);
              const activeCStudents = cStudents.filter(
                (s) => (s.accountStatus || 'نشط') === 'نشط'
              );
              const isAct = isCircleConsideredActive(c);
              const isScheduledToday = (c.scheduleDays || []).includes(todayDayIndex);
              const totalJuz = activeCStudents.reduce(
                (acc, s) => acc + s.memorizedJuz.length,
                0
              );
              const cStudentIds = new Set(activeCStudents.map((s) => s.id));
              const attendedSessions = sessions.filter(
                (ses) => cStudentIds.has(ses.studentId) && ses.status === 'حضر'
              );
              const avgMastery =
                attendedSessions.length > 0
                  ? Math.round(
                      attendedSessions.reduce((acc, s) => acc + s.masteryScore, 0) /
                        attendedSessions.length
                    )
                  : 94;

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedCircleName(c.name);
                    const el = document.getElementById('circle-session-cards-zone');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`rounded-3xl bg-white dark:bg-[#12231a] p-5 border transition-all flex flex-col justify-between gap-4 cursor-pointer ${
                    effectiveCircleName === c.name
                      ? 'border-2 border-[#145a3a] dark:border-[#dfbd69] shadow-md ring-2 ring-[#c59b27]/30'
                      : 'border-neutral-200 dark:border-emerald-900/50 hover:border-[#145a3a]/60 shadow-2xs'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Card Header: Status Pill + Level + Edit/Delete */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleCircleActive(c);
                          }}
                          title="انقر لتبديل حالة الحلقة (نشطة / متوقفة مؤقتاً)"
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold cursor-pointer transition-colors ${
                            isAct
                              ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-400/40'
                              : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-500 border border-neutral-300'
                          }`}
                        >
                          {isAct ? '🟢 نشطة' : '⏸️ متوقفة'}
                        </button>

                        <span className="px-2.5 py-1 rounded-xl bg-[#145a3a]/10 dark:bg-emerald-950 text-[#145a3a] dark:text-[#dfbd69] text-[11px] font-extrabold">
                          {c.level}
                        </span>

                        {isAct && isScheduledToday && (
                          <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold">
                            📅 اليوم
                          </span>
                        )}
                      </div>

                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => openEditCircleModal(c)}
                          title="تعديل الحلقة وتحديد طلابها"
                          className="p-2 rounded-xl bg-[#f6f7f2] dark:bg-[#0b1711] hover:bg-neutral-200 dark:hover:bg-emerald-950 text-[#145a3a] dark:text-[#dfbd69] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCircle(c.id)}
                          title="حذف الحلقة"
                          className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-600 dark:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Circle Name, Teacher & Schedule */}
                    <div>
                      <h3 className="text-base font-extrabold text-[#14281d] dark:text-white">
                        {c.name}
                      </h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        المحفظ:{' '}
                        <strong className="text-[#145a3a] dark:text-[#dfbd69]">
                          {c.teacherName}
                        </strong>
                      </p>
                      <div className="text-[11px] text-neutral-500 mt-1 flex flex-wrap items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#c59b27]" />
                        <span>
                          {(c.scheduleDays || [])
                            .map((d) => DAY_NAMES[d])
                            .join('، ') || 'أيام مرنة'}{' '}
                          • الساعة <strong className="font-mono">{c.scheduleTime}</strong> (
                          {c.duration || 45} د)
                        </span>
                      </div>
                    </div>

                    {/* 3 Simple KPI Boxes */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2.5 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200/70 dark:border-emerald-900/40">
                        <div className="text-[10px] text-neutral-500 font-bold">
                          الطلاب النشطون
                        </div>
                        <div className="text-sm font-extrabold font-mono tabular-nums text-[#145a3a] dark:text-[#dfbd69]">
                          {activeCStudents.length}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200/70 dark:border-emerald-900/40">
                        <div className="text-[10px] text-neutral-500 font-bold">
                          مجموع الأجزاء
                        </div>
                        <div className="text-sm font-extrabold font-mono tabular-nums text-[#145a3a] dark:text-[#dfbd69]">
                          {totalJuz} ج
                        </div>
                      </div>
                      <div className="p-2.5 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200/70 dark:border-emerald-900/40">
                        <div className="text-[10px] text-neutral-500 font-bold">الإتقان</div>
                        <div className="text-sm font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {avgMastery}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Direct 1-Click Circle Action Buttons */}
                  <div
                    className="grid grid-cols-2 gap-1.5 pt-3 border-t border-neutral-100 dark:border-emerald-900/40"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCircleName(c.name);
                        const el = document.getElementById('circle-session-cards-zone');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`py-2 px-2 rounded-xl text-[11px] font-extrabold cursor-pointer transition-colors ${
                        effectiveCircleName === c.name
                          ? 'bg-[#c59b27] text-[#14281d]'
                          : 'bg-[#145a3a] hover:bg-[#0f452c] text-white'
                      }`}
                    >
                      {effectiveCircleName === c.name
                        ? '✓ الحلقة المختارة للحصة'
                        : '⚡ فتح حصص الحلقة'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditCircleModal(c)}
                      className="py-2 px-2 rounded-xl bg-[#f6f7f2] dark:bg-[#0b1711] hover:border-[#145a3a] border border-neutral-200 dark:border-emerald-900 text-neutral-700 dark:text-neutral-200 text-[11px] font-extrabold cursor-pointer transition-colors"
                    >
                      ✏️ تعديل والأعضاء
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add New Circle Card */}
            <button
              type="button"
              onClick={openCreateCircleModal}
              className="rounded-3xl border-2 border-dashed border-neutral-300 dark:border-emerald-900/70 hover:border-[#145a3a] dark:hover:border-[#dfbd69] p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[210px] transition-all cursor-pointer group bg-white/50 dark:bg-[#12231a]/40"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#145a3a]/10 dark:bg-emerald-950 text-[#145a3a] dark:text-[#dfbd69] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-[#14281d] dark:text-white">
                  + إنشاء حلقة أو مجموعة جديدة
                </div>
                <p className="text-xs text-neutral-500 mt-1 max-w-xs">
                  أضف حلقة جديدة وحدد موعدها وطلابها في بطاقة مستقلة
                </p>
              </div>
            </button>
          </div>

          {/* 🕌 بطاقات حصص طلاب الحلقة المختارة — بنفس نمط الحصة أو وضع التركيز السريع */}
          <div
            id="circle-session-cards-zone"
            className="rounded-3xl bg-white dark:bg-[#12231a] p-6 border-2 border-[#c59b27]/50 shadow-xs space-y-5"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-neutral-100 dark:border-emerald-950">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-[#145a3a] text-[#dfbd69] text-xs font-extrabold">
                    {circleFocusMode
                      ? '🎯 وضع التركيز مفعّل (الأسماء والتقييم السريع فقط)'
                      : '⚡ حصص طلاب الحلقة (بنفس نمط الحصة المبسط)'}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-[#c59b27]/40 text-xs font-extrabold text-[#14281d] dark:text-[#dfbd69]">
                    {effectiveCircleName} ({circleStudents.filter((s) => (s.accountStatus || 'نشط') === 'نشط').length} طلاب نشطين)
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {circleFocusMode
                    ? 'تم إخفاء جميع التفاصيل الجانبية؛ اضغط مباشرة على تقييم الطالب (ممتاز / جيد / بحاجة لمراجعة) للحفظ الفوري'
                    : 'كل طالب في كارت مستقل يحتوي على البنود الأربعة الأساسية للحصة: (١) التسميع الفعلي، (٢) الحفظ الجديد، (٣) المراجعة القريبة، (٤) المراجعة البعيدة'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={circleFocusMode}
                  onClick={() => setCircleFocusMode((p) => !p)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border-2 flex items-center gap-1.5 cursor-pointer transition-all ${
                    circleFocusMode
                      ? 'bg-[#c59b27] text-[#14281d] border-[#145a3a] shadow-xs'
                      : 'bg-[#fcfaf2] dark:bg-[#0b1711] border-[#c59b27]/60 text-[#145a3a] dark:text-[#dfbd69] hover:border-[#145a3a]'
                  }`}
                >
                  <span>
                    {circleFocusMode
                      ? '🎯 وضع التركيز: مفعّل (إظهار التفاصيل)'
                      : '🎯 تفعيل وضع التركيز (تقييم سريع)'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold cursor-pointer"
                >
                  ✓ تحضير الجميع (حضر)
                </button>
                {!circleFocusMode && (
                  <button
                    type="button"
                    onClick={handleSaveAllCircleLessons}
                    className="px-4 py-2 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-[#dfbd69] text-xs font-extrabold cursor-pointer shadow-xs"
                  >
                    💾 حفظ حصص جميع طلاب الحلقة بضغطة واحدة
                  </button>
                )}
              </div>
            </div>

            {circleStudents.filter((s) => (s.accountStatus || 'نشط') === 'نشط')
              .length > 0 ? (
              circleFocusMode ? (
                /* 🎯 وضع التركيز: إخفاء تفاصيل الطلاب الجانبية وإظهار فقط أسماء الطلاب مع زر سريع لتقييم حفظهم (ممتاز / جيد / بحاجة لمراجعة) */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {circleStudents
                    .filter((s) => (s.accountStatus || 'نشط') === 'نشط')
                    .map((st, idx) => {
                      const todaySes = sessions.find(
                        (s) => s.studentId === st.id && s.date === attendanceDate
                      );
                      const savedGrade =
                        todaySes?.actualRecitation?.grade ||
                        todaySes?.previousEvaluation?.newGrade;

                      return (
                        <div
                          key={st.id}
                          className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            todaySes
                              ? 'bg-emerald-50/25 dark:bg-emerald-950/25 border-emerald-500/60'
                              : 'bg-[#fcfaf2]/70 dark:bg-[#0b1711]/80 border-neutral-200 dark:border-emerald-900/60'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-7 h-7 rounded-xl bg-[#145a3a] text-[#dfbd69] font-mono text-xs font-extrabold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-sm font-extrabold text-[#14281d] dark:text-white truncate">
                              {st.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleQuickFocusEvaluation(st, 'ممتاز')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                                todaySes && savedGrade === 'ممتاز'
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-white dark:bg-[#12231a] hover:bg-emerald-600 hover:text-white text-emerald-700 dark:text-emerald-300 border border-emerald-400/50'
                              }`}
                            >
                              ممتاز
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickFocusEvaluation(st, 'جيد')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                                todaySes &&
                                (savedGrade === 'جيد' || savedGrade === 'جيد جداً')
                                  ? 'bg-[#145a3a] text-white shadow-xs'
                                  : 'bg-white dark:bg-[#12231a] hover:bg-[#145a3a] hover:text-white text-[#145a3a] dark:text-[#dfbd69] border border-neutral-200 dark:border-emerald-800'
                              }`}
                            >
                              جيد
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleQuickFocusEvaluation(st, 'بحاجة لمراجعة')
                              }
                              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                                todaySes &&
                                (savedGrade === 'إعادة' || savedGrade === 'ضعيف')
                                  ? 'bg-amber-600 text-white shadow-xs'
                                  : 'bg-white dark:bg-[#12231a] hover:bg-amber-600 hover:text-white text-amber-800 dark:text-amber-300 border border-amber-400/50'
                              }`}
                            >
                              بحاجة لمراجعة
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {circleStudents
                  .filter((s) => (s.accountStatus || 'نشط') === 'نشط')
                  .map((st, idx) => {
                    const draft = getStudentLessonDraft(st);
                    const todaySes = sessions.find(
                      (s) => s.studentId === st.id && s.date === attendanceDate
                    );
                    const isSavedToday = Boolean(todaySes);

                    return (
                      <div
                        key={st.id}
                        className={`rounded-3xl p-5 border transition-all space-y-4 ${
                          isSavedToday
                            ? 'bg-emerald-50/20 dark:bg-emerald-950/20 border-emerald-500/60'
                            : 'bg-[#fcfaf2]/60 dark:bg-[#0b1711]/80 border-neutral-200 dark:border-emerald-900/60'
                        }`}
                      >
                        {/* Student Card Header: Name + Attendance (حضر / غاب / إجازة) + Save Status */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200/70 dark:border-emerald-900/50">
                          <div className="flex items-center gap-2.5">
                            <span className="w-8 h-8 rounded-xl bg-[#145a3a] text-[#dfbd69] font-mono text-xs font-extrabold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-extrabold text-[#14281d] dark:text-white">
                                  {st.name}
                                </h4>
                                <span className="px-2 py-0.5 rounded-lg bg-[#145a3a]/10 dark:bg-emerald-950 text-[#145a3a] dark:text-[#dfbd69] text-[10px] font-extrabold">
                                  {st.level} • {st.memorizedJuz.length} جزء
                                </span>
                                {isSavedToday && (
                                  <span className="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-extrabold">
                                    ✓ حصة محفوظة ({todaySes?.masteryScore}%)
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-neutral-500 mt-0.5">
                                موضع التوقف: سورة {st.currentStop.surahName} (آية {st.currentStop.ayah})
                              </div>
                            </div>
                          </div>

                          {/* Attendance Pills (حضر / غاب / إجازة) */}
                          <div className="flex items-center gap-1">
                            {(['حضر', 'غاب', 'إجازة'] as AttendanceStatus[]).map(
                              (stVal) => (
                                <button
                                  key={stVal}
                                  type="button"
                                  onClick={() =>
                                    updateStudentLessonDraft(st, { status: stVal })
                                  }
                                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-colors cursor-pointer ${
                                    draft.status === stVal
                                      ? stVal === 'حضر'
                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                        : stVal === 'غاب'
                                        ? 'bg-red-600 text-white border-red-600'
                                        : 'bg-[#c59b27] text-[#14281d] border-[#c59b27]'
                                      : 'bg-white dark:bg-[#12231a] border-neutral-200 dark:border-emerald-900'
                                  }`}
                                >
                                  {stVal}
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        {/* 4-Pillar Lesson Pattern (١: التسميع الفعلي، ٢: الحفظ الجديد، ٣: المراجعة القريبة، ٤: المراجعة البعيدة) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* ١) التسميع الفعلي */}
                          <div className="p-3 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/50 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                                ١) التسميع الفعلي
                              </span>
                              <select
                                value={draft.recitationGrade}
                                onChange={(e) =>
                                  updateStudentLessonDraft(st, {
                                    recitationGrade: e.target.value as GradeType,
                                  })
                                }
                                className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-400/50 text-[11px] font-extrabold text-[#145a3a] dark:text-[#dfbd69]"
                              >
                                {(
                                  [
                                    'ممتاز',
                                    'جيد جداً',
                                    'جيد',
                                    'ضعيف',
                                    'إعادة',
                                  ] as GradeType[]
                                ).map((g) => (
                                  <option key={g} value={g}>
                                    التقدير: {g}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <select
                              value={draft.recitationSurahId}
                              onChange={(e) =>
                                updateStudentLessonDraft(st, {
                                  recitationSurahId: Number(e.target.value),
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                            >
                              {SURAHS.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.id}. سورة {s.name}
                                </option>
                              ))}
                            </select>
                            <div className="grid grid-cols-2 gap-1.5">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-neutral-500">من:</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={draft.recitationFromAyah}
                                  onChange={(e) =>
                                    updateStudentLessonDraft(st, {
                                      recitationFromAyah: Number(e.target.value) || 1,
                                    })
                                  }
                                  className="w-full px-2 py-1 rounded-lg border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-neutral-500">إلى:</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={draft.recitationToAyah}
                                  onChange={(e) =>
                                    updateStudentLessonDraft(st, {
                                      recitationToAyah: Number(e.target.value) || 1,
                                    })
                                  }
                                  className="w-full px-2 py-1 rounded-lg border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono"
                                />
                              </div>
                            </div>
                          </div>

                          {/* ٢) تكليف الحفظ الجديد */}
                          <div className="p-3 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/50 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                                ٢) تكليف الحفظ الجديد
                              </span>
                              <span className="text-[10px] font-bold text-[#c59b27]">
                                واجب الحصة القادمة
                              </span>
                            </div>
                            <select
                              value={draft.newMemSurahId}
                              onChange={(e) =>
                                updateStudentLessonDraft(st, {
                                  newMemSurahId: Number(e.target.value),
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                            >
                              {SURAHS.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.id}. سورة {s.name}
                                </option>
                              ))}
                            </select>
                            <div className="grid grid-cols-2 gap-1.5">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-neutral-500">من:</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={draft.newMemFromAyah}
                                  onChange={(e) =>
                                    updateStudentLessonDraft(st, {
                                      newMemFromAyah: Number(e.target.value) || 1,
                                    })
                                  }
                                  className="w-full px-2 py-1 rounded-lg border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-neutral-500">إلى:</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={draft.newMemToAyah}
                                  onChange={(e) =>
                                    updateStudentLessonDraft(st, {
                                      newMemToAyah: Number(e.target.value) || 1,
                                    })
                                  }
                                  className="w-full px-2 py-1 rounded-lg border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono"
                                />
                              </div>
                            </div>
                          </div>

                          {/* ٣) المراجعة القريبة (الربط) */}
                          <div className="p-3 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/50 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                                ٣) المراجعة القريبة (الربط)
                              </span>
                              <select
                                value={draft.nearRevGrade}
                                onChange={(e) =>
                                  updateStudentLessonDraft(st, {
                                    nearRevGrade: e.target.value as GradeType,
                                  })
                                }
                                className="px-2 py-0.5 rounded-lg bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-800 text-[10px] font-bold"
                              >
                                {(['ممتاز', 'جيد جداً', 'جيد', 'إعادة'] as GradeType[]).map(
                                  (g) => (
                                    <option key={g} value={g}>
                                      {g}
                                    </option>
                                  )
                                )}
                              </select>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={draft.nearRevSurahId}
                                onChange={(e) =>
                                  updateStudentLessonDraft(st, {
                                    nearRevSurahId: Number(e.target.value),
                                  })
                                }
                                className="flex-1 px-2 py-1 rounded-xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                              >
                                {SURAHS.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.id}. {s.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                min={1}
                                value={draft.nearRevFromAyah}
                                onChange={(e) =>
                                  updateStudentLessonDraft(st, {
                                    nearRevFromAyah: Number(e.target.value) || 1,
                                  })
                                }
                                className="w-12 px-1.5 py-1 rounded-lg border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono text-center"
                                title="من آية"
                              />
                              <span className="text-[10px] text-neutral-400">-</span>
                              <input
                                type="number"
                                min={1}
                                value={draft.nearRevToAyah}
                                onChange={(e) =>
                                  updateStudentLessonDraft(st, {
                                    nearRevToAyah: Number(e.target.value) || 1,
                                  })
                                }
                                className="w-12 px-1.5 py-1 rounded-lg border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono text-center"
                                title="إلى آية"
                              />
                            </div>
                          </div>

                          {/* ٤) المراجعة البعيدة */}
                          <div className="p-3 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/50 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                                ٤) المراجعة البعيدة
                              </span>
                              <select
                                value={draft.farRevGrade}
                                onChange={(e) =>
                                  updateStudentLessonDraft(st, {
                                    farRevGrade: e.target.value as GradeType,
                                  })
                                }
                                className="px-2 py-0.5 rounded-lg bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-800 text-[10px] font-bold"
                              >
                                {(['ممتاز', 'جيد جداً', 'جيد', 'إعادة'] as GradeType[]).map(
                                  (g) => (
                                    <option key={g} value={g}>
                                      {g}
                                    </option>
                                  )
                                )}
                              </select>
                            </div>
                            <select
                              value={draft.farRevSurahId}
                              onChange={(e) =>
                                updateStudentLessonDraft(st, {
                                  farRevSurahId: Number(e.target.value),
                                })
                              }
                              className="w-full px-2.5 py-1 rounded-xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                            >
                              {SURAHS.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.id}. سورة {s.name} (كاملة)
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* ٥) ملاحظات ولي الأمر + حفظ الحصة وإرسال واتساب */}
                        <div className="space-y-2 pt-1">
                          <input
                            type="text"
                            value={draft.parentNotes}
                            onChange={(e) =>
                              updateStudentLessonDraft(st, {
                                parentNotes: e.target.value,
                              })
                            }
                            placeholder="ملاحظة المعلم لولي الأمر..."
                            className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-900 bg-white dark:bg-[#12231a] text-xs"
                          />

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveStudentCircleLesson(st, false)}
                              className="flex-1 py-2 px-3 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold cursor-pointer transition-colors"
                            >
                              💾 حفظ الحصة
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveStudentCircleLesson(st, true)}
                              className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer transition-colors"
                            >
                              📲 حفظ وإرسال واتساب
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedStudentId(st.id);
                                setActiveTab('session');
                              }}
                              className="py-2 px-3 rounded-xl bg-white dark:bg-[#12231a] hover:border-[#145a3a] border border-neutral-200 dark:border-emerald-900 text-[#145a3a] dark:text-[#dfbd69] text-xs font-bold cursor-pointer"
                              title="فتح الطالب في محرك التسميع الفردي الكامل"
                            >
                              🎙️ محرك الحصة
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
              )
            ) : (
              <div className="p-8 text-center rounded-2xl bg-[#f6f7f2]/50 dark:bg-[#0b1711]/50 border border-dashed border-neutral-300 dark:border-emerald-900 space-y-2">
                <p className="text-xs font-bold text-neutral-500">
                  {effectiveCircleName
                    ? `لا يوجد طلاب نشطون في «${effectiveCircleName}» حالياً.`
                    : 'لا توجد حلقات أو طلاب مضافون حالياً — ابدأ بإنشاء حلقتك الأولى.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const target = activeCircleObj || circles[0];
                    if (target) {
                      openEditCircleModal(target);
                    } else {
                      openCreateCircleModal();
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-[#145a3a] text-white text-xs font-bold cursor-pointer"
                >
                  {activeCircleObj || circles[0]
                    ? '+ ضم طلاب إلى هذه الحلقة'
                    : '+ إنشاء حلقة جديدة'}
                </button>
              </div>
            )}

            {/* Footer Batch Save & Mode Toggle Bar (Matching SessionEngineView Footer) */}
            <div
              id="circle-batch-save-footer"
              className="p-4 rounded-2xl bg-[#fcfaf2] dark:bg-[#0b1711] border border-[#c59b27]/40 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">
                {fastCircleMode
                  ? '⚡ الواجهة المبسطة للحلقة مفعّلة (نفس نمط الحصة: الحلقات النشطة + البنود الأربعة لكل طالب)'
                  : '🎛️ الأدوات المتقدمة للحلقة معروضة حالياً'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveAllCircleLessons}
                  className="px-4 py-2 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold cursor-pointer"
                >
                  💾 اعتماد وحفظ جميع حصص الحلقة
                </button>
                <button
                  type="button"
                  onClick={() => setFastCircleMode((p) => !p)}
                  className="px-3.5 py-2 rounded-xl bg-[#c59b27] text-[#14281d] text-xs font-extrabold cursor-pointer"
                >
                  {fastCircleMode
                    ? '🎛️ إظهار الأدوات المتقدمة (توزيع الطلاب، الجدولة، الأقران...)'
                    : '⚡ العودة للواجهة المبسطة'}
                </button>
              </div>
            </div>
          </div>

          {/* Simple Student Distribution Cards (Shown only when Advanced Mode !fastCircleMode is toggled) */}
          {!fastCircleMode && (
            <div className="rounded-3xl bg-white dark:bg-[#12231a] p-6 border border-neutral-200 dark:border-emerald-900/50 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-neutral-100 dark:border-emerald-950">
                <div>
                  <h3 className="text-base font-extrabold flex items-center gap-2 text-[#14281d] dark:text-white">
                    <Layers className="w-4 h-4 text-[#145a3a] dark:text-[#dfbd69]" />
                    <span>
                      بطاقات توزيع ونقل الطلاب السريع بين الحلقات (
                      {filteredDistributionStudents.length})
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    بطاقات مبسطة لنقل أي طالب بين الحلقات بضغطة واحدة أو توزيعهم تلقائياً حسب المستوى
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={distSearchQuery}
                    onChange={(e) => setDistSearchQuery(e.target.value)}
                    placeholder="بحث سريع باسم الطالب..."
                    className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                  />

                  <button
                    type="button"
                    onClick={() => setDistActiveStudentsOnly((p) => !p)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer ${
                      distActiveStudentsOnly
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-[#f6f7f2] dark:bg-[#0b1711] border-neutral-200 dark:border-emerald-900 text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    {distActiveStudentsOnly ? '🟢 الطلاب النشطون فقط' : 'جميع الطلاب'}
                  </button>

                  {(['الكل', 'متقدم', 'متوسط', 'مبتدئ'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setDistLevelFilter(lvl)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                        distLevelFilter === lvl
                          ? 'bg-[#145a3a] text-white border-[#145a3a]'
                          : 'bg-[#f6f7f2] dark:bg-[#0b1711] border-neutral-200 dark:border-emerald-900'
                      }`}
                    >
                      {lvl === 'الكل' ? 'الكل' : lvl}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={handleAutoDistributeByLevel}
                    className="px-3.5 py-1.5 rounded-xl bg-[#c59b27] hover:bg-[#b38a1e] text-[#14281d] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>توزيع تلقائي حسب المستوى</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredDistributionStudents.map((st) => (
                  <div
                    key={st.id}
                    className="p-4 rounded-2xl bg-[#f6f7f2]/70 dark:bg-[#0b1711]/70 border border-neutral-200 dark:border-emerald-900/50 flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-extrabold text-[#14281d] dark:text-white">
                          {st.name}
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          الخطة: {st.plan} • المحفوظ: {st.memorizedJuz.length} جزء (
                          {st.memorizedSurahs.length} سورة)
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold shrink-0 ${
                          st.level === 'متقدم'
                            ? 'bg-[#145a3a] text-white'
                            : st.level === 'متوسط'
                            ? 'bg-[#c59b27] text-[#14281d]'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {st.level}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200/60 dark:border-emerald-900/40">
                      <span className="text-[11px] font-bold text-neutral-500 shrink-0">
                        الحلقة:
                      </span>
                      <select
                        value={st.circle}
                        onChange={(e) =>
                          assignStudentToCircle(st.id, e.target.value)
                        }
                        className="flex-1 px-2.5 py-1.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-white dark:bg-[#12231a] text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69] cursor-pointer"
                      >
                        {circles.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name} ({c.level})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Group Recitation (التسميع الجماعي) */}
      {activeSubTab === 'groupRecitation' && (
        <div className="rounded-3xl bg-white dark:bg-[#12231a] p-6 border border-neutral-200 dark:border-emerald-900/50 shadow-xs space-y-5">
          <div className="p-4 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-900/50 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold mb-1">السورة الموحدة للحلقة</label>
              <select
                value={batchSurahId}
                onChange={(e) => setBatchSurahId(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-white dark:bg-[#12231a] text-xs font-bold"
              >
                {SURAHS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}. سورة {s.name} ({s.ayahs} آية)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">من آية</label>
              <input
                type="number"
                min={1}
                value={batchFromAyah}
                onChange={(e) => setBatchFromAyah(Number(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-white dark:bg-[#12231a] text-xs font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">إلى آية</label>
              <input
                type="number"
                min={1}
                value={batchToAyah}
                onChange={(e) => setBatchToAyah(Number(e.target.value) || 10)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-white dark:bg-[#12231a] text-xs font-mono tabular-nums"
              />
            </div>
          </div>

          {batchSurahMutashabihat.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-[#c59b27]/50 space-y-2">
              <div className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#c59b27]" />
                <span>تنبيه متشابهات السورة المختارة (لاختبار ضبط وإتقان طلاب الحلقة):</span>
              </div>
              {batchSurahMutashabihat.map((m) => (
                <div
                  key={m.id}
                  className="text-xs text-neutral-700 dark:text-neutral-200 leading-relaxed"
                >
                  • آية ({m.ayahNumber}): <strong className="font-quran">«{m.ayahSnippet}»</strong> — تتشابه مع <strong>سورة {m.similarSurahName} ({m.similarAyahNumber})</strong>: {m.dabitRule}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2.5">
            {circleStudents.map((st) => {
              const currentGrade = batchGrades[st.id] || 'ممتاز';
              return (
                <div
                  key={st.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-neutral-200 dark:border-emerald-900/40"
                >
                  <div className="text-sm font-bold">{st.name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(['ممتاز', 'جيد جداً', 'جيد', 'ضعيف', 'إعادة'] as GradeType[]).map(
                      (g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() =>
                            setBatchGrades((prev) => ({ ...prev, [st.id]: g }))
                          }
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                            currentGrade === g
                              ? 'bg-[#145a3a] text-white'
                              : 'bg-[#f6f7f2] dark:bg-[#0b1711] text-neutral-600 dark:text-neutral-300'
                          }`}
                        >
                          {g}
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleSaveGroupRecitation}
            className="w-full py-3.5 rounded-2xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-sm font-extrabold cursor-pointer flex items-center justify-center gap-2"
          >
            <BookOpen className="w-4 h-4 text-[#dfbd69]" />
            <span>اعتماد وحفظ التسميع الجماعي لجميع طلاب الحلقة</span>
          </button>
        </div>
      )}

      {/* Tab 4: Discipline Follow-up */}
      {activeSubTab === 'discipline' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 rounded-3xl bg-white dark:bg-[#12231a] p-6 border border-neutral-200 dark:border-emerald-900/50 space-y-4">
            <h3 className="text-base font-extrabold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              <span>تسجيل تنبيه أو إنذار انضباطي</span>
            </h3>

            <div>
              <label className="block text-xs font-bold mb-1">الطالب</label>
              <select
                value={warnStudentId}
                onChange={(e) => setWarnStudentId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.circle})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">درجة الإنذار</label>
              <select
                value={warnLevel}
                onChange={(e) =>
                  setWarnLevel(e.target.value as 'تنبيه' | 'إنذار أول' | 'إنذار نهائي')
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
              >
                <option value="تنبيه">تنبيه أولي</option>
                <option value="إنذار أول">إنذار أول</option>
                <option value="إنذار نهائي">إنذار نهائي</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">السبب والتوجيه</label>
              <textarea
                rows={3}
                value={warnReason}
                onChange={(e) => setWarnReason(e.target.value)}
                placeholder="مثال: تكرار الغياب دون عذر أو عدم إتمام مراجعة المقرر..."
                className="w-full p-3 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (!warnReason.trim()) return;
                addDisciplineWarning(warnStudentId, warnLevel, warnReason.trim());
                setWarnReason('');
              }}
              className="w-full py-2.5 rounded-xl bg-[#145a3a] text-white text-xs font-bold cursor-pointer"
            >
              حفظ في سجل الانضباط
            </button>
          </div>

          <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-[#12231a] p-6 border border-neutral-200 dark:border-emerald-900/50 space-y-3">
            <h3 className="text-base font-extrabold">سجل الانضباط الحالي للطلاب</h3>
            {students.flatMap((st) =>
              st.disciplineWarnings.map((w) => ({ ...w, studentName: st.name }))
            ).length > 0 ? (
              students
                .flatMap((st) =>
                  st.disciplineWarnings.map((w) => ({ ...w, studentName: st.name }))
                )
                .map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-extrabold">
                          {item.studentName} —{' '}
                          <span className="text-amber-700 dark:text-amber-400">
                            {item.level}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-600 dark:text-neutral-300 mt-1">
                          {item.reason}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-neutral-400">
                      {formatGregorianAndHijri(
                        item.date,
                        settings.showHijriDates ?? true
                      )}
                    </span>
                  </div>
                ))
            ) : (
              <div className="p-8 text-center text-xs text-neutral-500">
                لا توجد إنذارات مسجلة.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Interactive Drag-and-Drop Circle & Session ScheduleBoard */}
      {activeSubTab === 'schedules' && (
        <ScheduleBoard onOpenEditCircleModal={openEditCircleModal} />
      )}

      {/* Create / Edit Circle & Assign Students Modal */}
      {circleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-[#12231a] p-6 border border-neutral-200 dark:border-emerald-900/60 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-neutral-200 dark:border-emerald-900">
              <h3 className="text-sm font-extrabold text-[#145a3a] dark:text-[#dfbd69] flex items-center gap-2">
                <Award className="w-4 h-4" />
                <span>
                  {editingCircleId
                    ? 'تعديل بيانات الحلقة وتوزيع الطلاب'
                    : 'إنشاء حلقة تحفيظ / مجموعة فرعية جديدة'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setCircleModalOpen(false)}
                className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-emerald-950 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCircleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">
                    اسم الحلقة / المجموعة الفرعية *
                  </label>
                  <input
                    type="text"
                    required
                    value={circleName}
                    onChange={(e) => setCircleName(e.target.value)}
                    placeholder="مثال: حلقة الإمام نافع المدني"
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">المعلم المشرف</label>
                  <input
                    type="text"
                    value={circleTeacher}
                    onChange={(e) => setCircleTeacher(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">المستوى المستهدف</label>
                  <select
                    value={circleLevel}
                    onChange={(e) => setCircleLevel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                  >
                    <option value="مبتدئ">مبتدئ</option>
                    <option value="متوسط">متوسط</option>
                    <option value="متقدم">متقدم</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">موعد الانعقاد</label>
                  <input
                    type="time"
                    value={circleTime}
                    onChange={(e) => setCircleTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">المدة (دقيقة)</label>
                  <input
                    type="number"
                    min={15}
                    max={180}
                    value={circleDuration}
                    onChange={(e) => setCircleDuration(Number(e.target.value) || 45)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1.5">أيام انعقاد الحلقة</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_NAMES.map((dayName, idx) => {
                    const active = circleDays.includes(idx);
                    return (
                      <button
                        key={dayName}
                        type="button"
                        onClick={() => handleToggleCircleDay(idx)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                          active
                            ? 'bg-[#145a3a] text-white border-[#145a3a]'
                            : 'bg-[#f6f7f2] dark:bg-[#0b1711] border-neutral-200 dark:border-emerald-900'
                        }`}
                      >
                        {dayName}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">وصف الحلقة ومنهجها</label>
                <textarea
                  rows={2}
                  value={circleDesc}
                  onChange={(e) => setCircleDesc(e.target.value)}
                  placeholder="وصف مختصر لمنهج الحلقة..."
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs"
                />
              </div>

              {/* Student Selection for Circle Assignment */}
              <div className="pt-2 border-t border-neutral-200 dark:border-emerald-900">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                    تحديد وضم الطلاب إلى هذه الحلقة ({selectedStudentIdsForCircle.length} محددين):
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const matchingIds = students
                        .filter((s) => s.level === circleLevel)
                        .map((s) => s.id);
                      setSelectedStudentIdsForCircle(matchingIds);
                    }}
                    className="text-[11px] font-bold text-[#c59b27] hover:underline cursor-pointer"
                  >
                    تحديد جميع طلاب مستوى «{circleLevel}»
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-900/60">
                  {students.map((st) => {
                    const checked = selectedStudentIdsForCircle.includes(st.id);
                    return (
                      <label
                        key={st.id}
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'bg-white dark:bg-[#12231a] border-[#145a3a] font-extrabold'
                            : 'border-transparent hover:bg-white/60 dark:hover:bg-[#12231a]/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleStudentInModal(st.id)}
                            className="accent-[#145a3a] w-4 h-4"
                          />
                          <div>
                            <div>{st.name}</div>
                            <div className="text-[10px] text-neutral-500">
                              الحالية: {st.circle}
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-emerald-950 text-[10px] font-mono">
                          {st.level} · {st.memorizedJuz.length}ج
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold cursor-pointer"
              >
                {editingCircleId
                  ? 'حفظ تعديلات الحلقة وتحديث توزيع الطلاب'
                  : 'إنشاء الحلقة وضم الطلاب المحددين'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
