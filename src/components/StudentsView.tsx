import React, { useEffect, useMemo, useState } from 'react';
import { useAcademy } from '../context/AcademyContext';
import {
   DAY_NAMES,
  JUZ_NAMES,
  SURAHS,
} from '../data/quranData';
import {
  FeeRecord,
  LinkLogic,
  QuranRiwayah,
  Student,
  StudentLevel,
  StudentPlan,
} from '../types';
import {
  buildWhatsAppUrl,
  isValidWhatsAppPhone,
  normalizeWhatsAppPhone,
} from '../utils/whatsapp';
import { formatGregorianAndHijri } from '../utils/dateUtils';
import { getLocalDateString } from '../data/seedData';
import {
  HYBRID_FOUNDATION_LEVELS,
  OFFICIAL_ACADEMY_WHATSAPP,
} from '../data/hybridFoundationData';
import { QURAN_RIWAYAT_GUIDE } from '../data/educationalInnovationsData';
import {
  downloadPaymentReceiptPng,
  downloadStudentIdCardPng,
  generateOfflineQrMatrix,
  MilestoneBisharahModal,
  PaymentReceiptModal,
  StudentIdCardModal,
} from './StudentIdAndReceiptModals';
import { QuranTextModal } from './QuranTextModal';
import {
  FamilyGuidanceGeneratorSection,
  PedagogicalDiagnosticCard,
} from './PedagogicalAdvisorModal';
import { GamificationDashboard } from './GamificationDashboard';
import { NewMemAudioPlayerAndWhatsAppTool } from './NewMemAudioPlayerAndWhatsAppTool';
import { QuranCoverageAndGoalEngine } from './QuranCoverageAndGoalEngine';
import { MushafEngine } from './MushafEngine';
import { ERROR_PEDAGOGICAL_COACHING_MAP } from '../data/pedagogicalAdvisorData';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Crown,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  IdCard,
  MapPin,
  MoreVertical,
  Phone,
  Plus,
  Printer,
  QrCode,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  Eye,
  EyeOff,
  Lock,
  Wallet,
  X,
  Cloud,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { DEFAULT_SUPERVISOR_PERMISSIONS } from '../data/seedData';

