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
import realAcademyBackup from './realAcademyBackup.json';

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
  teacherName: 'الشيخ السيد الكومي',
  academyName: 'أكاديمية الإمام لتحفيظ القرآن الكريم',
  tagline: 'بالقرآن نحيا',
  officialWhatsappPhone: '201095782616',
  teacherPin: '1234',
  theme: 'light',
  fontSize: 'md',
  defaultReciter: 'Alafasy_128kbps',
  weeklyGoals: {
    newAyatTarget: 40,
    reviewsTarget: 6,
    sessionsTarget: 8,
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

export const INITIAL_SETTINGS: AcademySettings = {
  ...BASE_SETTINGS,
  ...(realAcademyBackup.settings as Partial<AcademySettings>),
  supervisorPermissions: DEFAULT_SUPERVISOR_PERMISSIONS,
  teacherPermissions: DEFAULT_TEACHER_PERMISSIONS,
};

export const INITIAL_CIRCLES: CircleGroup[] =
  realAcademyBackup.circles as unknown as CircleGroup[];

export const INITIAL_STUDENTS: Student[] =
  realAcademyBackup.students as unknown as Student[];

export const INITIAL_SESSIONS: SessionRecord[] =
  realAcademyBackup.sessions as unknown as SessionRecord[];

export const INITIAL_EXAMS: ExamRecord[] = [];

export const INITIAL_IJAZAHS: IjazahRecord[] = [];

export const INITIAL_TASKS: TaskItem[] = [];

export const INITIAL_TEACHER_RATINGS: TeacherRatingRecord[] = [];

export const INITIAL_HOME_SUBMISSIONS: HomePracticeSubmission[] = [];
