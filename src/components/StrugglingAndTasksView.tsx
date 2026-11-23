import React, { useEffect, useMemo, useState } from 'react';
import { useAcademy } from '../context/AcademyContext';
import { getLocalDateString } from '../data/seedData';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import { formatGregorianAndHijri } from '../utils/dateUtils';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';

interface Props {
  mode: 'struggling' | 'tasks';
}

export const StrugglingAndTasksView: React.FC<Props> = ({ mode }) => {
  const {
    students,
    sessions,
    tasks,
    settings,
    addTask,
    toggleTask,
    deleteTask,
    setSelectedStudentId,
    setActiveTab,
    showToast,
    lateSessionAlerts,
    lastLateSessionCheckTime,
    triggerFirestoreLateCheckNow,
    scheduleOrSendStudentMissedCirclePushNotification,
    teacherCircleCronAlerts,
    lastTeacherCronCheckTime,
    runTeacherCircleStartCronCheck,
    markRecitationEngineStartedInFirestore,
  } = useAcademy();

  const [activeMode, setActiveMode] = useState<'struggling' | 'tasks'>(mode);
  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  const [taskStatusFilter, setTaskStatusFilter] = useState<
    'open' | 'today' | 'overdue' | 'completed' | 'all'
  >('open');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'normal'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState(getLocalDateString(0));
  const [newTaskPriority, setNewTaskPriority] = useState<'عادي' | 'مرتفع'>('مرتفع');
  const [newTaskStudentId, setNewTaskStudentId] = useState<string>('');

  const today = getLocalDateString(0);

  // Unified Overlay Controller: Close dropdown on Escape, click-outside, or scroll
  useEffect(() => {
    if (!activeDropdownId) return;
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setActiveDropdownId(null);
      }
    };
    const handleClickOutside = () => {
      setActiveDropdownId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [activeDropdownId]);

  // 1. Struggling Students Analysis
  const strugglingList = useMemo(() => {
    const safeStudents = students ?? [];
    const safeSessions = sessions ?? [];
    return safeStudents
      .map((st) => {
        const stSessions = safeSessions
          .filter((s) => s.studentId === st.id)
          .sort((a, b) => b.date.localeCompare(a.date));

        const recentSessions = stSessions.slice(0, 4);
        const attendedSessions = stSessions.filter((s) => s.status === 'حضر');
        const avgMastery =
          attendedSessions.length > 0
            ? Math.round(
                attendedSessions.reduce((a, b) => a + (b.masteryScore || 0), 0) /
                  attendedSessions.length
              )
            : 88;

        const weakEvalCount = recentSessions.filter(
          (s) =>
            s.actualRecitation?.grade === 'إعادة' ||
            s.actualRecitation?.grade === 'جيد' ||
            s.previousEvaluation?.newGrade === 'إعادة'
        ).length;

        const absenceCount = recentSessions.filter(
          (s) => s.status === 'غاب' || s.status === 'إجازة'
        ).length;

        const errorCounts: Record<string, number> = {};
        const repeatedAyahMap: Record<string, number> = {};
        stSessions.forEach((s) => {
          (s.errors || []).forEach((err) => {
            errorCounts[err.type] = (errorCounts[err.type] || 0) + 1;
            const locKey = `${err.surahName} (${err.ayahNumber})`;
            repeatedAyahMap[locKey] = (repeatedAyahMap[locKey] || 0) + 1;
          });
        });

        const topErrorEntry = Object.entries(errorCounts).sort(
          (a, b) => b[1] - a[1]
        )[0];

        const topRepeatedAyahs = Object.entries(repeatedAyahMap)
          .filter(([, count]) => count >= 1)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);

        const totalRecentErrors = recentSessions.reduce(
          (acc, s) => acc + (s.errors?.length || 0),
          0
        );

        const lastAttendedDate = attendedSessions[0]?.date || st.startDate || today;
        const daysSinceLastSession = Math.max(
          0,
          Math.floor(
            (new Date(today).getTime() - new Date(lastAttendedDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        );

        let riskScore = 0;
        if (absenceCount >= 2) riskScore += 42;
        else if (absenceCount === 1) riskScore += 18;
        if (daysSinceLastSession >= 6) riskScore += 28;
        else if (daysSinceLastSession >= 4) riskScore += 14;
        if (avgMastery < 75) riskScore += 25;
        else if (avgMastery < 84) riskScore += 12;
        if (weakEvalCount >= 1) riskScore += 15;
        riskScore = Math.min(98, Math.max(8, riskScore));

        const isStruggling =
          avgMastery < 82 ||
          weakEvalCount >= 1 ||
          absenceCount >= 1 ||
          totalRecentErrors >= 3 ||
          st.level === 'مبتدئ';

        let reason = 'يحتاج لتثبيت الحفظ القريب وضبط المتشابهات';
        let plan =
          'تخصيص 10 دقائق بداية الحصة لتكرار الآيات الخمس الأخيرة مع الاستماع للمقرئ وتقليل الورد الجديد مؤقتاً.';

        if (absenceCount >= 1 && weakEvalCount >= 1) {
          reason = `تراجع التقييم مع غياب (${absenceCount} حصص أخيرة)`;
          plan =
            'إيقاف الجديد لحصة واحدة وعمل مراجعة شاملة لآخر سورتين مع التواصل مع ولي الأمر لضبط مواعيد الحضور.';
        } else if (topErrorEntry && topErrorEntry[0] === 'تجويد') {
          reason = `تكرار ملاحظات التجويد ومخارج الحروف (${topErrorEntry[1]} مرات)`;
          plan =
            'التلقين الصوتي المباشر للآيات قبل التسميع والتركيز على أحكام النون الساكنة والمدود.';
        } else if (topErrorEntry && topErrorEntry[0] === 'تردد') {
          reason = `تردد متكرر في ربط الآيات (${topErrorEntry[1]} مواضع)`;
          plan =
            'اعتماد نظام الربط من أول السورة أو آخر 3 آيات مع وصل أواخر الآيات بأوائل ما بعدها.';
        }

        return {
          student: st,
          avgMastery,
          weakEvalCount,
          absenceCount,
          totalRecentErrors,
          topErrorType: topErrorEntry ? topErrorEntry[0] : 'تردد',
          topRepeatedAyahs,
          daysSinceLastSession,
          riskScore,
          isStruggling,
          reason,
          plan,
        };
      })
      .filter((item) => item.isStruggling)
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [students, sessions, today]);

  // 2. Tasks Counts & Filtered List
  const taskStats = useMemo(() => {
    const safeTasks = tasks ?? [];
    const open = safeTasks.filter((t) => !t.completed).length;
    const highPriorityOpen = safeTasks.filter(
      (t) => !t.completed && t.priority === 'مرتفع'
    ).length;
    const normalPriorityOpen = safeTasks.filter(
      (t) => !t.completed && t.priority === 'عادي'
    ).length;
    const dueToday = safeTasks.filter(
      (t) => !t.completed && t.dueDate === today
    ).length;
    const overdue = safeTasks.filter(
      (t) => !t.completed && t.dueDate < today
    ).length;
    const completed = safeTasks.filter((t) => t.completed).length;

    return {
      total: safeTasks.length,
      open,
      highPriorityOpen,
      normalPriorityOpen,
      dueToday,
      overdue,
      completed,
    };
  }, [tasks, today]);

  const filteredTasks = useMemo(() => {
    const safeTasks = tasks ?? [];
    const q = searchQuery.trim().toLowerCase();

    return safeTasks
      .filter((t) => {
        // Status Filter
        if (taskStatusFilter === 'open' && t.completed) return false;
        if (taskStatusFilter === 'today' && (t.completed || t.dueDate !== today))
          return false;
        if (taskStatusFilter === 'overdue' && (t.completed || t.dueDate >= today))
          return false;
        if (taskStatusFilter === 'completed' && !t.completed) return false;

        // Priority Filter
        if (priorityFilter === 'high' && t.priority !== 'مرتفع') return false;
        if (priorityFilter === 'normal' && t.priority !== 'عادي') return false;

        // Search Query
        if (q) {
          const linkedStudent = (students ?? []).find((s) => s.id === t.studentId);
          const studentMatch = linkedStudent?.name?.toLowerCase().includes(q);
          const titleMatch = t.title.toLowerCase().includes(q);
          if (!titleMatch && !studentMatch) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.priority !== b.priority) return a.priority === 'مرتفع' ? -1 : 1;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [tasks, taskStatusFilter, priorityFilter, searchQuery, students, today]);

  const filteredStruggling = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return strugglingList.filter((item) => {
      if (priorityFilter === 'high' && item.riskScore < 50) return false;
      if (priorityFilter === 'normal' && item.riskScore >= 50) return false;
      if (q) {
        return (
          item.student.name.toLowerCase().includes(q) ||
          item.student.circle.toLowerCase().includes(q) ||
          item.reason.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [strugglingList, priorityFilter, searchQuery]);

  // v11.12.1 Review 4: Makeup & Postponed Sessions Agenda (التعويضات المؤجلة والمتابعة)
  const makeupAgenda = useMemo(() => {
    const safeStudents = students ?? [];
    const safeSessions = sessions ?? [];
    const compensatedIds = new Set<string>();
    safeSessions.forEach((s) => {
      if (s.makeupMeta?.absenceSessionId) {
        compensatedIds.add(s.makeupMeta.absenceSessionId);
      }
    });

    const items: {
      id: string;
      studentId: string;
      studentName: string;
      circleName: string;
      absenceDate: string;
      plannedDate: string;
      arrangementLabel: string;
      excuseNote: string;
      bucket: 'today' | 'overdue' | 'upcoming' | 'unscheduled';
    }[] = [];

    safeSessions.forEach((ses) => {
      if (ses.status !== 'غاب') return;
      if (compensatedIds.has(ses.id)) return;
      const st = safeStudents.find((x) => x.id === ses.studentId);
      if (!st || st.accountStatus === 'مؤرشف') return;

      const plan = ses.absencePlan;
      const plannedDate = plan?.plannedDate || '';
      const arrangementLabel =
        plan?.arrangement === 'planned_makeup'
          ? 'حصة تعويضية مجدولة'
          : plan?.arrangement === 'postponed_assignment'
          ? 'ترحيل التكليف للحصة القادمة'
          : 'بانتظار تحديد الترتيب';

      let bucket: 'today' | 'overdue' | 'upcoming' | 'unscheduled' = 'unscheduled';
      if (plannedDate) {
        if (plannedDate === today) bucket = 'today';
        else if (plannedDate < today) bucket = 'overdue';
        else bucket = 'upcoming';
      }

      items.push({
        id: ses.id,
        studentId: st.id,
        studentName: st.name,
        circleName: st.circle,
        absenceDate: ses.date,
        plannedDate,
        arrangementLabel,
        excuseNote: plan?.excuseNote || '',
        bucket,
      });
    });

    // Also include explicit student.makeupSessions cards that are still pending
    safeStudents.forEach((st) => {
      if (st.accountStatus === 'مؤرشف') return;
      (st.makeupSessions || []).forEach((mk) => {
        if (mk.resolutionStatus === 'completed') return;
        const pDate = mk.scheduledMakeupDate || '';
        const bucket: 'today' | 'overdue' | 'upcoming' | 'unscheduled' = !pDate
          ? 'unscheduled'
          : pDate === today
          ? 'today'
          : pDate < today
          ? 'overdue'
          : 'upcoming';
        items.push({
          id: mk.id,
          studentId: st.id,
          studentName: st.name,
          circleName: st.circle,
          absenceDate: mk.absentDate,
          plannedDate: pDate,
          arrangementLabel: `تعويض: سورة ${mk.missedSurahName} (${mk.missedFromAyah}-${mk.missedToAyah})`,
          excuseNote: mk.mergedPlanNote || '',
          bucket,
        });
      });
    });

    return {
      items,
      dueTodayCount: items.filter((i) => i.bucket === 'today').length,
      overdueCount: items.filter((i) => i.bucket === 'overdue').length,
      upcomingCount: items.filter((i) => i.bucket === 'upcoming').length,
    };
  }, [students, sessions, today]);

  // v11.12.1 Review 5: Teaching Intervention Insights (خطة التدخل التعليمي)
  const teachingInsights = useMemo(() => {
    const safeStudents = (students ?? []).filter(
      (s) => (s.accountStatus ?? 'نشط') !== 'مؤرشف'
    );
    const safeSessions = sessions ?? [];
    const cutoff14Days = getLocalDateString(-14);

    let studentsWithOpenErrors = 0;
    let totalOpenErrors = 0;
    let recurringErrorsCount = 0;
    let agedErrorsCount = 0;
    const categoryCounter: Record<string, number> = {};

    const priorityStudents: {
      student: (typeof safeStudents)[0];
      openCount: number;
      recurringCount: number;
      agedCount: number;
      topErrorLabel: string;
      suggestedNextQuestion: string;
      score: number;
    }[] = [];

    safeStudents.forEach((st) => {
      const stSessions = safeSessions.filter((s) => s.studentId === st.id);
      const openErrs: {
        type: string;
        surah: string;
        ayah?: number;
        word?: string;
        repeatCount: number;
        date: string;
      }[] = [];

      stSessions.forEach((ses) => {
        (ses.errors || []).forEach((err) => {
          if (err.correctedInSession || err.followUpStatus === 'mastered') return;
          const rep = err.repeatCount || 1;
          openErrs.push({
            type: err.type || 'تجويد',
            surah: err.surah || st.currentStop.surahName,
            ayah: err.ayah || st.currentStop.ayah,
            word: err.word,
            repeatCount: rep,
            date: ses.date,
          });
          categoryCounter[err.type || 'تجويد'] =
            (categoryCounter[err.type || 'تجويد'] || 0) + 1;
        });
      });

      if (openErrs.length > 0) {
        studentsWithOpenErrors += 1;
        totalOpenErrors += openErrs.length;
        const rec = openErrs.filter((e) => e.repeatCount >= 2).length;
        const aged = openErrs.filter((e) => e.date <= cutoff14Days).length;
        recurringErrorsCount += rec;
        agedErrorsCount += aged;

        const topErr =
          openErrs.sort((a, b) => b.repeatCount - a.repeatCount)[0] || openErrs[0];
        const suggestedNextQuestion = topErr.word
          ? `اسأل الطالب في مطلع الحصة عن ضبط كلمة «${topErr.word}» في سورة ${topErr.surah} (آية ${topErr.ayah}) وتطبيق حكم (${topErr.type}).`
          : `اطلب من الطالب تسميع سورة ${topErr.surah} من آية ${topErr.ayah} مع التركيز على (${topErr.type}).`;

        priorityStudents.push({
          student: st,
          openCount: openErrs.length,
          recurringCount: rec,
          agedCount: aged,
          topErrorLabel: `${topErr.type} — سورة ${topErr.surah}${
            topErr.ayah ? ` آية ${topErr.ayah}` : ''
          }`,
          suggestedNextQuestion,
          score: openErrs.length * 10 + rec * 15 + aged * 12,
        });
      }
    });

    const topCategories = Object.entries(categoryCounter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    return {
      studentsWithOpenErrors,
      totalOpenErrors,
      recurringErrorsCount,
      agedErrorsCount,
      topCategories,
      priorityStudents: priorityStudents
        .sort((a, b) => b.score - a.score)
        .slice(0, 6),
    };
  }, [students, sessions]);

  const handleCopyAnonymizedManagementSummary = () => {
    const catText =
      teachingInsights.topCategories.length > 0
        ? teachingInsights.topCategories
            .map(([cat, cnt]) => `${cat} (${cnt})`)
            .join('، ')
        : 'لا توجد أخطاء مسجلة';
    const summary = `📊 ملخص خطة التدخل التعليمي للإدارة (إحصائي دون أسماء شخصية — ${today}):
• طلاب لديهم مواضع تحتاج تثبيت: ${teachingInsights.studentsWithOpenErrors}
• إجمالي الأخطاء المفتوحة للمتابعة: ${teachingInsights.totalOpenErrors}
• الأخطاء المتكررة (٢+ مرات): ${teachingInsights.recurringErrorsCount}
• الأخطاء القديمة (١٤+ يوماً): ${teachingInsights.agedErrorsCount}
• أبرز تصنيفات الأخطاء: ${catText}
• الحصص التعويضية المتابعة: ${makeupAgenda.items.length} (اليوم: ${makeupAgenda.dueTodayCount} | متأخرة: ${makeupAgenda.overdueCount})`;
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(summary);
      showToast(
        '📋 تم نسخ الملخص الإحصائي للإدارة (دون أسماء أو بيانات شخصية) بنجاح ✓',
        'success'
      );
    }
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    addTask({
      title: newTaskTitle.trim(),
      dueDate: newTaskDueDate,
      priority: newTaskPriority,
      studentId: newTaskStudentId || undefined,
      completed: false,
      notes: '',
    });
    setNewTaskTitle('');
    setNewTaskStudentId('');
    setShowAddTaskModal(false);
    showToast('تمت إضافة المهمة بنجاح إلى سجل المتابعة ✓', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Unified Summary Header Row */}
      <div className="rounded-3xl bg-white dark:bg-[#12231a] p-5 border border-neutral-200/80 dark:border-emerald-900/50 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#145a3a]/10 dark:bg-[#dfbd69]/15 border border-[#c59b27]/40 flex items-center justify-center text-[#145a3a] dark:text-[#dfbd69] shrink-0">
            {activeMode === 'tasks' ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-[#14281d] dark:text-white">
                {activeMode === 'tasks'
                  ? 'لوحة المهام والمتابعة اليومية للمعلم'
                  : 'رادار متابعة الطلاب المتعثرين والوقاية المبكرة'}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-[#145a3a]/10 dark:bg-emerald-950 text-[#145a3a] dark:text-[#dfbd69] text-[11px] font-extrabold">
                {activeMode === 'tasks'
                  ? `${taskStats.open} مهام مفتوحة`
                  : `${strugglingList.length} طلاب تحت الرعاية`}
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {activeMode === 'tasks'
                ? 'تصنيف ذكي للمهام حسب الأولوية وتاريخ الاستحقاق مع ربط مباشر بملف كل طالب'
                : 'رصد مبكر لتراجع الإتقان أو تكرار الغياب مع خطة علاجية وتنفيذ فوري بضغطة واحدة'}
            </p>
          </div>
        </div>

        {/* Mode Switcher + Primary Add CTA */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="inline-flex items-center p-1 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200/80 dark:border-emerald-900/60">
            <button
              type="button"
              onClick={() => {
                setActiveMode('tasks');
                setActiveDropdownId(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeMode === 'tasks'
                  ? 'bg-[#145a3a] text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300 hover:text-[#145a3a]'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>المهام ({taskStats.open})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode('struggling');
                setActiveDropdownId(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeMode === 'struggling'
                  ? 'bg-[#145a3a] text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300 hover:text-[#145a3a]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>الطلاب المتعثرون ({strugglingList.length})</span>
            </button>
          </div>

          {activeMode === 'tasks' && (
            <button
              type="button"
              onClick={() => setShowAddTaskModal(true)}
              className="px-4 py-2.5 rounded-2xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#dfbd69]" />
              <span>+ مهمة جديدة</span>
            </button>
          )}
        </div>
      </div>

      {/* Priority & Status Filter Bar */}
      <div className="rounded-3xl bg-white dark:bg-[#12231a] p-4 border border-neutral-200/80 dark:border-emerald-900/50 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Priority Classification Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-neutral-400 dark:text-neutral-500 ml-1">
              الأولوية:
            </span>
            {[
              {
                id: 'all' as const,
                label: 'الكل',
                count:
                  activeMode === 'tasks'
                    ? taskStats.open
                    : strugglingList.length,
                badgeClass: 'bg-neutral-200/70 dark:bg-emerald-950 text-neutral-700 dark:text-neutral-300',
              },
              {
                id: 'high' as const,
                label: '🔥 أولوية مرتفعة',
                count:
                  activeMode === 'tasks'
                    ? taskStats.highPriorityOpen
                    : strugglingList.filter((i) => i.riskScore >= 50).length,
                badgeClass: 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300',
              },
              {
                id: 'normal' as const,
                label: '🌿 أولوية عادية',
                count:
                  activeMode === 'tasks'
                    ? taskStats.normalPriorityOpen
                    : strugglingList.filter((i) => i.riskScore < 50).length,
                badgeClass: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300',
              },
            ].map((pf) => {
              const isSelected = priorityFilter === pf.id;
              return (
                <button
                  key={pf.id}
                  type="button"
                  onClick={() => setPriorityFilter(pf.id)}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-[#145a3a] text-white border-[#145a3a] shadow-xs'
                      : 'bg-[#f6f7f2] dark:bg-[#0b1711] text-neutral-700 dark:text-neutral-200 border-neutral-200/80 dark:border-emerald-900/50 hover:border-[#145a3a]'
                  }`}
                >
                  <span>{pf.label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      isSelected ? 'bg-white/20 text-white' : pf.badgeClass
                    }`}
                  >
                    {pf.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-neutral-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeMode === 'tasks'
                  ? 'ابحث في عنوان المهمة أو اسم الطالب...'
                  : 'ابحث باسم الطالب أو الحلقة...'
              }
              className="w-full pr-10 pl-3.5 py-2 rounded-2xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold focus:outline-hidden focus:border-[#145a3a]"
            />
          </div>
        </div>

        {/* Task Status Sub-Filters (Shown in Tasks Mode) */}
        {activeMode === 'tasks' && (
          <div className="pt-2.5 border-t border-neutral-100 dark:border-emerald-900/40 flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-neutral-400 dark:text-neutral-500 ml-1">
              حالة المهمة:
            </span>
            {[
              { id: 'open' as const, label: 'مفتوحة', count: taskStats.open },
              { id: 'today' as const, label: 'مستحقة اليوم', count: taskStats.dueToday },
              { id: 'overdue' as const, label: 'متأخرة', count: taskStats.overdue },
              { id: 'completed' as const, label: 'مكتملة ✓', count: taskStats.completed },
              { id: 'all' as const, label: 'كل السجل', count: taskStats.total },
            ].map((sf) => {
              const active = taskStatusFilter === sf.id;
              return (
                <button
                  key={sf.id}
                  type="button"
                  onClick={() => setTaskStatusFilter(sf.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-[#c59b27]/20 text-[#145a3a] dark:text-[#dfbd69] border border-[#c59b27]/60 font-extrabold'
                      : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#0b1711]'
                  }`}
                >
                  <span>{sf.label}</span>
                  <span className="text-[10px] font-mono opacity-80">({sf.count})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Collapsible Advanced Panels: 1) Firestore Late Session Background Service, 2) Makeup Agenda (Review 4), 3) Teaching Intervention Insights (Review 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Panel 1: Firestore Late Session Background Service */}
        <details
          open={lateSessionAlerts.length > 0}
          className="rounded-3xl bg-white dark:bg-[#12231a] border border-amber-300/70 dark:border-amber-800/50 p-4 shadow-2xs group"
        >
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center text-sm font-bold">
                ⏳
              </span>
              <div>
                <h3 className="text-xs font-extrabold text-[#14281d] dark:text-white">
                  خدمة رصد تأخر الحلقات (Firestore Push)
                </h3>
                <p className="text-[11px] text-neutral-500">
                  المتأخرون الآن: ({lateSessionAlerts.length}) • آخر فحص:{' '}
                  {lastLateSessionCheckTime || 'نشط بالخلفية'}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold">
              نشط تلقائياً
            </span>
          </summary>

          <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-emerald-900/40 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-neutral-600 dark:text-neutral-300">
                يجدول ويرسل Push Notification للطالب إذا لم يسجل دخولاً أو لم يُسجل له تسميع بحلول موعد حلقته في Firestore.
              </span>
              <button
                type="button"
                onClick={() => void triggerFirestoreLateCheckNow()}
                className="px-3 py-1.5 rounded-xl bg-[#145a3a] hover:bg-[#0f442b] text-white text-[11px] font-extrabold shrink-0 cursor-pointer"
              >
                فحص وجدولة الآن
              </button>
            </div>

            {lateSessionAlerts.length === 0 ? (
              <div className="p-2.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
                ✅ جميع الحلقات المجدولة حتى هذه اللحظة منتظمة ولا يوجد طلاب متأخرون عن الدخول أو التسميع.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {lateSessionAlerts.map((la) => (
                  <div
                    key={la.id}
                    className="p-2.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300/60 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-extrabold text-[#14281d] dark:text-white flex flex-wrap items-center gap-1.5">
                        <span>
                          {la.studentName} • تأخر {la.minutesLate} د
                        </span>
                        {la.missingLogin && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[9px] font-bold">
                            لم يسجل دخول
                          </span>
                        )}
                        {la.missingRecitation !== false && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200 text-[9px] font-bold">
                            لم يُسجل تسميع
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">
                        {la.circleName} (الموعد: {la.scheduledTime}) • سورة {la.surahName}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          void scheduleOrSendStudentMissedCirclePushNotification(
                            la.studentId,
                            { pullFromFirestore: true, silentToast: false }
                          )
                        }
                        className="px-2 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#14281d] text-[10px] font-extrabold cursor-pointer"
                        title="إرسال إشعار دفع Push فوري للطالب"
                      >
                        🔔 تنبيه Push
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStudentId(la.studentId);
                          setActiveTab('session');
                        }}
                        className="px-2.5 py-1 rounded-xl bg-[#145a3a] text-white text-[10px] font-extrabold cursor-pointer"
                      >
                        بدء الحصة
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Teacher Cron-like Circle Start Recitation Engine Monitor */}
            <div className="pt-2.5 border-t border-neutral-100 dark:border-emerald-900/40 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-extrabold text-[#14281d] dark:text-[#dfbd69]">
                    ⏱️ جدولة تنبيه المحفظين التلقائية (Cron — محرك التسميع)
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    فحص بدء محرك التسميع في Firestore عند بداية وقت الحلقة • آخر نبضة:{' '}
                    {lastTeacherCronCheckTime || 'نشط كل دقيقة (:00)'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void runTeacherCircleStartCronCheck({
                      pullFromFirestore: true,
                      silentToast: false,
                    })
                  }
                  className="px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 text-[10px] font-extrabold shrink-0 cursor-pointer"
                >
                  فحص Cron المحفظين
                </button>
              </div>

              {teacherCircleCronAlerts.length === 0 ? (
                <div className="p-2 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                  ✅ جميع الحلقات الجارية حالياً تم بدء &quot;محرك التسميع&quot; لها في Firestore.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {teacherCircleCronAlerts.map((ca) => (
                    <div
                      key={ca.id}
                      className="p-2 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-300/60 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-[11px] font-extrabold text-rose-900 dark:text-rose-200">
                          {ca.circleName} • المحفظ: {ca.teacherName}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          موعد البدء: {ca.scheduledTime} (منذ {ca.minutesSinceStart} د) • لم يبدأ محرك التسميع في Firestore
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void markRecitationEngineStartedInFirestore(
                            ca.circleId,
                            undefined,
                            'started'
                          );
                          setActiveTab('session');
                        }}
                        className="px-2.5 py-1 rounded-xl bg-[#145a3a] text-white text-[10px] font-extrabold shrink-0 cursor-pointer"
                      >
                        تشغيل محرك التسميع
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </details>

        {/* Panel 2: Review 4 — Makeup & Postponed Sessions Agenda */}
        <details className="rounded-3xl bg-white dark:bg-[#12231a] border border-neutral-200/80 dark:border-emerald-900/50 p-4 shadow-2xs group">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-2xl bg-[#145a3a]/10 text-[#145a3a] dark:text-[#dfbd69] flex items-center justify-center text-sm font-bold">
                📅
              </span>
              <div>
                <h3 className="text-xs font-extrabold text-[#14281d] dark:text-white">
                  التعويضات المؤجلة والمتابعة ({makeupAgenda.items.length})
                </h3>
                <p className="text-[11px] text-neutral-500">
                  اليوم: {makeupAgenda.dueTodayCount} • متأخرة: {makeupAgenda.overdueCount} • قادمة:{' '}
                  {makeupAgenda.upcomingCount}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-[#145a3a] dark:text-[#dfbd69]">
              عرض الجدول ▾
            </span>
          </summary>

          <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-emerald-900/40 space-y-2 text-xs max-h-56 overflow-y-auto">
            {makeupAgenda.items.length === 0 ? (
              <p className="text-[11px] text-neutral-500 py-2">
                لا توجد حصص غياب معلقة بانتظار التعويض حالياً.
              </p>
            ) : (
              makeupAgenda.items.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-2xl bg-neutral-50 dark:bg-[#0b1711] border border-neutral-200/70 dark:border-emerald-900/40 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-extrabold text-[#14281d] dark:text-white flex items-center gap-1.5">
                      <span>{item.studentName}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                          item.bucket === 'overdue'
                            ? 'bg-rose-100 text-rose-700'
                            : item.bucket === 'today'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {item.bucket === 'overdue'
                          ? 'متأخرة'
                          : item.bucket === 'today'
                          ? 'مستحقة اليوم'
                          : item.plannedDate || 'غير مجدولة'}
                      </span>
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      غياب: {item.absenceDate} • {item.arrangementLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentId(item.studentId);
                      setActiveTab('session');
                    }}
                    className="px-2.5 py-1 rounded-xl bg-[#145a3a] text-white text-[10px] font-extrabold cursor-pointer shrink-0"
                  >
                    تعويض الآن
                  </button>
                </div>
              ))
            )}
          </div>
        </details>

        {/* Panel 3: Review 5 — Teaching Intervention Insights */}
        <details className="rounded-3xl bg-white dark:bg-[#12231a] border border-neutral-200/80 dark:border-emerald-900/50 p-4 shadow-2xs group">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-2xl bg-[#c59b27]/20 text-[#145a3a] dark:text-[#dfbd69] flex items-center justify-center text-sm font-bold">
                🧭
              </span>
              <div>
                <h3 className="text-xs font-extrabold text-[#14281d] dark:text-white">
                  خطة التدخل التعليمي ({teachingInsights.totalOpenErrors} خطأ مفتوح)
                </h3>
                <p className="text-[11px] text-neutral-500">
                  متكررة ٢+: {teachingInsights.recurringErrorsCount} • قديمة ١٤+ ي:{' '}
                  {teachingInsights.agedErrorsCount}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-[#145a3a] dark:text-[#dfbd69]">
              التفاصيل ▾
            </span>
          </summary>

          <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-emerald-900/40 space-y-2.5 text-xs max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-neutral-500">
                أهم الطلاب ذوي الأولوية وسؤال الحصة المقترح:
              </span>
              <button
                type="button"
                onClick={handleCopyAnonymizedManagementSummary}
                className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-[#145a3a] dark:text-[#dfbd69] text-[10px] font-extrabold cursor-pointer"
              >
                📋 نسخ ملخص للإدارة
              </button>
            </div>

            {teachingInsights.priorityStudents.map((ps) => (
              <div
                key={ps.student.id}
                className="p-2.5 rounded-2xl bg-neutral-50 dark:bg-[#0b1711] border border-neutral-200/70 dark:border-emerald-900/40 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-[#14281d] dark:text-white">
                    {ps.student.name} ({ps.openCount} أخطاء)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentId(ps.student.id);
                      setActiveTab('session');
                    }}
                    className="px-2 py-0.5 rounded-lg bg-[#145a3a] text-white text-[10px] font-bold cursor-pointer"
                  >
                    فتح التسميع
                  </button>
                </div>
                <p className="text-[11px] text-[#145a3a] dark:text-[#dfbd69] font-bold">
                  🎯 {ps.suggestedNextQuestion}
                </p>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* MODE 1: TASKS GRID (Rounded-3xl Cards + Soft Shadows + One Primary CTA + [ ⋮ ] Menu) */}
      {activeMode === 'tasks' ? (
        filteredTasks.length === 0 ? (
          <div className="rounded-3xl bg-white dark:bg-[#12231a] p-12 text-center border border-neutral-200/80 dark:border-emerald-900/50 shadow-xs space-y-3">
            <div className="w-14 h-14 rounded-3xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-[#14281d] dark:text-white">
              لا توجد مهام مطابقة للتصنيف المحدد
            </h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              يمكنك تغيير فلتر الأولوية أو إضافة مهمة متابعة جديدة لتنظيم جدولك القرآني.
            </p>
            <button
              type="button"
              onClick={() => setShowAddTaskModal(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-[#145a3a] text-white text-xs font-extrabold cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#dfbd69]" />
              <span>إضافة مهمة جديدة</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTasks.map((t) => {
              const linkedStudent = (students ?? []).find(
                (s) => s.id === t.studentId
              );
              const isOverdue = !t.completed && t.dueDate < today;
              const isToday = !t.completed && t.dueDate === today;
              const isHighPriority = t.priority === 'مرتفع';
              const dropdownKey = `task-menu-${t.id}`;
              const isMenuOpen = activeDropdownId === dropdownKey;

              return (
                <div
                  key={t.id}
                  className={`relative rounded-3xl p-5 border transition-all duration-200 flex flex-col justify-between gap-4 ${
                    t.completed
                      ? 'bg-neutral-50/90 dark:bg-[#0b1711]/70 border-neutral-200/70 dark:border-emerald-950 opacity-80 shadow-2xs'
                      : isHighPriority
                      ? 'bg-white dark:bg-[#12231a] border-rose-200/90 dark:border-rose-900/50 shadow-sm hover:shadow-md'
                      : 'bg-white dark:bg-[#12231a] border-neutral-200/80 dark:border-emerald-900/50 shadow-sm hover:shadow-md'
                  }`}
                >
                  {/* Top Row: Priority Badge + Due Status + Single [ ⋮ ] Secondary Menu */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold ${
                            isHighPriority
                              ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                              : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50'
                          }`}
                        >
                          {isHighPriority ? (
                            <Flame className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                          ) : (
                            <Sparkles className="w-3 h-3 text-emerald-600" />
                          )}
                          <span>
                            {isHighPriority ? 'أولوية مرتفعة' : 'أولوية عادية'}
                          </span>
                        </span>

                        {isOverdue && (
                          <span className="px-2.5 py-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold">
                            متأخرة
                          </span>
                        )}
                        {isToday && (
                          <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold">
                            مستحقة اليوم
                          </span>
                        )}
                        {t.completed && (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold">
                            مكتملة ✓
                          </span>
                        )}
                      </div>

                      {/* Three-Dots Menu [ ⋮ ] */}
                      <div
                        className="relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setActiveDropdownId(isMenuOpen ? null : dropdownKey)
                          }
                          className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-[#0b1711] text-neutral-500 dark:text-neutral-400 transition-colors cursor-pointer"
                          title="خيارات إضافية"
                          aria-label="خيارات المهمة"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {isMenuOpen && (
                          <div className="absolute left-0 top-full mt-1.5 w-52 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-800 shadow-xl py-1.5 z-40 text-xs font-bold">
                            {linkedStudent && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveDropdownId(null);
                                    setSelectedStudentId(linkedStudent.id);
                                    setActiveTab('session');
                                  }}
                                  className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-[#145a3a] dark:text-[#dfbd69] cursor-pointer"
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                  <span>بدء حصة تسميع للطالب</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveDropdownId(null);
                                    setSelectedStudentId(linkedStudent.id);
                                    setActiveTab('students');
                                  }}
                                  className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-neutral-700 dark:text-neutral-200 cursor-pointer"
                                >
                                  <User className="w-3.5 h-3.5" />
                                  <span>فتح ملف الطالب</span>
                                </button>
                                <a
                                  href={buildWhatsAppUrl(
                                    linkedStudent.whatsappPhone,
                                    `${settings.whatsappHeader}\n\nولي أمر الطالب *${linkedStudent.name}*، تذكير ودي بخصوص: (${t.title}).\n\n${settings.whatsappFooter}`
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => setActiveDropdownId(null)}
                                  className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-emerald-700 dark:text-emerald-400 cursor-pointer"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                  <span>إرسال تذكير واتساب</span>
                                </a>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveDropdownId(null);
                                deleteTask(t.id);
                                showToast('تم حذف المهمة من السجل', 'info');
                              }}
                              className="w-full px-3.5 py-2 text-right hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 text-rose-600 dark:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف المهمة نهائياً</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Task Title */}
                    <h3
                      className={`text-sm font-extrabold leading-relaxed ${
                        t.completed
                          ? 'line-through text-neutral-400 dark:text-neutral-500'
                          : 'text-[#14281d] dark:text-white'
                      }`}
                    >
                      {t.title}
                    </h3>

                    {/* Meta Info: Date + Linked Student */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#f6f7f2] dark:bg-[#0b1711] font-mono">
                        <Calendar className="w-3 h-3 text-[#c59b27]" />
                        <span>
                          {formatGregorianAndHijri(
                            t.dueDate,
                            settings.showHijriDates ?? true,
                            'compact'
                          )}
                        </span>
                      </span>

                      {linkedStudent && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#145a3a]/10 dark:bg-emerald-950/80 text-[#145a3a] dark:text-[#dfbd69] font-bold">
                          <User className="w-3 h-3" />
                          <span>{linkedStudent.name}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: Strictly ONE Primary CTA */}
                  <div className="pt-3 border-t border-neutral-100 dark:border-emerald-900/40">
                    <button
                      type="button"
                      onClick={() => toggleTask(t.id)}
                      className={`w-full py-2.5 px-4 rounded-2xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        t.completed
                          ? 'bg-neutral-200/70 dark:bg-[#0b1711] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-300/70'
                          : 'bg-[#145a3a] hover:bg-[#0f452c] text-white shadow-2xs'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#dfbd69]" />
                      <span>
                        {t.completed
                          ? 'إعادة فتح المهمة للمتابعة'
                          : '✓ تأكيد إنجاز المهمة'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : /* MODE 2: STRUGGLING STUDENTS GRID (Rounded-3xl Cards + One Primary CTA + [ ⋮ ] Menu) */
      filteredStruggling.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#12231a] p-12 text-center border border-neutral-200/80 dark:border-emerald-900/50 shadow-xs space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
          <h3 className="text-base font-extrabold text-[#14281d] dark:text-white">
            جميع الطلاب في مستوى إتقان مطمئن ولله الحمد
          </h3>
          <p className="text-xs text-neutral-500">
            لا توجد حالات تعثر حرجة مطابقة للفلتر المحدد حالياً.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredStruggling.map(
            ({
              student,
              avgMastery,
              absenceCount,
              totalRecentErrors,
              topErrorType,
              topRepeatedAyahs,
              riskScore,
              reason,
              plan,
            }) => {
              const isHighRisk = riskScore >= 50;
              const dropdownKey = `struggling-menu-${student.id}`;
              const isMenuOpen = activeDropdownId === dropdownKey;

              const whatsappMessage = `${settings.whatsappHeader}\n\nولي أمر الطالب المكرم: *${student.guardianName}*\nنود إشعاركم بخطة المتابعة الخاصة بالطالب *${student.name}*:\n- موضع التوقف الحالي: سورة ${student.currentStop.surahName} آية ${student.currentStop.ayah}\n- الملاحظة التعليمية: ${reason}\n- الخطة العلاجية المقترحة: ${plan}\n\nنسعد بتعاونكم معنا لتثبيت الحفظ في المنزل.\n${settings.whatsappFooter}`;

              return (
                <div
                  key={student.id}
                  className="relative rounded-3xl bg-white dark:bg-[#12231a] p-5 border border-neutral-200/80 dark:border-emerald-900/50 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3.5">
                    {/* Card Header: Student Info + Priority Badge + [ ⋮ ] */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center font-extrabold text-xs shrink-0 ${
                            isHighRisk
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-300/50'
                              : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300/50'
                          }`}
                        >
                          {student.name
                            .split(' ')
                            .slice(0, 2)
                            .map((w) => w[0])
                            .join('')}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-extrabold text-[#14281d] dark:text-white truncate">
                            {student.name}
                          </h3>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                            {student.circle} • إتقان {avgMastery}%
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                            isHighRisk
                              ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300'
                              : 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {isHighRisk ? '🔥 أولوية مرتفعة' : 'متابعة وقائية'}
                        </span>

                        {/* Secondary Actions Dropdown [ ⋮ ] */}
                        <div
                          className="relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setActiveDropdownId(
                                isMenuOpen ? null : dropdownKey
                              )
                            }
                            className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-[#0b1711] text-neutral-500 cursor-pointer"
                            title="خيارات المتابعة"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {isMenuOpen && (
                            <div className="absolute left-0 top-full mt-1.5 w-52 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-800 shadow-xl py-1.5 z-40 text-xs font-bold">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  setSelectedStudentId(student.id);
                                  setActiveTab('students');
                                }}
                                className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-neutral-700 dark:text-neutral-200 cursor-pointer"
                              >
                                <User className="w-3.5 h-3.5" />
                                <span>عرض ملف الطالب الشامل</span>
                              </button>
                              <a
                                href={buildWhatsAppUrl(
                                  student.whatsappPhone,
                                  whatsappMessage
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setActiveDropdownId(null)}
                                className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-emerald-700 dark:text-emerald-400 cursor-pointer"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                <span>إرسال الخطة لولي الأمر واتساب</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  addTask({
                                    title: `حصة تثبيت ومراجعة علاجية للطالب ${student.name} (${reason})`,
                                    dueDate: today,
                                    priority: 'مرتفع',
                                    studentId: student.id,
                                    completed: false,
                                    notes: '',
                                  });
                                  showToast(
                                    `تم جدولة مهمة متابعة عاجلة للطالب ${student.name} ✓`,
                                    'success'
                                  );
                                }}
                                className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-[#145a3a] dark:text-[#dfbd69] cursor-pointer"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>تحويل إلى مهمة اليوم</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Diagnostic Reason & Plan */}
                    <div className="p-3.5 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200/60 dark:border-emerald-900/40 space-y-1.5 text-xs">
                      <div className="font-extrabold text-amber-800 dark:text-amber-300">
                        سبب التنبيه: {reason}
                      </div>
                      <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed text-[11px]">
                        <strong className="text-[#145a3a] dark:text-[#dfbd69]">
                          العلاج المقترح:
                        </strong>{' '}
                        {plan}
                      </p>
                    </div>

                    {/* Quick Metrics Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="px-2.5 py-1 rounded-xl bg-neutral-100 dark:bg-[#0b1711] font-semibold">
                        الأخطاء الأخيرة:{' '}
                        <strong className="font-mono">{totalRecentErrors}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-xl bg-neutral-100 dark:bg-[#0b1711] font-semibold">
                        الأكثر تكراراً: <strong>{topErrorType}</strong>
                      </span>
                      {absenceCount > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold">
                          غياب: {absenceCount}
                        </span>
                      )}
                      {topRepeatedAyahs.slice(0, 1).map(([loc, cnt]) => (
                        <span
                          key={loc}
                          className="px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-bold"
                        >
                          موضع متكرر: {loc} ({cnt}×)
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Card Footer: Strictly ONE Primary CTA */}
                  <div className="pt-3 border-t border-neutral-100 dark:border-emerald-900/40">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(student.id);
                        setActiveTab('session');
                      }}
                      className="w-full py-2.5 px-4 rounded-2xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
                    >
                      <BookOpen className="w-4 h-4 text-[#dfbd69]" />
                      <span>🎙️ بدء حصة تثبيت ومراجعة الآن</span>
                    </button>
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}

      {/* Modal: Add New Follow-up Task (z-50 with backdrop-blur-sm) */}
      {showAddTaskModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddTaskModal(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-800 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-emerald-900/50">
              <h3 className="text-base font-extrabold text-[#145a3a] dark:text-[#dfbd69] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#c59b27]" />
                <span>إضافة مهمة متابعة جديدة</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddTaskModal(false)}
                className="px-2.5 py-1 rounded-xl bg-neutral-100 dark:bg-[#0b1711] text-xs font-bold text-neutral-500 cursor-pointer"
              >
                إغلاق ✕
              </button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-300 mb-1.5">
                  عنوان المهمة أو التذكير *
                </label>
                <input
                  type="text"
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="مثال: اختبار تثبيت جزء عم للطالب معاذ..."
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-semibold focus:outline-hidden focus:border-[#145a3a]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-300 mb-1.5">
                    تصنيف الأولوية
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) =>
                      setNewTaskPriority(e.target.value as 'عادي' | 'مرتفع')
                    }
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                  >
                    <option value="مرتفع">🔥 أولوية مرتفعة (عاجل)</option>
                    <option value="عادي">🌿 أولوية عادية</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-300 mb-1.5">
                    تاريخ الاستحقاق
                  </label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-300 mb-1.5">
                  ربط بطالب محدد (اختياري)
                </label>
                <select
                  value={newTaskStudentId}
                  onChange={(e) => setNewTaskStudentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-semibold"
                >
                  <option value="">— مهمة عامة بدون طالب محدد —</option>
                  {(students ?? []).map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.circle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="px-4 py-2.5 rounded-2xl border border-neutral-200 dark:border-emerald-900 text-xs font-bold text-neutral-600 dark:text-neutral-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-2xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold cursor-pointer shadow-xs"
                >
                  حفظ المهمة الآن ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
