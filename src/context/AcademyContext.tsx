import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AcademySettings,
  AccessCodeRequest,
  ActiveRoleMode,
  AdmissionRequest,
  CircleGroup,
  ExamRecord,
  FiveFortressTaskKey,
  FoundationLevelNumber,
  GradeType,
  HomePracticeSubmission,
  IjazahRecord,
  OwnerAuditLogItem,
  OwnerEncouragementItem,
  PeerCompetitionPack,
  PeerCompetitionSubmission,
  PortalRoute,
  PublicBookmarkCategory,
  PublicMushafBookmark,
  PublicVisitorWirdRecord,
  PublishedFamilyGuidanceNote,
  QuranRiwayah,
  SessionRecord,
  SmartBoardStroke,
  SmartQuizQuestion,
  StaffAuthProvider,
  StaffHierarchyRole,
  Student,
  StudentAccessibilityMode,
  StudentAccountStatus,
  StudentCustomMutashabih,
  StudentLevel,
  StudentPedagogicalProfile,
  StudentPrivacyPreference,
  StudentRecitationAudioClip,
  SupervisorPermissions,
  TaskItem,
  TeacherAccessRecord,
  TeacherPermissions,
  TeacherRatingRecord,
  TimestampAudioFeedbackPin,
  UserRole,
  WaqfImpactStats,
  LateSessionAlertRecord,
  RecitationEngineStatusRecord,
  ScheduleSlotRecord,
  SurahRevisionLogEntry,
  QuranTrackerStudentRecord,
} from '../types';
import {
  detectPortalRouteFromLocation,
  updatePortalManifest,
} from '../components/PWAComponents';
import { buildInitialPeerCompetitions } from '../data/smartQuizEngineData';
import {
  DEFAULT_SUPERVISOR_PERMISSIONS,
  DEFAULT_TEACHER_PERMISSIONS,
  INITIAL_CIRCLES,
  INITIAL_EXAMS,
  INITIAL_HOME_SUBMISSIONS,
  INITIAL_IJAZAHS,
  INITIAL_SESSIONS,
  INITIAL_SETTINGS,
  INITIAL_STUDENTS,
  INITIAL_TASKS,
  INITIAL_TEACHER_RATINGS,
  getCurrentMonthKey,
  getLocalDateString,
} from '../data/seedData';
import { normalizePortableBackupPayload } from '../utils/portableBackupNormalizer';
import { exportDataToJsonBackup } from '../utils/exportService';
import { SURAHS } from '../data/quranData';
import {
  UrgentAlertItem,
  computeTeacherAlerts,
  dispatchTeacherAlertPushViaSW,
  ensurePushServiceWorkerRegistered,
  sendLocalPushNotification,
  syncSessionRemindersWithServiceWorker,
  syncTeacherAlertsWithServiceWorker,
} from '../utils/notificationService';
import {
  ImamSessionRestore,
  SUPABASE_OFFICIAL_CONFIG,
  WLQSyncCore,
  canonicalJson,
} from '../utils/wlqSyncCore';
import {
  ACCESS_CODE_REQUESTS_STORAGE_KEY,
  auth,
  ExtendedFamilyFields,
  fetchAcademyCloudBackupFromFirestore,
  GoogleAuthResult,
  isMasterOwnerEmail,
  MASTER_OWNER_EMAILS,
  onAuthStateChanged,
  signInWithGooglePopup,
  signInWithMicrosoftPopup,
  signOutFromFirebase,
  subscribeToAccessCodeRequestsFromFirestore,
  subscribeToStaffRegistrationsFromFirestore,
  syncAcademySnapshotToFirestore,
  syncAccessCodeRequestToFirestore,
  syncAllStaffRegistrationsToFirestore,
  syncExtendedFamilyRecordToFirestore,
  syncStaffRegistrationToFirestore,
  syncUserProfileToFirestore,
  deleteStaffRegistrationFromFirestore,
  syncLateSessionAlertToFirestore,
  fetchRecitationEngineStatusesFromFirestore,
  syncRecitationEngineStatusToFirestore,
  syncScheduleSlotToFirestore,
  fetchScheduleSlotsFromFirestore,
  syncQuranTrackerLogToFirestore,
  fetchQuranTrackerLogsFromFirestore,
} from '../utils/firebaseClient';
import {
  evaluateAndDispatchFirestoreLateSessionAlerts,
  parseScheduleTimeString,
  startFirestoreLateSessionBackgroundService,
} from '../utils/lateSessionBackgroundService';
import { ACADEMY_BRAND_CONFIG } from '../constants/brandConfig';
import { DeveloperSupportModal } from '../components/DeveloperSupportModal';

export { ACADEMY_BRAND_CONFIG };

export interface OutboxMessage {
  id: string;
  recipientPhone: string;
  recipientName: string;
  text: string;
  type: 'session_report' | 'absence_alert' | 'credentials' | 'monthly_harvest' | 'circle_reminder';
  createdAt: string;
  status: 'queued' | 'sent';
}

export type ActiveTab =
  | 'dashboard'
  | 'faith_oasis'
  | 'owner_panel'
  | 'students'
  | 'session'
  | 'smartboard'
  | 'foundation'
  | 'tajweed'
  | 'circles'
  | 'exams'
  | 'struggling'
  | 'tasks'
  | 'finance'
  | 'broadcast'
  | 'resources'
  | 'public_mushaf'
  | 'settings';

interface AcademyStore {
  // Auth & Role
  isLoggedIn: boolean;
  userRole: UserRole;
  guardianStudentId: string | null;
  guardianSiblings: Student[];
  googleAuthUser: GoogleAuthResult | null;
  loginAsTeacher: () => void;
  loginWithGoogleEmail: (
    email: string,
    pin?: string,
    provider?: StaffAuthProvider
  ) => {
    ok: boolean;
    error?: string;
    requiresOnboardingCard?: boolean;
    requiresPendingScreen?: boolean;
    staffRecord?: TeacherAccessRecord;
  };
  startGoogleOAuthRedirect: (
    targetPortal?: 'teacher' | 'supervisor' | 'guardian' | 'student',
    initialFamily?: ExtendedFamilyFields
  ) => Promise<{
    ok: boolean;
    error?: string;
    isFirstGoogleLogin?: boolean;
    requiresOnboardingCard?: boolean;
    requiresPendingScreen?: boolean;
    ssoCandidate?: {
      email: string;
      displayName: string;
      provider: StaffAuthProvider;
      uid?: string;
      photoURL?: string | null;
    };
    staffRecord?: TeacherAccessRecord;
  }>;
  startMicrosoftOAuthRedirect: (
    targetPortal?: 'teacher' | 'supervisor' | 'guardian' | 'student',
    initialFamily?: ExtendedFamilyFields
  ) => Promise<{
    ok: boolean;
    error?: string;
    isFirstGoogleLogin?: boolean;
    requiresOnboardingCard?: boolean;
    requiresPendingScreen?: boolean;
    ssoCandidate?: {
      email: string;
      displayName: string;
      provider: StaffAuthProvider;
      uid?: string;
      photoURL?: string | null;
    };
    staffRecord?: TeacherAccessRecord;
  }>;
  submitNewStaffJoinRequest: (input: {
    fullName?: string;
    name?: string;
    email: string;
    whatsappPhone: string;
    specialization: string;
    requestedPosition:
      | 'محفظ حلقة'
      | 'مشرف تعليمي'
      | 'مسؤول مالي / إداري'
      | 'teacher'
      | 'supervisor';
    provider?: StaffAuthProvider;
    authProvider?: StaffAuthProvider;
    uid?: string;
    photoURL?: string | null;
  }) => TeacherAccessRecord;
  saveCurrentUserFamilyProfileToFirestore: (
    family: ExtendedFamilyFields
  ) => Promise<void>;
  loginAsGuardian: (phone: string, pin: string) => { ok: boolean; error?: string };
  loginAsGuardianDirect: (studentId: string) => void;
  loginAsGuest: () => void;
  logout: () => void;
  isStaffPortalPreview: boolean;
  setIsStaffPortalPreview: (v: boolean) => void;

