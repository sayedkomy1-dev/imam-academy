import {
  AcademySettings,
  CircleGroup,
  ExamRecord,
  HomePracticeSubmission,
  IjazahRecord,
  SessionRecord,
  Student,
  TaskItem,
  TeacherRatingRecord,
} from '../types';

export function getLocalDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getCurrentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const DEFAULT_SUPERVISOR_PERMISSIONS = {
  canViewAllTeachersStudents: true,
  canAccessAndExportBackups: false,
  canManageTeachers: true,
  canManageStudentsAndAdmissions: true,
  canViewFinancialRecords: false,
  canViewSensitiveStudentContact: false,
};

export const DEFAULT_TEACHER_PERMISSIONS = {
  canAddAndEditStudents: true,
  canExportTeacherJsonBackup: true,
  canImportTeacherJsonBackup: true,
  canCreateAndEditCircles: true,
  canIssueExamsAndCertificates: true,
  canManageStudentFees: false,
  canApproveAdmissionRequests: false,
  restrictToAssignedCircles: false,
  canAccessFinanceSection: false,
  canManageCompetitionsAndQuizzes: true,
  canDeleteOrEditCoreStudentData: true,
  canExportDatabaseBackups: true,
};

const BASE_SETTINGS: AcademySettings = {
  teacherName: 'المعلم المشرف',
  academyName: 'أكاديمية الإمام لتحفيظ القرآن الكريم',
  tagline: 'بالقرآن نحيا',
  officialWhatsappPhone: '01000000000',
  teacherPin: '1234',
  theme: 'light',
  fontSize: 'md',
  defaultReciter: 'Alafasy_128kbps',
  weeklyGoals: {
    newAyatTarget: 150,
    reviewsTarget: 24,
    sessionsTarget: 25,
    attendanceTarget: 92,
  },
  whatsappHeader:
    'السلام عليكم ورحمة الله وبركاته 🌿\nتحية طيبة من *أكاديمية الإمام لتحفيظ القرآن الكريم — بالقرآن نحيا*',
  whatsappFooter:
    'بارك الله فيكم وجعل أبناءنا وأبناءكم من أهل القرآن وخاصته 🤲',
  notificationsEnabled: true,
  notifyOverdueTasks: true,
  notifyUrgentStudents: true,
  reminderIntervalMinutes: 30,
  showHijriDates: true,
  hidePersonalDataFromPublic: true,
  limitedSharingMode: false,
  maskStudentPhoneAndPin: true,
  hideFinancialDetailsInStudentPortal: false,
  hideFamilyLineageInPublicViews: true,
  supervisorPermissions: DEFAULT_SUPERVISOR_PERMISSIONS,
  teacherPermissions: DEFAULT_TEACHER_PERMISSIONS,
  autoCloudBackupEnabled: true,
};

export const INITIAL_SETTINGS: AcademySettings = BASE_SETTINGS;

export const INITIAL_CIRCLES: CircleGroup[] = [];

export const INITIAL_STUDENTS: Student[] = [];

export const INITIAL_SESSIONS: SessionRecord[] = [];

export const INITIAL_EXAMS: ExamRecord[] = [];

export const INITIAL_IJAZAHS: IjazahRecord[] = [];

export const INITIAL_TASKS: TaskItem[] = [];

export const INITIAL_TEACHER_RATINGS: TeacherRatingRecord[] = [];

export const INITIAL_HOME_SUBMISSIONS: HomePracticeSubmission[] = [];