export const StudentsView: React.FC = () => {
  const {
    students,
    sessions,
    circles,
    settings,
    managedTeachers,
    currentStaffTier,
    selectedStudentId,
    setSelectedStudentId,
    setActiveTab,
    saveStudent,
    updateStudent,
    deleteStudent,
    saveSession,
    setStudentAccountStatus,
    updateStudentPrivacyPreference,
    updateStudentFee,
    loginAsGuardianDirect,
    linkStudentStopToAyah,
    addStudentCustomMutashabih,
    deleteStudentCustomMutashabih,
    admissionRequests,
    approveAdmissionAsStudent,
    updateAdmissionRequestStatus,
    clearAllStudentsAndStartEmpty,
    currentTeacherPermissions,
    exportTeacherScopedJsonBackup,
    importTeacherScopedJsonBackup,
    triggerCloudSyncNow,
    restoreFromCloudFirestoreNow,
    cloudSyncStatus,
    lastSyncTimestamp,
    googleAuthUser,
    peerCompetitions,
    showToast,
  } = useAcademy();

  const supervisorPerms =
    settings.supervisorPermissions || DEFAULT_SUPERVISOR_PERMISSIONS;
  const canSeeAllTeachersStudents =
    currentStaffTier === 'owner' ||
    (currentStaffTier === 'supervisor' &&
      supervisorPerms.canViewAllTeachersStudents);
  const canManageStudents =
    currentStaffTier === 'owner' ||
    (currentStaffTier === 'teacher' &&
      currentTeacherPermissions.canAddAndEditStudents) ||
    (currentStaffTier === 'supervisor' &&
      supervisorPerms.canManageStudentsAndAdmissions);

  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [circleFilter, setCircleFilter] = useState<string>('');
  const [teacherFilter, setTeacherFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'نشط' | 'متوقف' | 'مؤرشف' | 'all'>('نشط');
  const [ownerRevealSensitive, setOwnerRevealSensitive] = useState(false);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDropdownId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveDropdownId(null);
    };
    const onClickOutside = () => setActiveDropdownId(null);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('click', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', onClickOutside);
    };
  }, [activeDropdownId]);

  const [profileTab, setProfileTab] = useState<
    'overview' | 'id_and_receipts' | 'mushaf' | 'errors' | 'sessions'
  >('overview');
  const [mushafViewMode, setMushafViewMode] = useState<'surahs' | 'juz'>('surahs');
  const [showAdvancedStudentAnalytics, setShowAdvancedStudentAnalytics] = useState(false);

  // Add/Edit Student Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formName, setFormName] = useState('');
  const [formGuardian, setFormGuardian] = useState('');
  const [formMotherName, setFormMotherName] = useState('');
  const [formGrandfatherName, setFormGrandfatherName] = useState('');
  const [formGrandmotherName, setFormGrandmotherName] = useState('');
  const [formUncleName, setFormUncleName] = useState('');
  const [formGoogleEmail, setFormGoogleEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPin, setFormPin] = useState('123456');
  const [formLevel, setFormLevel] = useState<StudentLevel>('مبتدئ');
  const [formRiwayah, setFormRiwayah] = useState<QuranRiwayah>('حفص عن عاصم');
  const [formCircle, setFormCircle] = useState(circles[0]?.name || '');
  const [formPlan, setFormPlan] = useState<StudentPlan>('متوازنة');
  const [formLinkLogic, setFormLinkLogic] = useState<LinkLogic>('الآية التالية');
  const [formDays, setFormDays] = useState<number[]>([0, 2, 4]);
  const [formTime, setFormTime] = useState('17:00');
  const [formDuration, setFormDuration] = useState(30);
  const [formFee, setFormFee] = useState(300);
  const [formNotes, setFormNotes] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [showAdmissionDrawer, setShowAdmissionDrawer] = useState(false);
  const [assignCircleMap, setAssignCircleMap] = useState<Record<string, string>>({});
  const [khatmahSimulatedPace, setKhatmahSimulatedPace] = useState<number>(1.5);

  const handleQuickAttendAndStartSession = (st: Student) => {
    setSelectedStudentId(st.id);
    const todayStr = getLocalDateString(0);
    saveSession({
      studentId: st.id,
      date: todayStr,
      status: 'حضر',
      masteryScore: 94,
      previousEvaluation: {
        newGrade: 'ممتاز',
        nearGrade: 'ممتاز',
        farGrade: 'جيد جداً',
      },
      actualRecitation: {
        enabled: true,
        surahId: st.currentStop.surahId,
        surahName: st.currentStop.surahName,
        isFullSurah: false,
        fromAyah: st.currentStop.ayah,
        toAyah: Math.min(st.currentStop.ayah + 10, 50),
        direction: 'asc',
        grade: 'ممتاز',
      },
      juzReview: {
        enabled: true,
        items: [],
        direction: 'desc',
      },
      surahReview: {
        enabled: true,
        surahNames: [],
        direction: 'desc',
      },
      errors: [],
      parentNotes: 'تم تسجيل الحضور الفوري عبر مسح بطاقة الهوية القرآنية (QR Code)',
      syncStatus: 'حصة محفوظة',
      createdAt: new Date().toISOString(),
    });
    setStudentIdCardOpen(false);
    setActiveTab('session');
    showToast(
      `⚡ تم تسجيل حضور الطالب (${st.name}) فورياً عبر بطاقة QR وفتح محرك الحصة الخماسي بنجاح ✓`,
      'success'
    );
  };

  // Certificate Modal State
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [certificateReason, setCertificateReason] = useState(
    'إتمام حفظ ومراجعة المقرر بتقدير ممتاز'
  );

  // Automatic WhatsApp Reminder Scheduler for Students without login > 3 days
  const [showInactivityScheduler, setShowInactivityScheduler] = useState<boolean>(false);
  const [onlyInactiveOver3DaysFilter, setOnlyInactiveOver3DaysFilter] = useState<boolean>(false);
  const [inactivityAutoScheduleEnabled, setInactivityAutoScheduleEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('wlq_auto_wa_inactivity_enabled');
      return saved ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [inactivityThresholdDays, setInactivityThresholdDays] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('wlq_auto_wa_inactivity_days'));
      return Number.isFinite(saved) && saved >= 1 ? saved : 3;
    } catch {
      return 3;
    }
  });
  const [inactivityScheduleTime, setInactivityScheduleTime] = useState<string>(() => {
    try {
      return localStorage.getItem('wlq_auto_wa_inactivity_time') || '18:00';
    } catch {
      return '18:00';
    }
  });
  const [inactivityCustomTemplate, setInactivityCustomTemplate] = useState<string>(() => {
    try {
      return (
        localStorage.getItem('wlq_auto_wa_inactivity_template') ||
        'السلام عليكم ورحمة الله وبركاته، ولي أمر الطالب *{studentName}* حفظه الله، نود تذكيركم بلطف بأنه مضى *{days} أيام* منذ آخر تسجيل دخول ومتابعة للطالب في بوابة أكاديمية الإمام (توقف الحفظ الحالي: سورة *{surahName}* آية *{ayah}*). نسعد بدخول الطالب اليوم لمراجعة ورده القرآني وتثبيت الحفظ.'
      );
    } catch {
      return 'السلام عليكم ورحمة الله وبركاته، ولي أمر الطالب *{studentName}* حفظه الله، نود تذكيركم بلطف بأنه مضى *{days} أيام* منذ آخر تسجيل دخول ومتابعة للطالب في بوابة أكاديمية الإمام (توقف الحفظ الحالي: سورة *{surahName}* آية *{ayah}*). نسعد بدخول الطالب اليوم لمراجعة ورده القرآني وتثبيت الحفظ.';
    }
  });
  const [scheduledReminderLog, setScheduledReminderLog] = useState<
    Record<string, { scheduledAt: string; sentAt?: string; status: 'مجدول تلقائياً' | 'تم الإرسال عبر واتساب' }>
  >(() => {
    try {
      const raw = localStorage.getItem('wlq_auto_wa_inactivity_log');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [activeSequentialBatchIndex, setActiveSequentialBatchIndex] = useState<number>(0);

  useEffect(() => {
    try {
      localStorage.setItem('wlq_auto_wa_inactivity_enabled', String(inactivityAutoScheduleEnabled));
      localStorage.setItem('wlq_auto_wa_inactivity_days', String(inactivityThresholdDays));
      localStorage.setItem('wlq_auto_wa_inactivity_time', inactivityScheduleTime);
      localStorage.setItem('wlq_auto_wa_inactivity_template', inactivityCustomTemplate);
      localStorage.setItem('wlq_auto_wa_inactivity_log', JSON.stringify(scheduledReminderLog));
    } catch {
      // ignore storage errors
    }
  }, [
    inactivityAutoScheduleEnabled,
    inactivityThresholdDays,
    inactivityScheduleTime,
    inactivityCustomTemplate,
    scheduledReminderLog,
  ]);

  // Compute last login / activity date and days since login for each student
  const studentInactivityMap = useMemo(() => {
    const nowMs = Date.now();
    const map: Record<
      string,
      {
        lastLoginDateStr: string;
        daysSinceLogin: number;
        isOverThreshold: boolean;
      }
    > = {};

    students.forEach((st) => {
      const explicitLogin = st.lastStudentLoginAt || st.lastLoginDate;
      const latestSessionDate = sessions
        .filter((s) => s.studentId === st.id && s.status === 'حضر')
        .map((s) => s.date)
        .sort((a, b) => b.localeCompare(a))[0];

      const referenceDateStr =
        explicitLogin || latestSessionDate || st.trackerLastReviewedDate || st.startDate || '';

      let daysSince = 999;
      if (referenceDateStr) {
        const parsedMs = new Date(referenceDateStr).getTime();
        if (Number.isFinite(parsedMs)) {
          daysSince = Math.max(0, Math.floor((nowMs - parsedMs) / (1000 * 60 * 60 * 24)));
        }
      }

      map[st.id] = {
        lastLoginDateStr: referenceDateStr ? referenceDateStr.slice(0, 10) : 'لم يسجل دخولاً بعد',
        daysSinceLogin: daysSince,
        isOverThreshold:
          (st.accountStatus || 'نشط') === 'نشط' && daysSince > inactivityThresholdDays,
      };
    });

    return map;
  }, [students, sessions, inactivityThresholdDays]);

  const inactiveStudentsOver3Days = useMemo(() => {
    return students
      .filter((st) => studentInactivityMap[st.id]?.isOverThreshold)
      .sort(
        (a, b) =>
          (studentInactivityMap[b.id]?.daysSinceLogin || 0) -
          (studentInactivityMap[a.id]?.daysSinceLogin || 0)
      );
  }, [students, studentInactivityMap]);

  const buildStudentInactivityWhatsAppMessage = (st: Student, idx = 0) => {
    const info = studentInactivityMap[st.id];
    const daysLabel =
      info && info.daysSinceLogin < 900 ? String(info.daysSinceLogin) : `أكثر من ${inactivityThresholdDays}`;
    const studentCode = st.code || `IQ-${st.id.replace(/\D/g, '') || String(101 + idx)}`;
    const body = inactivityCustomTemplate
      .replace(/\{studentName\}/g, st.name)
      .replace(/\{guardianName\}/g, st.guardianName || 'ولي الأمر')
      .replace(/\{days\}/g, daysLabel)
      .replace(/\{surahName\}/g, st.currentStop.surahName)
      .replace(/\{ayah\}/g, String(st.currentStop.ayah))
      .replace(/\{circle\}/g, st.circle);

    return `${settings.whatsappHeader}\n\n${body}\n\n🔑 بيانات الدخول السريع لبوابة الطالب:\n- كود الطالب: *${studentCode}*\n- الرمز السري (PIN): *${st.guardianPin || '123456'}*\n- موعد التذكير المجدول: *${inactivityScheduleTime}*\n\n${settings.whatsappFooter}`;
  };

  const handleScheduleAllInactiveReminders = () => {
    if (inactiveStudentsOver3Days.length === 0) {
      showToast('جميع الطلاب النشطين سجلوا دخولهم خلال آخر 3 أيام والحمد لله ✓', 'info');
      return;
    }
    const nowIso = new Date().toISOString();
    const nextLog = { ...scheduledReminderLog };
    inactiveStudentsOver3Days.forEach((st) => {
      nextLog[st.id] = {
        scheduledAt: nowIso,
        sentAt: nextLog[st.id]?.sentAt,
        status: nextLog[st.id]?.sentAt ? 'تم الإرسال عبر واتساب' : 'مجدول تلقائياً',
      };
    });
    setScheduledReminderLog(nextLog);
    setInactivityAutoScheduleEnabled(true);
    setActiveSequentialBatchIndex(0);
    showToast(
      `⏰ تمت جدولة تذكير واتساب التلقائي لعدد (${inactiveStudentsOver3Days.length}) طلاب لم يسجلوا دخولاً منذ أكثر من ${inactivityThresholdDays} أيام (الموعد اليومي: ${inactivityScheduleTime}) ✓`,
      'success'
    );
  };

  const handleMarkStudentInactivityReminderSent = (st: Student) => {
    const nowIso = new Date().toISOString();
    setScheduledReminderLog((prev) => ({
      ...prev,
      [st.id]: {
        scheduledAt: prev[st.id]?.scheduledAt || nowIso,
        sentAt: nowIso,
        status: 'تم الإرسال عبر واتساب',
      },
    }));
    updateStudent(st.id, {
      lastWhatsAppInactivityReminderAt: nowIso,
    });
    showToast(`💬 تم فتح محادثة واتساب وتسجيل إرسال التذكير للطالب (${st.name}) ✓`, 'success');
  };

  // Smart Student ID Card + Payment Receipt + Milestone Bisharah + Unified Mushaf Modal State
  const [studentIdCardOpen, setStudentIdCardOpen] = useState(false);
  const [bisharahModalOpen, setBisharahModalOpen] = useState(false);
  const [mushafModalOpen, setMushafModalOpen] = useState(false);
  const [activeReceiptFee, setActiveReceiptFee] = useState<FeeRecord | null>(
    null
  );

  // Personal Student Mutashabihat Form State
  const [mutFormOpen, setMutFormOpen] = useState(false);
  const [mutPrimarySurahId, setMutPrimarySurahId] = useState(78);
  const [mutPrimaryAyah, setMutPrimaryAyah] = useState(1);
  const [mutPrimaryText, setMutPrimaryText] = useState('');
  const [mutSimilarSurahId, setMutSimilarSurahId] = useState(79);
  const [mutSimilarAyah, setMutSimilarAyah] = useState(1);
  const [mutSimilarText, setMutSimilarText] = useState('');
  const [mutDiffWord1, setMutDiffWord1] = useState('');
  const [mutDiffWord2, setMutDiffWord2] = useState('');
  const [mutRuleNote, setMutRuleNote] = useState('');

  const openReceiptForStudent = (st: Student, feeItem?: FeeRecord) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const existing =
      feeItem ||
      st.fees.find((f) => f.month === currentMonth) ||
      st.fees[0] || {
        month: currentMonth,
        amount: st.monthlyFee || 350,
        status: 'مدفوع' as const,
        paidAt: new Date().toISOString().slice(0, 10),
        method: 'إنستا باي (InstaPay)',
        receiptNumber: `REC-${currentMonth.replace('-', '')}-${
          st.id.replace(/\D/g, '') || '101'
        }`,
      };
    setSelectedStudentId(st.id);
    setActiveReceiptFee({
      ...existing,
      receiptNumber:
        existing.receiptNumber ||
        `REC-${existing.month.replace('-', '')}-${
          st.id.replace(/\D/g, '') || '101'
        }`,
      paidAt: existing.paidAt || new Date().toISOString().slice(0, 10),
      method: existing.method || 'إنستا باي (InstaPay)',
    });
  };

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim();
    return students.filter((st) => {
      const matchSearch =
        !q ||
        st.name.includes(q) ||
        st.guardianName.includes(q) ||
        st.whatsappPhone.includes(q) ||
        st.circle.includes(q);
      const matchLevel = !levelFilter || st.level === levelFilter;
      const matchCircle = !circleFilter || st.circle === circleFilter;
      const stTeacherName =
        st.assignedTeacherName ||
        circles.find((c) => c.name === st.circle)?.teacherName ||
        settings.teacherName;
      const matchTeacher = !teacherFilter || stTeacherName === teacherFilter;
      const stStatus = st.accountStatus || 'نشط';
      const matchStatus = statusFilter === 'all' || stStatus === statusFilter;
      const matchInactivity =
        !onlyInactiveOver3DaysFilter || Boolean(studentInactivityMap[st.id]?.isOverThreshold);
      return (
        matchSearch &&
        matchLevel &&
        matchCircle &&
        matchTeacher &&
        matchStatus &&
        matchInactivity
      );
    });
  }, [
    students,
    circles,
    settings.teacherName,
    searchQuery,
    levelFilter,
    circleFilter,
    teacherFilter,
    statusFilter,
    onlyInactiveOver3DaysFilter,
    studentInactivityMap,
  ]);

  const activeStudent = useMemo(() => {
    return (
      students.find((s) => s.id === selectedStudentId) ||
      filteredStudents[0] ||
      students[0] ||
      null
    );
  }, [students, selectedStudentId, filteredStudents]);

  const studentSessions = useMemo(() => {
    if (!activeStudent) return [];
    return sessions
      .filter((s) => s.studentId === activeStudent.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [sessions, activeStudent]);

  // Repeated Errors Analysis
  const errorStats = useMemo(() => {
    const counts: Record<string, number> = {
      حفظ: 0,
      تردد: 0,
      تلقين: 0,
      تجويد: 0,
      تشكيل: 0,
      'نسيان آية': 0,
    };
    const detailedList = studentSessions.flatMap((s) => s.errors || []);
    detailedList.forEach((err) => {
      counts[err.type] = (counts[err.type] || 0) + 1;
    });
    return { counts, detailedList };
  }, [studentSessions]);

  const openAddModal = () => {
    setEditingStudent(null);
    setFormName('');
    setFormGuardian('');
    setFormMotherName('');
    setFormGrandfatherName('');
    setFormGrandmotherName('');
    setFormUncleName('');
    setFormGoogleEmail(googleAuthUser?.email || '');
    setFormPhone('010');
    setFormPin('123456');
    setFormLevel('مبتدئ');
    setFormRiwayah('حفص عن عاصم');
    setFormCircle(circles[0]?.name || 'الحلقة الثالثة - التأسيس والناشئة');
    setFormPlan('متوازنة');
    setFormLinkLogic('الآية التالية');
    setFormDays([0, 2, 4]);
    setFormTime('17:00');
    setFormDuration(30);
    setFormFee(300);
    setFormNotes('');
    setPhoneError('');
    setModalOpen(true);
  };

  const openEditModal = (st: Student) => {
    setEditingStudent(st);
    setFormName(st.name);
    setFormGuardian(st.guardianName);
    setFormMotherName(st.motherName || '');
    setFormGrandfatherName(st.grandfatherName || '');
    setFormGrandmotherName(st.grandmotherName || '');
    setFormUncleName(st.uncleName || '');
    setFormGoogleEmail(st.googleEmail || '');
    setFormPhone(st.whatsappPhone);
    setFormPin(st.guardianPin || '123456');
    setFormLevel(st.level);
    setFormRiwayah(st.riwayah || 'حفص عن عاصم');
    setFormCircle(st.circle);
    setFormPlan(st.plan);
    setFormLinkLogic(st.linkLogic);
    setFormDays(st.scheduleDays);
    setFormTime(st.scheduleTime);
    setFormDuration(st.sessionDuration);
    setFormFee(st.monthlyFee);
    setFormNotes(st.notes);
    setPhoneError('');
    setModalOpen(true);
  };

  const handleToggleDay = (dayIndex: number) => {
    setFormDays((prev) =>
      prev.includes(dayIndex)
        ? prev.filter((d) => d !== dayIndex)
        : [...prev, dayIndex].sort()
    );
  };

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    if (!isValidWhatsAppPhone(formPhone)) {
      setPhoneError('رقم واتساب غير صحيح. أدخل رقماً صحيحاً مثل 01012345678 أو 966501234567');
      return;
    }

    const saved = saveStudent({
      id: editingStudent?.id,
      name: formName.trim(),
      guardianName: formGuardian.trim() || 'ولي الأمر',
      motherName: formMotherName.trim() || undefined,
      grandfatherName: formGrandfatherName.trim() || undefined,
      grandmotherName: formGrandmotherName.trim() || undefined,
      uncleName: formUncleName.trim() || undefined,
      googleEmail: formGoogleEmail.trim() || editingStudent?.googleEmail || undefined,
      googleUid: editingStudent?.googleUid || googleAuthUser?.uid || undefined,
      whatsappPhone: normalizeWhatsAppPhone(formPhone),
      guardianPin: formPin.trim() || '123456',
      level: formLevel,
      riwayah: formRiwayah,
      circle: formCircle,
      plan: formPlan,
      linkLogic: formLinkLogic,
      scheduleDays: formDays,
      scheduleTime: formTime,
      sessionDuration: formDuration,
      startDate: editingStudent?.startDate || new Date().toISOString().slice(0, 10),
      notes: formNotes.trim(),
      memorizedSurahs: editingStudent?.memorizedSurahs || [1, 112, 113, 114],
      inProgressSurahs: editingStudent?.inProgressSurahs || [78],
      memorizedJuz: editingStudent?.memorizedJuz || [],
      currentStop: editingStudent?.currentStop || {
        surahId: 78,
        surahName: 'النبأ',
        ayah: 1,
        juzNumber: 30,
      },
      monthlyFee: Number(formFee) || 300,
      fees: editingStudent?.fees || [],
      disciplineWarnings: editingStudent?.disciplineWarnings || [],
    });

    setSelectedStudentId(saved.id);
    setModalOpen(false);
  };

  const toggleSurahMemorized = (surahId: number) => {
    if (!activeStudent) return;
    const isMem = activeStudent.memorizedSurahs.includes(surahId);
    const nextList = isMem
      ? activeStudent.memorizedSurahs.filter((id) => id !== surahId)
      : [...activeStudent.memorizedSurahs, surahId];
    saveStudent({ ...activeStudent, memorizedSurahs: nextList });
  };

  const toggleJuzMemorized = (juzNum: number) => {
    if (!activeStudent) return;
    const isMem = activeStudent.memorizedJuz.includes(juzNum);
    const nextList = isMem
      ? activeStudent.memorizedJuz.filter((j) => j !== juzNum)
      : [...activeStudent.memorizedJuz, juzNum];
    saveStudent({ ...activeStudent, memorizedJuz: nextList });
  };

  return (
    <div className="space-y-6">
      {/* Top Filter & Search Bar */}
      <div className="rounded-2xl bg-white dark:bg-[#12231a] p-4 border border-neutral-200 dark:border-emerald-900/50 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3.5 top-3 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم الطالب، ولي الأمر، أو رقم الهاتف..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-semibold focus:outline-hidden focus:border-[#145a3a]"
            />
          </div>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
          >
            <option value="">جميع المستويات</option>
            <option value="مبتدئ">مبتدئ</option>
            <option value="متوسط">متوسط</option>
            <option value="متقدم">متقدم</option>
          </select>

          <select
            value={circleFilter}
            onChange={(e) => setCircleFilter(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
          >
            <option value="">جميع الحلقات والمجموعات</option>
            {circles.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          {canSeeAllTeachersStudents && (
            <select
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
              title="تصفية الطلاب حسب المحفظ (متاح للمالك والمشرف المصرح له)"
            >
              <option value="">جميع المحفظين ({managedTeachers.filter((t) => t.staffRole !== 'supervisor').length})</option>
              {Array.from(
                new Set(
                  managedTeachers
                    .filter((t) => t.staffRole !== 'supervisor')
                    .map((t) => t.name)
                )
              ).map((tName) => (
                <option key={tName} value={tName}>
                  طلاب المحفظ: {tName}
                </option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as 'نشط' | 'متوقف' | 'مؤرشف' | 'all'
              )
            }
            className="px-3.5 py-2.5 rounded-xl border border-[#c59b27]/60 bg-[#fcfaf2] dark:bg-[#0b1711] text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69]"
            title="تصفية الطلاب حسب حالة الملف وسياسة الأرشفة الآمنة"
          >
            <option value="نشط">الطلاب النشطون ({students.filter((s) => (s.accountStatus || 'نشط') === 'نشط').length})</option>
            <option value="متوقف">المتوقفون مؤقتاً ({students.filter((s) => s.accountStatus === 'متوقف').length})</option>
            <option value="مؤرشف">الأرشيف الآمن ({students.filter((s) => s.accountStatus === 'مؤرشف').length})</option>
            <option value="all">جميع الملفات ({students.length})</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* WhatsApp Auto-Reminder Scheduler Toggle Button (> 3 Days No Login) */}
          <button
            type="button"
            onClick={() => setShowInactivityScheduler((prev) => !prev)}
            className={`flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-extrabold border transition-colors cursor-pointer shrink-0 ${
              showInactivityScheduler
                ? 'bg-[#c59b27] text-[#14281d] border-[#c59b27] shadow-xs'
                : 'bg-emerald-50 dark:bg-emerald-950/50 text-[#145a3a] dark:text-[#dfbd69] border-[#c59b27]/60 hover:bg-emerald-100'
            }`}
            title="جدولة تذكير تلقائي عبر واتساب للطلاب الذين لم يسجلوا دخولاً منذ أكثر من 3 أيام"
          >
            <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-[#dfbd69]" />
            <span>⏰ جدولة تذكير واتساب (+{inactivityThresholdDays} أيام)</span>
            <span className="px-1.5 py-0.5 rounded-full bg-[#145a3a] text-[#dfbd69] text-[10px] font-mono font-bold">
              {inactiveStudentsOver3Days.length}
            </span>
          </button>

          {canManageStudents && (
            <button
              type="button"
              onClick={openAddModal}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 text-[#dfbd69]" />
              <span>+ إضافة طالب</span>
            </button>
          )}

          {/* Secondary Toolbar Actions Grouped in Single [ ⋮ ] Dropdown */}
          <div
            className="relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() =>
                setActiveDropdownId(
                  activeDropdownId === 'students-toolbar-menu'
                    ? null
                    : 'students-toolbar-menu'
                )
              }
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#fcfaf2] dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-900 text-[#14281d] dark:text-[#dfbd69] text-xs font-extrabold hover:border-[#145a3a] transition-colors cursor-pointer"
              title="أدوات السجل السحابي وطابور القبول"
            >
              <MoreVertical className="w-4 h-4 text-[#c59b27]" />
              <span>أدوات السجل</span>
              {admissionRequests.filter((r) => r.status !== 'تم القبول').length >
                0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-[#14281d] text-[10px] font-mono font-bold">
                  {
                    admissionRequests.filter((r) => r.status !== 'تم القبول')
                      .length
                  }
                </span>
              )}
            </button>

            {activeDropdownId === 'students-toolbar-menu' && (
              <div className="absolute left-0 top-full mt-1.5 w-64 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-800 shadow-xl py-2 z-40 text-xs font-bold space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveDropdownId(null);
                    setShowAdmissionDrawer((p) => !p);
                  }}
                  className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center justify-between text-[#145a3a] dark:text-[#dfbd69] cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#c59b27]" />
                    <span>طابور القبول وتحديد المستوى</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-mono">
                    {
                      admissionRequests.filter((r) => r.status !== 'تم القبول')
                        .length
                    }
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveDropdownId(null);
                    void triggerCloudSyncNow(true);
                  }}
                  className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-emerald-700 dark:text-emerald-300 cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>☁️ حفظ سحابي فوري (Firestore)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveDropdownId(null);
                    void restoreFromCloudFirestoreNow();
                  }}
                  className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-neutral-700 dark:text-neutral-200 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#145a3a] dark:text-[#dfbd69]" />
                  <span>استعادة السجل من السحابة</span>
                </button>

                {currentTeacherPermissions.canExportTeacherJsonBackup && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDropdownId(null);
                      exportTeacherScopedJsonBackup();
                    }}
                    className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-neutral-700 dark:text-neutral-200 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#c59b27]" />
                    <span>تنزيل نسخة احتياطية JSON</span>
                  </button>
                )}

                {currentTeacherPermissions.canImportTeacherJsonBackup && (
                  <label className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-neutral-700 dark:text-neutral-200 cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-emerald-600" />
                    <span>رفع واستعادة ملف JSON</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        setActiveDropdownId(null);
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          try {
                            const parsed = JSON.parse(
                              String(ev.target?.result || '{}')
                            );
                            importTeacherScopedJsonBackup(parsed);
                          } catch {
                            showToast('تعذر قراءة ملف JSON المرفوع', 'error');
                          }
                        };
                        reader.readAsText(file);
                      }}
                      className="hidden"
                    />
                  </label>
                )}

                {students.length > 0 && currentStaffTier === 'owner' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDropdownId(null);
                      clearAllStudentsAndStartEmpty();
                    }}
                    className="w-full px-3.5 py-2 text-right hover:bg-rose-50 dark:hover:bg-rose-950/50 flex items-center gap-2 text-rose-600 dark:text-rose-400 cursor-pointer border-t border-neutral-100 dark:border-emerald-900/40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>بدء نظام جديد فارغ</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ⏰ لوحة جدولة التذكير التلقائي عبر واتساب للطلاب الذين لم يسجلوا دخولاً منذ أكثر من 3 أيام */}
      {showInactivityScheduler && (
        <div
          id="whatsapp-inactivity-scheduler-panel"
          className="rounded-3xl bg-white dark:bg-[#12231a] p-5 border-2 border-[#c59b27] shadow-md space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-100 dark:border-emerald-900/60">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#145a3a] text-[#dfbd69] flex items-center justify-center shrink-0 shadow-xs">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                    ⏰ جدولة تذكير تلقائي عبر واتساب للطلاب المتغيبين عن تسجيل الدخول (+{inactivityThresholdDays} أيام)
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      inactivityAutoScheduleEnabled
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                        : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {inactivityAutoScheduleEnabled
                      ? `✓ الجدولة التلقائية مفعّلة يومياً (${inactivityScheduleTime})`
                      : '⏸️ الجدولة التلقائية متوقفة'}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  يقوم النظام برصد الطلاب النشطين الذين لم يسجلوا دخولاً لبوابة الطالب أو لم يُسجل لهم حضور منذ أكثر من {inactivityThresholdDays} أيام وتجهيز جدول رسائل التذكير عبر واتساب مع كود الدخول وموضع الحفظ.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyInactiveOver3DaysFilter((p) => !p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer border transition ${
                  onlyInactiveOver3DaysFilter
                    ? 'bg-[#145a3a] text-[#dfbd69] border-[#c59b27]'
                    : 'bg-[#fcfaf2] dark:bg-[#0b1711] text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-emerald-900'
                }`}
              >
                {onlyInactiveOver3DaysFilter
                  ? '✓ عرض المنقطعين فقط في القائمة'
                  : `تصفية القائمة للمنقطعين (${inactiveStudentsOver3Days.length})`}
              </button>

              <button
                type="button"
                onClick={() => setShowInactivityScheduler(false)}
                className="px-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-emerald-950 text-xs font-bold cursor-pointer"
              >
                إغلاق ✕
              </button>
            </div>
          </div>

          {/* Schedule Controls & Message Template */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-[#fcfaf2] dark:bg-[#0b1711] p-4 rounded-2xl border border-[#c59b27]/40">
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-[#14281d] dark:text-white flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inactivityAutoScheduleEnabled}
                    onChange={(e) => setInactivityAutoScheduleEnabled(e.target.checked)}
                    className="w-4 h-4 accent-[#145a3a] rounded cursor-pointer"
                  />
                  <span>تفعيل التذكير التلقائي المجدول يومياً</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 dark:text-neutral-300 mb-1">
                    عتبة عدم تسجيل الدخول (بالأيام):
                  </label>
                  <select
                    value={inactivityThresholdDays}
                    onChange={(e) => setInactivityThresholdDays(Number(e.target.value) || 3)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-800 bg-white dark:bg-[#12231a] text-xs font-bold"
                  >
                    <option value={2}>أكثر من يومين (2 أيام)</option>
                    <option value={3}>أكثر من 3 أيام (الافتراضي)</option>
                    <option value={5}>أكثر من 5 أيام</option>
                    <option value={7}>أكثر من 7 أيام (أسبوع)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 dark:text-neutral-300 mb-1">
                    وقت إرسال التذكير اليومي:
                  </label>
                  <input
                    type="time"
                    value={inactivityScheduleTime}
                    onChange={(e) => setInactivityScheduleTime(e.target.value || '18:00')}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-800 bg-white dark:bg-[#12231a] text-xs font-bold font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleScheduleAllInactiveReminders}
                  className="flex-1 py-2.5 px-3.5 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-[#dfbd69] text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    جدولة تذكير واتساب للجميع ({inactiveStudentsOver3Days.length} طالب)
                  </span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                  قالب رسالة التذكير التلقائية عبر واتساب (يدعم المتغيرات: {'{studentName}'}، {'{days}'}، {'{surahName}'}، {'{ayah}'}):
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setInactivityCustomTemplate(
                      'السلام عليكم ورحمة الله وبركاته، ولي أمر الطالب *{studentName}* حفظه الله، نود تذكيركم بلطف بأنه مضى *{days} أيام* منذ آخر تسجيل دخول ومتابعة للطالب في بوابة أكاديمية الإمام (توقف الحفظ الحالي: سورة *{surahName}* آية *{ayah}*). نسعد بدخول الطالب اليوم لمراجعة ورده القرآني وتثبيت الحفظ.'
                    )
                  }
                  className="text-[10px] font-bold text-neutral-500 hover:text-[#145a3a] cursor-pointer"
                >
                  استعادة النص الافتراضي
                </button>
              </div>
              <textarea
                rows={3}
                value={inactivityCustomTemplate}
                onChange={(e) => setInactivityCustomTemplate(e.target.value)}
                className="w-full p-3 rounded-xl border border-neutral-300 dark:border-emerald-800 bg-white dark:bg-[#12231a] text-xs font-semibold leading-relaxed"
              />
            </div>
          </div>

          {/* Sequential Batch Queue Bar + Student Cards (> 3 Days without login) */}
          {inactiveStudentsOver3Days.length === 0 ? (
            <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-500/30 text-center text-xs font-bold text-emerald-800 dark:text-emerald-200">
              ✓ ممتاز! لا يوجد أي طالب نشط متأخر عن تسجيل الدخول لأكثر من {inactivityThresholdDays} أيام حالياً.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Quick Sequential Sender Helper Bar */}
              {(() => {
                const safeIdx = Math.min(
                  activeSequentialBatchIndex,
                  Math.max(0, inactiveStudentsOver3Days.length - 1)
                );
                const currentTargetStudent = inactiveStudentsOver3Days[safeIdx];
                const currentTargetInfo = currentTargetStudent
                  ? studentInactivityMap[currentTargetStudent.id]
                  : null;
                return (
                  currentTargetStudent && (
                    <div className="p-3 rounded-2xl bg-gradient-to-l from-[#145a3a] to-[#0f452c] text-white flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-xs">
                        <span className="px-2.5 py-1 rounded-xl bg-black/25 text-[#dfbd69] font-mono font-extrabold">
                          طابور الإرسال السريع ({safeIdx + 1} / {inactiveStudentsOver3Days.length})
                        </span>
                        <div>
                          <span className="font-extrabold text-[#dfbd69]">
                            {currentTargetStudent.name}
                          </span>{' '}
                          <span className="text-emerald-100 text-[11px]">
                            (آخر دخول: {currentTargetInfo?.lastLoginDateStr} • منذ{' '}
                            {currentTargetInfo && currentTargetInfo.daysSinceLogin < 900
                              ? `${currentTargetInfo.daysSinceLogin} يوم`
                              : `+${inactivityThresholdDays} أيام`}
                            )
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={buildWhatsAppUrl(
                            currentTargetStudent.whatsappPhone,
                            buildStudentInactivityWhatsAppMessage(currentTargetStudent, safeIdx)
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            handleMarkStudentInactivityReminderSent(currentTargetStudent);
                            if (safeIdx + 1 < inactiveStudentsOver3Days.length) {
                              setActiveSequentialBatchIndex(safeIdx + 1);
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-[#c59b27] hover:bg-[#b58c1e] text-[#14281d] text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>💬 إرسال التذكير عبر واتساب والانتقال للتالي</span>
                        </a>
                      </div>
                    </div>
                  )
                );
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {inactiveStudentsOver3Days.map((st, i) => {
                  const info = studentInactivityMap[st.id];
                  const logEntry = scheduledReminderLog[st.id];
                  const waMessage = buildStudentInactivityWhatsAppMessage(st, i);
                  return (
                    <div
                      key={st.id}
                      className="p-3.5 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-900/60 flex flex-col justify-between gap-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-extrabold text-[#14281d] dark:text-white truncate">
                            {st.name}
                          </div>
                          <div className="text-[11px] text-neutral-500 truncate">
                            {st.circle} • سورة {st.currentStop.surahName} ({st.currentStop.ayah})
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-mono font-extrabold shrink-0">
                          {info && info.daysSinceLogin < 900
                            ? `منذ ${info.daysSinceLogin} يوم`
                            : `+${inactivityThresholdDays} أيام`}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-neutral-500">
                        <span>آخر نشاط: {info?.lastLoginDateStr}</span>
                        {logEntry ? (
                          <span
                            className={`px-2 py-0.5 rounded-full font-extrabold ${
                              logEntry.status === 'تم الإرسال عبر واتساب'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-[#c59b27]/20 text-[#145a3a] dark:text-[#dfbd69]'
                            }`}
                          >
                            {logEntry.status} ({inactivityScheduleTime})
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-bold">
                            بانتظار الجدولة
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 pt-1 border-t border-neutral-200/70 dark:border-emerald-900/40">
                        <button
                          type="button"
                          onClick={() => {
                            const nowIso = new Date().toISOString();
                            setScheduledReminderLog((prev) => ({
                              ...prev,
                              [st.id]: {
                                scheduledAt: nowIso,
                                sentAt: prev[st.id]?.sentAt,
                                status: 'مجدول تلقائياً',
                              },
                            }));
                            showToast(
                              `⏰ تمت جدولة تذكير واتساب التلقائي للطالب (${st.name}) الساعة ${inactivityScheduleTime} ✓`,
                              'info'
                            );
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-800 text-[#145a3a] dark:text-[#dfbd69] text-[10px] font-extrabold cursor-pointer"
                        >
                          ⏰ جدولة ({inactivityScheduleTime})
                        </button>

                        <a
                          href={buildWhatsAppUrl(st.whatsappPhone, waMessage)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => handleMarkStudentInactivityReminderSent(st)}
                          className="flex-1 py-1.5 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Phone className="w-3 h-3" />
                          <span>إرسال التذكير واتساب</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. طابور القبول وطلبات الالتحاق للطلاب الجدد (New Student Admission Queue) */}
      {showAdmissionDrawer && (
        <div className="rounded-3xl bg-white dark:bg-[#12231a] p-5 border-2 border-[#c59b27] shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-100 dark:border-emerald-950">
            <div>
              <h3 className="text-sm font-extrabold text-[#145a3a] dark:text-[#dfbd69] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#c59b27]" />
                <span>طلبات الالتحاق وطابور القبول وتحديد المستوى ({admissionRequests.length})</span>
              </h3>
              <p className="text-xs text-neutral-500">
                راجع طلبات أولياء الأمور الجدد واقبل الطالب بضغطة واحدة لإنشاء ملفه وإلحاقه بالحلقة المناسبة
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdmissionDrawer(false)}
              className="px-3 py-1 rounded-xl bg-neutral-100 dark:bg-emerald-950 text-xs font-bold cursor-pointer"
            >
              إخفاء ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {admissionRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-2xl bg-[#fcfaf2] dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-900/50 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-sm text-[#145a3a] dark:text-[#dfbd69]">
                    {req.studentName} ({req.age} سنوات)
                  </strong>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold">
                    {req.status}
                  </span>
                </div>
                <div className="text-neutral-600 dark:text-neutral-300 space-y-0.5">
                  <div>
                    ولي الأمر: <strong>{req.guardianName}</strong> • واتساب:{' '}
                    <span className="font-mono">{req.guardianPhone}</span>
                  </div>
                  <div>
                    الرواية المطلوبة: <strong>{req.requestedRiwayah}</strong> • المستوى:{' '}
                    {req.currentLevel}
                  </div>
                  <div>
                    الموعد المفضل: {req.preferredDays} ({req.preferredTime}) • المنطقة:{' '}
                    {req.countryOrTimezone}
                  </div>
                </div>
                {req.fatihaAudioDataUrl && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-400/40 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-bold text-amber-900 dark:text-amber-200">
                      <span>🎙️ تلاوة سورة الفاتحة لتحديد المستوى الأولي:</span>
                      {req.fatihaAudioDurationSec && (
                        <span className="font-mono text-[10px]">{req.fatihaAudioDurationSec} ثانية</span>
                      )}
                    </div>
                    <audio
                      controls
                      src={req.fatihaAudioDataUrl}
                      className="h-7 w-full max-w-sm"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] font-bold text-neutral-500">تسكين في حلقة:</span>
                  <select
                    value={assignCircleMap[req.id] || circles[0]?.name || ''}
                    onChange={(e) =>
                      setAssignCircleMap((prev) => ({ ...prev, [req.id]: e.target.value }))
                    }
                    className="px-2.5 py-1 rounded-xl border border-neutral-300 dark:border-emerald-800 bg-white dark:bg-[#12231a] text-xs font-bold text-[#145a3a] dark:text-[#dfbd69]"
                  >
                    {circles.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} ({c.level})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200/70 dark:border-emerald-900/40">
                  {req.status !== 'تم القبول' && (
                    <button
                      type="button"
                      onClick={() =>
                        approveAdmissionAsStudent(
                          req.id,
                          assignCircleMap[req.id] || circles[0]?.name || 'حلقة النور والبيان (الناشئة)'
                        )
                      }
                      className="px-3.5 py-1.5 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white font-extrabold cursor-pointer shadow-xs transition"
                    >
                      ✅ قبول وتسكين في الحلقة فوراً
                    </button>
                  )}
                  <a
                    href={buildWhatsAppUrl(
                      req.guardianPhone || req.whatsappPhone || '',
                      `السلام عليكم ورحمة الله، مرحباً بكم في ${settings.academyName}. بخصوص طلب التحاق الطالب (${req.studentName}) برواية (${req.requestedRiwayah || req.preferredRiwayah})، يسعدنا تحديد موعد المقابلة وتحديد المستوى.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold cursor-pointer"
                  >
                    💬 مراسلة ولي الأمر
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Split View: Students List (Right 4 cols) + Comprehensive Student Profile (Left 8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Students List Column */}
        <div className="lg:col-span-4 space-y-2.5">
          <div className="flex items-center justify-between px-1 text-xs font-bold text-neutral-500">
            <span>قائمة الطلاب ({filteredStudents.length})</span>
            <span>انقر لعرض الملف الشامل</span>
          </div>

          <div className="space-y-2.5 max-h-[75vh] overflow-y-auto pl-1 pb-16">
            {filteredStudents.map((st, idx) => {
              const isSelected = activeStudent?.id === st.id;
              const stSessions = sessions.filter(
                (s) => s.studentId === st.id && s.status === 'حضر'
              );
              const avgMastery =
                stSessions.length > 0
                  ? Math.round(
                      stSessions.reduce((a, b) => a + b.masteryScore, 0) /
                        stSessions.length
                    )
                  : 90;
              const quranCoveragePercent = Math.min(
                100,
                Math.max(
                  1,
                  Math.round(
                    ((st.memorizedJuz.length * 20 +
                      st.memorizedSurahs.length * 1.2) /
                      604) *
                      100
                  )
                )
              );
              const studentCode = `IQ-${
                st.id.replace(/\D/g, '') || String(101 + idx)
              }`;
              const cardMenuId = `student-card-menu-${st.id}`;
              const isCardMenuOpen = activeDropdownId === cardMenuId;

              return (
                <div
                  key={st.id}
                  onClick={() => setSelectedStudentId(st.id)}
                  className={`relative p-4 rounded-3xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#145a3a] text-white border-[#145a3a] shadow-md'
                      : 'bg-white dark:bg-[#12231a] border-neutral-200 dark:border-emerald-900/50 hover:border-[#145a3a] shadow-2xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-2xl font-bold text-xs flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-white/15 text-[#dfbd69]'
                            : 'bg-[#145a3a]/10 text-[#145a3a] dark:text-[#dfbd69]'
                        }`}
                      >
                        {st.name
                          .split(' ')
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join('')}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-extrabold truncate">
                            {st.name}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                              isSelected
                                ? 'bg-black/25 text-[#dfbd69]'
                                : 'bg-neutral-100 dark:bg-[#0b1711] text-[#145a3a] dark:text-[#dfbd69]'
                            }`}
                          >
                            {studentCode}
                          </span>
                          {studentInactivityMap[st.id]?.isOverThreshold && (
                            <span
                              className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold ${
                                isSelected
                                  ? 'bg-amber-400 text-[#14281d]'
                                  : 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                              }`}
                              title={`لم يسجل دخولاً منذ أكثر من ${inactivityThresholdDays} أيام`}
                            >
                              ⏰ لم يسجل دخول (+{inactivityThresholdDays} أيام)
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-xs truncate mt-0.5 ${
                            isSelected
                              ? 'text-emerald-100'
                              : 'text-neutral-500 dark:text-neutral-400'
                          }`}
                        >
                          تغطية القرآن {quranCoveragePercent}% · آخر درجة{' '}
                          {avgMastery}%
                        </div>
                      </div>
                    </div>

                    {/* Single [ ⋮ خيارات ] Dropdown Menu */}
                    <div
                      className="relative shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setActiveDropdownId(
                            isCardMenuOpen ? null : cardMenuId
                          )
                        }
                        className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                          isSelected
                            ? 'hover:bg-white/15 text-[#dfbd69]'
                            : 'hover:bg-neutral-100 dark:hover:bg-[#0b1711] text-neutral-500'
                        }`}
                        title="خيارات الطالب"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isCardMenuOpen && (
                        <div className="absolute left-0 top-full mt-1 w-60 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-800 shadow-xl py-1.5 z-40 text-xs font-bold text-neutral-700 dark:text-neutral-200">
                          <a
                            href={buildWhatsAppUrl(
                              st.whatsappPhone,
                              buildStudentInactivityWhatsAppMessage(st, idx)
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              setActiveDropdownId(null);
                              handleMarkStudentInactivityReminderSent(st);
                            }}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-amber-700 dark:text-[#dfbd69] cursor-pointer"
                          >
                            <Calendar className="w-3.5 h-3.5 text-[#c59b27]" />
                            <span>⏰ تذكير واتساب لعدم الدخول (+3 أيام)</span>
                          </a>

                          <a
                            href={buildWhatsAppUrl(
                              st.whatsappPhone,
                              `${settings.whatsappHeader}\n\nولي أمر الطالب *${st.name}*، إليكم بيانات الدخول لبوابة المتابعة القرآنية:\n- كود الطالب: *${studentCode}*\n- الرمز السري (PIN): *${st.guardianPin || '123456'}*\n- الرابط المباشر: https://welivequranacademy.online/?portal=guardian\n\n${settings.whatsappFooter}`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setActiveDropdownId(null)}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-emerald-700 dark:text-emerald-400 cursor-pointer"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>إرسال الكود والرمز السري واتساب</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveDropdownId(null);
                              setSelectedStudentId(st.id);
                              setStudentIdCardOpen(true);
                            }}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 cursor-pointer"
                          >
                            <IdCard className="w-3.5 h-3.5 text-[#c59b27]" />
                            <span>بطاقة الطالب الذكية (QR)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveDropdownId(null);
                              openReceiptForStudent(st);
                            }}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-emerald-600" />
                            <span>إصدار إيصال سداد</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveDropdownId(null);
                              setSelectedStudentId(st.id);
                              setCertificateOpen(true);
                            }}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 cursor-pointer"
                          >
                            <Award className="w-3.5 h-3.5 text-[#c59b27]" />
                            <span>إصدار شهادة تقدير</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveDropdownId(null);
                              openEditModal(st);
                            }}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تعديل بيانات الطالب</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: Current Stop + Strictly ONE Primary CTA [ 🎙️ تسميع ] */}
                  <div
                    className={`mt-3 pt-2.5 border-t flex items-center justify-between gap-2 text-[11px] ${
                      isSelected
                        ? 'border-emerald-700/70 text-emerald-100'
                        : 'border-neutral-100 dark:border-emerald-950 text-neutral-500 dark:text-neutral-400'
                    }`}
                  >
                    <span className="truncate">
                      توقف: سورة {st.currentStop.surahName} ({st.currentStop.ayah})
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedStudentId(st.id);
                        setActiveTab('session');
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer shrink-0 flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-[#c59b27] text-[#14281d] shadow-xs'
                          : 'bg-[#145a3a] text-white hover:bg-[#0f452c]'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>🎙️ تسميع</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Comprehensive Student Profile Column (No overflow-hidden so dropdowns never clip) */}
        <div className="lg:col-span-8">
          {activeStudent ? (
            <div className="rounded-3xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/50 shadow-xs">
              {/* Profile Header */}
              <div className="p-6 rounded-t-3xl bg-gradient-to-l from-[#145a3a] to-[#0f452c] text-white">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/15 border border-[#c59b27]/50 flex items-center justify-center text-xl font-extrabold text-[#dfbd69]">
                      {activeStudent.name
                        .split(' ')
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-extrabold">{activeStudent.name}</h2>
                        {(settings.limitedSharingMode ||
                          activeStudent.privacyPreference === 'limited' ||
                          activeStudent.privacyPreference === 'private' ||
                          (settings.hidePersonalDataFromPublic ?? true)) && (
                          <span className="px-2.5 py-0.5 rounded-lg bg-black/25 border border-[#dfbd69]/50 text-[#dfbd69] text-[10px] font-extrabold flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>
                              {settings.limitedSharingMode ||
                              activeStudent.privacyPreference === 'limited'
                                ? 'وضع المشاركة المحدودة (Private Mode)'
                                : activeStudent.privacyPreference === 'private'
                                ? 'إخفاء كامل عن العامة'
                                : 'محمي من الظهور للعامة'}
                            </span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-emerald-100 mt-1">
                        {activeStudent.circle} · المحفظ:{' '}
                        {activeStudent.assignedTeacherName ||
                          circles.find((c) => c.name === activeStudent.circle)
                            ?.teacherName ||
                          settings.teacherName}{' '}
                        · المستوى: {activeStudent.level} · الخطة:{' '}
                        {activeStudent.plan} · الربط: من {activeStudent.linkLogic}
                      </p>
                      {(() => {
                        const isPrivacyMaskActive =
                          (settings.limitedSharingMode ||
                            (settings.maskStudentPhoneAndPin ?? true) ||
                            activeStudent.privacyPreference === 'limited' ||
                            activeStudent.privacyPreference === 'private') &&
                          !(
                            ownerRevealSensitive &&
                            (currentStaffTier === 'owner' ||
                              (currentStaffTier === 'supervisor' &&
                                supervisorPerms.canViewSensitiveStudentContact))
                          );

                        const maskedPhone =
                          activeStudent.whatsappPhone.length >= 7
                            ? `${activeStudent.whatsappPhone.slice(
                                0,
                                4
                              )}•••••${activeStudent.whatsappPhone.slice(-3)}`
                            : '••••••••••';

                        return (
                          <div className="flex flex-wrap items-center gap-3 text-xs text-[#dfbd69] mt-2">
                            <span>ولي الأمر: {activeStudent.guardianName}</span>
                            <span>·</span>
                            <span className="tabular-nums font-mono" dir="ltr">
                              +{isPrivacyMaskActive ? maskedPhone : activeStudent.whatsappPhone}
                            </span>
                            <span>·</span>
                            <span className="tabular-nums font-mono">
                              PIN البوابة: {isPrivacyMaskActive ? '••••••' : activeStudent.guardianPin}
                            </span>
                            {(currentStaffTier === 'owner' ||
                              (currentStaffTier === 'supervisor' &&
                                supervisorPerms.canViewSensitiveStudentContact)) && (
                              <button
                                type="button"
                                onClick={() => setOwnerRevealSensitive((p) => !p)}
                                className="px-2 py-0.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                title="إظهار أو إخفاء بيانات الاتصال السرية (خاص بالمالك والمشرف المصرح له)"
                              >
                                {ownerRevealSensitive ? (
                                  <>
                                    <EyeOff className="w-3 h-3" />
                                    <span>إخفاء الرقم والرمز</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye className="w-3 h-3" />
                                    <span>إظهار للمالك</span>
                                  </>
                                )}
                              </button>
                            )}
                            {canManageStudents && (
                              <select
                                value={
                                  activeStudent.privacyPreference ||
                                  (settings.limitedSharingMode ? 'limited' : 'standard')
                                }
                                onChange={(e) =>
                                  updateStudentPrivacyPreference(
                                    activeStudent.id,
                                    e.target.value as 'standard' | 'limited' | 'private'
                                  )
                                }
                                className="px-2 py-0.5 rounded-lg bg-black/25 border border-white/20 text-white text-[10px] font-extrabold cursor-pointer"
                                title="تفضيل الخصوصية لهذا الطالب"
                              >
                                <option value="standard" className="text-black">
                                  خصوصية: قياسي
                                </option>
                                <option value="limited" className="text-black">
                                  خصوصية: مشاركة محدودة (Private Mode)
                                </option>
                                <option value="private" className="text-black">
                                  خصوصية: إخفاء كامل عن العامة
                                </option>
                              </select>
                            )}
                          </div>
                        );
                      })()}
                      {(!settings.hideFamilyLineageInPublicViews ||
                        currentStaffTier === 'owner') &&
                        (activeStudent.motherName ||
                          activeStudent.grandfatherName ||
                          activeStudent.grandmotherName ||
                          activeStudent.uncleName) && (
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-emerald-100 mt-2 bg-black/15 px-3 py-1.5 rounded-xl border border-white/10">
                            <span className="font-extrabold text-[#dfbd69]">
                              بيانات العائلة (للمالك):
                            </span>
                            {activeStudent.motherName && (
                              <span>الوالدة: {activeStudent.motherName}</span>
                            )}
                            {activeStudent.grandfatherName && (
                              <span>• الجد: {activeStudent.grandfatherName}</span>
                            )}
                            {activeStudent.grandmotherName && (
                              <span>• الجدة: {activeStudent.grandmotherName}</span>
                            )}
                            {activeStudent.uncleName && (
                              <span>• العم: {activeStudent.uncleName}</span>
                            )}
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Profile Action Buttons: Strictly ONE Primary CTA + Single [ ⋮ خيارات ] Dropdown */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(activeStudent.id);
                        setActiveTab('session');
                      }}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-[#c59b27] hover:bg-[#b58c1e] text-[#14281d] text-xs font-extrabold cursor-pointer shadow-xs"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>🎙️ بدء حصة تسميع</span>
                    </button>

                    <div
                      className="relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setActiveDropdownId(
                            activeDropdownId === 'student-profile-header-menu'
                              ? null
                              : 'student-profile-header-menu'
                          )
                        }
                        className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-extrabold cursor-pointer"
                        title="خيارات الملف والشهادات والبطاقة"
                      >
                        <MoreVertical className="w-4 h-4 text-[#dfbd69]" />
                        <span>خيارات الملف</span>
                      </button>

                      {activeDropdownId === 'student-profile-header-menu' && (
                        <div className="absolute left-0 top-full mt-2 w-60 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-800 shadow-2xl py-2 z-40 text-xs font-bold text-neutral-700 dark:text-neutral-200">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveDropdownId(null);
                              setStudentIdCardOpen(true);
                            }}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 cursor-pointer"
                          >
                            <IdCard className="w-4 h-4 text-[#c59b27]" />
                            <span>🪪 بطاقة الطالب الذكية (QR)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveDropdownId(null);
                              openReceiptForStudent(activeStudent);
                            }}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 cursor-pointer"
                          >
                            <FileText className="w-4 h-4 text-emerald-600" />
                            <span>🧾 إصدار إيصال سداد رقمي</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveDropdownId(null);
                              setCertificateOpen(true);
                            }}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 cursor-pointer"
                          >
                            <Award className="w-4 h-4 text-[#c59b27]" />
                            <span>🏆 إصدار شهادة تقدير</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveDropdownId(null);
                              setBisharahModalOpen(true);
                            }}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 cursor-pointer"
                          >
                            <Sparkles className="w-4 h-4 text-[#c59b27]" />
                            <span>🎉 توليد بطاقة بشارة عائلية</span>
                          </button>

                          <a
                            href={buildWhatsAppUrl(
                              activeStudent.whatsappPhone,
                              `${settings.whatsappHeader}\n\nولي أمر الطالب *${activeStudent.name}*، نود إطلاعكم بأن الطالب متوقف حالياً عند سورة ${activeStudent.currentStop.surahName} آية ${activeStudent.currentStop.ayah}.\n- رمز دخول البوابة (PIN): *${activeStudent.guardianPin || '123456'}*\n\n${settings.whatsappFooter}`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setActiveDropdownId(null)}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 text-emerald-700 dark:text-emerald-400 cursor-pointer"
                          >
                            <Phone className="w-4 h-4" />
                            <span>💬 إرسال التوقف والكود عبر واتساب</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveDropdownId(null);
                              loginAsGuardianDirect(activeStudent.id);
                            }}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 cursor-pointer"
                          >
                            <ExternalLink className="w-4 h-4 text-[#145a3a] dark:text-[#dfbd69]" />
                            <span>معاينة بوابة ولي الأمر والطالب</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveDropdownId(null);
                              openEditModal(activeStudent);
                            }}
                            className="w-full px-3.5 py-2 text-right hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center gap-2 cursor-pointer border-t border-neutral-100 dark:border-emerald-900/40"
                          >
                            <Edit3 className="w-4 h-4" />
                            <span>تعديل بيانات الطالب</span>
                          </button>

                          {(activeStudent.accountStatus || 'نشط') !== 'نشط' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveDropdownId(null);
                                setStudentAccountStatus(activeStudent.id, 'نشط');
                              }}
                              className="w-full px-3.5 py-2 text-right hover:bg-emerald-50 dark:hover:bg-emerald-950/50 flex items-center gap-2 text-emerald-700 dark:text-emerald-400 cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>إعادة تفعيل الملف</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  setStudentAccountStatus(
                                    activeStudent.id,
                                    'متوقف',
                                    'إيقاف مؤقت مع حفظ السجل'
                                  );
                                }}
                                className="w-full px-3.5 py-2 text-right hover:bg-amber-50 dark:hover:bg-amber-950/40 flex items-center gap-2 text-amber-700 dark:text-amber-300 cursor-pointer"
                              >
                                <AlertTriangle className="w-4 h-4" />
                                <span>إيقاف مؤقت (مع حفظ السجل)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  setStudentAccountStatus(
                                    activeStudent.id,
                                    'مؤرشف',
                                    'أرشفة آمنة مع الاحتفاظ الكامل بالسجل'
                                  );
                                }}
                                className="w-full px-3.5 py-2 text-right hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 text-rose-600 dark:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>أرشفة آمنة لملف الطالب</span>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-Navigation Tabs inside Student Profile */}
              <div className="flex border-b border-neutral-200 dark:border-emerald-900/50 px-6 bg-[#f6f7f2]/50 dark:bg-[#0b1711]/50 overflow-x-auto">
                {[
                  { id: 'overview', label: 'لوحة التقدم وأين توقفنا؟' },
                  {
                    id: 'id_and_receipts',
                    label: '🪪 بطاقة الطالب وإيصالات السداد',
                  },
                  {
                    id: 'mushaf',
                    label: 'خريطة التقدم في المصحف (30 جزءاً / 114 سورة)',
                  },
                  {
                    id: 'errors',
                    label: `سجل الأخطاء المتكررة (${errorStats.detailedList.length})`,
                  },
                  {
                    id: 'sessions',
                    label: `سجل الحصص (${studentSessions.length})`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setProfileTab(tab.id as typeof profileTab)}
                    className={`py-3.5 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                      profileTab === tab.id
                        ? 'border-[#145a3a] dark:border-[#dfbd69] text-[#145a3a] dark:text-[#dfbd69]'
                        : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Profile Body Content */}
              <div className="p-6">
                {/* Tab 1: Overview & Where We Stopped & Evaluation Trajectory */}
                {profileTab === 'overview' && (
                  <div className="space-y-6">
                    {/* "Where Did We Stop?" Card */}
                    <div className="p-5 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-[#c59b27]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-[#145a3a] text-[#dfbd69] flex items-center justify-center shrink-0">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[#c59b27]">
                            أين توقفنا؟ (موضع التسميع والربط الحالي)
                          </div>
                          <div className="text-lg font-extrabold text-[#14281d] dark:text-white mt-0.5">
                            سورة {activeStudent.currentStop.surahName} — الآية{' '}
                            <span className="tabular-nums font-mono">
                              {activeStudent.currentStop.ayah}
                            </span>{' '}
                            (الجزء {activeStudent.currentStop.juzNumber})
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                            منطق الربط المعتمد: البدء من{' '}
                            <strong>{activeStudent.linkLogic}</strong> · أيام الحصة:{' '}
                            {activeStudent.scheduleDays.map((d) => DAY_NAMES[d]).join('، ')} الساعة{' '}
                            <span className="tabular-nums font-mono">
                              {activeStudent.scheduleTime}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setMushafModalOpen(true)}
                          className="px-3.5 py-2.5 rounded-xl bg-[#c59b27] text-[#14281d] text-xs font-extrabold hover:bg-[#b58c1e] transition-colors cursor-pointer"
                        >
                          📖 المصحف الموحد / ربط الطالب بالآية
                        </button>
                        <button
                          onClick={() => {
                            setSelectedStudentId(activeStudent.id);
                            setActiveTab('smartboard');
                          }}
                          className="px-4 py-2.5 rounded-xl bg-[#145a3a] text-white text-xs font-bold hover:bg-[#0f452c] transition-colors cursor-pointer"
                        >
                          فتح الموضع في السبورة الذكية
                        </button>
                      </div>
                    </div>

                    {/* Progress KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                      <div className="p-4 rounded-2xl border border-neutral-200 dark:border-emerald-900/50">
                        <div className="text-xs text-neutral-500">سور محفوظة</div>
                        <div className="text-2xl font-extrabold text-[#145a3a] dark:text-[#dfbd69] tabular-nums mt-1">
                          {activeStudent.memorizedSurahs.length}{' '}
                          <span className="text-xs font-normal text-neutral-400">/ 114</span>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl border border-neutral-200 dark:border-emerald-900/50">
                        <div className="text-xs text-neutral-500">أجزاء مكتملة</div>
                        <div className="text-2xl font-extrabold text-[#145a3a] dark:text-[#dfbd69] tabular-nums mt-1">
                          {activeStudent.memorizedJuz.length}{' '}
                          <span className="text-xs font-normal text-neutral-400">/ 30</span>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl border border-neutral-200 dark:border-emerald-900/50">
                        <div className="text-xs text-neutral-500">متوسط الإتقان</div>
                        <div className="text-2xl font-extrabold text-emerald-600 tabular-nums mt-1">
                          {studentSessions.filter((s) => s.status === 'حضر').length > 0
                            ? Math.round(
                                studentSessions
                                  .filter((s) => s.status === 'حضر')
                                  .reduce((a, b) => a + b.masteryScore, 0) /
                                  studentSessions.filter((s) => s.status === 'حضر').length
                              )
                            : 92}
                          %
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl border border-neutral-200 dark:border-emerald-900/50">
                        <div className="text-xs text-neutral-500">إجمالي الحصص</div>
                        <div className="text-2xl font-extrabold text-[#14281d] dark:text-white tabular-nums mt-1">
                          {studentSessions.filter((s) => s.status === 'حضر').length}
                        </div>
                      </div>
                    </div>

                    {/* 🔊 أداة التشغيل الصوتي للنص الجديد داخل ملف الطالب */}
                    <NewMemAudioPlayerAndWhatsAppTool
                      student={activeStudent}
                      contextLocation="student_profile"
                    />

                    {/* 🧭 مؤشر تغطية القرآن الكريم ومصفوفة حداثة الذاكرة (Quran Tracker Matrix) */}
                    <QuranCoverageAndGoalEngine
                      student={activeStudent}
                      sessions={sessions}
                      roleMode="teacher"
                      onUpdateStudent={updateStudent}
                      onShowToast={showToast}
                      onOpenSurahInMushaf={() => setMushafModalOpen(true)}
                    />

                    {/* زر توسيع أو طي الأدوات التربوية والمتشابهات والأوسمة المتقدمة لمنع الزحام */}
                    <div className="p-3.5 rounded-2xl bg-[#fcfaf2] dark:bg-[#0b1711] border border-[#c59b27]/40 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">
                        {showAdvancedStudentAnalytics
                          ? '🎛️ التحليلات التربوية المتقدمة ومُخطط الختمة والأوسمة والمتشابهات معروضة حالياً'
                          : '⚡ تم تبسيط ملف الطالب لعرض الأساسيات فقط (موضع التوقف، مشغل التحفيظ، ومصفوفة المراجعة)'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedStudentAnalytics((p) => !p)}
                        className="px-3.5 py-1.5 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-[#dfbd69] text-xs font-extrabold cursor-pointer transition-colors"
                      >
                        {showAdvancedStudentAnalytics
                          ? '⚡ طي الأدوات المتقدمة'
                          : '🎛️ إظهار التحليلات والأوسمة والمتشابهات المتقدمة'}
                      </button>
                    </div>

                    {showAdvancedStudentAnalytics && (
                      <div className="space-y-6">
                    {/* 2. مُخطط الختمة التنبؤي الذكي (Smart Khatmah Predictor) */}
                    {(() => {
                      const totalQuranPages = 604;
                      const memorizedPages = Math.min(
                        totalQuranPages,
                        Math.max(
                          (activeStudent.memorizedJuz?.length || 0) * 20,
                          (activeStudent.memorizedSurahs?.length || 0) > 5 ? 20 : 6
                        )
                      );
                      const remainingPages = Math.max(0, totalQuranPages - memorizedPages);
                      const completionPercent = ((memorizedPages / totalQuranPages) * 100).toFixed(1);
                      const effectivePace = Math.max(0.2, khatmahSimulatedPace);
                      const weeksRemaining = Math.ceil(remainingPages / effectivePace);
                      const projectedDate = new Date(Date.now() + weeksRemaining * 7 * 86400000);
                      const projectedFormatted = formatGregorianAndHijri(
                        projectedDate.toISOString().slice(0, 10),
                        settings.showHijriDates ?? true
                      );

                      // Next milestone
                      const milestones = [
                        { label: 'ربع القرآن الكريم (7.5 أجزاء)', targetPages: 151, juz: '7.5' },
                        { label: 'نصف القرآن الكريم (15 جزءاً)', targetPages: 302, juz: '15' },
                        { label: 'ثلاثة أرباع القرآن (22.5 جزءاً)', targetPages: 453, juz: '22.5' },
                        { label: 'ختمة المصحف الشريف المباركة (30 جزءاً)', targetPages: 604, juz: '30' },
                      ];
                      const nextMilestone = milestones.find((m) => m.targetPages > memorizedPages) || milestones[3];
                      const pagesToNext = Math.max(0, nextMilestone.targetPages - memorizedPages);
                      const weeksToNext = Math.ceil(pagesToNext / effectivePace);

                      return (
                        <div className="p-5 rounded-3xl bg-gradient-to-br from-[#145a3a]/15 via-white dark:via-[#12231a] to-[#c59b27]/15 border-2 border-[#c59b27]/60 shadow-md space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-2xl bg-[#145a3a] text-[#dfbd69] flex items-center justify-center font-bold text-lg shadow-sm">
                                🎯
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="text-base font-extrabold text-[#14281d] dark:text-white">
                                    مُخطط الختمة التنبؤي الذكي (Smart Khatmah Predictor)
                                  </h3>
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold">
                                    خوارزمية تنبؤ ذكية
                                  </span>
                                </div>
                                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                                  حساب موعد الختمة المتوقع بناءً على معدل حفظ الطالب الأسبوعي وحضوره الفعلي
                                </p>
                              </div>
                            </div>

                            {/* Pace selector buttons */}
                            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white dark:bg-[#0b1711] border border-[#c59b27]/40 text-xs">
                              <span className="text-[11px] font-bold text-neutral-500 px-1">وتيرة الحفظ:</span>
                              {[
                                { pace: 0.5, label: 'نصف ص/أسبوع' },
                                { pace: 1.0, label: 'صفحة/أسبوع' },
                                { pace: 1.5, label: '1.5 ص/أسبوع' },
                                { pace: 2.5, label: 'مكثف (2.5 ص)' },
                              ].map((item) => (
                                <button
                                  key={item.pace}
                                  type="button"
                                  onClick={() => setKhatmahSimulatedPace(item.pace)}
                                  className={`px-2 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                                    khatmahSimulatedPace === item.pace
                                      ? 'bg-[#145a3a] text-white shadow-xs'
                                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                                  }`}
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Progress toward Khatmah Bar */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span className="text-[#145a3a] dark:text-[#dfbd69]">
                                نسبة الإنجاز نحو الختمة المباركة: {completionPercent}%
                              </span>
                              <span className="text-neutral-500 dark:text-neutral-400 font-mono">
                                {memorizedPages} من أصل {totalQuranPages} صفحة ({remainingPages} صفحة متبقية)
                              </span>
                            </div>
                            <div className="w-full h-3 rounded-full bg-neutral-200 dark:bg-emerald-950/70 overflow-hidden relative border border-neutral-300 dark:border-emerald-800">
                              <div
                                className="h-full bg-gradient-to-l from-amber-400 via-emerald-500 to-[#145a3a] rounded-full transition-all duration-500"
                                style={{ width: `${Math.max(2, Number(completionPercent))}%` }}
                              />
                            </div>
                          </div>

                          {/* Forecast Metrics Cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                            {/* Card 1: Projected Date */}
                            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/60 text-center space-y-1">
                              <div className="text-[11px] text-neutral-500 font-bold">تاريخ الختم المتوقع بإذن الله</div>
                              <div className="text-base font-black text-[#145a3a] dark:text-[#dfbd69]">
                                {projectedFormatted}
                              </div>
                              <div className="text-[10px] text-neutral-400">
                                قرابة {weeksRemaining} أسبوعاً ({Math.round(weeksRemaining / 4.3)} شهراً)
                              </div>
                            </div>

                            {/* Card 2: Next Milestone */}
                            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/60 text-center space-y-1">
                              <div className="text-[11px] text-neutral-500 font-bold">المحطة القرآنية القادمة</div>
                              <div className="text-sm font-extrabold text-[#c59b27]">
                                {nextMilestone.label}
                              </div>
                              <div className="text-[10px] text-neutral-400">
                                متبقي {pagesToNext} صفحة (خلال ~{weeksToNext} أسبوع)
                              </div>
                            </div>

                            {/* Card 3: Spiritual Encouragement */}
                            <div className="p-3.5 rounded-2xl bg-emerald-900/10 dark:bg-emerald-950/40 border border-emerald-700/30 flex flex-col justify-center items-center text-center space-y-1">
                              <span className="text-sm">✨</span>
                              <p className="text-[11px] text-[#145a3a] dark:text-emerald-200 font-bold leading-relaxed">
                                «يقال لصاحب القرآن: اقرأ وارتقِ ورتل فإن منزلتك عند آخر آية تقرأ بها»
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Al-Imam Hybrid Foundation & Live Gamification Progress Card */}
                    <div className="p-5 rounded-2xl bg-gradient-to-l from-[#145a3a]/10 to-[#c59b27]/10 border border-[#c59b27]/40 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2.5 rounded-xl bg-[#145a3a] text-[#dfbd69]">
                            <Sparkles className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                                منهج الإمام للتأسيس ونقاط الهمة
                              </span>
                              {activeStudent.hasGoldenCrown && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/25 border border-amber-500 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold">
                                  <Crown className="w-3 h-3" /> تاج الإتقان الذهبي
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-extrabold text-[#14281d] dark:text-white mt-0.5">
                              {HYBRID_FOUNDATION_LEVELS.find(
                                (l) => l.level === (activeStudent.foundationLevel || 1)
                              )?.title || 'المستوى 1: الحروف الهجائية مجردة'}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-3 py-1.5 rounded-xl bg-[#c59b27] text-[#14281d] text-xs font-extrabold font-mono">
                            ⚡ {activeStudent.xpPoints || 120} XP نقطة همة
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStudentId(activeStudent.id);
                              setActiveTab('foundation');
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-bold cursor-pointer"
                          >
                            فتح منهج الإمام للتأسيس ←
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const studentCompEntries = (peerCompetitions || []).flatMap((pack) => {
                          const sortedSubs = [...pack.submissions].sort(
                            (a, b) => b.compositeRankPoints - a.compositeRankPoints
                          );
                          return sortedSubs
                            .map((sub, idx) => ({ sub, computedRank: sub.rank || idx + 1 }))
                            .filter((item) => item.sub.studentId === activeStudent.id)
                            .map(({ sub, computedRank }) => ({
                              packTitle: pack.title,
                              rank: computedRank,
                              score: sub.score,
                              timeSeconds: sub.timeSeconds,
                              awardedCup: sub.awardedCup,
                              awardedBadge: sub.awardedBadge || pack.badgeTitle,
                            }));
                        });
                        const hasBadgesOrCups =
                          (activeStudent.badges && activeStudent.badges.length > 0) ||
                          studentCompEntries.length > 0;

                        if (!hasBadgesOrCups) return null;

                        return (
                          <div className="pt-2.5 border-t border-[#c59b27]/25 space-y-2">
                            {activeStudent.badges && activeStudent.badges.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] font-bold text-neutral-500 ml-1">
                                  الأوسمة والكؤوس المكتسبة:
                                </span>
                                {activeStudent.badges.map((badge) => {
                                  const isCup =
                                    badge.includes('كأس') ||
                                    badge.includes('🏆') ||
                                    badge.includes('🥈') ||
                                    badge.includes('🥉');
                                  return (
                                    <span
                                      key={badge}
                                      className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold ${
                                        isCup
                                          ? 'bg-gradient-to-l from-amber-300/40 to-amber-100 dark:from-amber-900/60 dark:to-amber-950/60 border border-amber-500 text-amber-900 dark:text-amber-200 shadow-2xs'
                                          : 'bg-white dark:bg-[#12231a] border border-[#c59b27]/50 text-[#145a3a] dark:text-[#dfbd69]'
                                      }`}
                                    >
                                      {isCup ? badge : `🏅 ${badge}`}
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            {studentCompEntries.length > 0 && (
                              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white/80 dark:bg-[#0b1711]/80 border border-[#c59b27]/40">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[11px] font-black text-[#145a3a] dark:text-[#dfbd69]">
                                    🏆 سجل المسابقات التنافسية (Live Leaderboard):
                                  </span>
                                  {studentCompEntries.map((entry, idx) => (
                                    <span
                                      key={`${entry.packTitle}-${idx}`}
                                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-[11px] font-extrabold text-[#14281d] dark:text-amber-200"
                                    >
                                      {entry.awardedCup} — المركز #{entry.rank} في «{entry.packTitle}» (الدقة {entry.score}% • ⏱️ {entry.timeSeconds}ث)
                                    </span>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setActiveTab('exams')}
                                  className="px-2.5 py-1 rounded-lg bg-[#145a3a] text-[#dfbd69] text-[10px] font-extrabold cursor-pointer"
                                >
                                  عرض لوحة الشرف والمسابقات ←
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Gamification Dashboard (D3 Rank Shifts & Earned Badges in Student Profile) */}
                    <GamificationDashboard
                      student={activeStudent}
                      mode="teacher"
                    />

                    {/* Pedagogical Advisor & Learning Style Diagnostic Card + Family Guidance Generator */}
                    <div id="pg-profile" className="space-y-4">
                      <PedagogicalDiagnosticCard
                        student={activeStudent}
                        errors={errorStats.detailedList}
                      />
                      <FamilyGuidanceGeneratorSection
                        student={activeStudent}
                        errors={errorStats.detailedList}
                        surahName={activeStudent.currentStop.surahName}
                        fromAyah={activeStudent.currentStop.ayah}
                        toAyah={activeStudent.currentStop.ayah + 5}
                      />
                    </div>

                    {/* Evaluation Trajectory Chart */}
                    <div className="p-5 rounded-2xl border border-neutral-200 dark:border-emerald-900/50">
                      <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
                        <TrendingUp className="w-4 h-4 text-[#145a3a] dark:text-[#dfbd69]" />
                        <span>مسار التقييم ونسبة الإتقان عبر الحصص</span>
                      </h3>
                      <div className="grid grid-cols-5 sm:grid-cols-8 gap-2.5 items-end h-36 pt-4">
                        {studentSessions
                          .filter((s) => s.status === 'حضر')
                          .slice(0, 8)
                          .reverse()
                          .map((ses) => (
                            <div
                              key={ses.id}
                              className="flex flex-col items-center justify-end h-full"
                            >
                              <span className="text-[11px] font-mono tabular-nums font-bold text-[#145a3a] dark:text-[#dfbd69] mb-1">
                                {ses.masteryScore}%
                              </span>
                              <div className="w-full max-w-[34px] h-24 bg-neutral-100 dark:bg-[#0b1711] rounded-xl p-1 flex items-end">
                                <div
                                  style={{ height: `${Math.max(20, ses.masteryScore)}%` }}
                                  className={`w-full rounded-lg ${
                                    ses.masteryScore >= 90
                                      ? 'bg-[#145a3a]'
                                      : ses.masteryScore >= 75
                                      ? 'bg-[#c59b27]'
                                      : 'bg-red-500'
                                  }`}
                                />
                              </div>
                              <span className="text-[10px] font-mono tabular-nums text-neutral-400 mt-1.5 text-center leading-tight">
                                {formatGregorianAndHijri(
                                  ses.date,
                                  settings.showHijriDates ?? true,
                                  'compact'
                                )}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Notes & Discipline */}
                    <div className="p-4 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] text-xs leading-relaxed">
                      <strong className="block mb-1 text-[#145a3a] dark:text-[#dfbd69]">
                        ملاحظات المعلم حول الطالب:
                      </strong>
                      <p className="text-neutral-700 dark:text-neutral-300">
                        {activeStudent.notes || 'لا توجد ملاحظات مسجلة.'}
                      </p>
                    </div>

                    {/* Personal Student Mutashabihat Cards (بطاقات متشابهاتي الخاصة للطالب) */}
                    <div className="p-5 rounded-2xl bg-[#fcfaf2] dark:bg-[#0b1711] border-2 border-[#c59b27]/40 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-extrabold text-[#145a3a] dark:text-[#dfbd69] flex items-center gap-2">
                            <span>🔗 بطاقات «متشابهاتي الخاصة» للطالب ({activeStudent.customMutashabihat?.length || 0})</span>
                          </h3>
                          <p className="text-[11px] text-neutral-500 mt-0.5">
                            ربط الآيات المتشابهة التي التبست على الطالب أثناء التسميع مع تلوين موضع الاختلاف وكتابة ضابط التفرقة
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMushafModalOpen(true)}
                            className="px-3 py-1.5 rounded-xl bg-[#145a3a]/10 dark:bg-emerald-950 text-[#145a3a] dark:text-[#dfbd69] text-xs font-extrabold cursor-pointer"
                          >
                            📖 ربط من المصحف
                          </button>
                          <button
                            type="button"
                            onClick={() => setMutFormOpen((prev) => !prev)}
                            className="px-3 py-1.5 rounded-xl bg-[#145a3a] text-white text-xs font-extrabold cursor-pointer"
                          >
                            {mutFormOpen ? 'إغلاق النموذج' : '➕ إضافة بطاقة متشابهات'}
                          </button>
                        </div>
                      </div>

                      {mutFormOpen && (
                        <div className="p-4 rounded-2xl bg-white dark:bg-[#12231a] border border-[#c59b27]/40 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="block text-[11px] font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                                الموضع الأول (السورة والآية والنص)
                              </label>
                              <div className="flex gap-2">
                                <select
                                  value={mutPrimarySurahId}
                                  onChange={(e) => setMutPrimarySurahId(Number(e.target.value))}
                                  className="flex-1 px-2.5 py-1.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
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
                                  value={mutPrimaryAyah}
                                  onChange={(e) => setMutPrimaryAyah(Number(e.target.value) || 1)}
                                  className="w-20 px-2.5 py-1.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono"
                                  placeholder="الآية"
                                />
                              </div>
                              <input
                                type="text"
                                value={mutPrimaryText}
                                onChange={(e) => setMutPrimaryText(e.target.value)}
                                placeholder="نص الآية الأولى أو موضع الاشتباه..."
                                className="w-full px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs"
                              />
                              <input
                                type="text"
                                value={mutDiffWord1}
                                onChange={(e) => setMutDiffWord1(e.target.value)}
                                placeholder="الكلمة المميزة في الآية الأولى (تُلون بالأحمر)"
                                className="w-full px-3 py-1.5 rounded-xl border border-red-300 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20 text-xs"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="block text-[11px] font-extrabold text-amber-700 dark:text-amber-300">
                                الموضع الثاني المشابه (السورة والآية والنص)
                              </label>
                              <div className="flex gap-2">
                                <select
                                  value={mutSimilarSurahId}
                                  onChange={(e) => setMutSimilarSurahId(Number(e.target.value))}
                                  className="flex-1 px-2.5 py-1.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
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
                                  value={mutSimilarAyah}
                                  onChange={(e) => setMutSimilarAyah(Number(e.target.value) || 1)}
                                  className="w-20 px-2.5 py-1.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono"
                                  placeholder="الآية"
                                />
                              </div>
                              <input
                                type="text"
                                value={mutSimilarText}
                                onChange={(e) => setMutSimilarText(e.target.value)}
                                placeholder="نص الآية الثانية المشابهة..."
                                className="w-full px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs"
                              />
                              <input
                                type="text"
                                value={mutDiffWord2}
                                onChange={(e) => setMutDiffWord2(e.target.value)}
                                placeholder="الكلمة المميزة في الآية الثانية (تُلون بالأحمر)"
                                className="w-full px-3 py-1.5 rounded-xl border border-red-300 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20 text-xs"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={mutRuleNote}
                              onChange={(e) => setMutRuleNote(e.target.value)}
                              placeholder="ضابط التفرقة الذهني (مثال: اربط الواو باسم السورة أو سياق القصة)..."
                              className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const s1 = SURAHS.find((s) => s.id === mutPrimarySurahId) || SURAHS[0];
                                const s2 = SURAHS.find((s) => s.id === mutSimilarSurahId) || SURAHS[0];
                                addStudentCustomMutashabih(activeStudent.id, {
                                  primarySurahId: s1.id,
                                  primarySurahName: s1.name,
                                  primaryAyah: mutPrimaryAyah,
                                  primaryText:
                                    mutPrimaryText.trim() ||
                                    `سورة ${s1.name} — الآية ${mutPrimaryAyah}`,
                                  similarSurahId: s2.id,
                                  similarSurahName: s2.name,
                                  similarAyah: mutSimilarAyah,
                                  similarText:
                                    mutSimilarText.trim() ||
                                    `سورة ${s2.name} — الآية ${mutSimilarAyah}`,
                                  differenceWord1: mutDiffWord1.trim() || 'موضع 1',
                                  differenceWord2: mutDiffWord2.trim() || 'موضع 2',
                                  ruleNote:
                                    mutRuleNote.trim() ||
                                    'الانتباه لسياق السورة وضبط الكلمة المميزة عند التسميع.',
                                });
                                setMutPrimaryText('');
                                setMutSimilarText('');
                                setMutDiffWord1('');
                                setMutDiffWord2('');
                                setMutRuleNote('');
                                setMutFormOpen(false);
                              }}
                              className="px-4 py-2 rounded-xl bg-[#c59b27] text-[#14281d] text-xs font-extrabold cursor-pointer shrink-0"
                            >
                              💾 حفظ البطاقة في ملف الطالب
                            </button>
                          </div>
                        </div>
                      )}

                      {activeStudent.customMutashabihat &&
                      activeStudent.customMutashabihat.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {activeStudent.customMutashabihat.map((card) => (
                            <div
                              key={card.id}
                              className="p-3.5 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/50 space-y-2"
                            >
                              <div className="flex items-center justify-between text-[11px] font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                                <span>
                                  سورة {card.primarySurahName} ({card.primaryAyah}) ⇄ سورة{' '}
                                  {card.similarSurahName} ({card.similarAyah})
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteStudentCustomMutashabih(activeStudent.id, card.id)
                                  }
                                  className="text-red-500 hover:text-red-700 cursor-pointer"
                                  title="حذف بطاقة المتشابهات"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="text-xs font-quran p-2 rounded-xl bg-[#f6f7f2] dark:bg-[#0b1711] leading-relaxed">
                                <div>
                                  1️⃣ {card.primaryText}{' '}
                                  <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-bold">
                                    {card.differenceWord1}
                                  </span>
                                </div>
                                <div className="mt-1">
                                  2️⃣ {card.similarText}{' '}
                                  <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-bold">
                                    {card.differenceWord2}
                                  </span>
                                </div>
                              </div>
                              <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                💡 ضابط التفرقة: {card.ruleNote}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-neutral-500">
                          لا توجد بطاقات متشابهات خاصة مضافة لهذا الطالب بعد. يمكنك إضافتها من هنا أو مباشرة أثناء التسميع من نافذة المصحف الموحد.
                        </div>
                      )}
                    </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 1.5: Smart Student ID Card & Official Payment Receipts Hub */}
                {profileTab === 'id_and_receipts' && (
                  <div className="space-y-6">
                    {/* Live Interactive Smart Student ID Card Preview */}
                    <div className="p-5 rounded-3xl bg-[#fcfaf2] dark:bg-[#0b1711] border-2 border-[#c59b27]/50 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2.5 rounded-2xl bg-[#145a3a] text-[#dfbd69]">
                            <IdCard className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                              بطاقة الهوية القرآنية الذكية للطالب (Student ID + Offline QR)
                            </h3>
                            <p className="text-xs text-neutral-500">
                              بطاقة معتمدة تحتوي على QR كود أوفلاين، رمز الدخول (PIN)، وإحصائيات الحفظ
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              downloadStudentIdCardPng(activeStudent, settings);
                              showToast(
                                'تم تحميل بطاقة الطالب الذكية كصورة PNG عالية الدقة',
                                'success'
                              );
                            }}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#c59b27] hover:bg-[#b58c1e] text-[#14281d] text-xs font-extrabold cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>تحميل البطاقة كصورة (PNG)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStudentIdCardOpen(true)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5 text-[#dfbd69]" />
                            <span>معاينة كاملة وطباعة البطاقة</span>
                          </button>
                        </div>
                      </div>

                      {/* Embedded Card Preview */}
                      <div className="rounded-3xl bg-gradient-to-br from-[#145a3a] via-[#0f452c] to-[#082618] text-white p-5 border-3 border-[#c59b27] shadow-lg flex flex-col sm:flex-row items-center justify-between gap-5">
                        <div className="space-y-2 text-center sm:text-right flex-1">
                          <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-white/15 border border-[#dfbd69]/40 text-[11px] font-extrabold text-[#dfbd69]">
                            <span>{settings.academyName}</span>
                            <span>•</span>
                            <span className="font-mono">
                              ID #{activeStudent.id.slice(-4)}
                            </span>
                          </div>
                          <h4 className="text-xl font-extrabold text-white">
                            {activeStudent.name}{' '}
                            {activeStudent.hasGoldenCrown ? '👑' : ''}
                          </h4>
                          <p className="text-xs text-emerald-100">
                            {activeStudent.circle} • المستوى: {activeStudent.level} •
                            التأسيس: {activeStudent.foundationLevel || 1}/8
                          </p>
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 text-xs">
                            <span className="px-2.5 py-1 rounded-xl bg-white/10 font-mono text-[#dfbd69] font-bold">
                              السور: {activeStudent.memorizedSurahs.length}/114
                            </span>
                            <span className="px-2.5 py-1 rounded-xl bg-white/10 font-mono text-[#dfbd69] font-bold">
                              الأجزاء: {activeStudent.memorizedJuz.length}/30
                            </span>
                            <span className="px-2.5 py-1 rounded-xl bg-white/10 font-mono text-[#dfbd69] font-bold">
                              ⚡ {activeStudent.xpPoints || 120} XP
                            </span>
                            <span className="px-2.5 py-1 rounded-xl bg-[#c59b27] text-[#14281d] font-mono font-extrabold">
                              PIN: {activeStudent.guardianPin}
                            </span>
                          </div>
                        </div>

                        <div className="bg-white p-3 rounded-2xl border-2 border-[#c59b27] flex flex-col items-center shrink-0">
                          {(() => {
                            const qrPayload = `IMAM-ID:${activeStudent.id}|PIN:${activeStudent.guardianPin}|SURAH:${activeStudent.currentStop.surahId}:${activeStudent.currentStop.ayah}`;
                            const matrix = generateOfflineQrMatrix(qrPayload);
                            return (
                              <svg
                                viewBox="0 0 21 21"
                                className="w-24 h-24"
                                shapeRendering="crispEdges"
                              >
                                {matrix.map((row, rIdx) =>
                                  row.map((cell, cIdx) =>
                                    cell ? (
                                      <rect
                                        key={`${rIdx}-${cIdx}`}
                                        x={cIdx}
                                        y={rIdx}
                                        width={1}
                                        height={1}
                                        fill="#14281d"
                                      />
                                    ) : null
                                  )
                                )}
                              </svg>
                            );
                          })()}
                          <span className="text-[10px] font-mono font-extrabold text-[#145a3a] mt-1">
                            QR OFFLINE
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Student Payment Receipts Ledger & Generator */}
                    <div className="p-5 rounded-3xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/50 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2.5 rounded-2xl bg-[#c59b27]/20 text-[#145a3a] dark:text-[#dfbd69]">
                            <Wallet className="w-5 h-5 text-[#c59b27]" />
                          </div>
                          <div>
                            <h3 className="text-sm font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                              إيصالات السداد المعتمدة وسجل اشتراكات الطالب
                            </h3>
                            <p className="text-xs text-neutral-500">
                              الرسوم الشهرية المقررة: {activeStudent.monthlyFee} ج.م •
                              إصدار وتحميل سندات القبض الرقمية
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openReceiptForStudent(activeStudent)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-extrabold cursor-pointer"
                        >
                          <FileText className="w-4 h-4 text-[#dfbd69]" />
                          <span>➕ إصدار إيصال سداد جديد</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(activeStudent.fees.length > 0
                          ? activeStudent.fees
                          : [
                              {
                                month: new Date().toISOString().slice(0, 7),
                                amount: activeStudent.monthlyFee || 350,
                                status: 'مدفوع' as const,
                                paidAt: new Date().toISOString().slice(0, 10),
                                method: 'إنستا باي (InstaPay)',
                                receiptNumber: `REC-${new Date()
                                  .toISOString()
                                  .slice(0, 7)
                                  .replace('-', '')}-${
                                  activeStudent.id.replace(/\D/g, '') || '101'
                                }`,
                              },
                            ]
                        ).map((feeItem) => {
                          const recNo =
                            feeItem.receiptNumber ||
                            `REC-${feeItem.month.replace('-', '')}-${
                              activeStudent.id.replace(/\D/g, '') || '101'
                            }`;
                          return (
                            <div
                              key={feeItem.month}
                              className="p-4 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-900/50 flex flex-col justify-between gap-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-extrabold font-mono text-[#145a3a] dark:text-[#dfbd69]">
                                      شهر {feeItem.month}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                        feeItem.status === 'مدفوع'
                                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                          : feeItem.status === 'متأخر'
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {feeItem.status}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                                    رقم السند: {recNo} •{' '}
                                    {feeItem.method || 'نقدي / تحويل'}
                                  </div>
                                </div>
                                <div className="text-left font-mono text-base font-extrabold text-[#14281d] dark:text-white">
                                  {feeItem.amount} ج.م
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-neutral-200/70 dark:border-emerald-900/40">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openReceiptForStudent(activeStudent, {
                                      ...feeItem,
                                      receiptNumber: recNo,
                                    })
                                  }
                                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#145a3a] text-white text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <FileText className="w-3.5 h-3.5 text-[#dfbd69]" />
                                  <span>معاينة وطباعة الإيصال</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    downloadPaymentReceiptPng(
                                      activeStudent,
                                      { ...feeItem, receiptNumber: recNo },
                                      settings
                                    );
                                    showToast(
                                      'تم تحميل إيصال السداد كصورة PNG',
                                      'success'
                                    );
                                  }}
                                  className="py-1.5 px-2.5 rounded-xl bg-[#c59b27] text-[#14281d] text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer"
                                  title="تحميل كصورة PNG"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>PNG</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Interactive Mushaf Progress Map (30 Juz / 114 Surahs) + KFGQPC MushafEngine */}
                {profileTab === 'mushaf' && (
                  <div className="space-y-4">
                    <MushafEngine
                      initialSurahId={activeStudent.currentStop.surahId}
                      fromAyah={1}
                      historicalHotspots={sessions
                        .filter((s) => s.studentId === activeStudent.id)
                        .flatMap((s) => s.errors || [])}
                    />
                    <QuranCoverageAndGoalEngine
                      student={activeStudent}
                      sessions={sessions}
                      roleMode="teacher"
                      onUpdateStudent={updateStudent}
                      onShowToast={showToast}
                      onOpenSurahInMushaf={() => setMushafModalOpen(true)}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-neutral-500">
                        انقر على أي سورة أو جزء لتبديل حالة الحفظ (محفوظ / غير محفوظ) مباشرةً:
                      </div>
                      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-neutral-100 dark:bg-[#0b1711]">
                        <button
                          onClick={() => setMushafViewMode('surahs')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                            mushafViewMode === 'surahs'
                              ? 'bg-[#145a3a] text-white'
                              : 'text-neutral-600 dark:text-neutral-300'
                          }`}
                        >
                          السور (114 سورة)
                        </button>
                        <button
                          onClick={() => setMushafViewMode('juz')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                            mushafViewMode === 'juz'
                              ? 'bg-[#145a3a] text-white'
                              : 'text-neutral-600 dark:text-neutral-300'
                          }`}
                        >
                          الأجزاء (30 جزءاً)
                        </button>
                      </div>
                    </div>

                    {mushafViewMode === 'surahs' ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-[55vh] overflow-y-auto p-1">
                        {SURAHS.map((s) => {
                          const isMem = activeStudent.memorizedSurahs.includes(s.id);
                          const isCurrent = activeStudent.currentStop.surahId === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => toggleSurahMemorized(s.id)}
                              className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                                isMem
                                  ? 'bg-[#145a3a] text-white border-[#145a3a]'
                                  : isCurrent
                                  ? 'bg-[#c59b27]/20 border-[#c59b27] text-[#14281d] dark:text-white'
                                  : 'bg-[#f6f7f2] dark:bg-[#0b1711] border-neutral-200 dark:border-emerald-900/40 text-neutral-700 dark:text-neutral-300'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[10px] opacity-80 tabular-nums font-mono">
                                <span>#{s.id}</span>
                                <span>{s.ayahs} آية</span>
                              </div>
                              <div className="text-xs font-bold mt-1 truncate">{s.name}</div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                        {JUZ_NAMES.map((jName, idx) => {
                          const juzNum = idx + 1;
                          const isMem = activeStudent.memorizedJuz.includes(juzNum);
                          return (
                            <button
                              key={juzNum}
                              type="button"
                              onClick={() => toggleJuzMemorized(juzNum)}
                              className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                                isMem
                                  ? 'bg-[#145a3a] text-white border-[#145a3a]'
                                  : 'bg-[#f6f7f2] dark:bg-[#0b1711] border-neutral-200 dark:border-emerald-900/40'
                              }`}
                            >
                              <div className="text-[11px] font-mono tabular-nums opacity-75">
                                الجزء {juzNum}
                              </div>
                              <div className="text-xs font-bold mt-1">{jName}</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: Repeated Errors Log */}
                {profileTab === 'errors' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                      {Object.entries(errorStats.counts).map(([type, count]) => (
                        <div
                          key={type}
                          className="p-3 rounded-xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-900/40 text-center"
                        >
                          <div className="text-xs font-bold text-neutral-500">{type}</div>
                          <div className="text-xl font-extrabold text-red-600 dark:text-red-400 tabular-nums mt-1">
                            {count}
                          </div>
                        </div>
                      ))}
                    </div>

                    {errorStats.detailedList.length > 0 ? (
                      <div className="space-y-2">
                        {errorStats.detailedList.map((err) => (
                          <div
                            key={err.id}
                            className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 dark:border-emerald-900/40 text-xs"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                              <span className="font-bold text-red-600 dark:text-red-400">
                                خطأ {err.type}
                              </span>
                              {err.tajweedRule && (
                                <span className="px-2 py-0.5 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 font-bold text-[11px]">
                                  {err.tajweedRule}
                                </span>
                              )}
                              {err.word && (
                                <span className="px-2 py-0.5 rounded-lg bg-[#145a3a]/10 dark:bg-emerald-950 text-[#145a3a] dark:text-[#dfbd69] font-quran text-sm font-bold">
                                  ﴿{err.word}﴾
                                </span>
                              )}
                              <span>في سياق: {err.context}</span>
                              {err.surah && (
                                <span className="font-semibold">
                                  · سورة {err.surah} {err.ayah ? `(آية ${err.ayah})` : ''}
                                </span>
                              )}
                              {ERROR_PEDAGOGICAL_COACHING_MAP[err.type] && (
                                <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800/50">
                                  {ERROR_PEDAGOGICAL_COACHING_MAP[err.type].badgeTitle}:{' '}
                                  {ERROR_PEDAGOGICAL_COACHING_MAP[err.type].oneLineAdvice}
                                </span>
                              )}
                            </div>
                            <span className="text-neutral-400 font-mono tabular-nums">
                              {formatGregorianAndHijri(
                                err.timestamp.slice(0, 10),
                                settings.showHijriDates ?? true
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-xs text-neutral-500">
                        سجل الطالب خالٍ من الأخطاء المتكررة، ما شاء الله!
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 4: Sessions History */}
                {profileTab === 'sessions' && (
                  <div className="space-y-3">
                    {studentSessions.map((ses) => (
                      <div
                        key={ses.id}
                        className="p-4 rounded-2xl border border-neutral-200 dark:border-emerald-900/50 bg-[#f6f7f2]/50 dark:bg-[#0b1711]/50 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
                            <Calendar className="w-4 h-4 text-[#145a3a] dark:text-[#dfbd69]" />
                            <span className="tabular-nums font-mono">
                              {formatGregorianAndHijri(
                                ses.date,
                                settings.showHijriDates ?? true
                              )}
                            </span>
                            <span>·</span>
                            <span
                              className={
                                ses.status === 'حضر'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-red-600'
                              }
                            >
                              {ses.status}
                            </span>
                          </div>
                          {ses.status === 'حضر' && (
                            <span className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69] tabular-nums">
                              نسبة الإتقان: {ses.masteryScore}%
                            </span>
                          )}
                        </div>

                        {ses.status === 'حضر' && (
                          <div className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
                            {ses.newMemorization?.enabled && (
                              <div>
                                • حفظ جديد: سورة {ses.newMemorization.surahName} (من{' '}
                                {ses.newMemorization.fromAyah} إلى {ses.newMemorization.toAyah})
                              </div>
                            )}
                            {ses.nearReview?.enabled && (
                              <div>
                                • مراجعة قريبة: سورة {ses.nearReview.surahName} (من{' '}
                                {ses.nearReview.fromAyah} إلى {ses.nearReview.toAyah})
                              </div>
                            )}
                            {ses.juzReview?.enabled && ses.juzReview.items.length > 0 && (
                              <div>
                                • مراجعة الأجزاء:{' '}
                                {ses.juzReview.items.map((i) => i.label).join('، ')}
                              </div>
                            )}
                            {ses.surahReview?.enabled &&
                              ses.surahReview.surahNames.length > 0 && (
                                <div>
                                  • مراجعة السور: {ses.surahReview.surahNames.join('، ')}
                                </div>
                              )}
                          </div>
                        )}

                        {ses.errors && ses.errors.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {ses.errors.map((err) => (
                              <span
                                key={err.id}
                                className="px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-[11px] font-bold text-red-700 dark:text-red-300"
                              >
                                {err.type}
                                {err.tajweedRule ? ` (${err.tajweedRule})` : ''}
                                {err.word ? ` ﴿${err.word}﴾` : ''}
                                {err.surah ? ` — ${err.surah}` : ''}
                                {err.ayah ? `:${err.ayah}` : ''}
                              </span>
                            ))}
                          </div>
                        )}

                        {ses.parentNotes && (
                          <div className="text-xs text-neutral-500 italic pt-1 border-t border-neutral-200/60 dark:border-emerald-950">
                            "{ses.parentNotes}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-[#12231a] p-12 text-center border border-neutral-200 dark:border-emerald-900/50">
              اختر طالباً من القائمة لعرض ملفه الشامل
            </div>
          )}
        </div>
      </div>

      {/* Modal 1: Add / Edit Student */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/60 shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-emerald-900/50 mb-5">
              <h3 className="text-base font-extrabold text-[#145a3a] dark:text-[#dfbd69] flex items-center gap-2">
                <User className="w-5 h-5" />
                <span>{editingStudent ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}</span>
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">اسم الطالب ثلاثياً *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="مثال: طالب ١"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">اسم ولي الأمر *</label>
                  <input
                    type="text"
                    required
                    value={formGuardian}
                    onChange={(e) => setFormGuardian(e.target.value)}
                    placeholder="مثال: ولي أمر طالب ١"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-semibold"
                  />
                </div>
              </div>

              {/* Extended Family Fields + Google Account Link */}
              <div className="p-3.5 rounded-2xl bg-[#fcfaf2] dark:bg-[#0b1711] border border-[#c59b27]/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                    👨‍👩‍👧‍👦 البيانات العائلية الإضافية للطالب (ترتبط بمعرف Google وتحفظ في Firestore)
                  </span>
                  {(editingStudent?.googleUid || googleAuthUser?.uid) && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                      Google UID: {(editingStudent?.googleUid || googleAuthUser?.uid || '').slice(0, 12)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold mb-1">اسم الوالدة</label>
                    <input
                      type="text"
                      value={formMotherName}
                      onChange={(e) => setFormMotherName(e.target.value)}
                      placeholder="اسم الوالدة"
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-white dark:bg-[#12231a] text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-1">اسم الجد</label>
                    <input
                      type="text"
                      value={formGrandfatherName}
                      onChange={(e) => setFormGrandfatherName(e.target.value)}
                      placeholder="اسم الجد"
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-white dark:bg-[#12231a] text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-1">اسم الجدة</label>
                    <input
                      type="text"
                      value={formGrandmotherName}
                      onChange={(e) => setFormGrandmotherName(e.target.value)}
                      placeholder="اسم الجدة"
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-white dark:bg-[#12231a] text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-1">اسم العم</label>
                    <input
                      type="text"
                      value={formUncleName}
                      onChange={(e) => setFormUncleName(e.target.value)}
                      placeholder="اسم العم"
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-white dark:bg-[#12231a] text-xs font-semibold"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">
                    بريد Google المرتبط بالطالب / ولي الأمر (اختياري)
                  </label>
                  <input
                    type="email"
                    dir="ltr"
                    value={formGoogleEmail}
                    onChange={(e) => setFormGoogleEmail(e.target.value)}
                    placeholder="student.account@gmail.com"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-white dark:bg-[#12231a] text-xs font-mono text-left"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold mb-1">
                    رقم واتساب ولي الأمر (مع فحص صحة الرقم) *
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    required
                    value={formPhone}
                    onChange={(e) => {
                      setFormPhone(e.target.value);
                      setPhoneError('');
                    }}
                    placeholder="01012345678 أو +966501234567"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono tabular-nums text-left"
                  />
                  {phoneError && (
                    <span className="text-[11px] text-red-600 font-bold block mt-1">
                      {phoneError}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">رمز بوابة ولي الأمر (PIN)</label>
                  <input
                    type="text"
                    dir="ltr"
                    maxLength={6}
                    value={formPin}
                    onChange={(e) => setFormPin(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono tabular-nums text-left"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">المستوى</label>
                  <select
                    value={formLevel}
                    onChange={(e) => setFormLevel(e.target.value as StudentLevel)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                  >
                    <option value="مبتدئ">مبتدئ</option>
                    <option value="متوسط">متوسط</option>
                    <option value="متقدم">متقدم</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">الرواية القرآنية المعتمدة</label>
                  <select
                    value={formRiwayah}
                    onChange={(e) => setFormRiwayah(e.target.value as QuranRiwayah)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#c59b27] bg-[#fcfaf2] dark:bg-[#0b1711] text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69]"
                  >
                    {Object.values(QURAN_RIWAYAT_GUIDE).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">الحلقة / المجموعة</label>
                  <select
                    value={formCircle}
                    onChange={(e) => setFormCircle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                  >
                    {circles.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">خطة الطالب</label>
                  <select
                    value={formPlan}
                    onChange={(e) => setFormPlan(e.target.value as StudentPlan)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                  >
                    <option value="متوازنة">متوازنة (حفظ ومراجعة)</option>
                    <option value="مكثفة">مكثفة</option>
                    <option value="مراجعة فقط">مراجعة فقط</option>
                    <option value="تثبيت">تثبيت</option>
                    <option value="قصار السور">قصار السور</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">منطق الربط في الحفظ</label>
                  <select
                    value={formLinkLogic}
                    onChange={(e) => setFormLinkLogic(e.target.value as LinkLogic)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                  >
                    <option value="الآية التالية">البدء من الآية التالية مباشرة</option>
                    <option value="آخر آية">البدء من آخر آية تم تسميعها (للربط)</option>
                  </select>
                </div>
              </div>

              {/* Weekly Schedule Days */}
              <div>
                <label className="block text-xs font-bold mb-2">أيام الحصة الأسبوعية</label>
                <div className="flex flex-wrap gap-2">
                  {DAY_NAMES.map((dayName, idx) => {
                    const selected = formDays.includes(idx);
                    return (
                      <button
                        key={dayName}
                        type="button"
                        onClick={() => handleToggleDay(idx)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          selected
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">موعد الحصة</label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">مدة الحصة (دقيقة)</label>
                  <select
                    value={formDuration}
                    onChange={(e) => setFormDuration(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold"
                  >
                    <option value={30}>30 دقيقة</option>
                    <option value={45}>45 دقيقة</option>
                    <option value={60}>60 دقيقة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">الرسوم الشهرية (ج.م / ر.س)</label>
                  <input
                    type="number"
                    value={formFee}
                    onChange={(e) => setFormFee(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">ملاحظات حول الطالب</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200 dark:border-emerald-900/50">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-emerald-900 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-bold cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>حفظ بيانات الطالب</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Printable Certificate of Appreciation */}
      {certificateOpen && activeStudent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-3xl bg-white text-[#14281d] p-6 md:p-8 shadow-2xl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-200 no-print">
              <div className="flex items-center gap-3 flex-1">
                <label className="text-xs font-bold shrink-0">سبب التكريم:</label>
                <input
                  type="text"
                  value={certificateReason}
                  onChange={(e) => setCertificateReason(e.target.value)}
                  className="w-full max-w-md px-3 py-1.5 rounded-xl border border-neutral-300 text-xs font-semibold"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#145a3a] text-white text-xs font-bold cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الشهادة / PDF</span>
                </button>
                <button
                  onClick={() => setCertificateOpen(false)}
                  className="p-2 rounded-xl border border-neutral-200 text-neutral-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Certificate Canvas */}
            <div className="border-8 border-double border-[#c59b27] rounded-2xl p-8 md:p-10 bg-[#fcfaf2] text-center relative overflow-hidden">
              <img
                src="/assets/aistudio/icon-192_29a1c2ce.png"
                alt="شعار الأكاديمية"
                referrerPolicy="no-referrer"
                className="w-20 h-20 mx-auto rounded-2xl border-2 border-[#c59b27] mb-3"
              />
              <div className="text-sm font-bold text-[#145a3a]">
                {settings.academyName} — {settings.tagline}
              </div>
              <h2 className="font-quran text-3xl md:text-4xl font-bold text-[#145a3a] my-4">
                شهادة تقدير وتفوق قرآني
              </h2>
              <p className="text-sm text-neutral-700 leading-relaxed max-w-xl mx-auto">
                تسر إدارة {settings.academyName} أن تمنح هذه الشهادة التقديرية للطالب/ـة:
              </p>
              <div className="font-quran text-2xl md:text-3xl font-bold text-[#c59b27] my-4 py-2 border-y border-[#c59b27]/40 max-w-md mx-auto">
                {activeStudent.name}
              </div>
              <p className="text-sm text-neutral-800 leading-relaxed max-w-xl mx-auto font-semibold">
                وذلك تقديراً لجهوده المباركة في: {certificateReason}، وإتمام حفظ{' '}
                {activeStudent.memorizedSurahs.length} سورة كريمة ضمن {activeStudent.circle}.
              </p>
              <p className="font-quran text-base text-[#145a3a] mt-4">
                ﴿ خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ ﴾
              </p>

              <div className="mt-8 pt-4 border-t border-[#c59b27]/30 flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-neutral-700">
                <div>
                  <span className="block text-neutral-500">المعلم المشرف</span>
                  <span className="text-sm text-[#145a3a]">{settings.teacherName}</span>
                </div>
                <div>
                  <span className="block text-neutral-500">الرواية المعتمدة</span>
                  <span className="text-sm text-[#145a3a]">
                    {activeStudent.riwayah || 'حفص عن عاصم'}
                  </span>
                </div>
                <div>
                  <span className="block text-neutral-500">كود التوثيق المرجعي</span>
                  <span className="font-mono text-sm text-[#145a3a]">
                    IMAM-CERT-{new Date().getFullYear()}-{activeStudent.id.replace(/\D/g, '') || '101'}
                  </span>
                </div>
                <div>
                  <span className="block text-neutral-500">تاريخ الإصدار</span>
                  <span className="tabular-nums font-mono">
                    {formatGregorianAndHijri(
                      new Date().toISOString().slice(0, 10),
                      settings.showHijriDates ?? true
                    )}
                  </span>
                </div>
                <div>
                  <span className="block text-neutral-500">ختم التوثيق الرقمي</span>
                  <span className="text-[#c59b27]">معتمد برمز QR ✓</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Smart Student ID Card & Offline QR Share */}
      {studentIdCardOpen && activeStudent && (
        <StudentIdCardModal
          student={activeStudent}
          allStudents={students}
          onSelectStudent={(id) => setSelectedStudentId(id)}
          settings={settings}
          onClose={() => setStudentIdCardOpen(false)}
          onShowToast={showToast}
          onQuickAttendAndStartSession={handleQuickAttendAndStartSession}
        />
      )}

      {/* Modal 4: Official Digital Payment Receipt Modal */}
      {activeReceiptFee && activeStudent && (
        <PaymentReceiptModal
          student={activeStudent}
          fee={activeReceiptFee}
          settings={settings}
          onClose={() => setActiveReceiptFee(null)}
          onUpdateFee={(studentId, month, status, amount, method) => {
            updateStudentFee(
              studentId,
              month,
              status,
              amount ?? activeReceiptFee.amount,
              method
            );
            setActiveReceiptFee((prev) =>
              prev
                ? {
                    ...prev,
                    month,
                    status,
                    amount: amount ?? prev.amount,
                    method: method ?? prev.method,
                  }
                : null
            );
          }}
          onShowToast={showToast}
        />
      )}

      {/* Modal 5: Milestone Bisharah Family Share Card Modal */}
      {bisharahModalOpen && activeStudent && (
        <MilestoneBisharahModal
          student={activeStudent}
          settings={settings}
          defaultMilestoneTitle={`إتمام حفظ سورة ${activeStudent.currentStop.surahName} والوصول إلى الآية ${activeStudent.currentStop.ayah} بإتقان`}
          onClose={() => setBisharahModalOpen(false)}
          onShowToast={showToast}
        />
      )}

      {/* Modal 6: Unified Mushaf Selector & Direct Student-Ayah Linker */}
      {mushafModalOpen && activeStudent && (
        <QuranTextModal
          isOpen={mushafModalOpen}
          onClose={() => setMushafModalOpen(false)}
          surahId={activeStudent.currentStop.surahId}
          fromAyah={activeStudent.currentStop.ayah}
          toAyah={Math.min(
            SURAHS.find((s) => s.id === activeStudent.currentStop.surahId)?.ayahs || 20,
            activeStudent.currentStop.ayah + 10
          )}
          sectionTitle={`المصحف الموحد وربط آية التوقف — الطالب: ${activeStudent.name}`}
          studentId={activeStudent.id}
          studentName={activeStudent.name}
          onApplyRange={(selSurahId, _selSurahName, selFromAyah) => {
            linkStudentStopToAyah(activeStudent.id, selSurahId, selFromAyah);
          }}
        />
      )}
    </div>
  );
};