  // Navigation & UI
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  selectedStudentId: string | null;
  setSelectedStudentId: (id: string | null) => void;
  toastMessage: { text: string; type: 'success' | 'error' | 'info' | 'warning' } | null;
  showToast: (text: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  quickSearchOpen: boolean;
  setQuickSearchOpen: (open: boolean) => void;
  isFullScreenFocus: boolean;
  setIsFullScreenFocus: (v: boolean) => void;
  isDeveloperModalOpen: boolean;
  setIsDeveloperModalOpen: (v: boolean) => void;

  // Entities
  students: Student[];
  sessions: SessionRecord[];
  circles: CircleGroup[];
  exams: ExamRecord[];
  ijazahs: IjazahRecord[];
  tasks: TaskItem[];
  settings: AcademySettings;
  boardStrokes: Record<string, SmartBoardStroke[]>;
  teacherRatings: TeacherRatingRecord[];
  homeSubmissions: HomePracticeSubmission[];
  admissionRequests: AdmissionRequest[];
  auditLogs: OwnerAuditLogItem[];
  managedTeachers: TeacherAccessRecord[];
  currentStaffTier: StaffHierarchyRole;
  setCurrentStaffTier: (tier: StaffHierarchyRole) => void;
  activeStaffEmail: string;
  setActiveStaffEmail: (email: string) => void;
  currentTeacherPermissions: TeacherPermissions;
  effectiveTeacherPermissions: TeacherPermissions;
  cloudSyncStatus: 'synced' | 'syncing' | 'local_ready';
  lastSyncTimestamp: string;
  triggerCloudSyncNow: (manualToast?: boolean) => Promise<void>;
  restoreFromCloudFirestoreNow: (silent?: boolean, targetEmail?: string) => Promise<boolean>;
  exportTeacherScopedJsonBackup: (teacherEmail?: string) => void;
  importTeacherScopedJsonBackup: (data: unknown, teacherEmail?: string) => boolean;
  updateTeacherAccessStatus: (
    teacherId: string,
    status: 'active' | 'blocked' | 'pending'
  ) => void;
  deleteStaffMember: (staffId: string) => void;
  addStaffMember: (input: {
    name: string;
    email: string;
    roleTitle: string;
    staffRole: StaffHierarchyRole;
    assignedCirclesCount?: number;
    assignedCircleNames?: string[];
    restrictToAssignedCircles?: boolean;
    authProvider?: StaffAuthProvider;
    whatsappPhone?: string;
    specialization?: string;
    status?: 'active' | 'pending';
    motherName?: string;
    grandfatherName?: string;
    grandmotherName?: string;
    uncleName?: string;
  }) => void;
  updateStaffFamilyDetails: (
    staffId: string,
    family: {
      motherName?: string;
      grandfatherName?: string;
      grandmotherName?: string;
      uncleName?: string;
    }
  ) => void;
  updateStaffRoleAndDetails: (
    staffId: string,
    updates: {
      staffRole?: StaffHierarchyRole;
      roleTitle?: string;
      assignedCirclesCount?: number;
      assignedCircleNames?: string[];
      restrictToAssignedCircles?: boolean;
      whatsappPhone?: string;
      specialization?: string;
      status?: 'active' | 'blocked' | 'pending';
      customPermissions?: Partial<SupervisorPermissions>;
      customTeacherPermissions?: Partial<TeacherPermissions>;
    }
  ) => void;
  updateSupervisorPermissions: (
    permissions: Partial<SupervisorPermissions>,
    targetSupervisorId?: string
  ) => void;
  updateTeacherPermissions: (
    permissions: Partial<TeacherPermissions>,
    targetTeacherId?: string
  ) => void;
  resetTeacherCustomPermissions: (targetTeacherId: string) => void;
  updateStudentPrivacyPreference: (
    studentId: string,
    preference: StudentPrivacyPreference
  ) => void;
  applyBulkStudentPrivacyPreference: (preference: StudentPrivacyPreference) => void;
  assignStudentToTeacher: (
    studentId: string,
    teacherEmail: string,
    teacherName: string
  ) => void;
  syncAllStaffToFirestoreNow: () => Promise<void>;
  linkStudentGoogleAccount: (
    studentId: string,
    googleEmail: string,
    family?: {
      motherName?: string;
      grandfatherName?: string;
      grandmotherName?: string;
      uncleName?: string;
    }
  ) => void;
  sessionReminderPreview: '1hour' | '60min' | 'now' | null;
  setSessionReminderPreview: (mode: '1hour' | '60min' | 'now' | null) => void;

  // Notifications & Background Services
  teacherAlerts: UrgentAlertItem[];
  triggerPushReminderNow: () => Promise<void>;
  lateSessionAlerts: LateSessionAlertRecord[];
  lastLateSessionCheckTime: string | null;
  triggerFirestoreLateCheckNow: () => Promise<void>;
  scheduleOrSendStudentMissedCirclePushNotification: (
    targetStudentId?: string,
    options?: { pullFromFirestore?: boolean; silentToast?: boolean }
  ) => Promise<{
    scheduledCount: number;
    sentCount: number;
    alerts: LateSessionAlertRecord[];
  }>;
  teacherCircleCronAlerts: RecitationEngineStatusRecord[];
  lastTeacherCronCheckTime: string | null;
  markRecitationEngineStartedInFirestore: (
    circleNameOrId?: string,
    studentId?: string,
    state?: 'started' | 'completed'
  ) => Promise<void>;
  runTeacherCircleStartCronCheck: (options?: {
    pullFromFirestore?: boolean;
    silentToast?: boolean;
  }) => Promise<{
    dueCirclesCount: number;
    notifiedTeachersCount: number;
    pendingCircles: RecitationEngineStatusRecord[];
  }>;
  lastScheduleBoardSyncAt: string | null;
  rescheduleSessionOrCircleViaDragDrop: (params: {
    entityType: 'circle' | 'student';
    targetId: string;
    fromDay?: number;
    toDay: number;
    toTime: string;
    copyDayInsteadOfMove?: boolean;
    cascadeToCircleStudents?: boolean;
  }) => Promise<void>;
  logQuickSurahRevisionInTracker: (params: {
    studentId: string;
    surahId: number;
    masteryScore?: number;
    markAsMemorized?: boolean;
    notes?: string;
  }) => Promise<void>;
  bulkLogJuzRevisionInTracker: (params: {
    studentId: string;
    juzNumber: number;
    masteryScore?: number;
  }) => Promise<void>;

  // Mutations
  saveStudent: (student: Omit<Student, 'id'> & { id?: string }) => Student;
  updateStudent: (studentId: string, patch: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  setStudentAccountStatus: (
    studentId: string,
    status: StudentAccountStatus,
    reason?: string
  ) => void;
  updateErrorFollowUpStatus: (
    studentId: string,
    errorKeyOrId: string,
    outcome: 'mastered' | 'needs_review' | 'repeated' | 'needs_practice' | 'repeated_error'
  ) => void;
  saveSession: (
    session: Omit<SessionRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ) => SessionRecord;
  saveCircle: (
    circle: Omit<CircleGroup, 'id'> & { id?: string },
    assignedStudentIds?: string[]
  ) => void;
  deleteCircle: (id: string) => void;
  assignStudentToCircle: (studentId: string, targetCircleName: string) => void;
  saveExam: (exam: Omit<ExamRecord, 'id'> & { id?: string }) => void;
  saveIjazah: (ijazah: Omit<IjazahRecord, 'id'> & { id?: string }) => void;
  saveTask: (task: Omit<TaskItem, 'id'> & { id?: string }) => void;
  addTask: (task: Omit<TaskItem, 'id'> & { id?: string }) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  updateStudentFee: (
    studentId: string,
    month: string,
    status: 'مدفوع' | 'متأخر' | 'معفى',
    amount: number,
    method?: string,
    notes?: string
  ) => void;
  addDisciplineWarning: (
    studentId: string,
    level: 'تنبيه' | 'إنذار أول' | 'إنذار نهائي',
    reason: string
  ) => void;
  updateSettings: (partial: Partial<AcademySettings>) => void;
  saveBoardStrokes: (key: string, strokes: SmartBoardStroke[]) => void;
  saveTeacherRating: (rating: Omit<TeacherRatingRecord, 'id' | 'date'> & { date?: string }) => void;
  saveHomeSubmission: (
    submission: Omit<
      HomePracticeSubmission,
      'id' | 'date' | 'createdAt' | 'reviewed' | 'reviewedByTeacher'
    > & {
      date?: string;
      guardianNote?: string;
    }
  ) => void;
  markHomeSubmissionReviewed: (
    id: string,
    feedback?: string,
    grade?: GradeType,
    masteryScore?: number
  ) => void;
  reviewHomeSubmission: (
    id: string,
    feedback?: string,
    grade?: GradeType,
    masteryScore?: number
  ) => void;
  addTimestampPinToHomeSubmission: (
    submissionId: string,
    pin: {
      timestampSec?: number;
      second?: number;
      formattedTime?: string;
      category: TimestampAudioFeedbackPin['category'];
      ayahNumber?: number;
      word?: string;
      comment?: string;
      note?: string;
      linkedErrorId?: string;
      linkedErrorType?: TimestampAudioFeedbackPin['linkedErrorType'];
      teacherVoiceNoteDataUrl?: string;
      teacherVoiceNoteDurationSec?: number;
    }
  ) => void;
  submitAdmissionRequest: (
    req: Partial<AdmissionRequest> & {
      studentName: string;
      age: number;
      guardianName: string;
    }
  ) => AdmissionRequest;
  updateAdmissionRequestStatus: (
    id: string,
    status: AdmissionRequest['status'],
    notes?: string
  ) => void;
  approveAdmissionAsStudent: (id: string, targetCircleName?: string) => Student | null;
  recordAuditLog: (
    actionCategory: OwnerAuditLogItem['actionCategory'],
    summary: string,
    targetName?: string,
    actorRole?: OwnerAuditLogItem['actorRole']
  ) => void;
  updateStudentAccessibilityMode: (
    studentId: string,
    mode: StudentAccessibilityMode
  ) => void;
  addStudentXp: (studentId: string, deltaXp: number, reason?: string) => void;
  awardStudentBadge: (studentId: string, badgeTitle: string) => void;
  toggleStudentGoldenCrown: (studentId: string) => void;
  promoteStudentFoundationLevel: (
    studentId: string,
    passedLevel: FoundationLevelNumber,
    score?: number
  ) => void;
  toggleStudentFortressTask: (
    studentId: string,
    taskId: FiveFortressTaskKey,
    dateStr?: string
  ) => void;
  linkStudentStopToAyah: (studentId: string, surahId: number, ayah: number) => void;
  addStudentCustomMutashabih: (
    studentId: string,
    item: Partial<StudentCustomMutashabih>
  ) => void;
  deleteStudentCustomMutashabih: (studentId: string, mutashabihId: string) => void;
  updateCircleSubstituteAndSeason: (
    circleId: string,
    updates: Partial<CircleGroup>
  ) => void;
  studentAudioBlobs: Record<string, StudentAudioBlobRecord[]>;
  saveStudentAudioBlob: (input: {
    studentId: string;
    studentName: string;
    surahName: string;
    fromAyah: number;
    toAyah: number;
    durationSeconds: number;
    blob: Blob;
    dataUrl: string;
    studentNote: string;
  }) => Promise<StudentAudioBlobRecord>;
  loadStudentAudioBlobs: (studentId: string) => Promise<StudentAudioBlobRecord[]>;
  deleteStudentAudioBlob: (studentId: string, recordId: string) => Promise<void>;
  saveStudentRecitationAudioClip: (
    studentId: string,
    clipInput: Omit<StudentRecitationAudioClip, 'id' | 'createdAt' | 'studentId'> & {
      blob?: Blob;
    }
  ) => Promise<StudentRecitationAudioClip>;
  deleteStudentRecitationAudioClip: (studentId: string, clipId: string) => void;
  // Public Mushaf & Waqf Portal
  publicMushafPortalOpen: boolean;
  setPublicMushafPortalOpen: (open: boolean) => void;
  waqfImpactStats: WaqfImpactStats;
  publicVisitors: PublicVisitorWirdRecord[];
  currentPublicVisitorId: string;
  publicBookmarks: PublicMushafBookmark[];
  recordWaqfAmeenPrayer: (visitorId?: string) => void;
  recordPublicWaqfActivity: (pagesRead?: number, versesRead?: number) => void;
  recordPwaInstallEvent: () => void;
  recordOfflineDownloadEvent: () => void;
  savePublicBookmark: (
    bookmark: Omit<PublicMushafBookmark, 'id' | 'updatedAt'> & { id?: string }
  ) => void;
  deletePublicBookmark: (id: string) => void;
  updatePublicVisitorWird: (
    updates: Partial<PublicVisitorWirdRecord> & {
      pagesDelta?: number;
      completedKhatmahDelta?: number;
    }
  ) => void;
  sendOwnerVisitorEncouragement: (
    targetVisitorId: string | 'ALL',
    badgeTitle: string,
    message: string
  ) => void;
  markVisitorEncouragementRead: (visitorId: string, encouragementId: string) => void;
  saveStudentPedagogicalProfile: (
    studentId: string,
    profile: StudentPedagogicalProfile
  ) => void;
  publishFamilyGuidanceToGuardian: (
    studentId: string,
    note: {
      title: string;
      categoryLabel: string;
      bodyText: string;
      targetLetterOrSurah?: string;
    }
  ) => PublishedFamilyGuidanceNote;
  resetToSeedData: () => void;
  clearAllStudentsAndStartEmpty: () => void;
  importFullBackup: (data: unknown) => boolean;

  // WhatsApp Offline Outbox Queue
  pendingOutboxMessages: OutboxMessage[];
  queueOutboxMessage: (msg: Omit<OutboxMessage, 'id' | 'createdAt' | 'status'>) => void;
  sendOutboxMessage: (id: string) => void;
  sendAllQueuedMessages: () => void;
  deleteOutboxMessage: (id: string) => void;

  // Smart Quiz & Peer-to-Peer Competitions Engine
  peerCompetitions: PeerCompetitionPack[];
  createPeerCompetitionPack: (pack: {
    title: string;
    description: string;
    targetLevel: StudentLevel | 'الكل';
    scopeLabel: string;
    questions: SmartQuizQuestion[];
    timeLimitSeconds: number;
    xpRewardFirst: number;
    xpRewardParticipant: number;
    badgeTitle: string;
  }) => PeerCompetitionPack;
  submitPeerCompetitionResult: (params: {
    competitionId: string;
    studentId: string;
    correctCount: number;
    totalQuestions: number;
    timeSeconds: number;
  }) => PeerCompetitionSubmission | null;
  deletePeerCompetitionPack: (id: string) => void;

  // Multi-Portal URL Routing & Hierarchical Role-Mode Switcher
  activePortalRoute: PortalRoute;
  setActivePortalRoute: (route: PortalRoute) => void;
  activeRoleMode: ActiveRoleMode;
  setActiveRoleMode: (mode: ActiveRoleMode) => void;

  // Guardian & Student Access Code Requests Pipeline
  accessCodeRequests: AccessCodeRequest[];
  submitAccessCodeRequest: (input: {
    studentName: string;
    guardianPhone: string;
    circleOrTeacherName?: string;
    portalType?: 'guardian' | 'student';
  }) => AccessCodeRequest;
  resolveAccessCodeRequestAndSendWhatsApp: (requestId: string) => {
    whatsappUrl: string;
    studentCode: string;
    studentPin: string;
    studentName: string;
  } | null;
  deleteAccessCodeRequest: (requestId: string) => void;
}

export interface StudentAudioBlobRecord {
  id: string;
  studentId: string;
  studentName: string;
  surahName: string;
  fromAyah: number;
  toAyah: number;
  durationSeconds: number;
  mimeType: string;
  sizeBytes: number;
  blob?: Blob;
  dataUrl: string;
  studentNote: string;
  createdAt: string;
  date?: string;
  recitationType?: string;
}

const STUDENT_AUDIO_IDB_NAME = 'wlq_student_audio_idb_v1';
const STUDENT_AUDIO_IDB_STORE = 'student_audio_blobs';

function openStudentAudioIndexedDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(STUDENT_AUDIO_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STUDENT_AUDIO_IDB_STORE)) {
          const store = db.createObjectStore(STUDENT_AUDIO_IDB_STORE, {
            keyPath: 'id',
          });
          store.createIndex('by_studentId', 'studentId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function persistAudioBlobToIdbAndLocalStorage(
  record: StudentAudioBlobRecord
): Promise<void> {
  // 1. Save raw Blob + metadata in IndexedDB
  const db = await openStudentAudioIndexedDB();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STUDENT_AUDIO_IDB_STORE, 'readwrite');
        tx.objectStore(STUDENT_AUDIO_IDB_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  // 2. Mirror serializable record (without raw Blob instance) to student's localStorage key
  try {
    const lsKey = `wlq_student_audio_blobs_${record.studentId}`;
    const raw = localStorage.getItem(lsKey);
    const existing: StudentAudioBlobRecord[] = raw ? JSON.parse(raw) : [];
    const serializable: StudentAudioBlobRecord = {
      ...record,
      blob: undefined,
    };
    const next = [
      serializable,
      ...existing.filter((item) => item.id !== record.id),
    ].slice(0, 15);
    localStorage.setItem(lsKey, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
}

async function fetchAudioBlobsFromIdbAndLocalStorage(
  studentId: string
): Promise<StudentAudioBlobRecord[]> {
  const results: StudentAudioBlobRecord[] = [];
  const seen = new Set<string>();

  const db = await openStudentAudioIndexedDB();
  if (db) {
    const idbItems = await new Promise<StudentAudioBlobRecord[]>((resolve) => {
      try {
        const tx = db.transaction(STUDENT_AUDIO_IDB_STORE, 'readonly');
        const store = tx.objectStore(STUDENT_AUDIO_IDB_STORE);
        const index = store.index('by_studentId');
        const req = index.getAll(IDBKeyRange.only(studentId));
        req.onsuccess = () =>
          resolve((req.result as StudentAudioBlobRecord[]) || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    for (const item of idbItems) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        results.push(item);
      }
    }
  }

  try {
    const lsKey = `wlq_student_audio_blobs_${studentId}`;
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const parsed = JSON.parse(raw) as StudentAudioBlobRecord[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.id && !seen.has(item.id)) {
            seen.add(item.id);
            results.push(item);
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const STORAGE_KEY = 'imam_academy_pwa_store_v13_sanitized';

const DEFAULT_SEED_STUDENT_IDS = new Set([
  'st-1',
  'st-2',
  'st-3',
  'st-4',
  'st-5',
  'st-6',
  'st-7',
  'st-8',
]);
const DEFAULT_SEED_CIRCLE_IDS = new Set([
  'circle-shatibi',
  'circle-jazari',
  'circle-noor',
]);
const DEFAULT_SEED_SESSION_IDS = new Set(['ses-101', 'ses-102']);
const DEFAULT_SEED_EXAM_IDS = new Set(['ex-1', 'ex-2', 'ex-3', 'ex-4']);
const DEFAULT_SEED_IJAZAH_IDS = new Set(['ij-1', 'ij-2']);
const DEFAULT_SEED_TASK_IDS = new Set(['tsk-1', 'tsk-2', 'tsk-3', 'tsk-4']);
const DEFAULT_SEED_RATING_IDS = new Set(['tr-1', 'tr-2', 'tr-3']);
const DEFAULT_SEED_HOME_SUB_IDS = new Set(['hp-1', 'hp-2']);
const DEFAULT_SEED_STAFF_IDS = new Set(['sup-1', 'sup-2', 'tch-2', 'tch-3']);
const DEFAULT_SEED_STAFF_EMAILS = new Set([
  'supervisor1@welivequran.com',
  'mahmoud.supervisor@outlook.com',
  'teacher1@welivequran.com',
  'abdulrahman.quran@gmail.com',
]);
const DEFAULT_SEED_COMP_IDS = new Set([
  'comp-pack-juz30-champions',
  'comp-pack-tabarak-mutashabihat',
]);
const DEFAULT_SEED_BOOKMARK_IDS = new Set([
  'bm-khatmah',
  'bm-memorization',
  'bm-tadabbur',
]);
const DEFAULT_SEED_VISITOR_IDS = new Set([
  'vis-local-current',
  'vis-101',
  'vis-102',
  'vis-103',
  'vis-104',
]);

const AcademyContext = createContext<AcademyStore | null>(null);

export const AcademyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const restoredContext = useMemo(() => ImamSessionRestore.load(), []);

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(
    () => !!(restoredContext?.isLoggedIn)
  );
  const [userRole, setUserRole] = useState<UserRole>(
    () => (restoredContext?.userRole as UserRole) || 'teacher'
  );
  const [guardianStudentId, setGuardianStudentId] = useState<string | null>(() => {
    const gid = restoredContext?.guardianStudentId || null;
    return gid && !DEFAULT_SEED_STUDENT_IDS.has(gid) ? gid : null;
  });
  const [isStaffPortalPreview, setIsStaffPortalPreview] = useState<boolean>(
    false
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>(
    () => (restoredContext?.activeTab as ActiveTab) || 'dashboard'
  );
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info' | 'warning';
  } | null>(null);
  const [quickSearchOpen, setQuickSearchOpen] = useState<boolean>(false);
  const [isFullScreenFocus, setIsFullScreenFocus] = useState<boolean>(false);
  const [isDeveloperModalOpen, setIsDeveloperModalOpen] = useState<boolean>(false);

  const [sessionReminderPreview, setSessionReminderPreview] = useState<
    '1hour' | '60min' | 'now' | null
  >(null);

  const [cloudSyncStatus, setCloudSyncStatus] = useState<
    'synced' | 'syncing' | 'local_ready'
  >('local_ready');
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<string>(() =>
    new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  );

  // Resilient Dynamic Firebase Initialization Engine (3-second timeout + LocalStorage fallback)
  useEffect(() => {
    let isMounted = true;
    const initDynamicFirebaseEngine = async () => {
      try {
        setCloudSyncStatus('syncing');
        const firebaseCdnUrl = 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
        const dynamicImportTask = import(/* @vite-ignore */ firebaseCdnUrl);
        const timeoutTask = new Promise<never>((_, reject) =>
          window.setTimeout(
            () => reject(new Error('FIREBASE_INIT_TIMEOUT_3000MS')),
            3000
          )
        );
        await Promise.race([dynamicImportTask, timeoutTask]);
        if (isMounted) {
          setCloudSyncStatus('synced');
        }
      } catch {
        // Immediately stop cloud attempts after 3s or offline error and switch to LocalStorage mode
        if (isMounted) {
          setCloudSyncStatus('local_ready');
        }
      }
    };
    void initDynamicFirebaseEngine();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load initial state from sanitized store while automatically migrating in the real students dataset once
  const loadInitialState = () => {
    const SANITIZED_MIGRATION_FLAG = 'wlq_sanitized_v13_migrated_2026';
    const REAL_STUDENTS_MIGRATION_FLAG = 'wlq_real_students_loaded_2026_11_24_v1';
    try {
      const migratedSanitized = localStorage.getItem(SANITIZED_MIGRATION_FLAG) === 'true';
      const loadedRealBackupAlready =
        localStorage.getItem(REAL_STUDENTS_MIGRATION_FLAG) === 'true';
      const raw = localStorage.getItem(STORAGE_KEY);

      let existingClean: {
        students: Student[];
        sessions: SessionRecord[];
        circles: CircleGroup[];
        exams: ExamRecord[];
        ijazahs: IjazahRecord[];
        tasks: TaskItem[];
        settings: AcademySettings;
        boardStrokes: Record<string, SmartBoardStroke[]>;
        teacherRatings: TeacherRatingRecord[];
        homeSubmissions: HomePracticeSubmission[];
      } | null = null;

      if (migratedSanitized && raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.students)) {
          const normalized = normalizePortableBackupPayload(
            parsed,
            INITIAL_SETTINGS,
            INITIAL_CIRCLES,
            getCurrentMonthKey()
          );
          if (normalized) {
            existingClean = {
              students: normalized.students.filter(
                (st) => !DEFAULT_SEED_STUDENT_IDS.has(st.id)
              ),
              sessions: normalized.sessions.filter(
                (ses) =>
                  !DEFAULT_SEED_SESSION_IDS.has(ses.id) &&
                  !DEFAULT_SEED_STUDENT_IDS.has(ses.studentId)
              ),
              circles: normalized.circles.filter(
                (c) => !DEFAULT_SEED_CIRCLE_IDS.has(c.id)
              ),
              exams: ((parsed.exams || []) as ExamRecord[]).filter(
                (ex) =>
                  !DEFAULT_SEED_EXAM_IDS.has(ex.id) &&
                  !DEFAULT_SEED_STUDENT_IDS.has(ex.studentId)
              ),
              ijazahs: ((parsed.ijazahs || []) as IjazahRecord[]).filter(
                (ij) =>
                  !DEFAULT_SEED_IJAZAH_IDS.has(ij.id) &&
                  !DEFAULT_SEED_STUDENT_IDS.has(ij.studentId)
              ),
              tasks: ((parsed.tasks || []) as TaskItem[]).filter(
                (tsk) =>
                  !DEFAULT_SEED_TASK_IDS.has(tsk.id) &&
                  (!tsk.studentId || !DEFAULT_SEED_STUDENT_IDS.has(tsk.studentId))
              ),
              settings: normalized.settings,
              boardStrokes: (parsed.boardStrokes || {}) as Record<string, SmartBoardStroke[]>,
              teacherRatings: ((parsed.teacherRatings || []) as TeacherRatingRecord[]).filter(
                (tr) =>
                  !DEFAULT_SEED_RATING_IDS.has(tr.id) &&
                  !DEFAULT_SEED_STUDENT_IDS.has(tr.studentId)
              ),
              homeSubmissions: ((parsed.homeSubmissions || []) as HomePracticeSubmission[]).filter(
                (hp) =>
                  !DEFAULT_SEED_HOME_SUB_IDS.has(hp.id) &&
                  !DEFAULT_SEED_STUDENT_IDS.has(hp.studentId)
              ),
            };
          }
        }
      }

      if (loadedRealBackupAlready && existingClean) {
        return existingClean;
      }

      // First-time upgrade to the real students backup: merge real students/sessions/circles with any existing user records
      localStorage.setItem(SANITIZED_MIGRATION_FLAG, 'true');
      localStorage.setItem(REAL_STUDENTS_MIGRATION_FLAG, 'true');

      if (existingClean) {
        const studentMap = new Map<string, Student>();
        INITIAL_STUDENTS.forEach((st) => studentMap.set(st.id, st));
        existingClean.students.forEach((st) => studentMap.set(st.id, st));

        const sessionMap = new Map<string, SessionRecord>();
        INITIAL_SESSIONS.forEach((ses) => sessionMap.set(ses.id, ses));
        existingClean.sessions.forEach((ses) => sessionMap.set(ses.id, ses));

        const circleMap = new Map<string, CircleGroup>();
        INITIAL_CIRCLES.forEach((c) => circleMap.set(c.id, c));
        existingClean.circles.forEach((c) => circleMap.set(c.id, c));

        return {
          ...existingClean,
          students: Array.from(studentMap.values()),
          sessions: Array.from(sessionMap.values()),
          circles: Array.from(circleMap.values()),
          settings: {
            ...existingClean.settings,
            teacherName:
              existingClean.settings.teacherName &&
              existingClean.settings.teacherName !== 'المعلم المشرف'
                ? existingClean.settings.teacherName
                : INITIAL_SETTINGS.teacherName,
            officialWhatsappPhone:
              existingClean.settings.officialWhatsappPhone &&
              existingClean.settings.officialWhatsappPhone !== '01000000000'
                ? existingClean.settings.officialWhatsappPhone
                : INITIAL_SETTINGS.officialWhatsappPhone,
            weeklyGoals: INITIAL_SETTINGS.weeklyGoals,
          },
        };
      }
    } catch {
      // fallback to real backup dataset
    }
    return {
      students: INITIAL_STUDENTS,
      sessions: INITIAL_SESSIONS,
      circles: INITIAL_CIRCLES,
      exams: INITIAL_EXAMS,
      ijazahs: INITIAL_IJAZAHS,
      tasks: INITIAL_TASKS,
      settings: INITIAL_SETTINGS,
      boardStrokes: {} as Record<string, SmartBoardStroke[]>,
      teacherRatings: INITIAL_TEACHER_RATINGS,
      homeSubmissions: INITIAL_HOME_SUBMISSIONS,
    };
  };

  const initial = loadInitialState();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(() => {
    const restoredId = restoredContext?.selectedStudentId;
    if (
      restoredId &&
      !DEFAULT_SEED_STUDENT_IDS.has(restoredId) &&
      initial.students.some((s) => s.id === restoredId)
    ) {
      return restoredId;
    }
    return initial.students[0]?.id || null;
  });
  const [students, setStudents] = useState<Student[]>(
    initial.students.map((st) => ({
      ...st,
      riwayah: st.riwayah || 'حفص عن عاصم',
      accessibilityMode: st.accessibilityMode || 'standard',
    }))
  );
  const [sessions, setSessions] = useState<SessionRecord[]>(initial.sessions);
  const [circles, setCircles] = useState<CircleGroup[]>(initial.circles);
  const [exams, setExams] = useState<ExamRecord[]>(
    initial.exams.map((ex, i) => ({
      ...ex,
      verificationCode:
        ex.verificationCode || `IMAM-VER-${202600 + i + 1}`,
      riwayah: ex.riwayah || 'حفص عن عاصم',
    }))
  );
  const [ijazahs, setIjazahs] = useState<IjazahRecord[]>(
    initial.ijazahs.map((ij, i) => ({
      ...ij,
      verificationCode:
        ij.verificationCode || `IMAM-SANAD-${9000 + i + 1}`,
    }))
  );
  const [tasks, setTasks] = useState<TaskItem[]>(initial.tasks);
  const [settings, setSettings] = useState<AcademySettings>(initial.settings);
  const [boardStrokes, setBoardStrokes] = useState<Record<string, SmartBoardStroke[]>>(
    initial.boardStrokes
  );
  const [teacherRatings, setTeacherRatings] = useState<TeacherRatingRecord[]>(
    initial.teacherRatings
  );
  const [homeSubmissions, setHomeSubmissions] = useState<HomePracticeSubmission[]>(
    initial.homeSubmissions
  );

  const [admissionRequests, setAdmissionRequests] = useState<AdmissionRequest[]>([]);

  const [auditLogs, setAuditLogs] = useState<OwnerAuditLogItem[]>([]);

  const [currentStaffTier, setCurrentStaffTier] = useState<StaffHierarchyRole>('owner');
  const [activeStaffEmail, setActiveStaffEmail] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(SUPABASE_OFFICIAL_CONFIG.trustStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { email?: string };
        if (parsed?.email) return parsed.email.trim().toLowerCase();
      }
    } catch {
      // ignore
    }
    return SUPABASE_OFFICIAL_CONFIG.ownerEmail;
  });

  const [managedTeachers, setManagedTeachers] = useState<TeacherAccessRecord[]>(() => {
    const defaultMasterOwners: TeacherAccessRecord[] = [
      {
        id: 'tch-owner-sayed1',
        name: 'الشيخ السيد الكومي — مالك الأكاديمية (١)',
        email: 'sayedkomy1@gmail.com',
        roleTitle: '👑 مالك الأكاديمية (Super Admin / Owner)',
        staffRole: 'owner',
        status: 'active',
        authProvider: 'google',
        whatsappPhone: '201095782616',
        specialization: 'المالك العام والمشرف الأعلى للحلقات القرآنية بالسند المتصل',
        lastSyncAt: getLocalDateString(0),
        lastActiveAt: `${getLocalDateString(0)} 10:00`,
        sessionsRecordedCount: INITIAL_SESSIONS.length,
        assignedCirclesCount: INITIAL_CIRCLES.length,
      },
      {
        id: 'tch-owner-sayed2',
        name: 'الشيخ السيد الكومي — مالك الأكاديمية (٢)',
        email: 'sayedkomy2@gmail.com',
        roleTitle: '👑 مالك الأكاديمية (Super Admin / Owner)',
        staffRole: 'owner',
        status: 'active',
        authProvider: 'google',
        whatsappPhone: '201095782616',
        specialization: 'المالك العام والمشرف الأعلى للحلقات القرآنية بالسند المتصل',
        lastSyncAt: getLocalDateString(0),
        lastActiveAt: `${getLocalDateString(0)} 11:30`,
        sessionsRecordedCount: 0,
        assignedCirclesCount: INITIAL_CIRCLES.length,
      },
    ];

    try {
      const saved = localStorage.getItem('imam_managed_staff_v13');
      if (saved) {
        const parsed = JSON.parse(saved) as TeacherAccessRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const map = new Map<string, TeacherAccessRecord>();
          defaultMasterOwners.forEach((o) => map.set(o.email.toLowerCase(), o));
          parsed.forEach((item) => {
            const key = item.email.trim().toLowerCase();
            if (
              DEFAULT_SEED_STAFF_IDS.has(item.id) ||
              DEFAULT_SEED_STAFF_EMAILS.has(key)
            ) {
              return;
            }
            if (isMasterOwnerEmail(key)) {
              map.set(key, {
                ...item,
                staffRole: 'owner',
                status: 'active',
                roleTitle: '👑 مالك الأكاديمية (Super Admin / Owner)',
              });
            } else {
              map.set(key, item);
            }
          });
          return Array.from(map.values());
        }
      }
    } catch {
      // ignore
    }
    return defaultMasterOwners;
  });

  useEffect(() => {
    try {
      localStorage.setItem('imam_managed_staff_v13', JSON.stringify(managedTeachers));
    } catch {
      // ignore
    }
  }, [managedTeachers]);

  const recordAuditLog = (
    actionCategory: OwnerAuditLogItem['actionCategory'],
    summary: string,
    targetName?: string,
    actorRole: OwnerAuditLogItem['actorRole'] = 'المالك / المشرف'
  ) => {
    const now = new Date();
    const timeStr = `${getLocalDateString(0)} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const entry: OwnerAuditLogItem = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: timeStr,
      actorName: settings.teacherName,
      actor: settings.teacherName,
      actorRole,
      actionCategory,
      category: actionCategory,
      summary,
      details: summary,
      targetName,
    };
    setAuditLogs((prev) => [entry, ...prev.slice(0, 99)]);
  };

  const updateTeacherAccessStatus = (
    teacherId: string,
    status: 'active' | 'blocked' | 'pending'
  ) => {
    const target = managedTeachers.find((t) => t.id === teacherId);
    if (!target) return;

    const targetRole = target.staffRole || 'teacher';
    if (targetRole === 'owner') {
      showToast('لا يمكن إيقاف أو تعليق حساب المالك العام للأكاديمية', 'error');
      return;
    }

    if (targetRole === 'supervisor' && currentStaffTier !== 'owner') {
      showToast('إدارة صلاحيات المشرفين (قبول أو إيقاف) متاحة للمالك العام فقط', 'error');
      return;
    }

    const updatedRecord: TeacherAccessRecord = {
      ...target,
      status,
      lastSyncAt: getLocalDateString(0),
    };

    setManagedTeachers((prev) =>
      prev.map((t) => (t.id === teacherId ? updatedRecord : t))
    );

    void syncStaffRegistrationToFirestore(updatedRecord).catch(() => {
      // non-blocking if not signed in
    });

    const roleLabel = targetRole === 'supervisor' ? 'المشرف' : 'المحفظ';
    const actionLabel =
      status === 'active'
        ? 'قبول وتفعيل'
        : status === 'blocked'
        ? 'إيقاف مؤقت'
        : 'تعليق للمراجعة';

    recordAuditLog(
      'صلاحيات وأمان',
      `${actionLabel} لحساب ${roleLabel} (${target.name} — ${target.email}) في Firestore بواسطة ${
        currentStaffTier === 'owner' ? 'المالك العام' : 'المشرف'
      }`,
      target.name
    );
    showToast(
      `تم ${actionLabel} حساب ${roleLabel} (${target.name}) في قاعدة بيانات Firestore بنجاح`,
      status === 'blocked' ? 'error' : 'success'
    );
  };

  const deleteStaffMember = (staffId: string) => {
    const target = managedTeachers.find((t) => t.id === staffId);
    if (!target) return;

    const targetRole = target.staffRole || 'teacher';
    if (targetRole === 'owner') {
      showToast('لا يمكن حذف حساب المالك العام للأكاديمية', 'error');
      return;
    }

    if (targetRole === 'supervisor' && currentStaffTier !== 'owner') {
      showToast('حذف حسابات المشرفين متاح للمالك العام فقط', 'error');
      return;
    }

    setManagedTeachers((prev) => prev.filter((t) => t.id !== staffId));
    void deleteStaffRegistrationFromFirestore(staffId).catch(() => {
      // non-blocking
    });

    const roleLabel = targetRole === 'supervisor' ? 'المشرف' : 'المحفظ';
    recordAuditLog(
      'صلاحيات وأمان',
      `حذف نهائي لحساب ${roleLabel} (${target.name} — ${target.email}) من قاعدة بيانات Firestore بواسطة ${
        currentStaffTier === 'owner' ? 'المالك العام' : 'المشرف'
      }`,
      target.name
    );
    showToast(`تم حذف حساب ${roleLabel} (${target.name}) نهائياً من قاعدة بيانات Firestore`, 'info');
  };

  const addStaffMember = (input: {
    name: string;
    email: string;
    roleTitle: string;
    staffRole: StaffHierarchyRole;
    assignedCirclesCount?: number;
    assignedCircleNames?: string[];
    restrictToAssignedCircles?: boolean;
    authProvider?: StaffAuthProvider;
    whatsappPhone?: string;
    specialization?: string;
    status?: 'active' | 'pending';
    motherName?: string;
    grandfatherName?: string;
    grandmotherName?: string;
    uncleName?: string;
  }) => {
    const cleanEmail = input.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      showToast('يرجى إدخال بريد إلكتروني صحيح', 'error');
      return;
    }

    if (
      (input.staffRole === 'supervisor' ||
        input.staffRole === 'owner' ||
        input.staffRole === 'financial_manager') &&
      currentStaffTier !== 'owner'
    ) {
      showToast('إضافة مشرف أو مسؤول مالي متاحة لمالك الأكاديمية فقط', 'error');
      return;
    }

    const exists = managedTeachers.some(
      (t) => t.email.toLowerCase() === cleanEmail
    );
    if (exists) {
      showToast('هذا البريد الإلكتروني مسجل بالفعل في قائمة المشرفين والمحفظين', 'error');
      return;
    }

    const isOwner = isMasterOwnerEmail(cleanEmail) || input.staffRole === 'owner';

    const newRecord: TeacherAccessRecord = {
      id: `${input.staffRole === 'supervisor' ? 'sup' : 'tch'}-${Date.now()}`,
      name: input.name.trim() || cleanEmail.split('@')[0],
      email: cleanEmail,
      roleTitle:
        input.roleTitle.trim() ||
        (isOwner
          ? '👑 مالك الأكاديمية (Super Admin / Owner)'
          : input.staffRole === 'supervisor'
          ? 'مشرف عام الحلقات والمتابعة'
          : input.staffRole === 'financial_manager'
          ? 'مسؤول مالي وإداري'
          : 'محفظ الحلقات القرآنية'),
      staffRole: isOwner ? 'owner' : input.staffRole,
      status: isOwner ? 'active' : input.status || 'active',
      lastSyncAt: getLocalDateString(0),
      requestedAt: getLocalDateString(0),
      assignedCirclesCount:
        input.assignedCircleNames && input.assignedCircleNames.length > 0
          ? input.assignedCircleNames.length
          : input.assignedCirclesCount ?? 1,
      assignedCircleNames: input.assignedCircleNames,
      restrictToAssignedCircles: input.restrictToAssignedCircles ?? false,
      authProvider:
        input.authProvider ||
        (cleanEmail.includes('outlook') ||
        cleanEmail.includes('hotmail') ||
        cleanEmail.includes('live') ||
        cleanEmail.includes('microsoft')
          ? 'microsoft'
          : 'google'),
      whatsappPhone: input.whatsappPhone?.trim() || undefined,
      specialization: input.specialization?.trim() || undefined,
      googleUid: auth.currentUser?.uid,
      motherName: input.motherName?.trim() || undefined,
      grandfatherName: input.grandfatherName?.trim() || undefined,
      grandmotherName: input.grandmotherName?.trim() || undefined,
      uncleName: input.uncleName?.trim() || undefined,
    };

    setManagedTeachers((prev) => [newRecord, ...prev]);

    void syncStaffRegistrationToFirestore(newRecord).catch(() => {
      // non-blocking
    });

    void syncExtendedFamilyRecordToFirestore({
      recordId: newRecord.id,
      entityType: input.staffRole === 'supervisor' ? 'supervisor' : 'teacher',
      personName: newRecord.name,
      motherName: newRecord.motherName,
      grandfatherName: newRecord.grandfatherName,
      grandmotherName: newRecord.grandmotherName,
      uncleName: newRecord.uncleName,
    }).catch(() => {
      // non-blocking if not signed into Firebase yet
    });

    const roleLabel =
      input.staffRole === 'supervisor'
        ? 'مشرف عام'
        : input.staffRole === 'financial_manager'
        ? 'مسؤول مالي'
        : 'محفظ حلقة';
    recordAuditLog(
      'صلاحيات وأمان',
      `إضافة واعتماد ${roleLabel} جديد (${newRecord.name} — ${newRecord.email}) وحفظه في Firestore`,
      newRecord.name
    );
    showToast(
      `تمت إضافة ${roleLabel} جديد (${newRecord.name}) وحفظ تسجيله في Firestore بنجاح`,
      'success'
    );
  };

  const updateStaffFamilyDetails = (
    staffId: string,
    family: {
      motherName?: string;
      grandfatherName?: string;
      grandmotherName?: string;
      uncleName?: string;
    }
  ) => {
    const target = managedTeachers.find((t) => t.id === staffId);
    if (!target) return;

    const cleanMother = family.motherName?.trim() || '';
    const cleanGrandfather = family.grandfatherName?.trim() || '';
    const cleanGrandmother = family.grandmotherName?.trim() || '';
    const cleanUncle = family.uncleName?.trim() || '';

    const updatedRecord: TeacherAccessRecord = {
      ...target,
      googleUid: target.googleUid || auth.currentUser?.uid,
      motherName: cleanMother || undefined,
      grandfatherName: cleanGrandfather || undefined,
      grandmotherName: cleanGrandmother || undefined,
      uncleName: cleanUncle || undefined,
      lastSyncAt: getLocalDateString(0),
    };

    setManagedTeachers((prev) =>
      prev.map((t) => (t.id === staffId ? updatedRecord : t))
    );

    void syncStaffRegistrationToFirestore(updatedRecord).catch(() => {
      // non-blocking
    });

    void syncExtendedFamilyRecordToFirestore({
      recordId: target.id,
      entityType: target.staffRole === 'supervisor' ? 'supervisor' : 'teacher',
      personName: target.name,
      motherName: cleanMother,
      grandfatherName: cleanGrandfather,
      grandmotherName: cleanGrandmother,
      uncleName: cleanUncle,
    }).catch(() => {
      // non-blocking
    });

    recordAuditLog(
      'صلاحيات وأمان',
      `تحديث بيانات العائلة (الوالدة، الجد، الجدة، العم) للمحفظ/المشرف (${target.name}) وربطها بمعرف Google في Firestore`,
      target.name
    );
    showToast(
      `تم حفظ بيانات العائلة (الوالدة، الجد، الجدة، العم) للمحفظ (${target.name}) ومزامنتها مع حساب Google و Firestore ✓`,
      'success'
    );
  };

  const updateStaffRoleAndDetails = (
    staffId: string,
    updates: {
      staffRole?: StaffHierarchyRole;
      roleTitle?: string;
      assignedCirclesCount?: number;
      assignedCircleNames?: string[];
      restrictToAssignedCircles?: boolean;
      whatsappPhone?: string;
      specialization?: string;
      status?: 'active' | 'blocked' | 'pending';
      customPermissions?: Partial<SupervisorPermissions>;
      customTeacherPermissions?: Partial<TeacherPermissions>;
    }
  ) => {
    const target = managedTeachers.find((t) => t.id === staffId);
    if (!target) return;

    if (isMasterOwnerEmail(target.email) || target.staffRole === 'owner') {
      showToast('لا يمكن تعديل أو تقييد حساب المالك الرسمي للأكاديمية', 'error');
      return;
    }

    if (currentStaffTier !== 'owner') {
      showToast('تعديل الرتبة الوظيفية والصلاحيات متاح لمالك الأكاديمية فقط', 'error');
      return;
    }

    const updatedCircleNames =
      updates.assignedCircleNames ?? target.assignedCircleNames;

    const updatedRecord: TeacherAccessRecord = {
      ...target,
      staffRole: updates.staffRole ?? target.staffRole,
      status: updates.status ?? target.status,
      roleTitle: updates.roleTitle?.trim() || target.roleTitle,
      assignedCirclesCount:
        updatedCircleNames && updatedCircleNames.length > 0
          ? updatedCircleNames.length
          : updates.assignedCirclesCount ?? target.assignedCirclesCount,
      assignedCircleNames: updatedCircleNames,
      restrictToAssignedCircles:
        updates.restrictToAssignedCircles ?? target.restrictToAssignedCircles,
      whatsappPhone:
        updates.whatsappPhone !== undefined
          ? updates.whatsappPhone.trim()
          : target.whatsappPhone,
      specialization:
        updates.specialization !== undefined
          ? updates.specialization.trim()
          : target.specialization,
      customPermissions:
        updates.customPermissions !== undefined
          ? { ...(target.customPermissions || {}), ...updates.customPermissions }
          : target.customPermissions,
      customTeacherPermissions:
        updates.customTeacherPermissions !== undefined
          ? {
              ...(target.customTeacherPermissions || {}),
              ...updates.customTeacherPermissions,
            }
          : target.customTeacherPermissions,
      lastSyncAt: getLocalDateString(0),
    };

    setManagedTeachers((prev) =>
      prev.map((t) => (t.id === staffId ? updatedRecord : t))
    );

    void syncStaffRegistrationToFirestore(updatedRecord).catch(() => {
      // non-blocking
    });

    recordAuditLog(
      'صلاحيات وأمان',
      `تحديث الدور والصلاحيات والحلقات المسندة لـ (${updatedRecord.name}) سحابياً بواسطة مالك الأكاديمية`,
      updatedRecord.name
    );
    showToast(
      `تم تحديث الدور والصلاحيات والحلقات لـ (${updatedRecord.name}) ومزامنتها سحابياً بنجاح ✓`,
      'success'
    );
  };

  const updateSupervisorPermissions = (
    permissions: Partial<SupervisorPermissions>,
    targetSupervisorId?: string
  ) => {
    if (currentStaffTier !== 'owner') {
      showToast('تحديد صلاحيات المشرفين متاح للمالك العام فقط', 'error');
      return;
    }

    if (targetSupervisorId) {
      const target = managedTeachers.find((t) => t.id === targetSupervisorId);
      if (!target) return;
      const mergedCustom = {
        ...(settings.supervisorPermissions || DEFAULT_SUPERVISOR_PERMISSIONS),
        ...(target.customPermissions || {}),
        ...permissions,
      };
      const updatedRecord: TeacherAccessRecord = {
        ...target,
        customPermissions: mergedCustom,
        lastSyncAt: getLocalDateString(0),
      };
      setManagedTeachers((prev) =>
        prev.map((t) => (t.id === targetSupervisorId ? updatedRecord : t))
      );
      void syncStaffRegistrationToFirestore(updatedRecord).catch(() => {});
      recordAuditLog(
        'صلاحيات وأمان',
        `تخصيص صلاحيات المشرف (${target.name}) بواسطة المالك العام`,
        target.name
      );
      showToast(`تم تحديث صلاحيات المشرف (${target.name}) بنجاح ✓`, 'success');
      return;
    }

    const nextGlobalPerms: SupervisorPermissions = {
      ...(settings.supervisorPermissions || DEFAULT_SUPERVISOR_PERMISSIONS),
      ...permissions,
    };
    setSettings((prev) => ({
      ...prev,
      supervisorPermissions: nextGlobalPerms,
    }));
    recordAuditLog(
      'صلاحيات وأمان',
      'تحديث مصفوفة الصلاحيات العامة للمشرفين بواسطة المالك العام',
      'صلاحيات المشرفين'
    );
    showToast('تم تحديث صلاحيات المشرفين المعتمدة من المالك العام ✓', 'success');
  };

  const updateTeacherPermissions = (
    permissions: Partial<TeacherPermissions>,
    targetTeacherId?: string
  ) => {
    if (currentStaffTier !== 'owner') {
      showToast('تحديد صلاحيات المحفظين الإضافية متاح للمالك العام فقط', 'error');
      return;
    }

    if (targetTeacherId) {
      const target = managedTeachers.find((t) => t.id === targetTeacherId);
      if (!target) return;
      const mergedCustom: TeacherPermissions = {
        ...(settings.teacherPermissions || DEFAULT_TEACHER_PERMISSIONS),
        ...(target.customTeacherPermissions || {}),
        ...permissions,
      };
      const updatedRecord: TeacherAccessRecord = {
        ...target,
        customTeacherPermissions: mergedCustom,
        lastSyncAt: getLocalDateString(0),
      };
      setManagedTeachers((prev) =>
        prev.map((t) => (t.id === targetTeacherId ? updatedRecord : t))
      );
      void syncStaffRegistrationToFirestore(updatedRecord).catch(() => {});
      void triggerCloudSyncNow(false);
      recordAuditLog(
        'صلاحيات وأمان',
        `تخصيص صلاحيات المحفظ (${target.name}) بواسطة المالك العام`,
        target.name
      );
      showToast(`تم تخصيص وحفظ صلاحيات المحفظ (${target.name}) سحابياً بنجاح ✓`, 'success');
      return;
    }

    const nextGlobalTeacherPerms: TeacherPermissions = {
      ...(settings.teacherPermissions || DEFAULT_TEACHER_PERMISSIONS),
      ...permissions,
    };
    setSettings((prev) => ({
      ...prev,
      teacherPermissions: nextGlobalTeacherPerms,
    }));
    void triggerCloudSyncNow(false);
    recordAuditLog(
      'صلاحيات وأمان',
      'تحديث مصفوفة الصلاحيات الإضافية للمحفظين بواسطة المالك العام',
      'صلاحيات المحفظين'
    );
    showToast('تم تحديث صلاحيات المحفظين الإضافية المعتمدة من المالك العام ✓', 'success');
  };

  const resetTeacherCustomPermissions = (targetTeacherId: string) => {
    if (currentStaffTier !== 'owner') {
      showToast('إعادة تعيين صلاحيات المحفظ للوضع الافتراضي متاح للمالك العام فقط', 'error');
      return;
    }
    const target = managedTeachers.find((t) => t.id === targetTeacherId);
    if (!target) return;
    const updatedRecord: TeacherAccessRecord = {
      ...target,
      customTeacherPermissions: undefined,
      lastSyncAt: getLocalDateString(0),
    };
    setManagedTeachers((prev) =>
      prev.map((t) => (t.id === targetTeacherId ? updatedRecord : t))
    );
    void syncStaffRegistrationToFirestore(updatedRecord).catch(() => {});
    void triggerCloudSyncNow(false);
    recordAuditLog(
      'صلاحيات وأمان',
      `إعادة صلاحيات المحفظ (${target.name}) إلى الصلاحيات الافتراضية العامة بواسطة المالك العام`,
      target.name
    );
    showToast(
      `تمت إعادة صلاحيات المحفظ (${target.name}) إلى الصلاحيات الافتراضية المعتمدة ✓`,
      'info'
    );
  };

  const currentTeacherPermissions: TeacherPermissions = useMemo(() => {
    const base = {
      ...DEFAULT_TEACHER_PERMISSIONS,
      ...(settings.teacherPermissions || {}),
    };
    const matchedTeacher = managedTeachers.find(
      (t) => t.email.toLowerCase() === activeStaffEmail.toLowerCase()
    );
    if (matchedTeacher?.customTeacherPermissions) {
      return {
        ...base,
        ...matchedTeacher.customTeacherPermissions,
      };
    }
    return base;
  }, [settings.teacherPermissions, managedTeachers, activeStaffEmail]);

  const updateStudentPrivacyPreference = (
    studentId: string,
    preference: StudentPrivacyPreference
  ) => {
    const target = students.find((s) => s.id === studentId);
    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId
          ? {
              ...s,
              privacyPreference: preference,
            }
          : s
      )
    );
    const prefLabel =
      preference === 'private'
        ? 'إخفاء كامل عن العامة (خاص)'
        : preference === 'limited'
        ? 'وضع المشاركة المحدودة (Private Mode)'
        : 'الوضع القياسي';
    if (target) {
      recordAuditLog(
        'صلاحيات وأمان',
        `تحديث إعدادات الخصوصية للطالب (${target.name}) إلى: ${prefLabel}`,
        target.name
      );
    }
    showToast(`تم تحديث إعدادات الخصوصية إلى: ${prefLabel}`, 'success');
  };

  const applyBulkStudentPrivacyPreference = (
    preference: StudentPrivacyPreference
  ) => {
    setStudents((prev) =>
      prev.map((s) => ({
        ...s,
        privacyPreference: preference,
      }))
    );
    const prefLabel =
      preference === 'private'
        ? 'إخفاء كامل عن العامة (خاص)'
        : preference === 'limited'
        ? 'وضع المشاركة المحدودة'
        : 'الوضع القياسي';
    recordAuditLog(
      'صلاحيات وأمان',
      `تعميم تفضيل الخصوصية (${prefLabel}) على جميع ملفات الطلاب (${students.length} طالب)`,
      'جميع الطلاب'
    );
    showToast(
      `تم تطبيق وضع الخصوصية (${prefLabel}) على جميع ملفات الطلاب (${students.length}) بنجاح ✓`,
      'success'
    );
  };

  const assignStudentToTeacher = (
    studentId: string,
    teacherEmail: string,
    teacherName: string
  ) => {
    const target = students.find((s) => s.id === studentId);
    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId
          ? {
              ...s,
              assignedTeacherEmail: teacherEmail.trim().toLowerCase(),
              assignedTeacherName: teacherName.trim(),
            }
          : s
      )
    );
    if (target) {
      recordAuditLog(
        'تعديل طالب',
        `إسناد الطالب (${target.name}) إلى المحفظ (${teacherName}) بإشراف المالك`,
        target.name
      );
      showToast(`تم إسناد الطالب (${target.name}) إلى المحفظ (${teacherName}) ✓`, 'success');
    }
  };

  const syncAllStaffToFirestoreNow = async () => {
    if (!auth.currentUser || !auth.currentUser.emailVerified) {
      showToast(
        'تم حفظ التعديلات محلياً — قم بتسجيل الدخول بحساب Google لمزامنتها مباشرة في Firestore السحابي',
        'info'
      );
      return;
    }
    try {
      const count = await syncAllStaffRegistrationsToFirestore(managedTeachers);
      recordAuditLog(
        'صلاحيات وأمان',
        `مزامنة شاملة لجميع تسجيلات المحفظين والمشرفين (${count} سجل) في قاعدة بيانات Firestore`,
        settings.academyName
      );
      showToast(
        `تمت مزامنة ${count} من تسجيلات المحفظين والمشرفين في قاعدة بيانات Firestore بنجاح ✓`,
        'success'
      );
    } catch {
      showToast('تعذر إتمام المزامنة الفورية مع Firestore حالياً', 'error');
    }
  };

  const linkStudentGoogleAccount = (
    studentId: string,
    googleEmail: string,
    family?: {
      motherName?: string;
      grandfatherName?: string;
      grandmotherName?: string;
      uncleName?: string;
    }
  ) => {
    const cleanEmail = googleEmail.trim().toLowerCase();
    const targetStudent = students.find((s) => s.id === studentId);
    const mergedMother =
      family?.motherName !== undefined
        ? family.motherName.trim()
        : targetStudent?.motherName || '';
    const mergedGrandfather =
      family?.grandfatherName !== undefined
        ? family.grandfatherName.trim()
        : targetStudent?.grandfatherName || '';
    const mergedGrandmother =
      family?.grandmotherName !== undefined
        ? family.grandmotherName.trim()
        : targetStudent?.grandmotherName || '';
    const mergedUncle =
      family?.uncleName !== undefined
        ? family.uncleName.trim()
        : targetStudent?.uncleName || '';

    setStudents((prev) =>
      prev.map((st) =>
        st.id === studentId
          ? {
              ...st,
              googleEmail: cleanEmail || undefined,
              googleUid: st.googleUid || auth.currentUser?.uid,
              motherName: mergedMother || undefined,
              grandfatherName: mergedGrandfather || undefined,
              grandmotherName: mergedGrandmother || undefined,
              uncleName: mergedUncle || undefined,
            }
          : st
      )
    );

    const stName = targetStudent?.name || 'الطالب';
    void syncExtendedFamilyRecordToFirestore({
      recordId: studentId,
      entityType: 'student',
      personName: stName,
      motherName: mergedMother,
      grandfatherName: mergedGrandfather,
      grandmotherName: mergedGrandmother,
      uncleName: mergedUncle,
    }).catch(() => {
      // non-blocking
    });

    recordAuditLog(
      'تعديل بيانات طالب',
      `ربط حساب Google (${cleanEmail || 'إلغاء الربط'}) وحفظ بيانات العائلة (الوالدة، الجد، الجدة، العم) للطالب (${stName}) في Firestore`,
      stName
    );
    showToast(
      `تم تحديث ربط حساب Google وبيانات العائلة للطالب (${stName}) في Firestore بنجاح`,
      'success'
    );
  };

  // Instant Session Restore (150ms debounced + visibilitychange)
  useEffect(() => {
    ImamSessionRestore.saveDebounced({
      activeTab,
      selectedStudentId,
      userRole,
      guardianStudentId,
      isLoggedIn,
      updatedAt: Date.now(),
    });
  }, [activeTab, selectedStudentId, userRole, guardianStudentId, isLoggedIn]);

  useEffect(() => {
    const saveNow = () => {
      ImamSessionRestore.saveImmediate({
        activeTab,
        selectedStudentId,
        userRole,
        guardianStudentId,
        isLoggedIn,
        updatedAt: Date.now(),
      });
    };
    const handleVis = () => {
      if (document.visibilityState === 'hidden') {
        saveNow();
      }
    };
    document.addEventListener('visibilitychange', handleVis);
    window.addEventListener('pagehide', saveNow);
    return () => {
      document.removeEventListener('visibilitychange', handleVis);
      window.removeEventListener('pagehide', saveNow);
    };
  }, [activeTab, selectedStudentId, userRole, guardianStudentId, isLoggedIn]);

  // Automatic & Manual Firebase Cloud Firestore Backup + Restore
  const lastRosterHashRef = useRef<string>('');
  const triggerCloudSyncNow = async (manualToast = false) => {
    setCloudSyncStatus('syncing');
    const safeRoster = WLQSyncCore.buildSafeSupervisorRoster(students, circles);
    const currentHash = canonicalJson(safeRoster);
    lastRosterHashRef.current = currentHash;
    try {
      localStorage.setItem(
        'wlq_supervisor_safe_roster_v12',
        JSON.stringify({
          schemaVersion: SUPABASE_OFFICIAL_CONFIG.schemaVersion,
          appVersion: SUPABASE_OFFICIAL_CONFIG.appVersion,
          ownerEmail: SUPABASE_OFFICIAL_CONFIG.ownerEmail,
          syncedAt: new Date().toISOString(),
          roster: safeRoster,
        })
      );
    } catch {
      // ignore storage quota
    }

    const fullBackupPayload: Record<string, unknown> = {
      schemaVersion: 12,
      exportedAt: new Date().toISOString(),
      teacherEmail: activeStaffEmail || googleAuthUser?.email || SUPABASE_OFFICIAL_CONFIG.ownerEmail,
      students,
      circles,
      sessions,
      exams,
      ijazahs,
      tasks,
      settings,
      managedTeachers,
    };

    const nowFormatted = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    try {
      await Promise.race([
        syncAcademySnapshotToFirestore({
          academyName: settings.academyName,
          studentsCount: students.length,
          sessionsCount: sessions.length,
          teacherEmail: activeStaffEmail || googleAuthUser?.email || SUPABASE_OFFICIAL_CONFIG.ownerEmail,
          backupPayload: fullBackupPayload,
        }),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error('CLOUD_SYNC_TIMEOUT_3000MS')), 3000)
        ),
      ]);
      setCloudSyncStatus('synced');
      setLastSyncTimestamp(nowFormatted);
    } catch {
      // Fallback immediately to LocalStorage mode if cloud takes > 3s
      setCloudSyncStatus('local_ready');
      setLastSyncTimestamp(nowFormatted);
    }

    if (manualToast) {
      recordAuditLog(
        'صلاحيات وأمان',
        `طلب مزامنة فورية يدوية (Force Sync) — الحلقات (${circles.length}) والطلاب (${students.length}) والحصص (${sessions.length})`,
        settings.academyName
      );
      showToast(
        `☁️ تمت المزامنة الفورية (Force Sync) وحفظ الحلقات (${circles.length}) والطلاب (${students.length}) والحصص (${sessions.length}) بنجاح ✓`,
        'success'
      );
    }
  };

  const restoreFromCloudFirestoreNow = async (
    silent = false,
    targetEmail?: string
  ): Promise<boolean> => {
    const emailToFetch =
      targetEmail ||
      activeStaffEmail ||
      googleAuthUser?.email ||
      SUPABASE_OFFICIAL_CONFIG.ownerEmail;
    try {
      setCloudSyncStatus('syncing');
      const result = await Promise.race([
        fetchAcademyCloudBackupFromFirestore(emailToFetch),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error('CLOUD_RESTORE_TIMEOUT_3000MS')), 3000)
        ),
      ]);
      setCloudSyncStatus('synced');
      if (!result.payload || !Array.isArray(result.payload.students)) {
        if (!silent) {
          showToast(
            'لا توجد نسخة احتياطية سحابية أحدث محفوظة حالياً — تم اعتماد البيانات الحالية ومزامنتها مع السحابة ✓',
            'info'
          );
          await triggerCloudSyncNow(false);
        }
        return false;
      }

      const normalized = normalizePortableBackupPayload(
        result.payload,
        settings,
        circles,
        getCurrentMonthKey()
      );
      if (!normalized) {
        return false;
      }

      const cleanCloudStudents = normalized.students.filter(
        (s) => !DEFAULT_SEED_STUDENT_IDS.has(s.id)
      );
      const cleanCloudCircles = normalized.circles.filter(
        (c) => !DEFAULT_SEED_CIRCLE_IDS.has(c.id)
      );
      const cleanCloudSessions = normalized.sessions.filter(
        (ses) =>
          !DEFAULT_SEED_SESSION_IDS.has(ses.id) &&
          !DEFAULT_SEED_STUDENT_IDS.has(ses.studentId)
      );
      const hadSeedRecordsInCloud =
        cleanCloudStudents.length !== normalized.students.length ||
        cleanCloudCircles.length !== normalized.circles.length ||
        cleanCloudSessions.length !== normalized.sessions.length;

      if (cleanCloudStudents.length === 0 && cleanCloudCircles.length === 0) {
        if (hadSeedRecordsInCloud) {
          void triggerCloudSyncNow(false);
        }
        return false;
      }

      // Merge non-seed cloud students, circles, and sessions with current state
      setStudents((prev) => {
        const map = new Map<string, Student>();
        prev
          .filter((s) => !DEFAULT_SEED_STUDENT_IDS.has(s.id))
          .forEach((s) => map.set(s.id, s));
        cleanCloudStudents.forEach((s) => map.set(s.id, s));
        return Array.from(map.values());
      });
      setCircles((prev) => {
        const map = new Map<string, CircleGroup>();
        prev
          .filter((c) => !DEFAULT_SEED_CIRCLE_IDS.has(c.id))
          .forEach((c) => map.set(c.id, c));
        cleanCloudCircles.forEach((c) => map.set(c.id, c));
        return Array.from(map.values());
      });
      setSessions((prev) => {
        const map = new Map<string, SessionRecord>();
        prev
          .filter(
            (s) =>
              !DEFAULT_SEED_SESSION_IDS.has(s.id) &&
              !DEFAULT_SEED_STUDENT_IDS.has(s.studentId)
          )
          .forEach((s) => map.set(s.id, s));
        cleanCloudSessions.forEach((s) => map.set(s.id, s));
        return Array.from(map.values());
      });

      if (hadSeedRecordsInCloud) {
        void triggerCloudSyncNow(false);
      }

      if (result.syncedAt) {
        setLastSyncTimestamp(result.syncedAt);
      }

      if (!silent) {
        showToast(
          `☁️ تمت استعادة ومزامنة البيانات من السحابة بنجاح (${cleanCloudStudents.length} طالباً و ${cleanCloudCircles.length} حلقات) ✓`,
          'success'
        );
      } else if (cleanCloudStudents.length > 0) {
        showToast(
          `☁️ تم استرجاع ومزامنة طلابك وحلقاتك تلقائياً من السحابة (${cleanCloudStudents.length} طالباً) ✓`,
          'success'
        );
      }
      return true;
    } catch {
      setCloudSyncStatus('local_ready');
      if (!silent) {
        showToast('تعذر الاتصال بالسحابة حالياً — تعمل المنصة بالنسخة المحلية المؤمنة (LocalStorage)', 'info');
      }
      return false;
    }
  };

  // Automatic debounced Cloud Backup to Firebase Cloud Firestore whenever students, circles, sessions, or tasks change
  useEffect(() => {
    if (settings.autoCloudBackupEnabled === false) return;
    const timer = window.setTimeout(() => {
      const safeRoster = WLQSyncCore.buildSafeSupervisorRoster(students, circles);
      const nextHash = canonicalJson(safeRoster);
      if (nextHash !== lastRosterHashRef.current) {
        void triggerCloudSyncNow(false);
      }
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [students, circles, sessions, tasks, settings.autoCloudBackupEnabled]);

  // Compute active teacher alerts (overdue tasks + urgent follow-up students)
  const teacherAlerts = useMemo(
    () =>
      computeTeacherAlerts(students, sessions, tasks, {
        notifyOverdueTasks: settings.notifyOverdueTasks ?? true,
        notifyUrgentStudents: settings.notifyUrgentStudents ?? true,
      }),
    [
      students,
      sessions,
      tasks,
      settings.notifyOverdueTasks,
      settings.notifyUrgentStudents,
    ]
  );

  // Sync to localStorage & IndexedDB on change (including teacherAlerts for sw-push.js background access)
  useEffect(() => {
    const payload = {
      students,
      sessions,
      circles,
      exams,
      ijazahs,
      tasks,
      teacherAlerts,
      settings,
      boardStrokes,
      teacherRatings,
      homeSubmissions,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota errors
    }

    // Also mirror to IndexedDB for durable Offline-First persistence & sw-push.js background notifications
    if (typeof indexedDB !== 'undefined') {
      try {
        const req = indexedDB.open('ImamAcademyDB', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('state')) {
            db.createObjectStore('state', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          if (db.objectStoreNames.contains('state')) {
            const tx = db.transaction('state', 'readwrite');
            tx.objectStore('state').put({ id: 'root', ...payload });
          }
        };
      } catch {
        // ignore IDB errors
      }
    }
  }, [
    students,
    sessions,
    circles,
    exams,
    ijazahs,
    tasks,
    teacherAlerts,
    settings,
    boardStrokes,
    teacherRatings,
    homeSubmissions,
  ]);

  // Apply Dark / Light / Sepia Mode & Font Size to HTML document
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-theme', settings.theme || 'light');
    root.setAttribute('data-font-size', settings.fontSize || 'md');
  }, [settings.theme, settings.fontSize]);

  // Global Ctrl+K shortcut for Quick Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showToast = (
    text: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'success'
  ) => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 3200);
  };

  // Register push service worker (/sw-push.js) and listen for notification click / acknowledge events from SW
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    void ensurePushServiceWorkerRegistered();

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'NOTIFICATION_CLICKED') {
        if (data.studentId) {
          setSelectedStudentId(data.studentId);
        }
        if (data.targetTab) {
          setActiveTab(data.targetTab as ActiveTab);
        }
      } else if (data.type === 'TEACHER_ALERT_ACKNOWLEDGED') {
        showToast('تم تأكيد الاطلاع على التنبيه من الإشعار الفوري ✓', 'info');
      }
    };

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, []);

  // Automatically sync upcoming session reminders AND teacherAlerts for students, parents, and teachers to sw-push.js
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    const timer = window.setTimeout(() => {
      const guardianIds =
        userRole === 'guardian' && guardianStudentId
          ? students
              .filter(
                (s) =>
                  s.id === guardianStudentId ||
                  (students.find((x) => x.id === guardianStudentId)?.whatsappPhone &&
                    s.whatsappPhone ===
                      students.find((x) => x.id === guardianStudentId)?.whatsappPhone)
              )
              .map((s) => s.id)
          : [];

      const detectedPortal = detectPortalRouteFromLocation();
      const effectivePortalRole =
        detectedPortal === 'student'
          ? 'student'
          : userRole === 'guardian' || detectedPortal === 'guardian'
          ? 'guardian'
          : 'teacher';

      void syncSessionRemindersWithServiceWorker({
        students,
        circles,
        portalRole: effectivePortalRole,
        guardianStudentIds: guardianIds,
        notificationsEnabled: settings.notificationsEnabled,
      });

      void syncTeacherAlertsWithServiceWorker({
        teacherAlerts,
        portalRole: effectivePortalRole,
        guardianStudentIds: guardianIds,
        selectedStudentId: guardianStudentId || selectedStudentId || null,
        notificationsEnabled: settings.notificationsEnabled,
        dispatchImmediately: false,
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [
    students,
    circles,
    teacherAlerts,
    userRole,
    guardianStudentId,
    selectedStudentId,
    settings.notificationsEnabled,
  ]);

  const [lateSessionAlerts, setLateSessionAlerts] = useState<LateSessionAlertRecord[]>([]);
  const [lastLateSessionCheckTime, setLastLateSessionCheckTime] = useState<string | null>(null);
  const [teacherCircleCronAlerts, setTeacherCircleCronAlerts] = useState<
    RecitationEngineStatusRecord[]
  >([]);
  const [lastTeacherCronCheckTime, setLastTeacherCronCheckTime] = useState<string | null>(
    null
  );

  const latestBgStateRef = useRef({
    students,
    circles,
    sessions,
    managedTeachers,
    activeTab,
    selectedStudentId,
    teacherName: settings.teacherName,
    activeStaffEmail,
    userRole,
    guardianStudentId,
    notificationsEnabled: settings.notificationsEnabled,
  });
  useEffect(() => {
    latestBgStateRef.current = {
      students,
      circles,
      sessions,
      managedTeachers,
      activeTab,
      selectedStudentId,
      teacherName: settings.teacherName,
      activeStaffEmail,
      userRole,
      guardianStudentId,
      notificationsEnabled: settings.notificationsEnabled,
    };
  }, [
    students,
    circles,
    sessions,
    managedTeachers,
    activeTab,
    selectedStudentId,
    settings.teacherName,
    activeStaffEmail,
    userRole,
    guardianStudentId,
    settings.notificationsEnabled,
  ]);

  // Browser Background Service: monitors Firestore schedule & attendance data for late students and sends Push Notifications
  useEffect(() => {
    const stopService = startFirestoreLateSessionBackgroundService({
      getState: () => {
        const cur = latestBgStateRef.current;
        const detectedPortal = detectPortalRouteFromLocation();
        const effectivePortalRole: 'teacher' | 'guardian' | 'student' =
          detectedPortal === 'student'
            ? 'student'
            : cur.userRole === 'guardian' || detectedPortal === 'guardian'
            ? 'guardian'
            : 'teacher';
        const guardianIds =
          cur.userRole === 'guardian' && cur.guardianStudentId
            ? cur.students
                .filter(
                  (s) =>
                    s.id === cur.guardianStudentId ||
                    (cur.students.find((x) => x.id === cur.guardianStudentId)
                      ?.whatsappPhone &&
                      s.whatsappPhone ===
                        cur.students.find((x) => x.id === cur.guardianStudentId)
                          ?.whatsappPhone)
                )
                .map((s) => s.id)
            : [];
        return {
          students: cur.students,
          circles: cur.circles,
          sessions: cur.sessions,
          teacherEmail: cur.activeStaffEmail || undefined,
          portalRole: effectivePortalRole,
          guardianStudentIds: guardianIds,
          notificationsEnabled: cur.notificationsEnabled,
        };
      },
      onAlertsUpdated: (res) => {
        setLateSessionAlerts(res.activeLateAlerts);
        setLastLateSessionCheckTime(res.checkedAt);
      },
      intervalMs: 60000,
    });
    return () => stopService();
  }, []);

  const studentCirclePushTimersRef = useRef<Record<string, number>>({});

  /**
   * Schedules or immediately sends a Push Notification to a student (and active portal)
   * if the student has not logged in (`lastLoginDate` / `lastStudentLoginAt`) OR has not had a recitation
   * recorded (`sessions` / `homeSubmissions`) by their scheduled circle time in Firestore (`ai-studio-d9f289e3-7654-4a97-9766-3b9b5c19d1c6`).
   */
  const scheduleOrSendStudentMissedCirclePushNotification = async (
    targetStudentId?: string,
    options?: { pullFromFirestore?: boolean; silentToast?: boolean }
  ): Promise<{
    scheduledCount: number;
    sentCount: number;
    alerts: LateSessionAlertRecord[];
  }> => {
    const now = new Date();
    const nowMs = now.getTime();
    const todayStr = getLocalDateString(0);
    const currentDay = now.getDay();

    let effectiveStudents = latestBgStateRef.current.students;
    let effectiveCircles = latestBgStateRef.current.circles;
    let effectiveSessions = latestBgStateRef.current.sessions;

    // 1. Pull latest schedule, login timestamps, and session records from Firestore
    if (options?.pullFromFirestore !== false) {
      try {
        const cloudSnap = await fetchAcademyCloudBackupFromFirestore(
          latestBgStateRef.current.activeStaffEmail ||
            googleAuthUser?.email ||
            SUPABASE_OFFICIAL_CONFIG.ownerEmail
        );
        if (cloudSnap.payload) {
          if (
            Array.isArray(cloudSnap.payload.students) &&
            cloudSnap.payload.students.length > 0
          ) {
            const cloudStudents = (cloudSnap.payload.students as Student[]).filter(
              (st) => !DEFAULT_SEED_STUDENT_IDS.has(st.id)
            );
            const mergedMap = new Map<string, Student>();
            effectiveStudents
              .filter((st) => !DEFAULT_SEED_STUDENT_IDS.has(st.id))
              .forEach((st) => mergedMap.set(st.id, st));
            cloudStudents.forEach((st) => {
              const localSt = mergedMap.get(st.id);
              mergedMap.set(st.id, {
                ...(localSt || {}),
                ...st,
                lastLoginDate:
                  st.lastLoginDate || localSt?.lastLoginDate || undefined,
                lastStudentLoginAt:
                  st.lastStudentLoginAt ||
                  localSt?.lastStudentLoginAt ||
                  undefined,
              });
            });
            effectiveStudents = Array.from(mergedMap.values());
          }
          if (
            Array.isArray(cloudSnap.payload.circles) &&
            cloudSnap.payload.circles.length > 0
          ) {
            effectiveCircles = (cloudSnap.payload.circles as CircleGroup[]).filter(
              (c) => !DEFAULT_SEED_CIRCLE_IDS.has(c.id)
            );
          }
          if (Array.isArray(cloudSnap.payload.sessions)) {
            const cloudSessions = (cloudSnap.payload.sessions as SessionRecord[]).filter(
              (s) =>
                !DEFAULT_SEED_SESSION_IDS.has(s.id) &&
                !DEFAULT_SEED_STUDENT_IDS.has(s.studentId)
            );
            const sesMap = new Map<string, SessionRecord>();
            effectiveSessions
              .filter(
                (s) =>
                  !DEFAULT_SEED_SESSION_IDS.has(s.id) &&
                  !DEFAULT_SEED_STUDENT_IDS.has(s.studentId)
              )
              .forEach((s) => sesMap.set(`${s.studentId}_${s.date}`, s));
            cloudSessions.forEach((s) =>
              sesMap.set(`${s.studentId}_${s.date}`, s)
            );
            effectiveSessions = Array.from(sesMap.values());
          }
        }
      } catch {
        // Fallback to local state if offline
      }
    }

    const detectedPortal = detectPortalRouteFromLocation();
    const effectivePortalRole: 'teacher' | 'guardian' | 'student' =
      detectedPortal === 'student'
        ? 'student'
        : latestBgStateRef.current.userRole === 'guardian' ||
          detectedPortal === 'guardian'
        ? 'guardian'
        : 'teacher';

    // Sync Service Worker background schedule for all active students
    void syncSessionRemindersWithServiceWorker({
      students: effectiveStudents,
      circles: effectiveCircles,
      portalRole: effectivePortalRole,
      guardianStudentIds: targetStudentId ? [targetStudentId] : [],
      notificationsEnabled: latestBgStateRef.current.notificationsEnabled,
    });

    const candidates = effectiveStudents.filter((st) => {
      if (!st || st.accountStatus === 'مؤرشف' || st.accountStatus === 'متوقف') {
        return false;
      }
      if (targetStudentId && st.id !== targetStudentId) {
        return false;
      }
      return true;
    });

    let scheduledCount = 0;
    let sentCount = 0;
    const alerts: LateSessionAlertRecord[] = [];

    for (const st of candidates) {
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
      const scheduledMs = scheduledDateObj.getTime();
      const diffMinutes = Math.floor((nowMs - scheduledMs) / 60000);

      // Check 1: Did the student log in today?
      const isCurrentlyLoggedInAsThisStudent =
        isLoggedIn &&
        (userRole === 'guardian' || userRole === 'student') &&
        (guardianStudentId === st.id || selectedStudentId === st.id);
      const hasLoggedInToday =
        isCurrentlyLoggedInAsThisStudent ||
        st.lastLoginDate === todayStr ||
        Boolean(st.lastStudentLoginAt && st.lastStudentLoginAt.startsWith(todayStr));

      // Check 2: Has a recitation been recorded for the student today (in sessions or homeSubmissions)?
      const hasRecordedSessionToday = effectiveSessions.some(
        (ses) =>
          ses.studentId === st.id &&
          ses.date === todayStr &&
          (ses.status === 'حضر' || ses.status === 'غاب' || ses.status === 'إجازة')
      );
      const hasHomeRecitationToday = homeSubmissions.some(
        (sub) => sub.studentId === st.id && sub.date === todayStr
      );
      const hasRecitationToday = hasRecordedSessionToday || hasHomeRecitationToday;

      const cleanStudentId = st.id.replace(/[^a-zA-Z0-9_-]/g, '');
      const alertId = `late_${todayStr}_${cleanStudentId}`;

      // Clear any previous scheduled timer for this student before re-evaluating
      if (studentCirclePushTimersRef.current[st.id]) {
        window.clearTimeout(studentCirclePushTimersRef.current[st.id]);
        delete studentCirclePushTimersRef.current[st.id];
      }

      // If recitation is recorded today, resolve any active Firestore alert
      if (hasRecitationToday) {
        void syncLateSessionAlertToFirestore({
          id: alertId,
          studentId: st.id,
          studentName: st.name,
          circleName: st.circle || circleObj?.name || 'الحلقة القرآنية',
          scheduledTime: rawTime,
          date: todayStr,
          minutesLate: Math.max(0, diffMinutes),
          stage: diffMinutes >= 15 ? 'late_15m' : 'late_5m',
          status: 'resolved',
          surahName: st.currentStop?.surahName || st.currentSurah || 'الورد المقرر',
          ayahNumber: st.currentStop?.ayah || st.currentAyah || 1,
          notifiedAt: now.toISOString(),
        }).catch(() => {});
        continue;
      }

      // Case A: Scheduled circle time is in the future today -> Schedule exact timer at circle time
      if (scheduledMs > nowMs) {
        const delayMs = Math.min(scheduledMs - nowMs + 1000, 8 * 60 * 60 * 1000);
        studentCirclePushTimersRef.current[st.id] = window.setTimeout(() => {
          void scheduleOrSendStudentMissedCirclePushNotification(st.id, {
            pullFromFirestore: true,
            silentToast: true,
          });
        }, delayMs);
        scheduledCount += 1;
        continue;
      }

      // Case B: Scheduled circle time has arrived or passed (0..180 mins) AND student hasn't logged in OR hasn't recorded recitation
      if (diffMinutes >= 0 && diffMinutes <= 180 && (!hasLoggedInToday || !hasRecitationToday)) {
        const stage: 'late_5m' | 'late_15m' =
          diffMinutes >= 15 ? 'late_15m' : 'late_5m';
        const surahName =
          st.currentStop?.surahName || st.currentSurah || 'الورد المقرر';
        const ayahNumber = st.currentStop?.ayah || st.currentAyah || 1;
        const circleTitle = st.circle || circleObj?.name || 'الحلقة القرآنية';

        const alertRecord: LateSessionAlertRecord = {
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
          missingRecitation: !hasRecitationToday,
          notifiedAt: now.toISOString(),
        };

        alerts.push(alertRecord);
        void syncLateSessionAlertToFirestore(alertRecord).catch(() => {});

        const missingReasonText =
          !hasLoggedInToday && !hasRecitationToday
            ? 'لم يقم بتسجيل الدخول ولم يتم تسجيل تسميع له'
            : !hasLoggedInToday
            ? 'لم يقم بتسجيل الدخول لحلقته'
            : 'لم يتم تسجيل تسميع له';

        const title =
          effectivePortalRole === 'student' || effectivePortalRole === 'guardian'
            ? `⏰ تنبيه موعد الحلقة (${rawTime}) — ${st.name}`
            : `⏳ تنبيه تأخر طالب عن الحلقة (${rawTime}) — ${st.name}`;
        const body = `حلول موعد حلقة (${circleTitle}) الساعة ${rawTime}: الطالب (${st.name}) ${missingReasonText} في Firestore • الورد المقرر: سورة ${surahName} (آية ${ayahNumber}).`;

        if (latestBgStateRef.current.notificationsEnabled !== false) {
          const dispatched = await sendLocalPushNotification({
            title,
            body,
            tag: `imam-student-missed-circle-${st.id}-${stage}`,
            targetTab: 'session',
            studentId: st.id,
            portalRoute: effectivePortalRole,
            notificationsEnabled: latestBgStateRef.current.notificationsEnabled,
            onClick: () => {
              setSelectedStudentId(st.id);
              setActiveTab('session');
            },
          });

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
                  tag: `imam-student-missed-circle-${st.id}-${stage}`,
                  targetTab: 'session',
                  studentId: st.id,
                  studentName: st.name,
                  circleName: circleTitle,
                  meetingUrl: alertRecord.meetingUrl || null,
                  portalRoute: effectivePortalRole,
                  reminderType: stage,
                  alertId: alertRecord.id,
                  alertCategory: 'late_session',
                },
              });
            }
          } catch {
            // ignore SW postMessage error
          }

          if (dispatched) {
            sentCount += 1;
          }
        }

        // If currently in the < 15m window, schedule a follow-up check at the +15m mark
        if (diffMinutes < 15) {
          const msUntil15m = Math.max(
            60000,
            (15 - diffMinutes) * 60 * 1000
          );
          studentCirclePushTimersRef.current[st.id] = window.setTimeout(() => {
            void scheduleOrSendStudentMissedCirclePushNotification(st.id, {
              pullFromFirestore: true,
              silentToast: true,
            });
          }, msUntil15m);
          scheduledCount += 1;
        }
      }
    }

    const checkedAt = now.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (!targetStudentId) {
      setLateSessionAlerts(alerts);
    } else if (alerts.length > 0) {
      setLateSessionAlerts((prev) => {
        const filtered = prev.filter((a) => a.studentId !== targetStudentId);
        return [...alerts, ...filtered];
      });
    }
    setLastLateSessionCheckTime(checkedAt);

    if (!options?.silentToast) {
      if (alerts.length > 0) {
        showToast(
          `🔔 تم رصد ${alerts.length} طلاب لم يسجلوا دخولاً أو تسميعاً بحلول موعد حلقتهم في Firestore وإرسال إشعار Push فوري`,
          'warning'
        );
      } else if (scheduledCount > 0) {
        showToast(
          `⏰ تمت جدولة إشعارات الدفع (Push) لـ ${scheduledCount} طلاب عند حلول موعد حلقتهم المجدول في Firestore`,
          'info'
        );
      } else {
        showToast(
          `✅ تم فحص مواعيد الحلقات في Firestore (${checkedAt}): جميع طلاب اليوم سجلوا دخولهم وتسميعهم بانتظام`,
          'success'
        );
      }
    }

    return { scheduledCount, sentCount, alerts };
  };

  // Automatically schedule/evaluate student missed-circle Push notifications when schedule or session data changes
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void scheduleOrSendStudentMissedCirclePushNotification(undefined, {
        pullFromFirestore: false,
        silentToast: true,
      });
    }, 1800);
    return () => {
      window.clearTimeout(timer);
    };
  }, [students, circles, sessions, homeSubmissions, isLoggedIn, guardianStudentId]);

  useEffect(() => {
    return () => {
      Object.values(studentCirclePushTimersRef.current).forEach((timerId) =>
        window.clearTimeout(timerId)
      );
    };
  }, []);

  const triggerFirestoreLateCheckNow = async () => {
    await scheduleOrSendStudentMissedCirclePushNotification(undefined, {
      pullFromFirestore: true,
      silentToast: false,
    });
    await runTeacherCircleStartCronCheck({
      pullFromFirestore: true,
      silentToast: true,
    });
  };

  const teacherCircleCronTimersRef = useRef<Record<string, number>>({});
  const teacherCircleNotifiedStagesRef = useRef<Record<string, string>>({});

  /**
   * Marks the "Recitation Engine" ('محرك التسميع') as started or completed for a circle in Firestore
   * (`/recitation_engine_status/{engineStatusId}`) and updates `CircleGroup.lastRecitationEngineStartedDate`.
   */
  const markRecitationEngineStartedInFirestore = async (
    circleNameOrId?: string,
    studentId?: string,
    state: 'started' | 'completed' = 'started'
  ): Promise<void> => {
    const todayStr = getLocalDateString(0);
    const nowIso = new Date().toISOString();
    const cur = latestBgStateRef.current;

    const targetStudent = studentId
      ? cur.students.find((s) => s.id === studentId)
      : cur.selectedStudentId
      ? cur.students.find((s) => s.id === cur.selectedStudentId)
      : undefined;

    const resolvedCircle =
      cur.circles.find(
        (c) =>
          (circleNameOrId && (c.id === circleNameOrId || c.name === circleNameOrId)) ||
          (targetStudent &&
            (c.name === targetStudent.circle || c.id === targetStudent.circleId))
      ) || cur.circles[0];

    if (!resolvedCircle) return;

    setCircles((prev) =>
      prev.map((c) =>
        c.id === resolvedCircle.id
          ? {
              ...c,
              lastRecitationEngineStartedDate: todayStr,
              lastRecitationEngineStartedAt: nowIso,
            }
          : c
      )
    );

    const cleanCircleId = (resolvedCircle.id || resolvedCircle.name).replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );
    const circleStudentsCount = cur.students.filter(
      (s) =>
        (s.accountStatus ?? 'نشط') === 'نشط' &&
        (s.circle === resolvedCircle.name || s.circleId === resolvedCircle.id)
    ).length;

    const record: RecitationEngineStatusRecord = {
      id: `engine_${todayStr}_${cleanCircleId}`,
      circleId: resolvedCircle.id,
      circleName: resolvedCircle.name,
      teacherName:
        resolvedCircle.substituteTeacherName ||
        resolvedCircle.teacherName ||
        cur.teacherName ||
        'معلم الحلقة',
      teacherEmail: cur.activeStaffEmail || SUPABASE_OFFICIAL_CONFIG.ownerEmail,
      scheduledTime: resolvedCircle.scheduleTime || '16:00',
      date: todayStr,
      engineState: state,
      activeStudentId: targetStudent?.id || cur.selectedStudentId || undefined,
      minutesSinceStart: 0,
      studentsCount: circleStudentsCount,
      notifiedAt: nowIso,
    };

    setTeacherCircleCronAlerts((prev) =>
      prev.filter(
        (item) =>
          item.circleId !== resolvedCircle.id && item.circleName !== resolvedCircle.name
      )
    );

    await syncRecitationEngineStatusToFirestore(record).catch(() => {});
  };

  // Automatically mark 'محرك التسميع' as started in Firestore whenever a teacher opens the 'session' tab
  useEffect(() => {
    if (isLoggedIn && userRole === 'teacher' && activeTab === 'session') {
      void markRecitationEngineStartedInFirestore(
        undefined,
        selectedStudentId || undefined,
        'started'
      );
    }
  }, [isLoggedIn, userRole, activeTab, selectedStudentId]);

  /**
   * Cron-like Automated Time Scheduler for Teachers (`المحفظين`):
   * Evaluates all scheduled circles in Firestore at the start of their circle time (`0..90` mins window)
   * and schedules exact timers for upcoming circles today. If 'محرك التسميع' (`Recitation Engine`)
   * has not been started in Firestore (`/recitation_engine_status` or `sessions`), dispatches a
   * Push Notification to the teacher (and Service Worker `sw-push.js`).
   */
  const runTeacherCircleStartCronCheck = async (options?: {
    pullFromFirestore?: boolean;
    silentToast?: boolean;
  }): Promise<{
    dueCirclesCount: number;
    notifiedTeachersCount: number;
    pendingCircles: RecitationEngineStatusRecord[];
  }> => {
    const now = new Date();
    const nowMs = now.getTime();
    const todayStr = getLocalDateString(0);
    const currentDay = now.getDay();
    const cur = latestBgStateRef.current;

    let effectiveCircles = cur.circles;
    let effectiveStudents = cur.students;
    let effectiveSessions = cur.sessions;

    // 1. Fetch latest Firestore recitation_engine_status records + cloud snapshot
    const firestoreEngineStatuses = await fetchRecitationEngineStatusesFromFirestore(
      todayStr
    ).catch(() => [] as RecitationEngineStatusRecord[]);
    const engineStatusByCircle = new Map<string, RecitationEngineStatusRecord>();
    firestoreEngineStatuses.forEach((rec) => {
      engineStatusByCircle.set(rec.circleId, rec);
      engineStatusByCircle.set(rec.circleName, rec);
    });

    if (options?.pullFromFirestore !== false) {
      try {
        const cloudSnap = await fetchAcademyCloudBackupFromFirestore(
          cur.activeStaffEmail ||
            googleAuthUser?.email ||
            SUPABASE_OFFICIAL_CONFIG.ownerEmail
        );
        if (cloudSnap.payload) {
          if (
            Array.isArray(cloudSnap.payload.circles) &&
            cloudSnap.payload.circles.length > 0
          ) {
            const cloudCircles = cloudSnap.payload.circles as CircleGroup[];
            const cirMap = new Map<string, CircleGroup>();
            effectiveCircles.forEach((c) => cirMap.set(c.id, c));
            cloudCircles.forEach((c) => {
              const localCir = cirMap.get(c.id);
              cirMap.set(c.id, {
                ...(localCir || {}),
                ...c,
                lastRecitationEngineStartedDate:
                  c.lastRecitationEngineStartedDate ||
                  localCir?.lastRecitationEngineStartedDate,
                lastRecitationEngineStartedAt:
                  c.lastRecitationEngineStartedAt ||
                  localCir?.lastRecitationEngineStartedAt,
              });
            });
            effectiveCircles = Array.from(cirMap.values());
          }
          if (Array.isArray(cloudSnap.payload.sessions)) {
            const cloudSessions = cloudSnap.payload.sessions as SessionRecord[];
            const sesMap = new Map<string, SessionRecord>();
            effectiveSessions.forEach((s) =>
              sesMap.set(`${s.studentId}_${s.date}`, s)
            );
            cloudSessions.forEach((s) =>
              sesMap.set(`${s.studentId}_${s.date}`, s)
            );
            effectiveSessions = Array.from(sesMap.values());
          }
        }
      } catch {
        // Offline fallback to local state
      }
    }

    let dueCirclesCount = 0;
    let notifiedTeachersCount = 0;
    const pendingCircles: RecitationEngineStatusRecord[] = [];

    for (const circle of effectiveCircles) {
      const circleStudents = effectiveStudents.filter(
        (st) =>
          (st.accountStatus ?? 'نشط') === 'نشط' &&
          (st.circle === circle.name || st.circleId === circle.id)
      );

      // Determine schedule days & time from the circle or its active students
      const scheduleDays =
        Array.isArray(circle.scheduleDays) && circle.scheduleDays.length > 0
          ? circle.scheduleDays
          : Array.from(
              new Set(
                circleStudents.flatMap((st) =>
                  Array.isArray(st.scheduleDays) ? st.scheduleDays : []
                )
              )
            );

      if (!scheduleDays.includes(currentDay)) {
        continue;
      }

      const rawTime =
        circle.scheduleTime ||
        circleStudents.find((st) => Boolean(st.scheduleTime))?.scheduleTime ||
        '';
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
      const scheduledMs = scheduledDateObj.getTime();
      const diffMinutes = Math.floor((nowMs - scheduledMs) / 60000);

      // Clear any previous exact circle-start timer before setting a new one
      if (teacherCircleCronTimersRef.current[circle.id]) {
        window.clearTimeout(teacherCircleCronTimersRef.current[circle.id]);
        delete teacherCircleCronTimersRef.current[circle.id];
      }

      // If the circle starts later today, schedule an exact Cron-like wake-up timer right at the circle start time (+0m)
      if (scheduledMs > nowMs) {
        const delayMs = Math.min(scheduledMs - nowMs + 750, 8 * 60 * 60 * 1000);
        teacherCircleCronTimersRef.current[circle.id] = window.setTimeout(() => {
          void runTeacherCircleStartCronCheck({
            pullFromFirestore: true,
            silentToast: true,
          });
        }, delayMs);
        continue;
      }

      // Check if we are within the circle start window (0 to 90 minutes from scheduled start time)
      if (diffMinutes < 0 || diffMinutes > 90) {
        continue;
      }

      dueCirclesCount += 1;

      // Resolve teacher assigned to this circle
      const assignedTeacherRecord = cur.managedTeachers.find(
        (t) =>
          (t.assignedCircleNames && t.assignedCircleNames.includes(circle.name)) ||
          t.name === circle.teacherName
      );
      const teacherName =
        circle.substituteTeacherName ||
        circle.teacherName ||
        assignedTeacherRecord?.name ||
        cur.teacherName ||
        'الشيخ المحفظ';
      const teacherEmail =
        assignedTeacherRecord?.email ||
        cur.activeStaffEmail ||
        SUPABASE_OFFICIAL_CONFIG.ownerEmail;

      // Check if 'محرك التسميع' has been started in Firestore for this circle today:
      // 1) Explicit status in Firestore `/recitation_engine_status`
      const fsEngineRecord =
        engineStatusByCircle.get(circle.id) ||
        engineStatusByCircle.get(circle.name);
      const startedInFirestoreCollection =
        fsEngineRecord &&
        fsEngineRecord.date === todayStr &&
        (fsEngineRecord.engineState === 'started' ||
          fsEngineRecord.engineState === 'completed');

      // 2) Circle metadata `lastRecitationEngineStartedDate === todayStr`
      const startedInCircleSnapshot =
        circle.lastRecitationEngineStartedDate === todayStr;

      // 3) Any session recorded today for a student in this circle
      const hasSessionRecordedForCircleToday = effectiveSessions.some(
        (ses) =>
          ses.date === todayStr &&
          circleStudents.some((st) => st.id === ses.studentId)
      );

      // 4) Teacher is currently inside `activeTab === 'session'` with a student of this circle
      const currentlyInSessionTabForCircle =
        cur.activeTab === 'session' &&
        circleStudents.some((st) => st.id === cur.selectedStudentId);

      const isEngineStarted = Boolean(
        startedInFirestoreCollection ||
          startedInCircleSnapshot ||
          hasSessionRecordedForCircleToday ||
          currentlyInSessionTabForCircle
      );

      const cleanCircleId = (circle.id || circle.name).replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
      );
      const statusDocId = `engine_${todayStr}_${cleanCircleId}`;

      if (isEngineStarted) {
        if (!startedInFirestoreCollection) {
          void syncRecitationEngineStatusToFirestore({
            id: statusDocId,
            circleId: circle.id,
            circleName: circle.name,
            teacherName,
            teacherEmail,
            scheduledTime: rawTime,
            date: todayStr,
            engineState: hasSessionRecordedForCircleToday ? 'completed' : 'started',
            minutesSinceStart: Math.max(0, diffMinutes),
            studentsCount: circleStudents.length,
            notifiedAt: now.toISOString(),
          }).catch(() => {});
        }
        continue;
      }

      // 'محرك التسميع' has NOT been started in Firestore at the start of the circle!
      const notStartedRecord: RecitationEngineStatusRecord = {
        id: statusDocId,
        circleId: circle.id,
        circleName: circle.name,
        teacherName,
        teacherEmail,
        scheduledTime: rawTime,
        date: todayStr,
        engineState: 'not_started',
        minutesSinceStart: Math.max(0, diffMinutes),
        studentsCount: circleStudents.length,
        notifiedAt: now.toISOString(),
      };

      pendingCircles.push(notStartedRecord);
      void syncRecitationEngineStatusToFirestore(notStartedRecord).catch(() => {});

      // Determine cron notification stage ('start_0m' | 'remind_5m' | 'urgent_15m') so we don't spam every single minute
      const cronStage =
        diffMinutes >= 15
          ? 'urgent_15m'
          : diffMinutes >= 5
          ? 'remind_5m'
          : 'start_0m';
      const stageDedupKey = `${todayStr}_${circle.id}`;
      const previousNotifiedStage =
        teacherCircleNotifiedStagesRef.current[stageDedupKey];

      const shouldDispatchPush =
        !options?.silentToast || previousNotifiedStage !== cronStage;

      if (shouldDispatchPush && cur.notificationsEnabled !== false) {
        teacherCircleNotifiedStagesRef.current[stageDedupKey] = cronStage;
        const firstCircleStudent = circleStudents[0];
        const title =
          diffMinutes <= 2
            ? `🔔 حان موعد بدء (${circle.name}) — افتح محرك التسميع`
            : `⏰ تنبيه للمحفظ (${teacherName}): لم يبدأ محرك التسميع لحلقة (${circle.name})`;
        const body = `بدأ وقت (${circle.name}) المجدول الساعة ${rawTime} منذ ${Math.max(
          1,
          diffMinutes
        )} د ولم يتم رصد بدء "محرك التسميع" في Firestore (${
          circleStudents.length
        } طلاب بانتظار التسميع). اضغط لفتح محرك التسميع فوراً.`;

        const dispatched = await sendLocalPushNotification({
          title,
          body,
          tag: `imam-teacher-engine-cron-${circle.id}-${cronStage}`,
          targetTab: 'session',
          studentId: firstCircleStudent?.id || null,
          portalRoute: 'teacher',
          notificationsEnabled: cur.notificationsEnabled,
          onClick: () => {
            if (firstCircleStudent?.id) {
              setSelectedStudentId(firstCircleStudent.id);
            }
            setActiveTab('session');
            void markRecitationEngineStartedInFirestore(
              circle.id,
              firstCircleStudent?.id,
              'started'
            );
          },
        });

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
                tag: `imam-teacher-engine-cron-${circle.id}-${cronStage}`,
                targetTab: 'session',
                studentId: firstCircleStudent?.id || null,
                studentName: firstCircleStudent?.name || circle.name,
                circleName: circle.name,
                meetingUrl: circle.permanentMeetingUrl || null,
                portalRoute: 'teacher',
                reminderType: 'now',
                alertId: statusDocId,
                alertCategory: 'late_session',
              },
            });
          }
        } catch {
          // ignore SW postMessage error
        }

        if (dispatched) {
          notifiedTeachersCount += 1;
        }
      }

      // Schedule next escalation check (+5m or +15m) if not yet reached
      const nextEscalationMinute =
        diffMinutes < 5 ? 5 : diffMinutes < 15 ? 15 : null;
      if (nextEscalationMinute !== null) {
        const msUntilNextStage = Math.max(
          45000,
          (nextEscalationMinute - diffMinutes) * 60 * 1000
        );
        teacherCircleCronTimersRef.current[circle.id] = window.setTimeout(() => {
          void runTeacherCircleStartCronCheck({
            pullFromFirestore: true,
            silentToast: true,
          });
        }, msUntilNextStage);
      }
    }

    const checkedAt = now.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setTeacherCircleCronAlerts(pendingCircles);
    setLastTeacherCronCheckTime(checkedAt);

    if (!options?.silentToast) {
      if (pendingCircles.length > 0) {
        showToast(
          `🔔 جدولة المحفظين (Cron): تم إرسال تنبيه Push لـ ${pendingCircles.length} حلقات حان موعدها ولم يبدأ فيها "محرك التسميع" في Firestore`,
          'warning'
        );
      } else {
        showToast(
          `✅ جدولة المحفظين (Cron ${checkedAt}): جميع الحلقات المجدولة حالياً تم بدء "محرك التسميع" لها في Firestore`,
          'success'
        );
      }
    }

    return {
      dueCirclesCount,
      notifiedTeachersCount,
      pendingCircles,
    };
  };

  // Automated Cron-like Time Scheduler Effect (ticks at every minute boundary `:00` + re-Arms when circles/sessions update)
  useEffect(() => {
    let cronIntervalId: number | null = null;
    const initialCheckTimer = window.setTimeout(() => {
      void runTeacherCircleStartCronCheck({
        pullFromFirestore: true,
        silentToast: true,
      });
    }, 2400);

    // Align Cron ticker to exact top-of-the-minute boundary (00 seconds)
    const now = new Date();
    const msUntilNextMinute = Math.max(
      1000,
      (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
    );
    const alignTimerId = window.setTimeout(() => {
      void runTeacherCircleStartCronCheck({
        pullFromFirestore: true,
        silentToast: true,
      });
      cronIntervalId = window.setInterval(() => {
        void runTeacherCircleStartCronCheck({
          pullFromFirestore: true,
          silentToast: true,
        });
      }, 60 * 1000);
    }, msUntilNextMinute);

    return () => {
      window.clearTimeout(initialCheckTimer);
      window.clearTimeout(alignTimerId);
      if (cronIntervalId !== null) {
        window.clearInterval(cronIntervalId);
      }
      Object.values(teacherCircleCronTimersRef.current).forEach((timerId) =>
        window.clearTimeout(timerId)
      );
    };
  }, [circles, sessions]);

  const triggerPushReminderNow = async () => {
    if (!settings.notificationsEnabled) {
      showToast('التنبيهات المحلية متوقفة حالياً من الإعدادات', 'info');
      return;
    }

    const lateCount = teacherAlerts.filter(
      (a) => a.category === 'late_session'
    ).length;
    const overdueCount = teacherAlerts.filter(
      (a) => a.category === 'overdue_task'
    ).length;
    const urgentStudentCount = teacherAlerts.filter(
      (a) => a.category === 'urgent_student'
    ).length;

    if (lateCount === 0 && overdueCount === 0 && urgentStudentCount === 0) {
      await sendLocalPushNotification({
        title: 'أكاديمية الإمام لتحفيظ القرآن الكريم',
        body: 'جميع الحلقات والمهام والمتابعات منتظمة بحمد الله! لا توجد حالات تأخر أو مهام متأخرة حالياً.',
        tag: 'imam-academy-all-clear',
        targetTab: 'dashboard',
        notificationsEnabled: settings.notificationsEnabled,
      });
      showToast('جميع المهام والمتابعات مكتملة ولا توجد تنبيهات متأخرة', 'success');
      return;
    }

    const parts: string[] = [];
    if (lateCount > 0) {
      parts.push(`${lateCount} طلاب متأخرين عن موعد الحلقة`);
    }
    if (overdueCount > 0) {
      parts.push(`${overdueCount} مهام متأخرة أو مستحقة اليوم`);
    }
    if (urgentStudentCount > 0) {
      parts.push(`${urgentStudentCount} طلاب يحتاجون متابعة عاجلة`);
    }

    const topItem = teacherAlerts[0];
    const targetTab: ActiveTab =
      topItem?.category === 'late_session'
        ? 'session'
        : topItem?.category === 'overdue_task'
        ? 'tasks'
        : 'struggling';
    const title = `تنبيه المتابعة — ${parts.join(' و ')}`;
    const body = topItem
      ? `${topItem.title}\n${topItem.body}`
      : 'يرجى مراجعة قسم المهام والطلاب المتعثرين.';

    // 1) Sync and dispatch through sw-push.js for interactive OS push notification
    const detectedPortal = detectPortalRouteFromLocation();
    const effectivePortalRole: 'teacher' | 'guardian' | 'student' =
      detectedPortal === 'student'
        ? 'student'
        : userRole === 'guardian' || detectedPortal === 'guardian'
        ? 'guardian'
        : 'teacher';

    let sentViaSW = false;
    if (topItem) {
      sentViaSW = await dispatchTeacherAlertPushViaSW(
        {
          ...topItem,
          title,
          body,
        },
        effectivePortalRole
      );
    }

    const sentBrowserNotif = sentViaSW
      ? true
      : await sendLocalPushNotification({
          title,
          body,
          tag: 'imam-academy-reminder',
          targetTab,
          studentId: topItem?.studentId || null,
          notificationsEnabled: settings.notificationsEnabled,
          onClick: () => {
            if (topItem?.studentId) {
              setSelectedStudentId(topItem.studentId);
            }
            setActiveTab(targetTab);
          },
        });

    if (sentBrowserNotif) {
      showToast(`تم إرسال إشعار المتصفح الفوري (sw-push): ${parts.join(' + ')}`, 'info');
    } else {
      showToast(`تنبيه محلي: لديك ${parts.join(' و ')}`, 'info');
    }
  };

  // Automatic local push notification on teacher login and periodic interval
  const hasNotifiedOnSessionRef = useRef(false);
  useEffect(() => {
    if (!isLoggedIn || userRole !== 'teacher' || !settings.notificationsEnabled) {
      return;
    }

    if (!hasNotifiedOnSessionRef.current && teacherAlerts.length > 0) {
      hasNotifiedOnSessionRef.current = true;
      const timer = setTimeout(() => {
        void triggerPushReminderNow();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoggedIn, userRole, settings.notificationsEnabled, teacherAlerts.length]);

  useEffect(() => {
    if (!isLoggedIn || userRole !== 'teacher' || !settings.notificationsEnabled) {
      return;
    }
    const intervalMs = Math.max(5, settings.reminderIntervalMinutes || 30) * 60 * 1000;
    const id = setInterval(() => {
      if (teacherAlerts.length > 0) {
        void triggerPushReminderNow();
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [
    isLoggedIn,
    userRole,
    settings.notificationsEnabled,
    settings.reminderIntervalMinutes,
    teacherAlerts.length,
  ]);

  const loginAsTeacher = () => {
    hasNotifiedOnSessionRef.current = false;
    setUserRole('teacher');
    setIsLoggedIn(true);
    setActiveTab('dashboard');
    try {
      localStorage.setItem(
        SUPABASE_OFFICIAL_CONFIG.trustStorageKey,
        JSON.stringify({
          role: 'teacher',
          email: SUPABASE_OFFICIAL_CONFIG.ownerEmail,
          trustedAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore storage errors
    }
    showToast('مرحباً بك في منصة المعلم والمشرف — أكاديمية الإمام', 'success');
  };

  const isOwnerEmail = (email: string) => {
    return isMasterOwnerEmail(email);
  };

  const submitNewStaffJoinRequest = (input: {
    fullName?: string;
    name?: string;
    email: string;
    whatsappPhone: string;
    specialization: string;
    requestedPosition:
      | 'محفظ حلقة'
      | 'مشرف تعليمي'
      | 'مسؤول مالي / إداري'
      | 'teacher'
      | 'supervisor';
    provider?: StaffAuthProvider;
    authProvider?: StaffAuthProvider;
    uid?: string;
    photoURL?: string | null;
  }): TeacherAccessRecord => {
    const cleanEmail = input.email.trim().toLowerCase();
    const isOwner = isOwnerEmail(cleanEmail);
    const resolvedFullName = (input.fullName || input.name || '').trim();
    const resolvedProvider: StaffAuthProvider =
      input.provider || input.authProvider || 'google';
    const normalizedPosition:
      | 'محفظ حلقة'
      | 'مشرف تعليمي'
      | 'مسؤول مالي / إداري' =
      input.requestedPosition === 'supervisor' ||
      input.requestedPosition === 'مشرف تعليمي'
        ? 'مشرف تعليمي'
        : input.requestedPosition === 'مسؤول مالي / إداري'
        ? 'مسؤول مالي / إداري'
        : 'محفظ حلقة';

    const desiredRole: StaffHierarchyRole = isOwner
      ? 'owner'
      : normalizedPosition === 'مشرف تعليمي'
      ? 'supervisor'
      : normalizedPosition === 'مسؤول مالي / إداري'
      ? 'financial_manager'
      : 'teacher';

    const existing = managedTeachers.find(
      (t) => t.email.toLowerCase() === cleanEmail
    );

    const recordId =
      existing?.id ||
      `${desiredRole === 'supervisor' ? 'sup' : 'tch'}-${Date.now()}`;

    const newRecord: TeacherAccessRecord = {
      id: recordId,
      name: resolvedFullName || cleanEmail.split('@')[0],
      email: cleanEmail,
      roleTitle: isOwner
        ? '👑 مالك الأكاديمية (Super Admin / Owner)'
        : `${normalizedPosition} — ${
            input.specialization.trim() || 'حلقات القرآن الكريم'
          }`,
      staffRole: desiredRole,
      status: isOwner ? 'active' : 'pending',
      authProvider: resolvedProvider,
      whatsappPhone: input.whatsappPhone.trim(),
      specialization: input.specialization.trim(),
      requestedPosition: normalizedPosition,
      requestedAt: getLocalDateString(0),
      lastSyncAt: getLocalDateString(0),
      assignedCirclesCount: 1,
      googleUid: input.uid || auth.currentUser?.uid,
      photoURL: input.photoURL || null,
    };

    setManagedTeachers((prev) => {
      const filtered = prev.filter(
        (t) => t.email.toLowerCase() !== cleanEmail
      );
      return [newRecord, ...filtered];
    });

    void syncStaffRegistrationToFirestore(newRecord).catch(() => {
      // non-blocking
    });

    recordAuditLog(
      'صلاحيات وأمان',
      `طلب انضمام جديد (${input.requestedPosition}) عبر ${
        input.provider === 'microsoft' ? 'Microsoft' : 'Google'
      } من (${newRecord.name} — ${cleanEmail}) بانتظار موافقة المالك`,
      newRecord.name
    );

    showToast(
      'تم تسجيل طلب انضمامك بنجاح وحفظه في السحابة بانتظار تفعيل المالك ✓',
      'success'
    );

    return newRecord;
  };

  const loginWithGoogleEmail = (
    email: string,
    pin?: string,
    provider: StaffAuthProvider = 'google'
  ): {
    ok: boolean;
    error?: string;
    requiresOnboardingCard?: boolean;
    requiresPendingScreen?: boolean;
    staffRecord?: TeacherAccessRecord;
  } => {
    const cleanEmail = email.trim().toLowerCase();
    const expectedPin = (settings.teacherPin || '1234').trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return {
        ok: false,
        error: 'يرجى إدخال البريد الإلكتروني الخاص بحساب Google أو Microsoft للمحفظ أو المشرف.',
      };
    }

    // Master Owner Emails (sayedkomy1@gmail.com / sayedkomy2@gmail.com) get instant Super Admin access
    if (isOwnerEmail(cleanEmail)) {
      if (pin !== undefined && pin.trim() !== '' && pin.trim() !== expectedPin) {
        return { ok: false, error: 'رمز مرور المالك / المشرف (PIN) غير صحيح.' };
      }
      setCurrentStaffTier('owner');
      setActiveStaffEmail(cleanEmail);
      hasNotifiedOnSessionRef.current = false;
      setUserRole('teacher');
      setIsLoggedIn(true);
      setActiveTab('owner_panel');
      try {
        localStorage.setItem(
          SUPABASE_OFFICIAL_CONFIG.trustStorageKey,
          JSON.stringify({
            role: 'teacher',
            email: cleanEmail,
            provider,
            trustedAt: new Date().toISOString(),
          })
        );
      } catch {
        // ignore
      }
      void restoreFromCloudFirestoreNow(true, cleanEmail);
      recordAuditLog(
        'صلاحيات وأمان',
        `تسجيل دخول المالك الرسمي للأكاديمية 👑 (${cleanEmail}) بكامل الصلاحيات المطلقة`,
        cleanEmail
      );
      showToast(
        `👑 مرحباً بمالك الأكاديمية (${cleanEmail}) — تم فتح كافة البوابات ولوحة تحكم المالك العليا`,
        'success'
      );
      return { ok: true };
    }

    const matchedStaff = managedTeachers.find(
      (t) => t.email.toLowerCase() === cleanEmail
    );

    if (!matchedStaff) {
      return {
        ok: false,
        requiresOnboardingCard: true,
        error:
          'أهلاً بك! بريدك الإلكتروني يسجل لأول مرة — يرجى استكمال بطاقة الانضمام السريعة لإرسال طلبك لمالك الأكاديمية.',
      };
    }

    if (matchedStaff.status === 'blocked') {
      return {
        ok: false,
        staffRecord: matchedStaff,
        error: `هذا الحساب (${
          matchedStaff.staffRole === 'supervisor' ? 'المشرف' : 'المحفظ'
        }) موقوف أو مرفوض حالياً من قِبل مالك الأكاديمية.`,
      };
    }

    if (matchedStaff.status === 'pending') {
      return {
        ok: false,
        requiresPendingScreen: true,
        staffRecord: matchedStaff,
        error:
          'تم تسجيل طلبك بنجاح ببريدك الإلكتروني — حسابك الآن قيد المراجعة والتفعيل من قِبل مالك الأكاديمية.',
      };
    }

    if (pin !== undefined && pin.trim() !== '' && pin.trim() !== expectedPin) {
      return { ok: false, error: 'رمز مرور المعلم / المشرف (PIN) غير صحيح.' };
    }

    const effectiveTier: StaffHierarchyRole = matchedStaff.staffRole || 'teacher';
    setCurrentStaffTier(effectiveTier);
    setActiveStaffEmail(cleanEmail);
    hasNotifiedOnSessionRef.current = false;
    setUserRole('teacher');
    setIsLoggedIn(true);
    setActiveTab(
      effectiveTier === 'financial_manager' ? 'finance' : 'dashboard'
    );

    // Update lastActiveAt
    const now = new Date();
    const activeTimeStr = `${getLocalDateString(0)} ${String(
      now.getHours()
    ).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setManagedTeachers((prev) =>
      prev.map((t) =>
        t.id === matchedStaff.id ? { ...t, lastActiveAt: activeTimeStr } : t
      )
    );

    try {
      localStorage.setItem(
        SUPABASE_OFFICIAL_CONFIG.trustStorageKey,
        JSON.stringify({
          role: 'teacher',
          email: cleanEmail,
          provider: matchedStaff.authProvider || provider,
          trustedAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore storage errors
    }

    void restoreFromCloudFirestoreNow(true, cleanEmail);

    recordAuditLog(
      'صلاحيات وأمان',
      `تسجيل دخول (${matchedStaff.name} — ${cleanEmail}) عبر ${
        (matchedStaff.authProvider || provider) === 'microsoft'
          ? 'Microsoft'
          : 'Google'
      } واسترجاع بيانات السحابة تلقائياً`,
      matchedStaff.name
    );
    showToast(
      `مرحباً بك (${matchedStaff.name}) — تم تسجيل الدخول وتطبيق صلاحياتك المعتمدة من المالك ☁️`,
      'success'
    );
    return { ok: true, staffRecord: matchedStaff };
  };

  const [googleAuthUser, setGoogleAuthUser] = useState<GoogleAuthResult | null>(null);

  // Listen to Firebase Auth state changes and subscribe to /staff_registrations in Firestore
  useEffect(() => {
    let unsubStaff: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const fbEmail = (fbUser.email || '').trim().toLowerCase();
        if (fbEmail) {
          setActiveStaffEmail(fbEmail);
          if (isOwnerEmail(fbEmail)) {
            setCurrentStaffTier('owner');
          }
        }
        setGoogleAuthUser((prev) => ({
          uid: fbUser.uid,
          email: fbUser.email || '',
          displayName:
            fbUser.displayName || fbUser.email?.split('@')[0] || 'مستخدم الأكاديمية',
          photoURL: fbUser.photoURL,
          emailVerified: fbUser.emailVerified,
          motherName: prev?.motherName,
          grandfatherName: prev?.grandfatherName,
          grandmotherName: prev?.grandmotherName,
          uncleName: prev?.uncleName,
          isFirstGoogleLogin: prev?.isFirstGoogleLogin,
        }));

        if (fbUser.emailVerified) {
          void restoreFromCloudFirestoreNow(true, fbEmail || undefined);
          unsubStaff = subscribeToStaffRegistrationsFromFirestore((remoteRecords) => {
            setManagedTeachers((prev) => {
              const map = new Map<string, TeacherAccessRecord>();
              prev
                .filter(
                  (item) =>
                    !DEFAULT_SEED_STAFF_IDS.has(item.id) &&
                    !DEFAULT_SEED_STAFF_EMAILS.has(item.email.toLowerCase())
                )
                .forEach((item) => map.set(item.email.toLowerCase(), item));
              remoteRecords.forEach((remote) => {
                const emailKey = remote.email.toLowerCase();
                if (
                  DEFAULT_SEED_STAFF_IDS.has(remote.id) ||
                  DEFAULT_SEED_STAFF_EMAILS.has(emailKey)
                ) {
                  void deleteStaffRegistrationFromFirestore(remote.id).catch(() => {});
                  return;
                }
                const existing = map.get(emailKey);
                map.set(emailKey, {
                  ...existing,
                  ...remote,
                  staffRole: isOwnerEmail(emailKey)
                    ? 'owner'
                    : remote.staffRole || existing?.staffRole || 'teacher',
                  status: isOwnerEmail(emailKey)
                    ? 'active'
                    : remote.status || existing?.status || 'pending',
                });
              });
              return Array.from(map.values());
            });
          });
        }
      } else {
        setGoogleAuthUser(null);
        if (unsubStaff) {
          unsubStaff();
          unsubStaff = null;
        }
      }
    });
    return () => {
      unsubscribe();
      if (unsubStaff) unsubStaff();
    };
  }, []);

  const saveCurrentUserFamilyProfileToFirestore = async (
    family: ExtendedFamilyFields
  ): Promise<void> => {
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) {
      showToast('يرجى تسجيل الدخول بحساب Google أولاً لحفظ ملف التعريف في Firestore', 'info');
      return;
    }
    const roleForProfile =
      userRole === 'guardian'
        ? 'guardian'
        : currentStaffTier === 'supervisor'
        ? 'supervisor'
        : 'teacher';
    const synced = await syncUserProfileToFirestore(fbUser, roleForProfile, family);
    setGoogleAuthUser((prev) =>
      prev
        ? {
            ...prev,
            motherName: synced.motherName,
            grandfatherName: synced.grandfatherName,
            grandmotherName: synced.grandmotherName,
            uncleName: synced.uncleName,
          }
        : prev
    );
    showToast(
      'تم حفظ بيانات العائلة (الوالدة، الجد، الجدة، العم) في ملف تعريف المستخدم في Firestore وربطها بمعرف Google UID ✓',
      'success'
    );
  };

  const handleOAuthPopupFlow = async (
    providerType: 'google' | 'microsoft',
    targetPortal: 'teacher' | 'supervisor' | 'guardian' | 'student' = 'teacher',
    initialFamily?: ExtendedFamilyFields
  ): Promise<{
    ok: boolean;
    error?: string;
    isFirstGoogleLogin?: boolean;
    requiresOnboardingCard?: boolean;
    requiresPendingScreen?: boolean;
    ssoCandidate?: {
      email: string;
      displayName: string;
      provider: StaffAuthProvider;
      uid?: string;
      photoURL?: string | null;
    };
    staffRecord?: TeacherAccessRecord;
  }> => {
    try {
      const result =
        providerType === 'microsoft'
          ? await signInWithMicrosoftPopup(targetPortal, initialFamily)
          : await signInWithGooglePopup(targetPortal, initialFamily);
      const cleanEmail = (result.email || '').trim().toLowerCase();

      setGoogleAuthUser(result);

      if (targetPortal === 'teacher' || targetPortal === 'supervisor') {
        const ownerAccount = isOwnerEmail(cleanEmail);
        const existingStaff = managedTeachers.find(
          (t) => t.email.toLowerCase() === cleanEmail
        );

        // If NOT a Master Owner and NOT yet registered in managedTeachers -> prompt Quick Join Card!
        if (!ownerAccount && !existingStaff) {
          return {
            ok: false,
            requiresOnboardingCard: true,
            ssoCandidate: {
              email: cleanEmail,
              displayName:
                result.displayName || cleanEmail.split('@')[0] || 'محفظ جديد',
              provider: providerType,
              uid: result.uid,
              photoURL: result.photoURL,
            },
          };
        }

        if (!ownerAccount && existingStaff) {
          if (existingStaff.status === 'blocked') {
            const blockedMsg = `هذا الحساب (${
              existingStaff.staffRole === 'supervisor' ? 'المشرف' : 'المحفظ'
            }) موقوف أو مرفوض من قِبل مالك الأكاديمية.`;
            showToast(blockedMsg, 'error');
            return { ok: false, error: blockedMsg, staffRecord: existingStaff };
          }
          if (existingStaff.status === 'pending') {
            return {
              ok: false,
              requiresPendingScreen: true,
              staffRecord: existingStaff,
              error:
                'تم تسجيل طلبك بنجاح ببريدك الإلكتروني — حسابك الآن قيد المراجعة والتفعيل من قِبل مالك الأكاديمية.',
            };
          }
        }

        const staffRecordId =
          existingStaff?.id || `${targetPortal}-${result.uid.slice(0, 10)}`;
        const staffPersonName =
          existingStaff?.name ||
          result.displayName ||
          cleanEmail.split('@')[0];

        const createdRole: StaffHierarchyRole = ownerAccount
          ? 'owner'
          : existingStaff?.staffRole ||
            (targetPortal === 'supervisor' ? 'supervisor' : 'teacher');

        const now = new Date();
        const activeTimeStr = `${getLocalDateString(0)} ${String(
          now.getHours()
        ).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const syncedStaffRecord: TeacherAccessRecord = {
          ...(existingStaff || {}),
          id: staffRecordId,
          name: staffPersonName,
          email: cleanEmail,
          roleTitle:
            existingStaff?.roleTitle ||
            (createdRole === 'owner'
              ? '👑 مالك الأكاديمية (Super Admin / Owner)'
              : createdRole === 'supervisor'
              ? 'مشرف عام الحلقات والمتابعة'
              : 'محفظ الحلقات القرآنية'),
          staffRole: createdRole,
          status: 'active',
          authProvider: existingStaff?.authProvider || providerType,
          lastSyncAt: getLocalDateString(0),
          lastActiveAt: activeTimeStr,
          assignedCirclesCount: existingStaff?.assignedCirclesCount ?? 1,
          googleUid: result.uid,
          photoURL: result.photoURL,
        };

        setManagedTeachers((prev) => {
          const found = prev.some((t) => t.email.toLowerCase() === cleanEmail);
          if (found) {
            return prev.map((t) =>
              t.email.toLowerCase() === cleanEmail ? syncedStaffRecord : t
            );
          }
          return [syncedStaffRecord, ...prev];
        });

        void syncStaffRegistrationToFirestore(syncedStaffRecord).catch(() => {});

        setCurrentStaffTier(createdRole);
        if (cleanEmail) {
          setActiveStaffEmail(cleanEmail);
        }
        hasNotifiedOnSessionRef.current = false;
        setUserRole('teacher');
        setIsLoggedIn(true);
        setActiveTab(
          createdRole === 'owner'
            ? 'owner_panel'
            : createdRole === 'financial_manager'
            ? 'finance'
            : 'dashboard'
        );

        void restoreFromCloudFirestoreNow(true, cleanEmail);
      } else {
        // Guardian or Student Portal
        const matchedStudent =
          students.find(
            (s) =>
              (s.accountStatus ?? 'نشط') !== 'مؤرشف' &&
              (s.googleEmail?.toLowerCase() === cleanEmail ||
                s.googleUid === result.uid)
          ) ||
          students.find((s) => (s.accountStatus ?? 'نشط') !== 'مؤرشف') ||
          students[0];

        if (matchedStudent) {
          const loginIso = new Date().toISOString();
          const loginDateStr = getLocalDateString(0);
          setStudents((prev) =>
            prev.map((st) =>
              st.id === matchedStudent.id
                ? {
                    ...st,
                    googleUid: result.uid,
                    googleEmail: cleanEmail || st.googleEmail,
                    googleAvatarUrl: result.photoURL,
                    lastStudentLoginAt: loginIso,
                    lastLoginDate: loginDateStr,
                  }
                : st
            )
          );
          setGuardianStudentId(matchedStudent.id);
          setSelectedStudentId(matchedStudent.id);
        }
        hasNotifiedOnSessionRef.current = false;
        setIsStaffPortalPreview(false);
        setUserRole('guardian');
        setIsLoggedIn(true);
      }

      try {
        localStorage.setItem(
          SUPABASE_OFFICIAL_CONFIG.trustStorageKey,
          JSON.stringify({
            role:
              targetPortal === 'guardian' || targetPortal === 'student'
                ? 'guardian'
                : 'teacher',
            email: cleanEmail || SUPABASE_OFFICIAL_CONFIG.ownerEmail,
            displayName: result.displayName,
            uid: result.uid,
            provider: providerType,
            trustedAt: new Date().toISOString(),
          })
        );
      } catch {
        // ignore
      }

      void triggerCloudSyncNow(false);

      recordAuditLog(
        'صلاحيات وأمان',
        `تسجيل دخول رسمي عبر ${
          providerType === 'microsoft' ? 'Microsoft' : 'Google'
        } (${result.displayName} — ${cleanEmail}) ومزامنة السحابة`,
        cleanEmail || result.displayName
      );
      showToast(
        isOwnerEmail(cleanEmail)
          ? `👑 مرحباً بمالك الأكاديمية (${result.displayName}) — تم فتح كافة الصلاحيات المطلقة`
          : `مرحباً بك (${result.displayName}) — تم تسجيل الدخول بنجاح`,
        'success'
      );
      return { ok: true, isFirstGoogleLogin: result.isFirstGoogleLogin };
    } catch {
      return {
        ok: false,
        error: `POPUP_FALLBACK_${providerType.toUpperCase()}`,
      };
    }
  };

  const startGoogleOAuthRedirect = (
    targetPortal: 'teacher' | 'supervisor' | 'guardian' | 'student' = 'teacher',
    initialFamily?: ExtendedFamilyFields
  ) => handleOAuthPopupFlow('google', targetPortal, initialFamily);

  const startMicrosoftOAuthRedirect = (
    targetPortal: 'teacher' | 'supervisor' | 'guardian' | 'student' = 'teacher',
    initialFamily?: ExtendedFamilyFields
  ) => handleOAuthPopupFlow('microsoft', targetPortal, initialFamily);

  // Handle Google OAuth callback hash (#access_token=...) if returning from OAuth redirect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      hasNotifiedOnSessionRef.current = false;
      setUserRole('teacher');
      setIsLoggedIn(true);
      setActiveTab('dashboard');
      try {
        localStorage.setItem(
          SUPABASE_OFFICIAL_CONFIG.trustStorageKey,
          JSON.stringify({
            role: 'teacher',
            email: SUPABASE_OFFICIAL_CONFIG.ownerEmail,
            provider: 'google_oauth',
            trustedAt: new Date().toISOString(),
          })
        );
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch {
        // ignore
      }
      showToast('تم التحقق من حساب Google للمحفظ/المشرف بنجاح', 'success');
    }
  }, []);

  const loginAsGuardian = (phone: string, pin: string) => {
    const cleanDigits = phone.replace(/\D/g, '');
    const cleanPin = pin.trim();
    const matched = students.find(
      (s) =>
        (s.accountStatus ?? 'نشط') !== 'مؤرشف' &&
        cleanDigits.length >= 8 &&
        (s.whatsappPhone.endsWith(cleanDigits.slice(-9)) ||
          cleanDigits.endsWith(s.whatsappPhone.slice(-9)) ||
          s.whatsappPhone === cleanDigits) &&
        (s.guardianPin === cleanPin ||
          s.whatsappPhone.replace(/\D/g, '').slice(-6) === cleanPin)
    );
    if (!matched) {
      return { ok: false, error: 'رقم الهاتف أو رمز الدخول (PIN) غير صحيح، أو الحساب مؤرشف.' };
    }
    const loginIso = new Date().toISOString();
    const loginDateStr = getLocalDateString(0);
    setStudents((prev) =>
      prev.map((st) =>
        st.id === matched.id
          ? {
              ...st,
              lastStudentLoginAt: loginIso,
              lastLoginDate: loginDateStr,
            }
          : st
      )
    );
    setGuardianStudentId(matched.id);
    setSelectedStudentId(matched.id);
    setIsStaffPortalPreview(false);
    setUserRole('guardian');
    setIsLoggedIn(true);
    void triggerCloudSyncNow(false);
    showToast(`مرحباً بولي أمر الطالب: ${matched.name}`, 'success');
    return { ok: true };
  };

  // All active siblings linked to the guardian's phone number (hiding archived siblings automatically)
  const guardianSiblings = useMemo(() => {
    const primary =
      students.find((s) => s.id === guardianStudentId) ||
      students.find((s) => s.id === selectedStudentId);
    if (!primary) return students.filter((s) => (s.accountStatus ?? 'نشط') !== 'مؤرشف');
    const tail = primary.whatsappPhone.replace(/\D/g, '').slice(-9);
    const siblings = students.filter(
      (s) =>
        (s.accountStatus ?? 'نشط') !== 'مؤرشف' &&
        (s.whatsappPhone === primary.whatsappPhone ||
          (tail.length >= 8 && s.whatsappPhone.endsWith(tail)))
    );
    return siblings.length > 0 ? siblings : [primary];
  }, [students, guardianStudentId, selectedStudentId]);

  const loginAsGuardianDirect = (studentId: string) => {
    const found = students.find((s) => s.id === studentId) || students[0];
    if (found) {
      const loginIso = new Date().toISOString();
      const loginDateStr = getLocalDateString(0);
      setStudents((prev) =>
        prev.map((st) =>
          st.id === found.id
            ? {
                ...st,
                lastStudentLoginAt: loginIso,
                lastLoginDate: loginDateStr,
              }
            : st
        )
      );
      setGuardianStudentId(found.id);
      setSelectedStudentId(found.id);
      setIsStaffPortalPreview(true);
      setUserRole('guardian');
      setIsLoggedIn(true);
      showToast(`تم فتح معاينة بوابة ولي الأمر والطالب للطالب: ${found.name}`, 'info');
    }
  };

  const loginAsGuest = () => {
    setIsStaffPortalPreview(false);
    setUserRole('guest');
    setIsLoggedIn(true);
    showToast('مرحباً بك في مركز التحفيظ الحر والتلاوة', 'info');
  };

  const logout = () => {
    setIsLoggedIn(false);
    setIsStaffPortalPreview(false);
    setGuardianStudentId(null);
    ImamSessionRestore.clear();
    void signOutFromFirebase();
    try {
      localStorage.removeItem(SUPABASE_OFFICIAL_CONFIG.trustStorageKey);
    } catch {
      // ignore
    }
  };

  const saveStudent = (studentInput: Omit<Student, 'id'> & { id?: string }): Student => {
    if (studentInput.id) {
      let updated!: Student;
      setStudents((prev) =>
        prev.map((s) => {
          if (s.id === studentInput.id) {
            updated = {
              ...s,
              ...studentInput,
              googleUid: studentInput.googleUid ?? s.googleUid ?? auth.currentUser?.uid,
              accountStatus: studentInput.accountStatus ?? s.accountStatus ?? 'نشط',
              id: s.id,
            };
            return updated;
          }
          return s;
        })
      );

      void syncExtendedFamilyRecordToFirestore({
        recordId: studentInput.id,
        entityType: 'student',
        personName: studentInput.name,
        motherName: studentInput.motherName,
        grandfatherName: studentInput.grandfatherName,
        grandmotherName: studentInput.grandmotherName,
        uncleName: studentInput.uncleName,
      }).catch(() => {
        // non-blocking
      });

      showToast('تم تحديث بيانات الطالب وحفظ بيانات العائلة في Firestore بنجاح', 'success');
      recordAuditLog(
        'تعديل طالب',
        `تعديل بيانات الطالب (${studentInput.name}) وحفظ الحقول العائلية الإضافية في Firestore — المستوى: ${studentInput.level}`,
        studentInput.name
      );
      return updated;
    } else {
      const matchedTeacherProfile = managedTeachers.find(
        (t) => t.email.toLowerCase() === activeStaffEmail.toLowerCase()
      );
      const defaultTeacherName =
        matchedTeacherProfile?.name || settings.teacherName;
      const defaultTeacherEmail =
        matchedTeacherProfile?.email || activeStaffEmail || SUPABASE_OFFICIAL_CONFIG.ownerEmail;

      const newStudent: Student = {
        ...studentInput,
        assignedTeacherEmail:
          studentInput.assignedTeacherEmail || defaultTeacherEmail,
        assignedTeacherName:
          studentInput.assignedTeacherName || defaultTeacherName,
        googleUid: studentInput.googleUid ?? auth.currentUser?.uid,
        riwayah: studentInput.riwayah || 'حفص عن عاصم',
        accountStatus: studentInput.accountStatus ?? 'نشط',
        id: `st-${Date.now()}`,
      };
      setStudents((prev) => [newStudent, ...prev]);

      void syncExtendedFamilyRecordToFirestore({
        recordId: newStudent.id,
        entityType: 'student',
        personName: newStudent.name,
        motherName: newStudent.motherName,
        grandfatherName: newStudent.grandfatherName,
        grandmotherName: newStudent.grandmotherName,
        uncleName: newStudent.uncleName,
      }).catch(() => {
        // non-blocking
      });

      showToast(
        `تمت إضافة الطالب الجديد (${newStudent.name}) وإسناده للشيخ (${newStudent.assignedTeacherName}) ومزامنته سحابياً ✓`,
        'success'
      );
      recordAuditLog(
        'تعديل طالب',
        `إضافة ملف طالب جديد (${newStudent.name}) في ${newStudent.circle} ومزامنته سحابياً مع Firestore`,
        newStudent.name
      );
      return newStudent;
    }
  };

  const updateStudent = (studentId: string, patch: Partial<Student>) => {
    setStudents((prev) =>
      prev.map((st) => (st.id === studentId ? { ...st, ...patch, id: st.id } : st))
    );
  };

  const setStudentAccountStatus = (
    studentId: string,
    status: StudentAccountStatus,
    reason?: string
  ) => {
    setStudents((prev) =>
      prev.map((st) =>
        st.id === studentId
          ? {
              ...st,
              accountStatus: status,
              archivedAt: status === 'مؤرشف' ? getLocalDateString(0) : undefined,
              archiveReason: status === 'مؤرشف' ? reason || 'أرشفة آمنة مع حفظ السجل الكامل' : undefined,
            }
          : st
      )
    );
    const stName = students.find((s) => s.id === studentId)?.name || 'الطالب';
    recordAuditLog(
      'أرشفة وحالة ملف',
      `تغيير حالة ملف الطالب (${stName}) إلى (${status}) — ${reason || 'إجراء إداري'}`,
      stName
    );
    if (status === 'مؤرشف') {
      showToast(
        `تمت أرشفة الطالب (${stName}) بأمان وإخفاؤه من القوائم النشطة مع الاحتفاظ بكامل سجل حصصه وأخطائه`,
        'info'
      );
    } else if (status === 'متوقف') {
      showToast(`تم تحويل حالة الطالب (${stName}) إلى متوقف مؤقتاً`, 'info');
    } else {
      showToast(`تمت إعادة تفعيل الطالب (${stName}) واستعادة كامل سجله التاريخي وربطه العائلي`, 'success');
    }
  };

  const updateErrorFollowUpStatus = (
    studentId: string,
    errorKeyOrId: string,
    outcome: 'mastered' | 'needs_review' | 'repeated' | 'needs_practice' | 'repeated_error'
  ) => {
    const normalizedOutcome =
      outcome === 'needs_practice'
        ? 'needs_review'
        : outcome === 'repeated_error'
        ? 'repeated'
        : outcome;
    const todayStr = getLocalDateString(0);
    setSessions((prev) =>
      prev.map((ses) => {
        if (ses.studentId !== studentId) return ses;
        const hasMatch = (ses.errors || []).some(
          (e) => e.id === errorKeyOrId || (e.compositeKey && e.compositeKey === errorKeyOrId)
        );
        if (!hasMatch) return ses;
        return {
          ...ses,
          errors: ses.errors.map((e) => {
            if (e.id !== errorKeyOrId && (!e.compositeKey || e.compositeKey !== errorKeyOrId)) {
              return e;
            }
            if (normalizedOutcome === 'mastered') {
              return { ...e, followUpStatus: 'mastered', lastReviewedDate: todayStr };
            }
            if (normalizedOutcome === 'needs_review') {
              return { ...e, followUpStatus: 'needs_review', lastReviewedDate: todayStr };
            }
            return {
              ...e,
              followUpStatus: 'open',
              repeatCount: (e.repeatCount || 1) + 1,
              lastReviewedDate: todayStr,
            };
          }),
        };
      })
    );
    showToast(
      normalizedOutcome === 'mastered'
        ? 'تم اعتماد إتقان الموضع وإغلاق متابعة الخطأ مع حفظه في السجل التاريخي ✓'
        : normalizedOutcome === 'needs_review'
        ? 'تم إبقاء الخطأ مفتوحاً للمتابعة والتثبيت في الحصة القادمة'
        : 'تم تسجيل تكرار الخطأ (+1) وإبقاؤه في قائمة المتابعة العاجلة',
      normalizedOutcome === 'mastered' ? 'success' : 'info'
    );
  };

  // Safe default behavior: deleteStudent archives the student unless already archived, then records Tombstone
  const deleteStudent = (id: string) => {
    const target = students.find((s) => s.id === id);
    if (target && (target.accountStatus ?? 'نشط') !== 'مؤرشف') {
      setStudentAccountStatus(id, 'مؤرشف', 'أرشفة آمنة لحماية السجل التاريخي من الحذف العشوائي');
      return;
    }
    WLQSyncCore.markTombstone(id, 'student');
    setStudents((prev) => prev.filter((s) => s.id !== id));
    setSessions((prev) => prev.filter((ses) => ses.studentId !== id));
    showToast('تم حذف ملف الطالب المؤرشف نهائياً وتسجيل Tombstone لمنع عودته في المزامنة', 'info');
  };

  const saveSession = (
    sessionInput: Omit<SessionRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ): SessionRecord => {
    const existingIndex = sessions.findIndex(
      (s) =>
        (sessionInput.id && s.id === sessionInput.id) ||
        (s.studentId === sessionInput.studentId && s.date === sessionInput.date)
    );

    const record: SessionRecord = {
      ...sessionInput,
      id:
        existingIndex >= 0
          ? sessions[existingIndex].id
          : sessionInput.id || `ses-${Date.now()}`,
      createdAt:
        existingIndex >= 0
          ? sessions[existingIndex].createdAt
          : sessionInput.createdAt || new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      setSessions((prev) => prev.map((s, idx) => (idx === existingIndex ? record : s)));
    } else {
      setSessions((prev) => [record, ...prev]);
    }

    // Update student's currentStop, memorizedSurahs, and memorizedJuz if present
    if (record.status === 'حضر') {
      const surahMeta = record.newMemorization?.enabled
        ? SURAHS.find((s) => s.id === record.newMemorization!.surahId)
        : undefined;
      const completedJuzFromSession = record.juzReview?.enabled
        ? record.juzReview.items
            .filter((item) => item.scope === 'full')
            .map((item) => item.juzNumber)
        : [];

      if (surahMeta || completedJuzFromSession.length > 0) {
        setStudents((prev) =>
          prev.map((st) => {
            if (st.id !== record.studentId) return st;

            let newMemorizedSurahs = st.memorizedSurahs;
            let newCurrentStop = st.currentStop;

            if (surahMeta && record.newMemorization) {
              const isCompleted =
                record.newMemorization.isFullSurah ||
                record.newMemorization.toAyah >= surahMeta.ayahs;
              if (isCompleted) {
                newMemorizedSurahs = Array.from(
                  new Set([...st.memorizedSurahs, surahMeta.id])
                );
              }
              newCurrentStop = {
                surahId: surahMeta.id,
                surahName: surahMeta.name,
                ayah: record.newMemorization.toAyah,
                juzNumber: surahMeta.juz,
              };
            }

            const newMemorizedJuz =
              completedJuzFromSession.length > 0
                ? Array.from(
                    new Set([...st.memorizedJuz, ...completedJuzFromSession])
                  ).sort((a, b) => a - b)
                : st.memorizedJuz;

            // Auto-update ev/quran-tracker surahRevisionLogs from completed session
            const updatedRevisionLogs: Record<number, SurahRevisionLogEntry> = {
              ...(st.surahRevisionLogs || {}),
            };
            const touchedSurahIds = new Set<number>();
            if (record.actualRecitation?.enabled && record.actualRecitation.surahId) {
              touchedSurahIds.add(record.actualRecitation.surahId);
            }
            if (record.newMemorization?.enabled && record.newMemorization.surahId) {
              touchedSurahIds.add(record.newMemorization.surahId);
            }
            if (record.nearReview?.enabled && record.nearReview.surahId) {
              touchedSurahIds.add(record.nearReview.surahId);
            }
            if (record.farReview?.enabled && record.farReview.surahId) {
              touchedSurahIds.add(record.farReview.surahId);
            }
            if (record.surahReview?.enabled && Array.isArray(record.surahReview.surahNames)) {
              record.surahReview.surahNames.forEach((sName) => {
                const found = SURAHS.find((s) => s.name === sName);
                if (found) touchedSurahIds.add(found.id);
              });
            }
            touchedSurahIds.forEach((sid) => {
              const prevEntry = updatedRevisionLogs[sid];
              updatedRevisionLogs[sid] = {
                surahId: sid,
                lastReviewedDate: record.date || getLocalDateString(0),
                reviewCount: (prevEntry?.reviewCount || 0) + 1,
                masteryScore: record.masteryScore || prevEntry?.masteryScore || 95,
              };
            });

            if (touchedSurahIds.size > 0) {
              const cleanStId = st.id.replace(/[^a-zA-Z0-9_-]/g, '_');
              void syncQuranTrackerLogToFirestore({
                id: `tracker_${cleanStId}`,
                studentId: st.id,
                studentName: st.name,
                circleName: st.circle || 'الحلقة القرآنية',
                streakDays: (st.attendanceStreak || 1) + 1,
                lastActiveDate: record.date || getLocalDateString(0),
                dailyGoalSurahs: st.trackerDailyGoalSurahs || 3,
                surahRevisionMapJson: JSON.stringify(updatedRevisionLogs),
                updatedAtIso: new Date().toISOString(),
              }).catch(() => {});
            }

            return {
              ...st,
              memorizedSurahs: newMemorizedSurahs,
              memorizedJuz: newMemorizedJuz,
              currentStop: newCurrentStop,
              surahRevisionLogs: updatedRevisionLogs,
              trackerLastReviewedDate:
                touchedSurahIds.size > 0
                  ? record.date || getLocalDateString(0)
                  : st.trackerLastReviewedDate,
              recitationAudioClips:
                record.recitationAudioClips && record.recitationAudioClips.length > 0
                  ? [
                      ...record.recitationAudioClips.filter(
                        (c) =>
                          !(st.recitationAudioClips || []).some((ex) => ex.id === c.id)
                      ),
                      ...(st.recitationAudioClips || []),
                    ].slice(0, 40)
                  : st.recitationAudioClips,
              lastRecitationAudioUrl:
                record.recitationAudioClips?.[0]?.audioUrl ||
                record.actualRecitation?.recordedAudioUrl ||
                record.newMemorization?.recordedAudioUrl ||
                st.lastRecitationAudioUrl,
            };
          })
        );
      }
    }


    const sessionStudent = students.find((s) => s.id === record.studentId);
    void markRecitationEngineStartedInFirestore(
      sessionStudent?.circle || sessionStudent?.circleId,
      record.studentId,
      'completed'
    );

    showToast('تم حفظ الحصة وتحديث سجل الطالب بنجاح', 'success');
    return record;
  };

  const [lastScheduleBoardSyncAt, setLastScheduleBoardSyncAt] = useState<
    string | null
  >(null);

  // Pull any remote /schedule_slots modifications from Firestore on mount/login
  useEffect(() => {
    let mounted = true;
    const loadRemoteScheduleSlots = async () => {
      try {
        const slots = await fetchScheduleSlotsFromFirestore();
        if (!mounted || slots.length === 0) return;

        setCircles((prevCircles) =>
          prevCircles.map((cir) => {
            const matchedSlot = slots.find(
              (sl) =>
                sl.entityType === 'circle' &&
                (sl.targetId === cir.id || sl.circleName === cir.name)
            );
            if (!matchedSlot) return cir;
            return {
              ...cir,
              scheduleDays:
                Array.isArray(matchedSlot.scheduleDays) &&
                matchedSlot.scheduleDays.length > 0
                  ? matchedSlot.scheduleDays
                  : cir.scheduleDays,
              scheduleTime: matchedSlot.scheduleTime || cir.scheduleTime,
              duration: matchedSlot.durationMinutes || cir.duration,
            };
          })
        );

        setStudents((prevStudents) =>
          prevStudents.map((st) => {
            const matchedSlot = slots.find(
              (sl) => sl.entityType === 'student' && sl.targetId === st.id
            );
            if (!matchedSlot) return st;
            return {
              ...st,
              scheduleDays:
                Array.isArray(matchedSlot.scheduleDays) &&
                matchedSlot.scheduleDays.length > 0
                  ? matchedSlot.scheduleDays
                  : st.scheduleDays,
              scheduleTime: matchedSlot.scheduleTime || st.scheduleTime,
              sessionDuration:
                matchedSlot.durationMinutes || st.sessionDuration,
            };
          })
        );
      } catch {
        // fallback to local schedule state
      }
    };
    void loadRemoteScheduleSlots();
    return () => {
      mounted = false;
    };
  }, [isLoggedIn]);

  /**
   * Drag-and-Drop ScheduleBoard handler: updates a Circle's or Student's scheduled days and time
   * and automatically syncs the change to Firestore (`/schedule_slots/{slotId}` + `/academy_snapshots`).
   */
  const rescheduleSessionOrCircleViaDragDrop = async (params: {
    entityType: 'circle' | 'student';
    targetId: string;
    fromDay?: number;
    toDay: number;
    toTime: string;
    copyDayInsteadOfMove?: boolean;
    cascadeToCircleStudents?: boolean;
  }): Promise<void> => {
    const dayNamesAr = [
      'الأحد',
      'الاثنين',
      'الثلاثاء',
      'الأربعاء',
      'الخميس',
      'الجمعة',
      'السبت',
    ];
    const safeToDay = Math.max(0, Math.min(6, Math.floor(params.toDay)));
    const safeToTime = (params.toTime || '17:00').trim();
    const nowTimeStr = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    if (params.entityType === 'circle') {
      const targetCircle = circles.find((c) => c.id === params.targetId);
      if (!targetCircle) return;

      const currentDays = Array.isArray(targetCircle.scheduleDays)
        ? targetCircle.scheduleDays
        : [0, 2, 4];

      let nextDays: number[];
      if (
        params.fromDay !== undefined &&
        !params.copyDayInsteadOfMove &&
        params.fromDay !== safeToDay
      ) {
        nextDays = Array.from(
          new Set([
            ...currentDays.filter((d) => d !== params.fromDay),
            safeToDay,
          ])
        ).sort((a, b) => a - b);
      } else {
        nextDays = Array.from(new Set([...currentDays, safeToDay])).sort(
          (a, b) => a - b
        );
      }

      const updatedCircle: CircleGroup = {
        ...targetCircle,
        scheduleDays: nextDays,
        scheduleTime: safeToTime,
      };

      setCircles((prev) =>
        prev.map((c) => (c.id === targetCircle.id ? updatedCircle : c))
      );

      if (params.cascadeToCircleStudents !== false) {
        setStudents((prev) =>
          prev.map((st) =>
            st.circle === targetCircle.name || st.circleId === targetCircle.id
              ? {
                  ...st,
                  scheduleDays: nextDays,
                  scheduleTime: safeToTime,
                }
              : st
          )
        );
      }

      const cleanTargetId = targetCircle.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const slotRecord: ScheduleSlotRecord = {
        id: `slot_circle_${cleanTargetId}`,
        entityType: 'circle',
        targetId: targetCircle.id,
        targetName: targetCircle.name,
        circleName: targetCircle.name,
        teacherName:
          targetCircle.substituteTeacherName ||
          targetCircle.teacherName ||
          settings.teacherName,
        teacherEmail: activeStaffEmail || SUPABASE_OFFICIAL_CONFIG.ownerEmail,
        scheduleDays: nextDays,
        scheduleTime: safeToTime,
        durationMinutes: targetCircle.duration || 45,
        level: targetCircle.level,
        updatedByEmail: activeStaffEmail,
        updatedAtIso: new Date().toISOString(),
      };

      void syncScheduleSlotToFirestore(slotRecord).catch(() => {});
      void triggerCloudSyncNow(false);
      setLastScheduleBoardSyncAt(nowTimeStr);

      recordAuditLog(
        'صلاحيات وأمان',
        `تعديل موعد (${targetCircle.name}) عبر لوحة السحب والإفلات (ScheduleBoard) إلى يوم ${dayNamesAr[safeToDay]} الساعة ${safeToTime} ومزامنة Firestore تلقائياً`,
        targetCircle.name
      );
      showToast(
        `🗓️ تم نقل موعد (${targetCircle.name}) إلى ${dayNamesAr[safeToDay]} الساعة ${safeToTime} وتحديث Firestore تلقائياً ☁️`,
        'success'
      );
    } else {
      const targetStudent = students.find((s) => s.id === params.targetId);
      if (!targetStudent) return;

      const currentDays =
        Array.isArray(targetStudent.scheduleDays) &&
        targetStudent.scheduleDays.length > 0
          ? targetStudent.scheduleDays
          : [0, 2, 4];

      let nextDays: number[];
      if (
        params.fromDay !== undefined &&
        !params.copyDayInsteadOfMove &&
        params.fromDay !== safeToDay
      ) {
        nextDays = Array.from(
          new Set([
            ...currentDays.filter((d) => d !== params.fromDay),
            safeToDay,
          ])
        ).sort((a, b) => a - b);
      } else {
        nextDays = Array.from(new Set([...currentDays, safeToDay])).sort(
          (a, b) => a - b
        );
      }

      setStudents((prev) =>
        prev.map((st) =>
          st.id === targetStudent.id
            ? {
                ...st,
                scheduleDays: nextDays,
                scheduleTime: safeToTime,
              }
            : st
        )
      );

      const cleanTargetId = targetStudent.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const slotRecord: ScheduleSlotRecord = {
        id: `slot_student_${cleanTargetId}`,
        entityType: 'student',
        targetId: targetStudent.id,
        targetName: targetStudent.name,
        circleName: targetStudent.circle || 'الحلقة القرآنية',
        teacherName:
          targetStudent.assignedTeacherName || settings.teacherName,
        teacherEmail:
          targetStudent.assignedTeacherEmail ||
          activeStaffEmail ||
          SUPABASE_OFFICIAL_CONFIG.ownerEmail,
        scheduleDays: nextDays,
        scheduleTime: safeToTime,
        durationMinutes: targetStudent.sessionDuration || 30,
        level: targetStudent.level,
        updatedByEmail: activeStaffEmail,
        updatedAtIso: new Date().toISOString(),
      };

      void syncScheduleSlotToFirestore(slotRecord).catch(() => {});
      void triggerCloudSyncNow(false);
      setLastScheduleBoardSyncAt(nowTimeStr);

      recordAuditLog(
        'تعديل طالب',
        `تعديل موعد حصة الطالب (${targetStudent.name}) عبر السحب والإفلات (ScheduleBoard) إلى يوم ${dayNamesAr[safeToDay]} الساعة ${safeToTime} ومزامنة Firestore تلقائياً`,
        targetStudent.name
      );
      showToast(
        `🗓️ تم نقل حصة الطالب (${targetStudent.name}) إلى ${dayNamesAr[safeToDay]} الساعة ${safeToTime} وتحديث Firestore تلقائياً ☁️`,
        'success'
      );
    }
  };

  // Pull any remote /quran_tracker_logs modifications from Firestore on mount/login
  useEffect(() => {
    let mounted = true;
    const loadRemoteQuranTrackerLogs = async () => {
      try {
        const logs = await fetchQuranTrackerLogsFromFirestore();
        if (!mounted || logs.length === 0) return;

        setStudents((prevStudents) =>
          prevStudents.map((st) => {
            const cleanStId = st.id.replace(/[^a-zA-Z0-9_-]/g, '_');
            const matchedLog = logs.find(
              (l) => l.studentId === st.id || l.id === `tracker_${cleanStId}`
            );
            if (!matchedLog) return st;
            let parsedMap: Record<number, SurahRevisionLogEntry> = {};
            try {
              parsedMap = JSON.parse(
                matchedLog.surahRevisionMapJson || '{}'
              ) as Record<number, SurahRevisionLogEntry>;
            } catch {
              parsedMap = {};
            }
            const mergedMap: Record<number, SurahRevisionLogEntry> = {
              ...(st.surahRevisionLogs || {}),
              ...parsedMap,
            };
            return {
              ...st,
              surahRevisionLogs: mergedMap,
              attendanceStreak: Math.max(
                st.attendanceStreak || 0,
                matchedLog.streakDays || 0
              ),
              trackerDailyGoalSurahs:
                matchedLog.dailyGoalSurahs || st.trackerDailyGoalSurahs || 3,
              trackerLastReviewedDate:
                matchedLog.lastActiveDate || st.trackerLastReviewedDate,
            };
          })
        );
      } catch {
        // fallback to local student state
      }
    };
    void loadRemoteQuranTrackerLogs();
    return () => {
      mounted = false;
    };
  }, [isLoggedIn]);

  /**
   * One-Tap Quick Revision Logger inspired by `ev/quran-tracker`:
   * Marks a Surah as reviewed today, updates freshness to Green (< 7 days),
   * increments daily streak & XP, and automatically syncs to `/quran_tracker_logs/{trackerId}` in Firestore.
   */
  const logQuickSurahRevisionInTracker = async (params: {
    studentId: string;
    surahId: number;
    masteryScore?: number;
    markAsMemorized?: boolean;
    notes?: string;
  }): Promise<void> => {
    const targetStudent = students.find((s) => s.id === params.studentId);
    if (!targetStudent) return;

    const surahMeta = SURAHS.find((s) => s.id === params.surahId);
    const surahName = surahMeta?.name || `سورة رقم ${params.surahId}`;
    const todayStr = getLocalDateString(0);
    const prevLogs = targetStudent.surahRevisionLogs || {};
    const prevEntry = prevLogs[params.surahId];
    const nextEntry: SurahRevisionLogEntry = {
      surahId: params.surahId,
      lastReviewedDate: todayStr,
      reviewCount: (prevEntry?.reviewCount || 0) + 1,
      masteryScore: Math.max(
        50,
        Math.min(100, Math.round(params.masteryScore ?? prevEntry?.masteryScore ?? 96))
      ),
      notes: params.notes || prevEntry?.notes,
    };

    const nextLogs: Record<number, SurahRevisionLogEntry> = {
      ...prevLogs,
      [params.surahId]: nextEntry,
    };

    const shouldAddMemorized = params.markAsMemorized !== false;
    const nextMemorizedSurahs = shouldAddMemorized
      ? Array.from(new Set([...(targetStudent.memorizedSurahs || []), params.surahId])).sort(
          (a, b) => a - b
        )
      : targetStudent.memorizedSurahs || [];

    const isFirstReviewToday = targetStudent.trackerLastReviewedDate !== todayStr;
    const nextStreak = isFirstReviewToday
      ? (targetStudent.attendanceStreak || 1) + 1
      : Math.max(1, targetStudent.attendanceStreak || 1);

    setStudents((prev) =>
      prev.map((st) =>
        st.id === targetStudent.id
          ? {
              ...st,
              memorizedSurahs: nextMemorizedSurahs,
              surahRevisionLogs: nextLogs,
              attendanceStreak: nextStreak,
              trackerLastReviewedDate: todayStr,
              xpPoints: (st.xpPoints || 0) + 15,
            }
          : st
      )
    );

    const cleanStId = targetStudent.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const trackerRecord: QuranTrackerStudentRecord = {
      id: `tracker_${cleanStId}`,
      studentId: targetStudent.id,
      studentName: targetStudent.name,
      circleName: targetStudent.circle || 'الحلقة القرآنية',
      streakDays: nextStreak,
      lastActiveDate: todayStr,
      dailyGoalSurahs: targetStudent.trackerDailyGoalSurahs || 3,
      surahRevisionMapJson: JSON.stringify(nextLogs),
      updatedAtIso: new Date().toISOString(),
    };

    void syncQuranTrackerLogToFirestore(trackerRecord).catch(() => {});
    void triggerCloudSyncNow(false);

    showToast(
      `✅ تم تسجيل مراجعة سورة ${surahName} للطالب (${targetStudent.name}) وتحديث مؤشر النضارة في Firestore 🟢`,
      'success'
    );
  };

  /**
   * Bulk One-Tap Juz Revision Logger inspired by `ev/quran-tracker`:
   * Marks all Surahs in a Juz as reviewed today and syncs to Firestore.
   */
  const bulkLogJuzRevisionInTracker = async (params: {
    studentId: string;
    juzNumber: number;
    masteryScore?: number;
  }): Promise<void> => {
    const targetStudent = students.find((s) => s.id === params.studentId);
    if (!targetStudent) return;

    const surahsInJuz = SURAHS.filter((s) => s.juz === params.juzNumber);
    if (surahsInJuz.length === 0) return;

    const todayStr = getLocalDateString(0);
    const nextLogs: Record<number, SurahRevisionLogEntry> = {
      ...(targetStudent.surahRevisionLogs || {}),
    };

    surahsInJuz.forEach((s) => {
      const prevEntry = nextLogs[s.id];
      nextLogs[s.id] = {
        surahId: s.id,
        lastReviewedDate: todayStr,
        reviewCount: (prevEntry?.reviewCount || 0) + 1,
        masteryScore: params.masteryScore ?? prevEntry?.masteryScore ?? 96,
      };
    });

    const nextMemorizedJuz = Array.from(
      new Set([...(targetStudent.memorizedJuz || []), params.juzNumber])
    ).sort((a, b) => a - b);

    const nextMemorizedSurahs = Array.from(
      new Set([
        ...(targetStudent.memorizedSurahs || []),
        ...surahsInJuz.map((s) => s.id),
      ])
    ).sort((a, b) => a - b);

    const isFirstReviewToday = targetStudent.trackerLastReviewedDate !== todayStr;
    const nextStreak = isFirstReviewToday
      ? (targetStudent.attendanceStreak || 1) + 1
      : Math.max(1, targetStudent.attendanceStreak || 1);

    setStudents((prev) =>
      prev.map((st) =>
        st.id === targetStudent.id
          ? {
              ...st,
              memorizedJuz: nextMemorizedJuz,
              memorizedSurahs: nextMemorizedSurahs,
              surahRevisionLogs: nextLogs,
              attendanceStreak: nextStreak,
              trackerLastReviewedDate: todayStr,
              xpPoints: (st.xpPoints || 0) + 40,
            }
          : st
      )
    );

    const cleanStId = targetStudent.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const trackerRecord: QuranTrackerStudentRecord = {
      id: `tracker_${cleanStId}`,
      studentId: targetStudent.id,
      studentName: targetStudent.name,
      circleName: targetStudent.circle || 'الحلقة القرآنية',
      streakDays: nextStreak,
      lastActiveDate: todayStr,
      dailyGoalSurahs: targetStudent.trackerDailyGoalSurahs || 3,
      surahRevisionMapJson: JSON.stringify(nextLogs),
      updatedAtIso: new Date().toISOString(),
    };

    void syncQuranTrackerLogToFirestore(trackerRecord).catch(() => {});
    void triggerCloudSyncNow(false);

    showToast(
      `✅ تم تسجيل مراجعة الجزء ${params.juzNumber} كاملاً للطالب (${targetStudent.name}) ومزامنة Firestore بنجاح 🟢`,
      'success'
    );
  };

  const saveCircle = (
    circleInput: Omit<CircleGroup, 'id'> & { id?: string },
    assignedStudentIds?: string[]
  ) => {
    const existingCircle = circleInput.id
      ? circles.find((c) => c.id === circleInput.id)
      : undefined;
    const oldName = existingCircle?.name;
    const newName = circleInput.name.trim();

    if (circleInput.id) {
      setCircles((prev) =>
        prev.map((c) =>
          c.id === circleInput.id ? { ...c, ...circleInput, name: newName, id: c.id } : c
        )
      );
    } else {
      setCircles((prev) => [
        ...prev,
        { ...circleInput, name: newName, id: `cir-${Date.now()}` },
      ]);
    }

    if (assignedStudentIds) {
      const assignedSet = new Set(assignedStudentIds);
      const fallbackCircle =
        circles.find((c) => c.id !== circleInput.id && c.name !== newName)?.name ||
        newName;
      setStudents((prev) =>
        prev.map((st) => {
          if (assignedSet.has(st.id)) {
            return { ...st, circle: newName };
          }
          if (oldName && st.circle === oldName) {
            return { ...st, circle: fallbackCircle };
          }
          return st;
        })
      );
    } else if (oldName && oldName !== newName) {
      setStudents((prev) =>
        prev.map((st) => (st.circle === oldName ? { ...st, circle: newName } : st))
      );
    }

    showToast(
      circleInput.id
        ? `تم تحديث بيانات "${newName}" وتوزيع الطلاب بنجاح`
        : `تم إنشاء "${newName}" وتوزيع الطلاب بنجاح`,
      'success'
    );
  };

  const deleteCircle = (id: string) => {
    const target = circles.find((c) => c.id === id);
    if (!target) return;
    const fallbackCircleName =
      circles.find((c) => c.id !== id)?.name || '';

    setCircles((prev) => prev.filter((c) => c.id !== id));
    setStudents((prev) =>
      prev.map((st) =>
        st.circle === target.name ? { ...st, circle: fallbackCircleName } : st
      )
    );
    showToast(
      fallbackCircleName
        ? `تم حذف "${target.name}" ونقل طلابها إلى "${fallbackCircleName}"`
        : `تم حذف الحلقة "${target.name}" بنجاح`,
      'info'
    );
  };

  const assignStudentToCircle = (studentId: string, targetCircleName: string) => {
    setStudents((prev) =>
      prev.map((st) =>
        st.id === studentId ? { ...st, circle: targetCircleName } : st
      )
    );
    const stName = students.find((s) => s.id === studentId)?.name || 'الطالب';
    showToast(`تم نقل ${stName} إلى ${targetCircleName}`, 'success');
  };

  const saveExam = (examInput: Omit<ExamRecord, 'id'> & { id?: string }) => {
    const verificationCode =
      examInput.verificationCode ||
      `IMAM-VER-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (examInput.id) {
      setExams((prev) =>
        prev.map((ex) =>
          ex.id === examInput.id
            ? { ...examInput, verificationCode, id: ex.id }
            : ex
        )
      );
    } else {
      setExams((prev) => [
        { ...examInput, verificationCode, id: `ex-${Date.now()}` },
        ...prev,
      ]);
    }
    const stName =
      students.find((s) => s.id === examInput.studentId)?.name || 'الطالب';
    recordAuditLog(
      'شهادة وإجازة',
      `اعتماد اختبار (${examInput.targetTitle}) بدرجة ${examInput.score}% وكود تحقق ${verificationCode}`,
      stName
    );
    showToast('تم حفظ سجل الاختبار القرآني وتوليد كود التحقق الرقمي', 'success');
  };

  const saveIjazah = (ijazahInput: Omit<IjazahRecord, 'id'> & { id?: string }) => {
    const verificationCode =
      ijazahInput.verificationCode ||
      `IMAM-SANAD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (ijazahInput.id) {
      setIjazahs((prev) =>
        prev.map((ij) =>
          ij.id === ijazahInput.id
            ? { ...ijazahInput, verificationCode, id: ij.id }
            : ij
        )
      );
    } else {
      setIjazahs((prev) => [
        { ...ijazahInput, verificationCode, id: `ij-${Date.now()}` },
        ...prev,
      ]);
    }
    const stName =
      students.find((s) => s.id === ijazahInput.studentId)?.name || 'الطالب';
    recordAuditLog(
      'شهادة وإجازة',
      `توثيق إجازة وسند (${ijazahInput.riwayah}) برقم ${ijazahInput.certificateNumber} وكود تحقق ${verificationCode}`,
      stName
    );
    showToast('تم توثيق الإجازة والسند وكود التحقق الرقمي بنجاح', 'success');
  };

  const saveTask = (taskInput: Omit<TaskItem, 'id'> & { id?: string }) => {
    if (taskInput.id) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskInput.id ? { ...taskInput, id: t.id } : t))
      );
      showToast('تم تحديث المهمة', 'success');
    } else {
      setTasks((prev) => [{ ...taskInput, id: `tsk-${Date.now()}` }, ...prev]);
      showToast('تمت إضافة المهمة الجديدة', 'success');
    }
  };

  const toggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    showToast('تم حذف المهمة', 'info');
  };

  const updateStudentFee = (
    studentId: string,
    month: string,
    status: 'مدفوع' | 'متأخر' | 'معفى',
    amount: number,
    method?: string,
    notes?: string
  ) => {
    setStudents((prev) =>
      prev.map((st) => {
        if (st.id !== studentId) return st;
        const existingIdx = st.fees.findIndex((f) => f.month === month);
        const updatedRecord = {
          month,
          amount,
          status,
          paidAt: status === 'مدفوع' ? new Date().toISOString().slice(0, 10) : undefined,
          method,
          notes,
          receiptNumber:
            status === 'مدفوع'
              ? `REC-${month.replace('-', '')}-${st.id.replace(/\D/g, '') || '100'}`
              : undefined,
        };
        const nextFees =
          existingIdx >= 0
            ? st.fees.map((f, i) => (i === existingIdx ? updatedRecord : f))
            : [...st.fees, updatedRecord];
        return { ...st, fees: nextFees };
      })
    );
    const stName = students.find((s) => s.id === studentId)?.name || 'الطالب';
    recordAuditLog(
      'دفعة مالية وإيصال',
      `تحديث دفعة شهر (${month}) إلى (${status}) بمبلغ ${amount} ج.م للطالب (${stName})`,
      stName
    );
    showToast('تم تحديث الحالة المالية للطالب وتوليد إيصال السداد', 'success');
  };

  const addDisciplineWarning = (
    studentId: string,
    level: 'تنبيه' | 'إنذار أول' | 'إنذار نهائي',
    reason: string
  ) => {
    setStudents((prev) =>
      prev.map((st) => {
        if (st.id !== studentId) return st;
        return {
          ...st,
          disciplineWarnings: [
            {
              id: `warn-${Date.now()}`,
              date: new Date().toISOString().slice(0, 10),
              level,
              reason,
            },
            ...st.disciplineWarnings,
          ],
        };
      })
    );
    showToast('تم تسجيل ملاحظة الانضباط في ملف الطالب', 'info');
  };

  const updateSettings = (partial: Partial<AcademySettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
    showToast('تم حفظ الإعدادات', 'success');
  };

  const saveBoardStrokes = (key: string, strokes: SmartBoardStroke[]) => {
    setBoardStrokes((prev) => ({ ...prev, [key]: strokes }));
  };

  const saveTeacherRating = (
    ratingInput: Omit<TeacherRatingRecord, 'id' | 'date'> & { date?: string }
  ) => {
    const newRecord: TeacherRatingRecord = {
      ...ratingInput,
      id: `tr-${Date.now()}`,
      date: ratingInput.date || getLocalDateString(0),
    };
    setTeacherRatings((prev) => [newRecord, ...prev]);
    showToast('تم إرسال تقييم المحفظ ورسالة الشكر بنجاح — جزاكم الله خيراً', 'success');
  };

  const saveHomeSubmission = (
    submissionInput: Omit<
      HomePracticeSubmission,
      'id' | 'date' | 'createdAt' | 'reviewed' | 'reviewedByTeacher'
    > & {
      date?: string;
      guardianNote?: string;
    }
  ) => {
    const todayStr = submissionInput.date || getLocalDateString(0);
    const newSub: HomePracticeSubmission = {
      ...submissionInput,
      id: `hp-${Date.now()}`,
      date: todayStr,
      createdAt: todayStr,
      guardianNote: submissionInput.guardianNote || submissionInput.studentNote,
      reviewed: false,
      reviewedByTeacher: false,
    };
    setHomeSubmissions((prev) => [newSub, ...prev]);
    setStudents((prev) =>
      prev.map((st) =>
        st.id === submissionInput.studentId
          ? {
              ...st,
              dailyAudioRecordings: [
                newSub,
                ...(st.dailyAudioRecordings || []),
              ],
              xpPoints: Math.max(0, (st.xpPoints || 0) + 25),
            }
          : st
      )
    );
    showToast(
      'تم حفظ المقطع الصوتي للورد اليومي في حالة الطالب وإرساله لصندوق وارد المحفظ (+25 XP)',
      'success'
    );
  };

  const markHomeSubmissionReviewed = (
    id: string,
    feedback?: string,
    grade: GradeType = 'ممتاز',
    masteryScore = 95
  ) => {
    setHomeSubmissions((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              reviewed: true,
              reviewedByTeacher: true,
              grade,
              masteryScore,
              teacherFeedback:
                feedback || 'أحسنت يا بطل، استمر على هذا الإتقان المبارك!',
            }
          : item
      )
    );
    setStudents((prev) =>
      prev.map((st) => ({
        ...st,
        dailyAudioRecordings: (st.dailyAudioRecordings || []).map((rec) =>
          rec.id === id
            ? {
                ...rec,
                reviewed: true,
                reviewedByTeacher: true,
                grade,
                masteryScore,
                teacherFeedback:
                  feedback || 'أحسنت يا بطل، استمر على هذا الإتقان المبارك!',
              }
            : rec
        ),
      }))
    );
    showToast('تم اعتماد مراجعة التسميع غير المتزامن وإرسال التعليقات للطالب', 'success');
  };

  const addTimestampPinToHomeSubmission = (
    submissionId: string,
    pin: {
      timestampSec?: number;
      second?: number;
      formattedTime?: string;
      category: TimestampAudioFeedbackPin['category'];
      ayahNumber?: number;
      word?: string;
      comment?: string;
      note?: string;
      linkedErrorId?: string;
      linkedErrorType?: TimestampAudioFeedbackPin['linkedErrorType'];
      teacherVoiceNoteDataUrl?: string;
      teacherVoiceNoteDurationSec?: number;
    }
  ) => {
    const sec = Math.max(0, Math.round(pin.timestampSec ?? pin.second ?? 0));
    const fmt =
      pin.formattedTime ||
      `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(
        2,
        '0'
      )}`;
    const text = pin.comment || pin.note || 'ملاحظة صوتية على التلاوة';
    const newPin: TimestampAudioFeedbackPin = {
      id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      timestampSec: sec,
      second: sec,
      formattedTime: fmt,
      category: pin.category,
      ayahNumber: pin.ayahNumber,
      word: pin.word,
      comment: text,
      note: text,
      linkedErrorId: pin.linkedErrorId,
      linkedErrorType: pin.linkedErrorType,
      teacherVoiceNoteDataUrl: pin.teacherVoiceNoteDataUrl,
      teacherVoiceNoteDurationSec: pin.teacherVoiceNoteDurationSec,
      createdAt: getLocalDateString(0),
    };
    setHomeSubmissions((prev) =>
      prev.map((sub) =>
        sub.id === submissionId
          ? {
              ...sub,
              timestampPins: [...(sub.timestampPins || []), newPin].sort(
                (a, b) => a.timestampSec - b.timestampSec
              ),
            }
          : sub
      )
    );
    setStudents((prev) =>
      prev.map((st) => ({
        ...st,
        dailyAudioRecordings: (st.dailyAudioRecordings || []).map((sub) =>
          sub.id === submissionId
            ? {
                ...sub,
                timestampPins: [...(sub.timestampPins || []), newPin].sort(
                  (a, b) => a.timestampSec - b.timestampSec
                ),
              }
            : sub
        ),
      }))
    );
    showToast(
      `📌 تم تثبيت تعليق زمني (${pin.category}) عند الدقيقة (${fmt})`,
      'success'
    );
  };

  const submitAdmissionRequest = (
    req: Partial<AdmissionRequest> & {
      studentName: string;
      age: number;
      guardianName: string;
    }
  ): AdmissionRequest => {
    const phone = req.whatsappPhone || req.guardianPhone || '201068631966';
    const tz =
      req.countryAndTimezone || req.countryOrTimezone || 'القاهرة (GMT+2)';
    const riwayah: QuranRiwayah =
      req.preferredRiwayah || req.requestedRiwayah || 'حفص عن عاصم';
    const days = req.preferredDays || 'السبت - الإثنين - الأربعاء';
    const time = req.preferredTime || '17:00';
    const daysAndTime = req.preferredDaysAndTime || `${days} — ${time}`;
    const level: StudentLevel =
      req.currentLevel === 'متقدم' || req.currentLevel === 'متوسط'
        ? req.currentLevel
        : 'مبتدئ';

    const newReq: AdmissionRequest = {
      id: `adm-${Date.now()}`,
      studentName: req.studentName,
      age: req.age,
      guardianName: req.guardianName,
      whatsappPhone: phone,
      guardianPhone: phone,
      countryAndTimezone: tz,
      countryOrTimezone: tz,
      preferredRiwayah: riwayah,
      requestedRiwayah: riwayah,
      currentLevel: level,
      memorizedPartsSummary:
        req.memorizedPartsSummary || String(req.currentLevel || 'جزء عم'),
      preferredDaysAndTime: daysAndTime,
      preferredDays: days,
      preferredTime: time,
      status: 'جديد',
      createdAt: getLocalDateString(0),
      notes: req.notes,
    };
    setAdmissionRequests((prev) => [newReq, ...prev]);
    recordAuditLog(
      'قبول طالب جديد',
      `استلام طلب التحاق جديد للطالب (${newReq.studentName}) — الرواية: ${newReq.preferredRiwayah}`,
      newReq.studentName,
      'النظام'
    );
    showToast('تم تسجيل طلب الالتحاق وحجز تحديد المستوى بنجاح', 'success');
    return newReq;
  };

  const updateAdmissionRequestStatus = (
    id: string,
    status: AdmissionRequest['status'],
    notes?: string
  ) => {
    setAdmissionRequests((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status, notes: notes ?? r.notes } : r
      )
    );
    showToast(`تم تحديث حالة طلب الالتحاق إلى (${status})`, 'info');
  };

  const approveAdmissionAsStudent = (
    id: string,
    targetCircleName?: string
  ): Student | null => {
    const req = admissionRequests.find((r) => r.id === id);
    if (!req) return null;
    const levelNorm: StudentLevel =
      req.currentLevel === 'متقدم' || req.currentLevel === 'متوسط'
        ? req.currentLevel
        : 'مبتدئ';
    const assignedCircle =
      targetCircleName ||
      circles.find((c) => c.level === levelNorm)?.name ||
      circles[0]?.name ||
      'حلقة النور والبيان (الناشئة)';

    const created = saveStudent({
      name: req.studentName,
      guardianName: req.guardianName,
      whatsappPhone: req.whatsappPhone || req.guardianPhone || '201068631966',
      guardianPin: '123456',
      level: levelNorm,
      riwayah: req.preferredRiwayah || req.requestedRiwayah || 'حفص عن عاصم',
      timezoneLabel: req.countryAndTimezone || req.countryOrTimezone,
      circle: assignedCircle,
      plan: 'متوازنة',
      linkLogic: 'الآية التالية',
      scheduleDays: [0, 2, 4],
      scheduleTime: req.preferredTime || '17:00',
      sessionDuration: 30,
      startDate: getLocalDateString(0),
      notes: `طالب مقبول من بوابة التسجيل — ${req.memorizedPartsSummary}. ${req.notes || ''}`,
      memorizedSurahs: [1, 112, 113, 114],
      inProgressSurahs: [78],
      memorizedJuz: levelNorm === 'متوسط' ? [30] : [],
      currentStop: {
        surahId: 78,
        surahName: 'النبأ',
        ayah: 1,
        juzNumber: 30,
      },
      monthlyFee: 350,
      fees: [],
      disciplineWarnings: [],
    });

    setAdmissionRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'مقبول بالحلقة' } : r))
    );
    recordAuditLog(
      'قبول طالب جديد',
      `اعتماد قبول الطالب (${req.studentName}) وتحويله رسمياً إلى (${assignedCircle})`,
      req.studentName
    );
    return created;
  };

  const updateStudentAccessibilityMode = (
    studentId: string,
    mode: StudentAccessibilityMode
  ) => {
    setStudents((prev) =>
      prev.map((st) =>
        st.id === studentId ? { ...st, accessibilityMode: mode } : st
      )
    );
    const label =
      mode === 'kids'
        ? 'وضع الطفل الصغير بالأيقونات الكبيرة'
        : mode === 'seniors'
        ? 'وضع الخط الفائق لحلقات الكبار'
        : 'الوضع القياسي';
    showToast(`تم تفعيل (${label}) في بوابة الطالب`, 'info');
  };

  const addStudentXp = (studentId: string, deltaXp: number, reason?: string) => {
    setStudents((prev) =>
      prev.map((st) =>
        st.id === studentId
          ? { ...st, xpPoints: Math.max(0, (st.xpPoints || 0) + deltaXp) }
          : st
      )
    );
    if (reason) {
      showToast(`🌟 +${deltaXp} نقطة همة: ${reason}`, 'success');
    }
  };

  const awardStudentBadge = (studentId: string, badgeTitle: string) => {
    setStudents((prev) =>
      prev.map((st) => {
        if (st.id !== studentId) return st;
        const current = st.badges || [];
        const nextBadges = current.includes(badgeTitle)
          ? current
          : [...current, badgeTitle];
        return {
          ...st,
          badges: nextBadges,
          xpPoints: (st.xpPoints || 0) + 30,
        };
      })
    );
    showToast(`🏅 تم منح الطالب "${badgeTitle}" (+30 نقطة همة)!`, 'success');
  };

  const toggleStudentGoldenCrown = (studentId: string) => {
    setStudents((prev) =>
      prev.map((st) =>
        st.id === studentId
          ? {
              ...st,
              hasGoldenCrown: !st.hasGoldenCrown,
              xpPoints: !st.hasGoldenCrown ? (st.xpPoints || 0) + 50 : st.xpPoints,
            }
          : st
      )
    );
  };

  const promoteStudentFoundationLevel = (
    studentId: string,
    passedLevel: FoundationLevelNumber,
    score = 96
  ) => {
    const nextLevel = Math.min(8, passedLevel + 1) as FoundationLevelNumber;
    setStudents((prev) =>
      prev.map((st) => {
        if (st.id !== studentId) return st;
        const completed = Array.from(
          new Set([...(st.completedFoundationLevels || []), passedLevel])
        ).sort((a, b) => a - b);
        const badges = Array.from(
          new Set([...(st.badges || []), 'وسام بطل التأسيس'])
        );
        return {
          ...st,
          foundationLevel: nextLevel,
          completedFoundationLevels: completed,
          xpPoints: (st.xpPoints || 0) + 100,
          badges,
        };
      })
    );

    const st = students.find((s) => s.id === studentId);
    saveExam({
      studentId,
      date: getLocalDateString(0),
      type: 'اختبار مرحلة تأسيسية',
      targetTitle: `اجتياز المستوى (${passedLevel}) من منهج الإمام للتأسيس القرآني`,
      committee: [settings.teacherName],
      score,
      grade: score >= 90 ? 'ممتاز' : 'جيد جداً',
      passed: true,
      notes: `اجتاز الطالب ${st?.name || ''} اختبار المستوى ${passedLevel} بنجاح وانتقل للمستوى ${nextLevel}.`,
      certificateIssued: true,
    });
  };

  const toggleStudentFortressTask = (
    studentId: string,
    taskId: FiveFortressTaskKey,
    dateStr = getLocalDateString(0)
  ) => {
    setStudents((prev) =>
      prev.map((st) => {
        if (st.id !== studentId) return st;
        const log = { ...(st.fiveFortressesLog || {}) };
        const dayTasks = log[dateStr] || {
          listened3Times: false,
          readPreparation: false,
          reviewedLink: false,
          reviewedFar: false,
        };
        const exists = !!dayTasks[taskId];
        log[dateStr] = {
          ...dayTasks,
          [taskId]: !exists,
        };
        return {
          ...st,
          fiveFortressesLog: log,
          xpPoints: Math.max(0, (st.xpPoints || 0) + (exists ? -10 : 15)),
        };
      })
    );
  };

  const linkStudentStopToAyah = (
    studentId: string,
    surahId: number,
    ayah: number
  ) => {
    const surahMeta = SURAHS.find((s) => s.id === surahId) || SURAHS[0];
    const validAyah = Math.max(1, Math.min(surahMeta.ayahs, ayah));
    setStudents((prev) =>
      prev.map((st) =>
        st.id === studentId
          ? {
              ...st,
              currentStop: {
                surahId: surahMeta.id,
                surahName: surahMeta.name,
                ayah: validAyah,
                juzNumber: surahMeta.juz,
              },
            }
          : st
      )
    );
    const stName = students.find((s) => s.id === studentId)?.name || 'الطالب';
    showToast(
      `📌 تم ربط موضع توقف الطالب (${stName}) بسورة ${surahMeta.name} — الآية (${validAyah})`,
      'success'
    );
  };

  const addStudentCustomMutashabih = (
    studentId: string,
    item: Partial<StudentCustomMutashabih>
  ) => {
    const sAName = item.surahAName || item.primarySurahName || 'النبأ';
    const aANum = item.ayahANumber ?? item.primaryAyah ?? 1;
    const aAText =
      item.ayahAText || item.primaryText || `سورة ${sAName} — الآية ${aANum}`;
    const sBName = item.surahBName || item.similarSurahName || 'النازعات';
    const aBNum = item.ayahBNumber ?? item.similarAyah ?? 1;
    const aBText =
      item.ayahBText || item.similarText || `سورة ${sBName} — الآية ${aBNum}`;
    const diffWord =
      item.diffHighlightWord || item.differenceWord1 || 'موضع الاختلاف';
    const rule =
      item.dabitRule ||
      item.ruleNote ||
      'الانتباه لسياق السورة وضبط الكلمة المميزة عند التسميع.';

    const newItem: StudentCustomMutashabih = {
      id: `cmut-${Date.now()}`,
      createdAt: getLocalDateString(0),
      surahAName: sAName,
      ayahANumber: aANum,
      ayahAText: aAText,
      surahBName: sBName,
      ayahBNumber: aBNum,
      ayahBText: aBText,
      diffHighlightWord: diffWord,
      dabitRule: rule,
      primarySurahId: item.primarySurahId,
      primarySurahName: sAName,
      primaryAyah: aANum,
      primaryText: aAText,
      similarSurahId: item.similarSurahId,
      similarSurahName: sBName,
      similarAyah: aBNum,
      similarText: aBText,
      differenceWord1: item.differenceWord1 || diffWord,
      differenceWord2: item.differenceWord2 || diffWord,
      ruleNote: rule,
    };
    setStudents((prev) =>
      prev.map((st) =>
        st.id === studentId
          ? {
              ...st,
              customMutashabihat: [newItem, ...(st.customMutashabihat || [])],
              xpPoints: (st.xpPoints || 0) + 20,
            }
          : st
      )
    );
    showToast(
      `تمت إضافة بطاقة «متشابهاتي الخاصة» لسورة ${sAName} مع سورة ${sBName} بملف الطالب`,
      'success'
    );
  };

  const deleteStudentCustomMutashabih = (
    studentId: string,
    mutashabihId: string
  ) => {
    setStudents((prev) =>
      prev.map((st) =>
        st.id === studentId
          ? {
              ...st,
              customMutashabihat: (st.customMutashabihat || []).filter(
                (m) => m.id !== mutashabihId
              ),
            }
          : st
      )
    );
    showToast('تم حذف بطاقة المتشابهات من ملف الطالب', 'info');
  };

  const updateCircleSubstituteAndSeason = (
    circleId: string,
    updates: Partial<CircleGroup>
  ) => {
    setCircles((prev) =>
      prev.map((c) => (c.id === circleId ? { ...c, ...updates } : c))
    );
    showToast('تم حفظ إعدادات الحلقة (المعلم البديل / الموسم المكثف) بنجاح', 'success');
  };

  const [studentAudioBlobs, setStudentAudioBlobs] = useState<
    Record<string, StudentAudioBlobRecord[]>
  >({});

  const loadStudentAudioBlobs = async (
    studentId: string
  ): Promise<StudentAudioBlobRecord[]> => {
    if (!studentId) return [];
    const items = await fetchAudioBlobsFromIdbAndLocalStorage(studentId);
    setStudentAudioBlobs((prev) => ({
      ...prev,
      [studentId]: items,
    }));
    return items;
  };

  const saveStudentAudioBlob = async (input: {
    studentId: string;
    studentName: string;
    surahName: string;
    fromAyah: number;
    toAyah: number;
    durationSeconds: number;
    blob: Blob;
    dataUrl: string;
    studentNote: string;
  }): Promise<StudentAudioBlobRecord> => {
    const nowIso = new Date().toISOString();
    const record: StudentAudioBlobRecord = {
      id: `blob-${input.studentId}-${Date.now()}`,
      studentId: input.studentId,
      studentName: input.studentName,
      surahName: input.surahName,
      fromAyah: input.fromAyah,
      toAyah: input.toAyah,
      durationSeconds: input.durationSeconds,
      mimeType: input.blob.type || 'audio/webm',
      sizeBytes: input.blob.size || 0,
      blob: input.blob,
      dataUrl: input.dataUrl,
      studentNote: input.studentNote,
      createdAt: nowIso,
    };

    await persistAudioBlobToIdbAndLocalStorage(record);

    setStudentAudioBlobs((prev) => ({
      ...prev,
      [input.studentId]: [record, ...(prev[input.studentId] || [])],
    }));

    saveHomeSubmission({
      studentId: input.studentId,
      studentName: input.studentName,
      date: getLocalDateString(0),
      surahName: input.surahName,
      fromAyah: input.fromAyah,
      toAyah: input.toAyah,
      durationSeconds: input.durationSeconds,
      audioDataUrl: input.dataUrl,
      studentNote: input.studentNote,
    });

    return record;
  };

  const deleteStudentAudioBlob = async (
    studentId: string,
    recordId: string
  ): Promise<void> => {
    const db = await openStudentAudioIndexedDB();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STUDENT_AUDIO_IDB_STORE, 'readwrite');
          tx.objectStore(STUDENT_AUDIO_IDB_STORE).delete(recordId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }
    try {
      const lsKey = `wlq_student_audio_blobs_${studentId}`;
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const existing: StudentAudioBlobRecord[] = JSON.parse(raw);
        localStorage.setItem(
          lsKey,
          JSON.stringify(existing.filter((item) => item.id !== recordId))
        );
      }
    } catch {
      // ignore
    }
    setStudentAudioBlobs((prev) => ({
      ...prev,
      [studentId]: (prev[studentId] || []).filter((item) => item.id !== recordId),
    }));
    showToast('تم حذف المقطع الصوتي من تخزين الطالب المحلي', 'info');
  };

  const saveStudentRecitationAudioClip = async (
    studentId: string,
    clipInput: Omit<StudentRecitationAudioClip, 'id' | 'createdAt' | 'studentId'> & {
      blob?: Blob;
    }
  ): Promise<StudentRecitationAudioClip> => {
    const nowIso = new Date().toISOString();
    const targetStudent = students.find((s) => s.id === studentId);
    const studentName = clipInput.studentName || targetStudent?.name || 'طالب';
    const clipId = `rec-clip-${studentId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;

    const newClip: StudentRecitationAudioClip = {
      id: clipId,
      studentId,
      studentName,
      sessionDate: clipInput.sessionDate,
      axisKey: clipInput.axisKey,
      axisLabel: clipInput.axisLabel,
      surahName: clipInput.surahName,
      fromAyah: clipInput.fromAyah,
      toAyah: clipInput.toAyah,
      audioUrl: clipInput.audioUrl,
      durationSeconds: Math.max(1, clipInput.durationSeconds),
      grade: clipInput.grade,
      percentage: clipInput.percentage,
      notes: clipInput.notes,
      createdAt: nowIso,
    };

    // Store the audio URL and clip directly in the Student's state (حالة الطالب)
    setStudents((prev) =>
      prev.map((st) => {
        if (st.id !== studentId) return st;
        const existingClips = st.recitationAudioClips || [];
        return {
          ...st,
          lastRecitationAudioUrl: newClip.audioUrl,
          recitationAudioClips: [newClip, ...existingClips].slice(0, 40),
        };
      })
    );

    if (clipInput.blob) {
      try {
        await saveStudentAudioBlob({
          studentId,
          studentName,
          surahName: clipInput.surahName,
          fromAyah: clipInput.fromAyah || 1,
          toAyah: clipInput.toAyah || clipInput.fromAyah || 1,
          durationSeconds: Math.max(1, clipInput.durationSeconds),
          blob: clipInput.blob,
          dataUrl: clipInput.audioUrl,
          studentNote: `[تسجيل محور: ${clipInput.axisLabel}] سورة ${clipInput.surahName} (${
            clipInput.fromAyah || 1
          }-${clipInput.toAyah || 1})`,
        });
      } catch {
        // Already persisted in student state
      }
    }

    return newClip;
  };

  const deleteStudentRecitationAudioClip = (studentId: string, clipId: string) => {
    setStudents((prev) =>
      prev.map((st) => {
        if (st.id !== studentId) return st;
        const filtered = (st.recitationAudioClips || []).filter((c) => c.id !== clipId);
        return {
          ...st,
          recitationAudioClips: filtered,
          lastRecitationAudioUrl: filtered[0]?.audioUrl || undefined,
        };
      })
    );
    showToast('تم حذف المقطع الصوتي المسجل من حالة الطالب', 'info');
  };

  // --- Public Mushaf, Waqf Dedication & Visitor Impact State ---
  const [publicMushafPortalOpen, setPublicMushafPortalOpen] = useState<boolean>(false);

  const [currentPublicVisitorId] = useState<string>(() => {
    try {
      const existing = localStorage.getItem('imam_public_visitor_id_v1');
      if (existing) return existing;
      const created = 'vis-local-current';
      localStorage.setItem('imam_public_visitor_id_v1', created);
      return created;
    } catch {
      return 'vis-local-current';
    }
  });

  const [waqfImpactStats, setWaqfImpactStats] = useState<WaqfImpactStats>(() => {
    try {
      const raw = localStorage.getItem('imam_waqf_impact_stats_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as WaqfImpactStats;
        // Strip old hardcoded seed numbers (1482 / 28640)
        if (parsed && parsed.totalVisitors !== 1482 && parsed.totalPagesRead !== 28640) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return {
      totalVisitors: 0,
      pwaInstallsCount: 0,
      totalPagesRead: 0,
      totalJuzRead: 0,
      completedKhatmahsCount: 0,
      ameenPrayersCount: 0,
      offlineDownloadsCount: 0,
    };
  });

  const [publicBookmarks, setPublicBookmarks] = useState<PublicMushafBookmark[]>(() => {
    try {
      const raw = localStorage.getItem('imam_public_mushaf_bookmarks_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as PublicMushafBookmark[];
        if (Array.isArray(parsed)) {
          return parsed.filter((bm) => !DEFAULT_SEED_BOOKMARK_IDS.has(bm.id));
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [publicVisitors, setPublicVisitors] = useState<PublicVisitorWirdRecord[]>(() => {
    try {
      const raw = localStorage.getItem('imam_public_visitors_wird_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as PublicVisitorWirdRecord[];
        if (Array.isArray(parsed)) {
          return parsed.filter((v) => !DEFAULT_SEED_VISITOR_IDS.has(v.id));
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('imam_waqf_impact_stats_v1', JSON.stringify(waqfImpactStats));
    } catch {
      // ignore
    }
  }, [waqfImpactStats]);

  useEffect(() => {
    try {
      localStorage.setItem('imam_public_mushaf_bookmarks_v1', JSON.stringify(publicBookmarks));
    } catch {
      // ignore
    }
  }, [publicBookmarks]);

  useEffect(() => {
    try {
      localStorage.setItem('imam_public_visitors_wird_v1', JSON.stringify(publicVisitors));
    } catch {
      // ignore
    }
  }, [publicVisitors]);

  const recordWaqfAmeenPrayer = (visitorId?: string) => {
    const targetId = visitorId || currentPublicVisitorId;
    setWaqfImpactStats((prev) => ({
      ...prev,
      ameenPrayersCount: prev.ameenPrayersCount + 1,
      completedKhatmahsCount: prev.completedKhatmahsCount + 1,
    }));
    setPublicVisitors((prev) =>
      prev.map((v) =>
        v.id === targetId
          ? {
              ...v,
              ameenCount: (v.ameenCount || 0) + 1,
              lastActiveAt: getLocalDateString(0),
            }
          : v
      )
    );
    showToast('تقبل الله طاعتكم ودعاءكم، ولكم بمثل ما دعوتم', 'success');
  };

  const recordPublicWaqfActivity = (pagesRead = 1, versesRead = 15) => {
    setWaqfImpactStats((prev) => ({
      ...prev,
      totalPagesRead: prev.totalPagesRead + Math.max(0, pagesRead),
      totalVersesRead: (prev.totalVersesRead || 0) + Math.max(0, versesRead),
      totalJuzRead: Math.floor((prev.totalPagesRead + Math.max(0, pagesRead)) / 20),
    }));
  };

  const recordPwaInstallEvent = () => {
    setWaqfImpactStats((prev) => ({
      ...prev,
      pwaInstallsCount: prev.pwaInstallsCount + 1,
    }));
  };

  const recordOfflineDownloadEvent = () => {
    setWaqfImpactStats((prev) => ({
      ...prev,
      offlineDownloadsCount: prev.offlineDownloadsCount + 1,
    }));
  };

  const savePublicBookmark = (
    input: Omit<PublicMushafBookmark, 'id' | 'updatedAt'> & { id?: string }
  ) => {
    const nowStr = getLocalDateString(0);
    setPublicBookmarks((prev) => {
      const existingByCategory = prev.find(
        (b) => b.id === input.id || b.category === input.category
      );
      if (existingByCategory) {
        return prev.map((b) =>
          b.id === existingByCategory.id
            ? { ...b, ...input, id: b.id, updatedAt: nowStr }
            : b
        );
      }
      return [
        {
          ...input,
          id: input.id || `bm-${Date.now()}`,
          updatedAt: nowStr,
        },
        ...prev,
      ];
    });
    showToast(`تم حفظ (${input.label}) عند صفحة ${input.pageNumber} — سورة ${input.surahName}`, 'success');
  };

  const deletePublicBookmark = (id: string) => {
    setPublicBookmarks((prev) => prev.filter((b) => b.id !== id));
    showToast('تم إزالة الفاصل المرجعي', 'info');
  };

  const updatePublicVisitorWird = (
    updates: Partial<PublicVisitorWirdRecord> & {
      pagesDelta?: number;
      completedKhatmahDelta?: number;
    }
  ) => {
    const pagesDelta = updates.pagesDelta || 0;
    const khatmahDelta = updates.completedKhatmahDelta || 0;

    if (pagesDelta > 0 || khatmahDelta > 0) {
      setWaqfImpactStats((prev) => ({
        ...prev,
        totalPagesRead: prev.totalPagesRead + Math.max(0, pagesDelta),
        totalJuzRead: Math.floor((prev.totalPagesRead + Math.max(0, pagesDelta)) / 20),
        completedKhatmahsCount: prev.completedKhatmahsCount + Math.max(0, khatmahDelta),
      }));
    }

    setPublicVisitors((prev) =>
      prev.map((v) => {
        if (v.id !== currentPublicVisitorId) return v;
        const nextPage = updates.currentPage ?? v.currentPage;
        const nextPagesToday = Math.max(0, (updates.pagesReadToday ?? v.pagesReadToday) + pagesDelta);
        const nextTotalPages = Math.max(0, (updates.totalPagesRead ?? v.totalPagesRead) + pagesDelta);
        const nextKhatmahs = Math.max(
          0,
          (updates.completedKhatmahs ?? v.completedKhatmahs) + khatmahDelta
        );
        const nextCompletion = Math.min(100, Math.round((nextPage / 604) * 100));
        return {
          ...v,
          ...updates,
          currentPage: nextPage,
          pagesReadToday: nextPagesToday,
          totalPagesRead: nextTotalPages,
          completedKhatmahs: nextKhatmahs,
          completionPercentage: updates.completionPercentage ?? nextCompletion,
          lastActiveAt: getLocalDateString(0),
        };
      })
    );
  };

  const sendOwnerVisitorEncouragement = (
    targetVisitorId: string | 'ALL',
    badgeTitle: string,
    message: string
  ) => {
    const newEnc: OwnerEncouragementItem = {
      id: `enc-${Date.now()}`,
      badgeTitle:
        badgeTitle.trim() ||
        '🌟 وسام تميز ورسالة تشجيع وإهداء خاص من إدارة أكاديمية الإمام',
      message:
        message.trim() ||
        'تقبل الله تلاوتكم، وجعل القرآن العظيم شفيعاً لكم ونوراً في الدنيا والآخرة.',
      sentAt: getLocalDateString(0),
      senderName: settings.academyName || 'إدارة أكاديمية الإمام للقرآن الكريم',
      isRead: false,
    };

    setPublicVisitors((prev) =>
      prev.map((v) => {
        if (targetVisitorId !== 'ALL' && v.id !== targetVisitorId) return v;
        const nextBadges = v.badges.includes(newEnc.badgeTitle)
          ? v.badges
          : [newEnc.badgeTitle, ...v.badges];
        return {
          ...v,
          badges: nextBadges,
          encouragements: [newEnc, ...(v.encouragements || [])],
        };
      })
    );

    const targetName =
      targetVisitorId === 'ALL'
        ? 'جميع زوار وقراء المصحف العام'
        : publicVisitors.find((v) => v.id === targetVisitorId)?.visitorName || 'القارئ المتميز';

    recordAuditLog(
      'إعدادات عامة',
      `إرسال (${newEnc.badgeTitle}) ورسالة تشجيع إلى (${targetName}) عبر بوابة المصحف العام والوقف`,
      targetName
    );
    showToast(`🌟 تم إرسال وسام التميز ورسالة التشجيع إلى (${targetName}) بنجاح`, 'success');
  };

  const markVisitorEncouragementRead = (visitorId: string, encouragementId: string) => {
    setPublicVisitors((prev) =>
      prev.map((v) =>
        v.id === visitorId
          ? {
              ...v,
              encouragements: (v.encouragements || []).map((e) =>
                e.id === encouragementId ? { ...e, isRead: true } : e
              ),
            }
          : v
      )
    );
  };

  const resetToSeedData = () => {
    setStudents(INITIAL_STUDENTS);
    setSessions(INITIAL_SESSIONS);
    setCircles(INITIAL_CIRCLES);
    setExams(INITIAL_EXAMS);
    setIjazahs(INITIAL_IJAZAHS);
    setTasks(INITIAL_TASKS);
    setSettings(INITIAL_SETTINGS);
    setBoardStrokes({});
    setTeacherRatings(INITIAL_TEACHER_RATINGS);
    setHomeSubmissions(INITIAL_HOME_SUBMISSIONS);
    setAdmissionRequests([]);
    setAuditLogs([]);
    setAccessCodeRequests([]);
    setPeerCompetitions([]);
    setPublicBookmarks([]);
    setPublicVisitors([]);
    setSelectedStudentId(INITIAL_STUDENTS[0]?.id || null);
    void triggerCloudSyncNow(false);
    showToast(
      `تم استعادة بيانات الطلاب الحقيقيين (${INITIAL_STUDENTS.length} طالباً و ${INITIAL_SESSIONS.length} حصة) بنجاح`,
      'success'
    );
  };

  const importFullBackup = (data: unknown): boolean => {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    if (!Array.isArray(obj.students)) return false;

    const normalized = normalizePortableBackupPayload(
      obj,
      settings,
      circles,
      getCurrentMonthKey()
    );
    if (!normalized) return false;

    setStudents(normalized.students);
    setSessions(normalized.sessions);
    setCircles(normalized.circles);
    setSettings(normalized.settings);

    if (normalized.students.length > 0) {
      setSelectedStudentId(normalized.students[0].id);
    }

    if (Array.isArray(obj.exams)) setExams(obj.exams as ExamRecord[]);
    if (Array.isArray(obj.ijazahs)) setIjazahs(obj.ijazahs as IjazahRecord[]);
    if (Array.isArray(obj.tasks)) setTasks(obj.tasks as TaskItem[]);
    if (Array.isArray(obj.managedTeachers)) {
      setManagedTeachers(obj.managedTeachers as TeacherAccessRecord[]);
    }
    if (Array.isArray(obj.teacherRatings)) {
      setTeacherRatings(obj.teacherRatings as TeacherRatingRecord[]);
    }
    if (Array.isArray(obj.homeSubmissions)) {
      setHomeSubmissions(obj.homeSubmissions as HomePracticeSubmission[]);
    }
    recordAuditLog(
      'إعدادات عامة',
      `استعادة البيانات من ملف نسخة احتياطية محلي JSON (${normalized.circles.length} حلقات، ${normalized.students.length} طلاب، ${normalized.sessions.length} حصة)`,
      'إدارة النسخ الاحتياطي'
    );
    showToast(
      `تمت استعادة البيانات بنجاح (${normalized.circles.length} حلقات، ${normalized.students.length} طالباً، و ${normalized.sessions.length} حصة مسجلة)`,
      'success'
    );
    void triggerCloudSyncNow(false);
    return true;
  };

  const exportTeacherScopedJsonBackup = (teacherEmail?: string) => {
    const targetEmail = (teacherEmail || activeStaffEmail || '').trim().toLowerCase();
    const matchedTeacher = managedTeachers.find(
      (t) => t.email.toLowerCase() === targetEmail
    );
    const teacherName = matchedTeacher?.name || settings.teacherName;

    const scopedCircles =
      currentStaffTier === 'owner' && !teacherEmail
        ? circles
        : circles.filter(
            (c) =>
              c.teacherName === teacherName ||
              (matchedTeacher?.assignedCircleNames || []).includes(c.name)
          );
    const finalCircles = scopedCircles.length > 0 ? scopedCircles : circles;
    const circleNamesSet = new Set(finalCircles.map((c) => c.name));

    const scopedStudents =
      currentStaffTier === 'owner' && !teacherEmail
        ? students
        : students.filter(
            (s) =>
              (s.assignedTeacherEmail &&
                s.assignedTeacherEmail.toLowerCase() === targetEmail) ||
              s.assignedTeacherName === teacherName ||
              circleNamesSet.has(s.circle)
          );
    const finalStudents = scopedStudents.length > 0 ? scopedStudents : students;
    const studentIdsSet = new Set(finalStudents.map((s) => s.id));
    const scopedSessions = sessions.filter((ses) =>
      studentIdsSet.has(ses.studentId)
    );
    const scopedExams = exams.filter((ex) => studentIdsSet.has(ex.studentId));
    const scopedIjazahs = ijazahs.filter((ij) => studentIdsSet.has(ij.studentId));
    const scopedTasks = tasks.filter(
      (tsk) => !tsk.studentId || studentIdsSet.has(tsk.studentId)
    );

    exportDataToJsonBackup({
      students: finalStudents,
      sessions: scopedSessions,
      circles: finalCircles,
      exams: scopedExams,
      ijazahs: scopedIjazahs,
      tasks: scopedTasks,
      settings,
      filenamePrefix: `teacher-backup-${
        targetEmail ? targetEmail.split('@')[0] : 'sheikh'
      }`,
    });

    recordAuditLog(
      'إعدادات وحلقات',
      `تنزيل نسخة احتياطية JSON لطلاب وحلقات المحفظ (${teacherName}) — ${finalStudents.length} طالباً و ${finalCircles.length} حلقات`,
      teacherName,
      'المعلم'
    );
    showToast(
      `📥 تم تنزيل نسخة JSON لطلابك (${finalStudents.length} طالباً) وحلقاتك (${finalCircles.length} حلقات) بنجاح ✓`,
      'success'
    );
  };

  const importTeacherScopedJsonBackup = (
    data: unknown,
    teacherEmail?: string
  ): boolean => {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    if (!Array.isArray(obj.students)) return false;

    const normalized = normalizePortableBackupPayload(
      obj,
      settings,
      circles,
      getCurrentMonthKey()
    );
    if (!normalized) return false;

    const targetEmail = (teacherEmail || activeStaffEmail || '').trim().toLowerCase();
    const matchedTeacher = managedTeachers.find(
      (t) => t.email.toLowerCase() === targetEmail
    );
    const teacherName = matchedTeacher?.name || settings.teacherName;

    const taggedStudents = normalized.students.map((st) => ({
      ...st,
      assignedTeacherEmail: st.assignedTeacherEmail || targetEmail || undefined,
      assignedTeacherName: st.assignedTeacherName || teacherName,
    }));

    setStudents((prev) => {
      const map = new Map<string, Student>();
      prev.forEach((s) => map.set(s.id, s));
      taggedStudents.forEach((s) => map.set(s.id, s));
      return Array.from(map.values());
    });

    setCircles((prev) => {
      const map = new Map<string, CircleGroup>();
      prev.forEach((c) => map.set(c.id, c));
      normalized.circles.forEach((c) => map.set(c.id, c));
      return Array.from(map.values());
    });

    setSessions((prev) => {
      const map = new Map<string, SessionRecord>();
      prev.forEach((s) => map.set(s.id, s));
      normalized.sessions.forEach((s) => map.set(s.id, s));
      return Array.from(map.values());
    });

    if (taggedStudents.length > 0) {
      setSelectedStudentId(taggedStudents[0].id);
    }

    recordAuditLog(
      'إعدادات وحلقات',
      `رفع واستعادة نسخة JSON لطلاب وحلقات المحفظ (${teacherName}) — تم دمج ${taggedStudents.length} طالباً و ${normalized.circles.length} حلقات ومزامنتها سحابياً`,
      teacherName,
      'المعلم'
    );
    showToast(
      `📤 تم رفع واستعادة نسخة JSON لطلابك (${taggedStudents.length} طالباً) وحلقاتك (${normalized.circles.length} حلقات) ومزامنتها مع السحابة ✓`,
      'success'
    );
    void triggerCloudSyncNow(false);
    return true;
  };

  const saveStudentPedagogicalProfile = (
    studentId: string,
    profile: StudentPedagogicalProfile
  ) => {
    setStudents((prev) =>
      prev.map((st) =>
        st.id === studentId
          ? {
              ...st,
              pedagogicalProfile: profile,
            }
          : st
      )
    );
    const targetName = students.find((s) => s.id === studentId)?.name || 'طالب';
    recordAuditLog(
      'تعديل بيانات طالب',
      `تحديث بطاقة التشخيص التربوي ونمط التعلم (${profile.learningStyle} — ${profile.suggestedTrack})`,
      targetName,
      'المعلم'
    );
    showToast(
      `🧠 تم حفظ بطاقة التشخيص التربوي للطالب (${targetName}): نمط ${profile.learningStyle} • المسار المقترح: ${profile.suggestedTrack}`,
      'success'
    );
  };

  const publishFamilyGuidanceToGuardian = (
    studentId: string,
    note: {
      title: string;
      categoryLabel: string;
      bodyText: string;
      targetLetterOrSurah?: string;
    }
  ): PublishedFamilyGuidanceNote => {
    const created: PublishedFamilyGuidanceNote = {
      id: `fgn-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: note.title,
      categoryLabel: note.categoryLabel,
      bodyText: note.bodyText,
      createdAt: getLocalDateString(0),
      teacherName: settings.teacherName,
      targetLetterOrSurah: note.targetLetterOrSurah,
    };
    setStudents((prev) =>
      prev.map((st) =>
        st.id === studentId
          ? {
              ...st,
              publishedFamilyGuidance: [
                created,
                ...(st.publishedFamilyGuidance || []),
              ].slice(0, 12),
            }
          : st
      )
    );
    const targetName = students.find((s) => s.id === studentId)?.name || 'طالب';
    showToast(
      `👨‍👩‍👧 تم نشر بطاقة «توجيه تربوي للأسرة» في بوابة ولي أمر الطالب (${targetName}) بنجاح`,
      'success'
    );
    return created;
  };

  // WhatsApp Offline Outbox Queue Implementation
  const [pendingOutboxMessages, setPendingOutboxMessages] = useState<OutboxMessage[]>(() => {
    try {
      const raw = localStorage.getItem('imam_whatsapp_outbox_queue_v1');
      if (raw) return JSON.parse(raw) as OutboxMessage[];
    } catch {
      // ignore
    }
    return [];
  });

  const queueOutboxMessage = (msg: Omit<OutboxMessage, 'id' | 'createdAt' | 'status'>) => {
    const newMsg: OutboxMessage = {
      ...msg,
      id: `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      status: 'queued',
    };
    setPendingOutboxMessages((prev) => {
      const updated = [newMsg, ...prev];
      try {
        localStorage.setItem('imam_whatsapp_outbox_queue_v1', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast(`تم حفظ الرسالة في طابور رسائل واتساب الأوفلاين (${msg.recipientName})`, 'info');
  };

  const sendOutboxMessage = (id: string) => {
    const item = pendingOutboxMessages.find((m) => m.id === id);
    if (!item) return;
    const cleanPhone = item.recipientPhone.replace(/\D/g, '');
    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(item.text)}`;
    window.open(url, '_blank');
    setPendingOutboxMessages((prev) => {
      const updated = prev.filter((m) => m.id !== id);
      try {
        localStorage.setItem('imam_whatsapp_outbox_queue_v1', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast(`تم إرسال رسالة ${item.recipientName} عبر واتساب بنجاح`, 'success');
  };

  const sendAllQueuedMessages = () => {
    if (pendingOutboxMessages.length === 0) return;
    pendingOutboxMessages.forEach((item) => {
      const cleanPhone = item.recipientPhone.replace(/\D/g, '');
      const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(item.text)}`;
      window.open(url, '_blank');
    });
    setPendingOutboxMessages([]);
    try {
      localStorage.removeItem('imam_whatsapp_outbox_queue_v1');
    } catch {}
    showToast('تم إرسال كافة رسائل طابور واتساب بنجاح', 'success');
  };

  const deleteOutboxMessage = (id: string) => {
    setPendingOutboxMessages((prev) => {
      const updated = prev.filter((m) => m.id !== id);
      try {
        localStorage.setItem('imam_whatsapp_outbox_queue_v1', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  useEffect(() => {
    const handleOnline = () => {
      if (pendingOutboxMessages.length > 0) {
        showToast(
          `🌿 عاد الاتصال بالإنترنت! لديك ${pendingOutboxMessages.length} رسائل في طابور واتساب جاهزة للإرسال`,
          'info'
        );
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [pendingOutboxMessages.length]);

  // Smart Quiz & Peer-to-Peer Competitions Engine
  const [peerCompetitions, setPeerCompetitions] = useState<PeerCompetitionPack[]>(() => {
    try {
      const saved = localStorage.getItem('imam_peer_competitions_v1');
      if (saved) {
        const parsed = JSON.parse(saved) as PeerCompetitionPack[];
        if (Array.isArray(parsed)) {
          return parsed.filter((c) => !DEFAULT_SEED_COMP_IDS.has(c.id));
        }
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('imam_peer_competitions_v1', JSON.stringify(peerCompetitions));
    } catch {}
  }, [peerCompetitions]);

  const createPeerCompetitionPack = (packInput: {
    title: string;
    description: string;
    targetLevel: StudentLevel | 'الكل';
    scopeLabel: string;
    questions: SmartQuizQuestion[];
    timeLimitSeconds: number;
    xpRewardFirst: number;
    xpRewardParticipant: number;
    badgeTitle: string;
  }): PeerCompetitionPack => {
    const newPack: PeerCompetitionPack = {
      id: `comp-pack-${Date.now()}`,
      title: packInput.title.trim(),
      description: packInput.description.trim(),
      targetLevel: packInput.targetLevel,
      scopeLabel: packInput.scopeLabel,
      questions: packInput.questions,
      timeLimitSeconds: packInput.timeLimitSeconds,
      xpRewardFirst: packInput.xpRewardFirst,
      xpRewardParticipant: packInput.xpRewardParticipant,
      badgeTitle: packInput.badgeTitle.trim() || '🏆 وسام المسابقة القرآنية',
      status: 'نشطة',
      createdAt: getLocalDateString(0),
      submissions: [],
    };
    setPeerCompetitions((prev) => [newPack, ...prev]);
    recordAuditLog(
      'تعديل طالب',
      `إطلاق مسابقة تنافسية وحقيبة اختبارية جماعية: (${newPack.title}) لمستوى (${newPack.targetLevel})`,
      newPack.title
    );
    showToast(`🏆 تم إطلاق المسابقة التنافسية (${newPack.title}) لطلاب الحلقات بنجاح!`, 'success');
    return newPack;
  };

  const submitPeerCompetitionResult = (params: {
    competitionId: string;
    studentId: string;
    correctCount: number;
    totalQuestions: number;
    timeSeconds: number;
  }): PeerCompetitionSubmission | null => {
    const { competitionId, studentId, correctCount, totalQuestions, timeSeconds } = params;
    const st = students.find((s) => s.id === studentId);
    const comp = peerCompetitions.find((c) => c.id === competitionId);
    if (!st || !comp) return null;

    const accuracyScore = Math.round((correctCount / Math.max(1, totalQuestions)) * 100);
    // Speed bonus: faster completion gives up to +100 speed rank points
    const speedBonus = Math.max(5, Math.min(100, Math.round(120 - timeSeconds)));
    const compositeRankPoints = accuracyScore + (accuracyScore >= 50 ? speedBonus : 0);

    const rawSubmission: PeerCompetitionSubmission = {
      id: `comp-sub-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      competitionId,
      studentId: st.id,
      studentName: st.name,
      circleName: st.circle,
      level: st.level,
      score: accuracyScore,
      correctCount,
      totalQuestions,
      timeSeconds: Math.max(3, timeSeconds),
      compositeRankPoints,
      completedAt: getLocalDateString(0),
    };

    let awardedCupLabel: PeerCompetitionSubmission['awardedCup'] = '🎖️ وسام التميز';

    setPeerCompetitions((prev) =>
      prev.map((c) => {
        if (c.id !== competitionId) return c;
        // Replace existing submission by same student if higher score, or append
        const others = c.submissions.filter((sub) => sub.studentId !== st.id);
        const merged = [...others, rawSubmission].sort(
          (a, b) => b.compositeRankPoints - a.compositeRankPoints || a.timeSeconds - b.timeSeconds
        );
        const ranked = merged.map((item, idx) => {
          const cup: PeerCompetitionSubmission['awardedCup'] =
            idx === 0
              ? '🏆 الكأس الذهبي'
              : idx === 1
              ? '🥈 الكأس الفضي'
              : idx === 2
              ? '🥉 الكأس البرونزي'
              : '🎖️ وسام التميز';
          if (item.studentId === st.id) {
            awardedCupLabel = cup;
          }
          return {
            ...item,
            awardedCup: cup,
          };
        });
        return {
          ...c,
          submissions: ranked,
        };
      })
    );

    const xpEarned =
      (awardedCupLabel as string) === '🏆 الكأس الذهبي'
        ? comp.xpRewardFirst
        : comp.xpRewardParticipant;
    const badgeToAward = `${awardedCupLabel} — ${comp.badgeTitle}`;

    // Automatically award XP and Cup/Badge to the student's profile!
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== st.id) return s;
        const existingBadges = s.badges || [];
        const nextBadges = existingBadges.includes(badgeToAward)
          ? existingBadges
          : [badgeToAward, ...existingBadges];
        return {
          ...s,
          xpPoints: (s.xpPoints || 120) + xpEarned,
          badges: nextBadges,
          hasGoldenCrown:
            (awardedCupLabel as string) === '🏆 الكأس الذهبي' ? true : s.hasGoldenCrown,
        };
      })
    );

    showToast(
      `🎉 أحسنت يا (${st.name})! الدقة ${accuracyScore}% في ${timeSeconds} ثانية — نلت (${awardedCupLabel}) و +${xpEarned} نقطة همة XP!`,
      'success'
    );

    return {
      ...rawSubmission,
      awardedCup: awardedCupLabel,
    };
  };

  const deletePeerCompetitionPack = (id: string) => {
    setPeerCompetitions((prev) => prev.filter((c) => c.id !== id));
    showToast('تم حذف المسابقة التنافسية من القائمة', 'info');
  };

  // Multi-Portal URL Routing State & Dynamic PWA Manifest Sync
  const [activePortalRoute, setActivePortalRouteState] = useState<PortalRoute>(() => {
    const detected = detectPortalRouteFromLocation();
    return detected || 'general';
  });

  const setActivePortalRoute = (route: PortalRoute) => {
    setActivePortalRouteState(route);
    updatePortalManifest(route);
    if (route === 'almushaf' || route === 'sadaqa') {
      setPublicMushafPortalOpen(true);
    } else if (route === 'owner') {
      setPublicMushafPortalOpen(false);
      if (isLoggedIn && currentStaffTier === 'owner') {
        setActiveTab('owner_panel');
      }
    } else if (route === 'general') {
      setPublicMushafPortalOpen(false);
    }
  };

  // On initial boot, read pathname case-insensitively and route + update dynamic manifest
  useEffect(() => {
    const initialRoute = detectPortalRouteFromLocation();
    if (initialRoute) {
      setActivePortalRouteState(initialRoute);
      updatePortalManifest(initialRoute);
      if (initialRoute === 'almushaf' || initialRoute === 'sadaqa') {
        setPublicMushafPortalOpen(true);
      } else if (initialRoute === 'owner' && isLoggedIn && currentStaffTier === 'owner') {
        setActiveTab('owner_panel');
      }
    } else {
      updatePortalManifest(
        publicMushafPortalOpen
          ? 'almushaf'
          : userRole === 'guardian'
          ? 'guardian'
          : userRole === 'student'
          ? 'student'
          : currentStaffTier === 'owner'
          ? 'owner'
          : 'general'
      );
    }
  }, []);

  // Hierarchical Role-Mode Switcher State (Owner -> Owner/Supervisor/Teacher | Supervisor -> Supervisor/Teacher | Teacher -> Teacher)
  const [activeRoleMode, setActiveRoleModeState] = useState<ActiveRoleMode>(() =>
    currentStaffTier === 'owner'
      ? 'owner_mode'
      : currentStaffTier === 'supervisor'
      ? 'supervisor_mode'
      : 'teacher_mode'
  );

  useEffect(() => {
    if (currentStaffTier === 'owner') {
      setActiveRoleModeState('owner_mode');
    } else if (currentStaffTier === 'supervisor') {
      setActiveRoleModeState((prev) =>
        prev === 'owner_mode' ? 'supervisor_mode' : prev
      );
    } else {
      setActiveRoleModeState('teacher_mode');
    }
  }, [currentStaffTier]);

  const setActiveRoleMode = (mode: ActiveRoleMode) => {
    if (currentStaffTier === 'teacher' && mode !== 'teacher_mode') {
      showToast('وضع الإشراف والإدارة العليا غير متاح لحساب المحفظ', 'error');
      return;
    }
    if (currentStaffTier === 'supervisor' && mode === 'owner_mode') {
      showToast('الوضع الإداري للمالك متاح لمالك الأكاديمية فقط', 'error');
      return;
    }
    setActiveRoleModeState(mode);
    if (mode === 'teacher_mode') {
      if (activeTab === 'owner_panel' || activeTab === 'finance') {
        setActiveTab('session');
      }
      showToast(
        '📖 تم التبديل إلى وضع المحفظ — واجهة التسميع الخماسي والسبورة والحلقات جاهزة الآن',
        'info'
      );
    } else if (mode === 'supervisor_mode') {
      showToast('🛡️ تم التبديل إلى وضع المشرف العام لمتابعة الحلقات والطلاب', 'info');
    } else {
      showToast('👑 تم التبديل إلى الوضع الإداري الأعلى لمالك الأكاديمية', 'success');
    }
  };

  // Guardian & Student Access Code Requests State (`access_code_requests`)
  const [accessCodeRequests, setAccessCodeRequests] = useState<AccessCodeRequest[]>(() => {
    try {
      const raw = localStorage.getItem(ACCESS_CODE_REQUESTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AccessCodeRequest[];
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (r) =>
              r.id !== 'req-seed-1' &&
              (!r.matchedStudentId || !DEFAULT_SEED_STUDENT_IDS.has(r.matchedStudentId))
          );
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        ACCESS_CODE_REQUESTS_STORAGE_KEY,
        JSON.stringify(accessCodeRequests)
      );
    } catch {
      // ignore
    }
  }, [accessCodeRequests]);

  // Play a gentle Web Audio API notification chime when a new access code request arrives
  const playNotificationChime = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // ignore audio context restriction
    }
  };

  useEffect(() => {
    const unsub = subscribeToAccessCodeRequestsFromFirestore((incomingList) => {
      if (!Array.isArray(incomingList) || incomingList.length === 0) return;
      setAccessCodeRequests((prev) => {
        const map = new Map<string, AccessCodeRequest>();
        prev.forEach((item) => map.set(item.id, item));
        let hasNewPending = false;
        incomingList.forEach((item) => {
          if (!map.has(item.id) && item.status === 'pending') {
            hasNewPending = true;
          }
          map.set(item.id, item);
        });
        if (hasNewPending && isLoggedIn && userRole === 'teacher') {
          playNotificationChime();
        }
        return Array.from(map.values()).sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        );
      });
    });
    return () => unsub();
  }, [isLoggedIn, userRole]);

  const submitAccessCodeRequest = (input: {
    studentName: string;
    guardianPhone: string;
    circleOrTeacherName?: string;
    portalType?: 'guardian' | 'student';
  }): AccessCodeRequest => {
    const cleanName = (input.studentName || '').trim();
    const cleanPhone = (input.guardianPhone || '').replace(/\D/g, '');
    const phoneTail = cleanPhone.slice(-9);

    // Search students automatically by name or phone
    const matchedStudent = students.find((st) => {
      const stPhone = (st.whatsappPhone || st.guardianPhone || '').replace(/\D/g, '');
      const phoneMatch = phoneTail.length >= 7 && stPhone.endsWith(phoneTail);
      const nameMatch =
        cleanName.length >= 3 &&
        (st.name.includes(cleanName) || cleanName.includes(st.name));
      return phoneMatch || nameMatch;
    });

    const matchedCircle = matchedStudent
      ? circles.find((c) => c.name === matchedStudent.circle)
      : undefined;

    const now = new Date();
    const createdAtStr = `${getLocalDateString(0)} ${String(now.getHours()).padStart(
      2,
      '0'
    )}:${String(now.getMinutes()).padStart(2, '0')}`;

    const studentCodeVal = matchedStudent
      ? matchedStudent.code || `IMAM-${matchedStudent.id.toUpperCase()}`
      : `IMAM-${Math.floor(1000 + Math.random() * 9000)}`;
    const studentPinVal = matchedStudent
      ? matchedStudent.guardianPin || '123456'
      : String(Math.floor(100000 + Math.random() * 900000));

    const newReq: AccessCodeRequest = {
      id: `acreq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      studentName: cleanName || matchedStudent?.name || 'طالب الأكاديمية',
      guardianPhone: cleanPhone || input.guardianPhone.trim(),
      circleOrTeacherName:
        input.circleOrTeacherName?.trim() ||
        matchedStudent?.circle ||
        matchedCircle?.teacherName ||
        settings.teacherName,
      portalType: input.portalType || 'guardian',
      status: 'pending',
      matchedStudentId: matchedStudent?.id,
      matchedStudentName: matchedStudent?.name,
      matchedStudentCode: studentCodeVal,
      matchedStudentPin: studentPinVal,
      matchedCircleName: matchedStudent?.circle,
      matchedTeacherName:
        matchedStudent?.assignedTeacherName ||
        matchedCircle?.teacherName ||
        settings.teacherName,
      createdAt: createdAtStr,
    };

    setAccessCodeRequests((prev) => [newReq, ...prev]);
    void syncAccessCodeRequestToFirestore(newReq);
    playNotificationChime();
    showToast(
      `🔑 تم تسجيل طلب كود الدخول للطالب (${newReq.studentName}) وإشعار الشيخ المحفظ والمشرف فوراً ✓`,
      'success'
    );
    return newReq;
  };

  const resolveAccessCodeRequestAndSendWhatsApp = (requestId: string) => {
    const req = accessCodeRequests.find((r) => r.id === requestId);
    if (!req) return null;

    // Re-check student match or generate code/pin
    const cleanPhone = (req.guardianPhone || '').replace(/\D/g, '');
    const phoneTail = cleanPhone.slice(-9);
    const matchedStudent =
      students.find((s) => s.id === req.matchedStudentId) ||
      students.find((st) => {
        const stPhone = (st.whatsappPhone || st.guardianPhone || '').replace(
          /\D/g,
          ''
        );
        return (
          (phoneTail.length >= 7 && stPhone.endsWith(phoneTail)) ||
          st.name.includes(req.studentName) ||
          req.studentName.includes(st.name)
        );
      });

    const finalStudentName = matchedStudent?.name || req.studentName;
    const finalCode =
      matchedStudent?.code ||
      req.matchedStudentCode ||
      (matchedStudent ? `IMAM-${matchedStudent.id.toUpperCase()}` : 'IMAM-101');
    const finalPin =
      matchedStudent?.guardianPin ||
      req.matchedStudentPin ||
      String(Math.floor(100000 + Math.random() * 900000));
    const finalPhoneForLogin =
      matchedStudent?.whatsappPhone || cleanPhone || req.guardianPhone;

    if (matchedStudent && (!matchedStudent.guardianPin || !matchedStudent.code)) {
      setStudents((prev) =>
        prev.map((s) =>
          s.id === matchedStudent.id
            ? { ...s, guardianPin: finalPin, code: finalCode, pin: finalPin }
            : s
        )
      );
    }

    const portalUrl =
      req.portalType === 'student'
        ? 'https://welivequranacademy.online/student'
        : 'https://welivequranacademy.online/Guardian';

    const messageText = `السلام عليكم ورحمة الله وبركاته، مرحباً بكم في أكاديمية الإمام لتحفيظ القرآن الكريم (بالقرآن نحيا). إليكم بيانات الدخول الخاصة بمتابعة الطالب ${finalStudentName}: رابط بوابة ولي الأمر: ${portalUrl} | رقم الهاتف المسجل: ${finalPhoneForLogin} | كود الطالب: ${finalCode} | رمز الدخول السري (PIN): ${finalPin}`;

    const targetWhatsAppPhone =
      cleanPhone.length >= 8 ? cleanPhone : matchedStudent?.whatsappPhone || '201068631966';
    const whatsappUrl = `https://wa.me/${targetWhatsAppPhone}?text=${encodeURIComponent(
      messageText
    )}`;

    const now = new Date();
    const resolvedAtStr = `${getLocalDateString(0)} ${String(
      now.getHours()
    ).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const updatedReq: AccessCodeRequest = {
      ...req,
      status: 'resolved',
      matchedStudentId: matchedStudent?.id || req.matchedStudentId,
      matchedStudentName: finalStudentName,
      matchedStudentCode: finalCode,
      matchedStudentPin: finalPin,
      resolvedAt: resolvedAtStr,
    };

    setAccessCodeRequests((prev) =>
      prev.map((item) => (item.id === requestId ? updatedReq : item))
    );
    void syncAccessCodeRequestToFirestore(updatedReq);

    queueOutboxMessage({
      recipientName: `ولي أمر ${finalStudentName}`,
      recipientPhone: targetWhatsAppPhone,
      text: messageText,
      type: 'credentials',
    });

    showToast(
      `⚡ تم تجهيز كود الدخول (${finalPin}) للطالب (${finalStudentName}) وفتح محادثة واتساب لولي الأمر ✓`,
      'success'
    );

    return {
      whatsappUrl,
      studentCode: finalCode,
      studentPin: finalPin,
      studentName: finalStudentName,
    };
  };

  const deleteAccessCodeRequest = (requestId: string) => {
    setAccessCodeRequests((prev) => prev.filter((r) => r.id !== requestId));
  };

  const clearAllStudentsAndStartEmpty = () => {
    setStudents([]);
    setCircles([]);
    setSessions([]);
    setExams([]);
    setIjazahs([]);
    setTasks([]);
    setBoardStrokes({});
    setTeacherRatings([]);
    setHomeSubmissions([]);
    setAdmissionRequests([]);
    setAuditLogs([]);
    setAccessCodeRequests([]);
    setPeerCompetitions([]);
    setPublicBookmarks([]);
    setPublicVisitors([]);
    setSelectedStudentId(null);
    void triggerCloudSyncNow(false);
    showToast('تم مسح كافة البيانات الافتراضية والتجريبية وبدء نظام جديد فارغ تماماً', 'info');
  };

  return (
    <AcademyContext.Provider
      value={{
        isLoggedIn,
        userRole,
        guardianStudentId,
        guardianSiblings,
        googleAuthUser,
        loginAsTeacher,
        loginWithGoogleEmail,
        startGoogleOAuthRedirect,
        startMicrosoftOAuthRedirect,
        submitNewStaffJoinRequest,
        saveCurrentUserFamilyProfileToFirestore,
        loginAsGuardian,
        loginAsGuardianDirect,
        loginAsGuest,
        logout,
        activeTab,
        setActiveTab,
        selectedStudentId,
        setSelectedStudentId,
        isStaffPortalPreview,
        setIsStaffPortalPreview,
        toastMessage,
        showToast,
        quickSearchOpen,
        setQuickSearchOpen,
        isFullScreenFocus,
        setIsFullScreenFocus,
        isDeveloperModalOpen,
        setIsDeveloperModalOpen,
        students:
          currentStaffTier === 'teacher' &&
          userRole === 'teacher' &&
          (() => {
            const activeTeacher = managedTeachers.find(
              (t) => t.email.toLowerCase() === activeStaffEmail.toLowerCase()
            );
            return Boolean(
              (activeTeacher?.restrictToAssignedCircles ||
                currentTeacherPermissions.restrictToAssignedCircles) &&
                activeTeacher?.assignedCircleNames &&
                activeTeacher.assignedCircleNames.length > 0
            );
          })()
            ? students.filter((s) => {
                const activeTeacher = managedTeachers.find(
                  (t) => t.email.toLowerCase() === activeStaffEmail.toLowerCase()
                );
                return (
                  activeTeacher?.assignedCircleNames?.includes(s.circle) ||
                  s.assignedTeacherEmail?.toLowerCase() ===
                    activeStaffEmail.toLowerCase()
                );
              })
            : students,
        sessions,
        circles:
          currentStaffTier === 'teacher' &&
          userRole === 'teacher' &&
          (() => {
            const activeTeacher = managedTeachers.find(
              (t) => t.email.toLowerCase() === activeStaffEmail.toLowerCase()
            );
            return Boolean(
              (activeTeacher?.restrictToAssignedCircles ||
                currentTeacherPermissions.restrictToAssignedCircles) &&
                activeTeacher?.assignedCircleNames &&
                activeTeacher.assignedCircleNames.length > 0
            );
          })()
            ? circles.filter((c) => {
                const activeTeacher = managedTeachers.find(
                  (t) => t.email.toLowerCase() === activeStaffEmail.toLowerCase()
                );
                return activeTeacher?.assignedCircleNames?.includes(c.name);
              })
            : circles,
        exams,
        ijazahs,
        tasks,
        settings,
        boardStrokes,
        teacherRatings,
        homeSubmissions,
        admissionRequests,
        auditLogs,
        managedTeachers,
        currentStaffTier,
        setCurrentStaffTier,
        activeStaffEmail,
        setActiveStaffEmail,
        currentTeacherPermissions,
        effectiveTeacherPermissions: currentTeacherPermissions,
        cloudSyncStatus,
        lastSyncTimestamp,
        triggerCloudSyncNow,
        restoreFromCloudFirestoreNow,
        exportTeacherScopedJsonBackup,
        importTeacherScopedJsonBackup,
        updateTeacherAccessStatus,
        deleteStaffMember,
        addStaffMember,
        updateStaffFamilyDetails,
        updateStaffRoleAndDetails,
        updateSupervisorPermissions,
        updateTeacherPermissions,
        resetTeacherCustomPermissions,
        updateStudentPrivacyPreference,
        applyBulkStudentPrivacyPreference,
        assignStudentToTeacher,
        syncAllStaffToFirestoreNow,
        linkStudentGoogleAccount,
        sessionReminderPreview,
        setSessionReminderPreview,
        teacherAlerts,
        triggerPushReminderNow,
        lateSessionAlerts,
        lastLateSessionCheckTime,
        triggerFirestoreLateCheckNow,
        scheduleOrSendStudentMissedCirclePushNotification,
        teacherCircleCronAlerts,
        lastTeacherCronCheckTime,
        markRecitationEngineStartedInFirestore,
        runTeacherCircleStartCronCheck,
        lastScheduleBoardSyncAt,
        rescheduleSessionOrCircleViaDragDrop,
        logQuickSurahRevisionInTracker,
        bulkLogJuzRevisionInTracker,
        saveStudent,
        updateStudent,
        deleteStudent,
        setStudentAccountStatus,
        updateErrorFollowUpStatus,
        saveSession,
        saveCircle,
        deleteCircle,
        assignStudentToCircle,
        saveExam,
        saveIjazah,
        saveTask,
        addTask: saveTask,
        toggleTask,
        deleteTask,
        updateStudentFee,
        addDisciplineWarning,
        updateSettings,
        saveBoardStrokes,
        saveTeacherRating,
        saveHomeSubmission,
        markHomeSubmissionReviewed,
        reviewHomeSubmission: markHomeSubmissionReviewed,
        addTimestampPinToHomeSubmission,
        submitAdmissionRequest,
        updateAdmissionRequestStatus,
        approveAdmissionAsStudent,
        recordAuditLog,
        updateStudentAccessibilityMode,
        addStudentXp,
        awardStudentBadge,
        toggleStudentGoldenCrown,
        promoteStudentFoundationLevel,
        toggleStudentFortressTask,
        linkStudentStopToAyah,
        addStudentCustomMutashabih,
        deleteStudentCustomMutashabih,
        updateCircleSubstituteAndSeason,
        studentAudioBlobs,
        saveStudentAudioBlob,
        loadStudentAudioBlobs,
        deleteStudentAudioBlob,
        saveStudentRecitationAudioClip,
        deleteStudentRecitationAudioClip,
        publicMushafPortalOpen,
        setPublicMushafPortalOpen,
        waqfImpactStats,
        publicVisitors,
        currentPublicVisitorId,
        publicBookmarks,
        recordWaqfAmeenPrayer,
        recordPublicWaqfActivity,
        recordPwaInstallEvent,
        recordOfflineDownloadEvent,
        savePublicBookmark,
        deletePublicBookmark,
        updatePublicVisitorWird,
        sendOwnerVisitorEncouragement,
        markVisitorEncouragementRead,
        saveStudentPedagogicalProfile,
        publishFamilyGuidanceToGuardian,
        resetToSeedData,
        clearAllStudentsAndStartEmpty,
        importFullBackup,
        pendingOutboxMessages,
        queueOutboxMessage,
        sendOutboxMessage,
        sendAllQueuedMessages,
        deleteOutboxMessage,
        peerCompetitions,
        createPeerCompetitionPack,
        submitPeerCompetitionResult,
        deletePeerCompetitionPack,
        activePortalRoute,
        setActivePortalRoute,
        activeRoleMode,
        setActiveRoleMode,
        accessCodeRequests,
        submitAccessCodeRequest,
        resolveAccessCodeRequestAndSendWhatsApp,
        deleteAccessCodeRequest,
      }}
    >
      {children}
      <DeveloperSupportModal
        isOpen={isDeveloperModalOpen}
        onClose={() => setIsDeveloperModalOpen(false)}
      />
    </AcademyContext.Provider>
  );
};

export const useAcademy = () => {
  const ctx = useContext(AcademyContext);
  if (!ctx) throw new Error('useAcademy must be used inside AcademyProvider');
  return ctx;
};
