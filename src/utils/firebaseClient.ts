import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  initializeFirestore,
  setLogLevel,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import defaultFirebaseConfig from '../../firebase-applet-config.json';
import {
  AccessCodeRequest,
  CustomFirebaseConfigInput,
  MASTER_OWNER_EMAILS,
  StaffAuthProvider,
  StaffHierarchyRole,
  TeacherAccessRecord,
} from '../types';

export { MASTER_OWNER_EMAILS };

export const CUSTOM_FIREBASE_CONFIG_STORAGE_KEY =
  'imam_custom_firebase_config_v1';

export function isMasterOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return (
    MASTER_OWNER_EMAILS.some((m) => m.toLowerCase() === clean) ||
    clean === 'info.welivequran@gmail.com'
  );
}

export function getEffectiveFirebaseConfig(): CustomFirebaseConfigInput & {
  firestoreDatabaseId: string;
  isCustom: boolean;
  config: CustomFirebaseConfigInput & { firestoreDatabaseId: string };
} {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(CUSTOM_FIREBASE_CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CustomFirebaseConfigInput>;
        if (parsed.apiKey && parsed.projectId && parsed.appId) {
          const cfg = {
            apiKey: parsed.apiKey.trim(),
            authDomain:
              (parsed.authDomain || `${parsed.projectId}.firebaseapp.com`).trim(),
            projectId: parsed.projectId.trim(),
            appId: parsed.appId.trim(),
            firestoreDatabaseId:
              (parsed.firestoreDatabaseId || defaultFirebaseConfig.firestoreDatabaseId || '(default)').trim(),
          };
          return {
            ...cfg,
            isCustom: true,
            config: cfg,
          };
        }
      }
    } catch {
      // ignore local storage parse errors
    }
  }
  const defaultCfg = {
    apiKey: defaultFirebaseConfig.apiKey,
    authDomain: defaultFirebaseConfig.authDomain,
    projectId: defaultFirebaseConfig.projectId,
    appId: defaultFirebaseConfig.appId,
    firestoreDatabaseId: defaultFirebaseConfig.firestoreDatabaseId,
  };
  return {
    ...defaultCfg,
    isCustom: false,
    config: defaultCfg,
  };
}

export function saveCustomFirebaseConfig(config: CustomFirebaseConfigInput): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CUSTOM_FIREBASE_CONFIG_STORAGE_KEY,
      JSON.stringify({
        apiKey: config.apiKey.trim(),
        authDomain: config.authDomain.trim(),
        projectId: config.projectId.trim(),
        appId: config.appId.trim(),
        firestoreDatabaseId: config.firestoreDatabaseId?.trim() || '',
      })
    );
  } catch {
    // ignore storage errors
  }
}

export function resetCustomFirebaseConfig(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CUSTOM_FIREBASE_CONFIG_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const effectiveConfig = getEffectiveFirebaseConfig();

// Silence internal Firestore WebChannel/token retry console errors
setLogLevel('silent');

// Purge any stale cached Firebase Auth tokens in IndexedDB / Web Storage on startup
// so expired tokens never trigger securetoken.googleapis.com errors on boot
if (typeof window !== 'undefined') {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('firebase:')) {
        window.localStorage.removeItem(k);
      }
    }
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith('firebase:')) {
        window.sessionStorage.removeItem(k);
      }
    }
    if (window.indexedDB && typeof window.indexedDB.deleteDatabase === 'function') {
      window.indexedDB.deleteDatabase('firebaseLocalStorageDb');
    }
  } catch {
    // ignore storage errors
  }
}

const app = initializeApp({
  ...defaultFirebaseConfig,
  apiKey: effectiveConfig.apiKey,
  authDomain: effectiveConfig.authDomain,
  projectId: effectiveConfig.projectId,
  appId: effectiveConfig.appId,
});

function createCleanAuth() {
  try {
    return initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createCleanAuth();

export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  effectiveConfig.firestoreDatabaseId || defaultFirebaseConfig.firestoreDatabaseId
);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export const microsoftProvider = new OAuthProvider('microsoft.com');
microsoftProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Verifies that the current Firebase user can obtain a valid ID token without
 * failing due to a disabled `securetoken.googleapis.com` API in the project.
 * If token fetching fails with `token-service-api-has-not-been-used`, signs out
 * immediately so Firestore's credentials provider is not poisoned.
 */
async function ensureHealthyAuthToken(user: FirebaseUser | null): Promise<boolean> {
  if (!user) return false;
  try {
    await user.getIdToken();
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('token-service-api-has-not-been-used') ||
      msg.includes('securetoken.googleapis.com') ||
      msg.includes('Fetching auth token failed')
    ) {
      try {
        await signOut(auth);
      } catch {
        // ignore signOut error
      }
      return false;
    }
    return false;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: rawMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  const isTransientOrTokenService =
    rawMessage.includes('the client is offline') ||
    rawMessage.includes('Could not reach Cloud Firestore backend') ||
    rawMessage.includes('token-service-api-has-not-been-used') ||
    rawMessage.includes('securetoken.googleapis.com') ||
    rawMessage.includes('Fetching auth token failed') ||
    rawMessage.includes('unavailable');
  if (!isTransientOrTokenService) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot
async function testConnection() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  try {
    if (auth.currentUser) {
      await ensureHealthyAuthToken(auth.currentUser);
    }
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch {
    // Gracefully operate in local/offline-first mode when unauthenticated or offline
  }
}
void testConnection();

export interface ExtendedFamilyFields {
  motherName?: string;
  grandfatherName?: string;
  grandmotherName?: string;
  uncleName?: string;
}

export interface GoogleAuthResult extends ExtendedFamilyFields {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  emailVerified: boolean;
  isFirstGoogleLogin?: boolean;
}

/**
 * Persists or updates the authenticated user's profile in Firestore (`/user_profiles/{uid}`)
 * on first Google login (and subsequent updates), including extended family fields
 * (`motherName`, `grandfatherName`, `grandmotherName`, `uncleName`) linked to `uid`.
 */
export async function syncUserProfileToFirestore(
  user: FirebaseUser,
  role: 'teacher' | 'supervisor' | 'guardian' | 'student',
  family?: ExtendedFamilyFields
): Promise<ExtendedFamilyFields & { isFirstGoogleLogin: boolean }> {
  const cleanUid = (user.uid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  if (!cleanUid) return { isFirstGoogleLogin: false };
  if (!(await ensureHealthyAuthToken(user))) {
    return {
      isFirstGoogleLogin: false,
      motherName: family?.motherName,
      grandfatherName: family?.grandfatherName,
      grandmotherName: family?.grandmotherName,
      uncleName: family?.uncleName,
    };
  }

  const safeDisplayName = (
    user.displayName ||
    user.email?.split('@')[0] ||
    'مستخدم أكاديمية الإمام'
  ).slice(0, 120);

  const path = `user_profiles/${cleanUid}`;
  const ref = doc(db, 'user_profiles', cleanUid);

  try {
    const existingSnap = await getDoc(ref);
    const isFirstGoogleLogin = !existingSnap.exists();
    const existingData = existingSnap.exists()
      ? (existingSnap.data() as Record<string, unknown>)
      : {};

    const mergedMother = (
      family?.motherName !== undefined && family.motherName.trim() !== ''
        ? family.motherName.trim()
        : typeof existingData.motherName === 'string'
        ? existingData.motherName
        : family?.motherName ?? ''
    ).slice(0, 120);
    const mergedGrandfather = (
      family?.grandfatherName !== undefined && family.grandfatherName.trim() !== ''
        ? family.grandfatherName.trim()
        : typeof existingData.grandfatherName === 'string'
        ? existingData.grandfatherName
        : family?.grandfatherName ?? ''
    ).slice(0, 120);
    const mergedGrandmother = (
      family?.grandmotherName !== undefined && family.grandmotherName.trim() !== ''
        ? family.grandmotherName.trim()
        : typeof existingData.grandmotherName === 'string'
        ? existingData.grandmotherName
        : family?.grandmotherName ?? ''
    ).slice(0, 120);
    const mergedUncle = (
      family?.uncleName !== undefined && family.uncleName.trim() !== ''
        ? family.uncleName.trim()
        : typeof existingData.uncleName === 'string'
        ? existingData.uncleName
        : family?.uncleName ?? ''
    ).slice(0, 120);

    if (isFirstGoogleLogin) {
      await setDoc(ref, {
        uid: cleanUid,
        displayName: safeDisplayName,
        role,
        motherName: mergedMother,
        grandfatherName: mergedGrandfather,
        grandmotherName: mergedGrandmother,
        uncleName: mergedUncle,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName: safeDisplayName,
        role,
        motherName: mergedMother,
        grandfatherName: mergedGrandfather,
        grandmotherName: mergedGrandmother,
        uncleName: mergedUncle,
        updatedAt: serverTimestamp(),
      });
    }

    return {
      isFirstGoogleLogin,
      motherName: mergedMother,
      grandfatherName: mergedGrandfather,
      grandmotherName: mergedGrandmother,
      uncleName: mergedUncle,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Syncs a Student or Teacher/Supervisor extended family record (`/family_records/{recordId}`)
 * linked to the authenticated user's Google UID (`ownerUid`) in Firestore.
 */
export async function syncExtendedFamilyRecordToFirestore(params: {
  recordId: string;
  entityType: 'student' | 'teacher' | 'supervisor';
  personName: string;
  motherName?: string;
  grandfatherName?: string;
  grandmotherName?: string;
  uncleName?: string;
}): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;
  if (!(await ensureHealthyAuthToken(currentUser))) return false;

  const cleanUid = currentUser.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const cleanRecordId = (params.recordId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  if (!cleanUid || !cleanRecordId) return false;

  const safePersonName = (params.personName || 'عضو الأكاديمية').slice(0, 120);
  const safeMother = (params.motherName || '').trim().slice(0, 120);
  const safeGrandfather = (params.grandfatherName || '').trim().slice(0, 120);
  const safeGrandmother = (params.grandmotherName || '').trim().slice(0, 120);
  const safeUncle = (params.uncleName || '').trim().slice(0, 120);

  const path = `family_records/${cleanRecordId}`;
  const ref = doc(db, 'family_records', cleanRecordId);

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        recordId: cleanRecordId,
        ownerUid: cleanUid,
        entityType: params.entityType,
        personName: safePersonName,
        motherName: safeMother,
        grandfatherName: safeGrandfather,
        grandmotherName: safeGrandmother,
        uncleName: safeUncle,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        entityType: params.entityType,
        personName: safePersonName,
        motherName: safeMother,
        grandfatherName: safeGrandfather,
        grandmotherName: safeGrandmother,
        uncleName: safeUncle,
        updatedAt: serverTimestamp(),
      });
    }

    // Also mirror family fields onto the authenticated user's profile document
    await syncUserProfileToFirestore(
      currentUser,
      params.entityType === 'student' ? 'student' : params.entityType,
      {
        motherName: safeMother,
        grandfatherName: safeGrandfather,
        grandmotherName: safeGrandmother,
        uncleName: safeUncle,
      }
    );

    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function buildEmailSnapshotId(email?: string): string {
  const clean = (email || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');
  if (!clean) return '';
  return `staff_${clean}`.slice(0, 120);
}

/**
 * Syncs academy cloud snapshot summary AND full serialized JSON backup payload (`payloadJson`)
 * for the authenticated user in `/academy_snapshots/{uid}` as well as `/academy_snapshots/{emailKey}`
 * and `/academy_snapshots/master_academy_backup` so any device logging in finds the Sheikh's students immediately.
 */
export async function syncAcademySnapshotToFirestore(params: {
  academyName: string;
  studentsCount: number;
  sessionsCount: number;
  teacherEmail?: string;
  backupPayload?: Record<string, unknown>;
}): Promise<boolean> {
  // Always mirror a local cloud-backup cache keyed by email for instant offline-first fallback
  if (typeof window !== 'undefined' && params.backupPayload) {
    try {
      const emailKey = buildEmailSnapshotId(
        params.teacherEmail || auth.currentUser?.email || 'master'
      );
      window.localStorage.setItem(
        `wlq_firestore_cloud_backup_${emailKey}`,
        JSON.stringify({
          syncedAt: new Date().toISOString(),
          payload: params.backupPayload,
        })
      );
      window.localStorage.setItem(
        'wlq_firestore_cloud_backup_master',
        JSON.stringify({
          syncedAt: new Date().toISOString(),
          payload: params.backupPayload,
        })
      );
    } catch {
      // ignore local storage quota
    }
  }

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;
  if (!(await ensureHealthyAuthToken(currentUser))) return false;

  const cleanUid = currentUser.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  if (!cleanUid) return false;

  const safeAcademyName = (
    params.academyName || 'أكاديمية الإمام لتحفيظ القرآن الكريم'
  ).slice(0, 160);
  const safeStudentsCount = Math.max(
    0,
    Math.min(100000, Math.floor(params.studentsCount || 0))
  );
  const safeSessionsCount = Math.max(
    0,
    Math.min(1000000, Math.floor(params.sessionsCount || 0))
  );
  const safeTeacherEmail = (
    params.teacherEmail ||
    currentUser.email ||
    ''
  )
    .trim()
    .toLowerCase()
    .slice(0, 160);

  let serializedPayload = '';
  if (params.backupPayload) {
    try {
      const rawJson = JSON.stringify(params.backupPayload);
      if (rawJson.length <= 940000) {
        serializedPayload = rawJson;
      } else {
        // Trim heavy audio data URLs if needed to fit within Firestore 1MB document limit
        const slimPayload = {
          ...params.backupPayload,
          sessions: Array.isArray(params.backupPayload.sessions)
            ? (params.backupPayload.sessions as Record<string, unknown>[]).map(
                (ses) => ({
                  ...ses,
                  voiceNoteDataUrl: undefined,
                  memorizationAudioDataUrl: undefined,
                  teacherVoiceNotes: undefined,
                })
              )
            : [],
        };
        const slimJson = JSON.stringify(slimPayload);
        if (slimJson.length <= 940000) {
          serializedPayload = slimJson;
        }
      }
    } catch {
      serializedPayload = '';
    }
  }

  const targetDocIds = Array.from(
    new Set(
      [
        cleanUid,
        buildEmailSnapshotId(safeTeacherEmail),
        'master_academy_backup',
      ].filter(Boolean)
    )
  );

  let wroteAny = false;
  for (const docId of targetDocIds) {
    const path = `academy_snapshots/${docId}`;
    const ref = doc(db, 'academy_snapshots', docId);
    try {
      const existingSnap = await getDoc(ref);
      const baseFields: Record<string, unknown> = {
        ownerUid: cleanUid,
        teacherEmail: safeTeacherEmail,
        academyName: safeAcademyName,
        studentsCount: safeStudentsCount,
        sessionsCount: safeSessionsCount,
        schemaVersion: 12,
        updatedAt: serverTimestamp(),
      };
      if (serializedPayload) {
        baseFields.payloadJson = serializedPayload;
      }
      if (!existingSnap.exists()) {
        await setDoc(ref, {
          ...baseFields,
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, baseFields);
      }
      wroteAny = true;
    } catch (error) {
      if (docId === cleanUid) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    }
  }
  return wroteAny;
}

/**
 * Restores the latest academy/teacher backup payload from Firebase Cloud Firestore (`/academy_snapshots/{id}`)
 * when a Sheikh (Teacher), Supervisor, or Owner logs in from any device or triggers manual cloud restore.
 */
export async function fetchAcademyCloudBackupFromFirestore(
  teacherEmail?: string
): Promise<{
  source: 'firestore' | 'local_cloud_cache' | null;
  syncedAt?: string;
  payload: Record<string, unknown> | null;
}> {
  const emailKey = buildEmailSnapshotId(
    teacherEmail || auth.currentUser?.email || ''
  );
  const currentUser = auth.currentUser;

  if (currentUser && currentUser.emailVerified) {
    const healthy = await ensureHealthyAuthToken(currentUser);
    if (healthy) {
      const cleanUid = currentUser.uid
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 128);
      const candidateIds = Array.from(
        new Set(
          [cleanUid, emailKey, 'master_academy_backup'].filter(Boolean)
        )
      );

      for (const docId of candidateIds) {
        try {
          const snap = await getDoc(doc(db, 'academy_snapshots', docId));
          if (snap.exists()) {
            const data = snap.data() as Record<string, unknown>;
            if (
              typeof data.payloadJson === 'string' &&
              data.payloadJson.trim().startsWith('{')
            ) {
              const parsed = JSON.parse(data.payloadJson) as Record<
                string,
                unknown
              >;
              if (parsed && Array.isArray(parsed.students)) {
                return {
                  source: 'firestore',
                  syncedAt: new Date().toLocaleTimeString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  payload: parsed,
                };
              }
            }
          }
        } catch {
          // try next candidate docId
        }
      }
    }
  }

  // Fallback to local cloud backup cache if offline or Email+PIN login without active Firebase popup token
  if (typeof window !== 'undefined') {
    try {
      const cacheKeys = [
        emailKey ? `wlq_firestore_cloud_backup_${emailKey}` : '',
        'wlq_firestore_cloud_backup_master',
      ].filter(Boolean);
      for (const key of cacheKeys) {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const wrapper = JSON.parse(raw) as {
            syncedAt?: string;
            payload?: Record<string, unknown>;
          };
          if (wrapper?.payload && Array.isArray(wrapper.payload.students)) {
            return {
              source: 'local_cloud_cache',
              syncedAt: wrapper.syncedAt,
              payload: wrapper.payload,
            };
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return { source: null, payload: null };
}

/**
 * Creates or updates a Teacher/Supervisor registration in `/staff_registrations/{staffId}` in Firestore
 * (and mirrors to local `staff_users` cache for instant offline/hybrid sync)
 * so the Academy Owner can approve (`active`), suspend (`blocked`), or delete (`deleteDoc`) registrations.
 */
export async function syncStaffRegistrationToFirestore(
  record: TeacherAccessRecord
): Promise<boolean> {
  // Always mirror into local `staff_users` cache so real-time queue works even offline
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('imam_cloud_staff_users_v1');
      const list: TeacherAccessRecord[] = raw ? JSON.parse(raw) : [];
      const next = [
        record,
        ...list.filter((item) => item.id !== record.id && item.email.toLowerCase() !== record.email.toLowerCase()),
      ];
      window.localStorage.setItem('imam_cloud_staff_users_v1', JSON.stringify(next));
    } catch {
      // ignore local storage quota
    }
  }

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;
  if (!(await ensureHealthyAuthToken(currentUser))) return false;

  const cleanStaffId = (record.id || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  if (!cleanStaffId) return false;

  const safeGoogleUid = (record.googleUid || currentUser.uid || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  const safeName = (record.name || 'محفظ الأكاديمية').slice(0, 120);
  const safeEmail = (record.email || 'teacher@welivequran.com')
    .trim()
    .toLowerCase()
    .slice(0, 160);
  const safeRoleTitle = (record.roleTitle || 'محفظ الحلقات القرآنية').slice(
    0,
    160
  );
  const safeStaffRole: 'owner' | 'supervisor' | 'teacher' =
    record.staffRole === 'owner' || record.staffRole === 'supervisor'
      ? record.staffRole
      : 'teacher';
  const safeStatus: 'active' | 'blocked' | 'pending' =
    record.status === 'blocked' || record.status === 'pending'
      ? record.status
      : 'active';
  const safeCircles = Math.max(
    0,
    Math.min(100, Math.floor(record.assignedCirclesCount ?? 1))
  );
  const safeMother = (record.motherName || '').trim().slice(0, 120);
  const safeGrandfather = (record.grandfatherName || '').trim().slice(0, 120);
  const safeGrandmother = (record.grandmotherName || '').trim().slice(0, 120);
  const safeUncle = (record.uncleName || '').trim().slice(0, 120);
  const customPermissionsJson = JSON.stringify({
    customTeacherPermissions: record.customTeacherPermissions || null,
    customPermissions: record.customPermissions || null,
    effectiveStaffRole: record.staffRole || 'teacher',
    authProvider: record.authProvider || 'google',
    whatsappPhone: record.whatsappPhone || '',
    specialization: record.specialization || '',
    requestedPosition: record.requestedPosition || '',
    requestedAt: record.requestedAt || '',
    lastActiveAt: record.lastActiveAt || '',
    sessionsRecordedCount: record.sessionsRecordedCount ?? 0,
    assignedCircleNames: record.assignedCircleNames || [],
    restrictToAssignedCircles: Boolean(record.restrictToAssignedCircles),
  }).slice(0, 3900);

  const path = `staff_registrations/${cleanStaffId}`;
  const ref = doc(db, 'staff_registrations', cleanStaffId);

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        staffId: cleanStaffId,
        googleUid: safeGoogleUid,
        name: safeName,
        email: safeEmail,
        roleTitle: safeRoleTitle,
        staffRole: safeStaffRole,
        status: safeStatus,
        assignedCirclesCount: safeCircles,
        motherName: safeMother,
        grandfatherName: safeGrandfather,
        grandmotherName: safeGrandmother,
        uncleName: safeUncle,
        customPermissionsJson,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        googleUid: safeGoogleUid,
        name: safeName,
        email: safeEmail,
        roleTitle: safeRoleTitle,
        staffRole: safeStaffRole,
        status: safeStatus,
        assignedCirclesCount: safeCircles,
        motherName: safeMother,
        grandfatherName: safeGrandfather,
        grandmotherName: safeGrandmother,
        uncleName: safeUncle,
        customPermissionsJson,
        updatedAt: serverTimestamp(),
      });
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a Teacher or Supervisor registration document from `/staff_registrations/{staffId}` in Firestore.
 */
export async function deleteStaffRegistrationFromFirestore(
  staffId: string
): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('imam_cloud_staff_users_v1');
      if (raw) {
        const list: TeacherAccessRecord[] = JSON.parse(raw);
        window.localStorage.setItem(
          'imam_cloud_staff_users_v1',
          JSON.stringify(list.filter((item) => item.id !== staffId))
        );
      }
    } catch {
      // ignore
    }
  }

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;
  if (!(await ensureHealthyAuthToken(currentUser))) return false;

  const cleanStaffId = (staffId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  if (!cleanStaffId) return false;

  const path = `staff_registrations/${cleanStaffId}`;
  const ref = doc(db, 'staff_registrations', cleanStaffId);
  try {
    await deleteDoc(ref);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Syncs all current Teacher and Supervisor registrations to `/staff_registrations/{staffId}` in Firestore.
 */
export async function syncAllStaffRegistrationsToFirestore(
  records: TeacherAccessRecord[]
): Promise<number> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return 0;

  let syncedCount = 0;
  for (const rec of records) {
    try {
      const ok = await syncStaffRegistrationToFirestore(rec);
      if (ok) syncedCount += 1;
    } catch {
      // continue syncing remaining records
    }
  }
  return syncedCount;
}

/**
 * Real-time subscription (`onSnapshot`) to `/staff_registrations` in Firestore so the Owner Dashboard stays synced.
 */
export function subscribeToStaffRegistrationsFromFirestore(
  onUpdate: (records: TeacherAccessRecord[]) => void
): () => void {
  let unsubscribeSnapshot: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.emailVerified) return;
    const healthy = await ensureHealthyAuthToken(currentUser);
    if (!healthy || cancelled) return;

    const colRef = collection(db, 'staff_registrations');
    unsubscribeSnapshot = onSnapshot(
      colRef,
      (snapshot) => {
        if (snapshot.empty) return;
        const list: TeacherAccessRecord[] = snapshot.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          let parsedCustomTeacherPerms: TeacherAccessRecord['customTeacherPermissions'] =
            undefined;
          let parsedCustomSupervisorPerms: TeacherAccessRecord['customPermissions'] =
            undefined;
          let parsedEffectiveRole: StaffHierarchyRole | undefined = undefined;
          let parsedAuthProvider: StaffAuthProvider | undefined = undefined;
          let parsedWhatsappPhone: string | undefined = undefined;
          let parsedSpecialization: string | undefined = undefined;
          let parsedRequestedPosition: TeacherAccessRecord['requestedPosition'] =
            undefined;
          let parsedRequestedAt: string | undefined = undefined;
          let parsedLastActiveAt: string | undefined = undefined;
          let parsedSessionsRecordedCount: number | undefined = undefined;
          let parsedAssignedCircleNames: string[] | undefined = undefined;
          let parsedRestrictToAssignedCircles: boolean | undefined = undefined;

          if (
            typeof data.customPermissionsJson === 'string' &&
            data.customPermissionsJson.startsWith('{')
          ) {
            try {
              const parsed = JSON.parse(data.customPermissionsJson) as Record<
                string,
                unknown
              >;
              if (
                parsed.customTeacherPermissions &&
                typeof parsed.customTeacherPermissions === 'object'
              ) {
                parsedCustomTeacherPerms =
                  parsed.customTeacherPermissions as TeacherAccessRecord['customTeacherPermissions'];
              }
              if (
                parsed.customPermissions &&
                typeof parsed.customPermissions === 'object'
              ) {
                parsedCustomSupervisorPerms =
                  parsed.customPermissions as TeacherAccessRecord['customPermissions'];
              }
              if (
                parsed.effectiveStaffRole === 'owner' ||
                parsed.effectiveStaffRole === 'supervisor' ||
                parsed.effectiveStaffRole === 'teacher' ||
                parsed.effectiveStaffRole === 'financial_manager'
              ) {
                parsedEffectiveRole = parsed.effectiveStaffRole;
              }
              if (
                parsed.authProvider === 'google' ||
                parsed.authProvider === 'microsoft' ||
                parsed.authProvider === 'pin'
              ) {
                parsedAuthProvider = parsed.authProvider;
              }
              if (typeof parsed.whatsappPhone === 'string' && parsed.whatsappPhone) {
                parsedWhatsappPhone = parsed.whatsappPhone;
              }
              if (typeof parsed.specialization === 'string' && parsed.specialization) {
                parsedSpecialization = parsed.specialization;
              }
              if (
                parsed.requestedPosition === 'محفظ حلقة' ||
                parsed.requestedPosition === 'مشرف تعليمي' ||
                parsed.requestedPosition === 'مسؤول مالي / إداري'
              ) {
                parsedRequestedPosition = parsed.requestedPosition;
              }
              if (typeof parsed.requestedAt === 'string' && parsed.requestedAt) {
                parsedRequestedAt = parsed.requestedAt;
              }
              if (typeof parsed.lastActiveAt === 'string' && parsed.lastActiveAt) {
                parsedLastActiveAt = parsed.lastActiveAt;
              }
              if (typeof parsed.sessionsRecordedCount === 'number') {
                parsedSessionsRecordedCount = parsed.sessionsRecordedCount;
              }
              if (Array.isArray(parsed.assignedCircleNames)) {
                parsedAssignedCircleNames = parsed.assignedCircleNames.filter(
                  (c): c is string => typeof c === 'string'
                );
              }
              if (typeof parsed.restrictToAssignedCircles === 'boolean') {
                parsedRestrictToAssignedCircles = parsed.restrictToAssignedCircles;
              }
            } catch {
              // ignore invalid JSON
            }
          }
          const rawEmail = typeof data.email === 'string' ? data.email : '';
          const fallbackRole: StaffHierarchyRole = isMasterOwnerEmail(rawEmail)
            ? 'owner'
            : data.staffRole === 'owner' || data.staffRole === 'supervisor'
            ? data.staffRole
            : 'teacher';

          return {
            id: typeof data.staffId === 'string' ? data.staffId : d.id,
            googleUid:
              typeof data.googleUid === 'string' && data.googleUid
                ? data.googleUid
                : undefined,
            name: typeof data.name === 'string' ? data.name : 'محفظ الأكاديمية',
            email: rawEmail,
            roleTitle:
              typeof data.roleTitle === 'string'
                ? data.roleTitle
                : 'محفظ الحلقات القرآنية',
            staffRole: parsedEffectiveRole || fallbackRole,
            status: isMasterOwnerEmail(rawEmail)
              ? 'active'
              : data.status === 'blocked' || data.status === 'pending'
              ? data.status
              : 'active',
            assignedCirclesCount:
              typeof data.assignedCirclesCount === 'number'
                ? data.assignedCirclesCount
                : 1,
            assignedCircleNames: parsedAssignedCircleNames,
            restrictToAssignedCircles: parsedRestrictToAssignedCircles,
            authProvider: parsedAuthProvider || 'google',
            whatsappPhone: parsedWhatsappPhone,
            specialization: parsedSpecialization,
            requestedPosition: parsedRequestedPosition,
            requestedAt: parsedRequestedAt,
            lastActiveAt: parsedLastActiveAt,
            sessionsRecordedCount: parsedSessionsRecordedCount,
            lastSyncAt: new Date().toISOString().slice(0, 10),
            motherName:
              typeof data.motherName === 'string' && data.motherName
                ? data.motherName
                : undefined,
            grandfatherName:
              typeof data.grandfatherName === 'string' && data.grandfatherName
                ? data.grandfatherName
                : undefined,
            grandmotherName:
              typeof data.grandmotherName === 'string' && data.grandmotherName
                ? data.grandmotherName
                : undefined,
            uncleName:
              typeof data.uncleName === 'string' && data.uncleName
                ? data.uncleName
                : undefined,
            customTeacherPermissions: parsedCustomTeacherPerms,
            customPermissions: parsedCustomSupervisorPerms,
          };
        });
        onUpdate(list);
      },
      () => {
        // Ignore permission/offline errors when user is not signed in or token service is disabled
      }
    );
  })();

  return () => {
    cancelled = true;
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
    }
  };
}

/**
 * Launches the official Google Sign-In popup via Firebase Auth and on first login
 * saves extended family fields (`motherName`, `grandfatherName`, `grandmotherName`, `uncleName`)
 * into `/user_profiles/{uid}` in Firestore linked to the unique Google UID.
 */
export async function signInWithGooglePopup(
  role: 'teacher' | 'supervisor' | 'guardian' | 'student' = 'teacher',
  initialFamily?: ExtendedFamilyFields
): Promise<GoogleAuthResult & { provider: StaffAuthProvider }> {
  const credential = await signInWithPopup(auth, googleProvider);
  const user = credential.user;
  const uid = user.uid;
  const email = user.email || '';
  const displayName = user.displayName || email.split('@')[0] || 'مستخدم Google';
  const photoURL = user.photoURL;
  const emailVerified = user.emailVerified;

  let loadedFamily: ExtendedFamilyFields & { isFirstGoogleLogin?: boolean } = {
    motherName: initialFamily?.motherName,
    grandfatherName: initialFamily?.grandfatherName,
    grandmotherName: initialFamily?.grandmotherName,
    uncleName: initialFamily?.uncleName,
  };

  if (emailVerified) {
    const tokenHealthy = await ensureHealthyAuthToken(user);
    if (tokenHealthy) {
      try {
        loadedFamily = await syncUserProfileToFirestore(user, role, initialFamily);
      } catch {
        // Non-blocking if rules/network are still warming up
      }
    }
  }

  return {
    uid,
    email,
    displayName,
    photoURL,
    emailVerified,
    provider: 'google',
    isFirstGoogleLogin: loadedFamily.isFirstGoogleLogin ?? true,
    motherName: loadedFamily.motherName,
    grandfatherName: loadedFamily.grandfatherName,
    grandmotherName: loadedFamily.grandmotherName,
    uncleName: loadedFamily.uncleName,
  };
}

/**
 * Launches the official Microsoft Sign-In popup via Firebase Auth (`OAuthProvider('microsoft.com')`).
 */
export async function signInWithMicrosoftPopup(
  role: 'teacher' | 'supervisor' | 'guardian' | 'student' = 'teacher',
  initialFamily?: ExtendedFamilyFields
): Promise<GoogleAuthResult & { provider: StaffAuthProvider }> {
  const credential = await signInWithPopup(auth, microsoftProvider);
  const user = credential.user;
  const uid = user.uid;
  const email = user.email || '';
  const displayName =
    user.displayName || email.split('@')[0] || 'مستخدم Microsoft';
  const photoURL = user.photoURL;
  const emailVerified = true;

  let loadedFamily: ExtendedFamilyFields & { isFirstGoogleLogin?: boolean } = {
    motherName: initialFamily?.motherName,
    grandfatherName: initialFamily?.grandfatherName,
    grandmotherName: initialFamily?.grandmotherName,
    uncleName: initialFamily?.uncleName,
  };

  const tokenHealthy = await ensureHealthyAuthToken(user);
  if (tokenHealthy) {
    try {
      loadedFamily = await syncUserProfileToFirestore(user, role, initialFamily);
    } catch {
      // Non-blocking
    }
  }

  return {
    uid,
    email,
    displayName,
    photoURL,
    emailVerified,
    provider: 'microsoft',
    isFirstGoogleLogin: loadedFamily.isFirstGoogleLogin ?? true,
    motherName: loadedFamily.motherName,
    grandfatherName: loadedFamily.grandfatherName,
    grandmotherName: loadedFamily.grandmotherName,
    uncleName: loadedFamily.uncleName,
  };
}

export async function signOutFromFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // ignore signout error
  }
}

export const ACCESS_CODE_REQUESTS_STORAGE_KEY = 'imam_access_code_requests_v1';

/**
 * Saves or updates a Guardian/Student Access Code Request in Firestore (`access_code_requests/{id}`)
 * and mirrors to localStorage + BroadcastChannel for instant real-time alerts.
 */
export async function syncAccessCodeRequestToFirestore(
  requestRecord: AccessCodeRequest
): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(ACCESS_CODE_REQUESTS_STORAGE_KEY);
      const list: AccessCodeRequest[] = raw ? JSON.parse(raw) : [];
      const next = [
        requestRecord,
        ...list.filter((item) => item.id !== requestRecord.id),
      ].slice(0, 100);
      window.localStorage.setItem(
        ACCESS_CODE_REQUESTS_STORAGE_KEY,
        JSON.stringify(next)
      );
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('imam_access_code_requests_channel');
        bc.postMessage({ type: 'ACCESS_CODE_REQUEST_UPDATED', payload: next });
        bc.close();
      }
    } catch {
      // ignore local storage quota
    }
  }

  const cleanId = (requestRecord.id || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  if (!cleanId) return false;

  const ref = doc(db, 'access_code_requests', cleanId);
  try {
    await setDoc(
      ref,
      {
        id: cleanId,
        studentName: (requestRecord.studentName || '').trim().slice(0, 120),
        guardianPhone: (requestRecord.guardianPhone || '').trim().slice(0, 40),
        circleOrTeacherName: (requestRecord.circleOrTeacherName || '')
          .trim()
          .slice(0, 120),
        portalType: requestRecord.portalType || 'guardian',
        status: requestRecord.status === 'resolved' ? 'resolved' : 'pending',
        matchedStudentId: (requestRecord.matchedStudentId || '').slice(0, 120),
        matchedStudentName: (requestRecord.matchedStudentName || '').slice(0, 120),
        matchedStudentCode: (requestRecord.matchedStudentCode || '').slice(0, 60),
        matchedStudentPin: (requestRecord.matchedStudentPin || '').slice(0, 32),
        matchedTeacherName: (requestRecord.matchedTeacherName || '').slice(0, 120),
        matchedCircleName: (requestRecord.matchedCircleName || '').slice(0, 120),
        createdAt: requestRecord.createdAt || new Date().toISOString(),
        resolvedAt: requestRecord.resolvedAt || '',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch {
    // Gracefully succeed via local/BroadcastChannel mirror when unauthenticated or offline
    return false;
  }
}

/**
 * Real-time subscription to `access_code_requests` in Firestore + BroadcastChannel + storage events
 */
export function subscribeToAccessCodeRequestsFromFirestore(
  onUpdate: (requests: AccessCodeRequest[]) => void
): () => void {
  let unsubscribeSnapshot: (() => void) | null = null;
  let bc: BroadcastChannel | null = null;
  let cancelled = false;

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === ACCESS_CODE_REQUESTS_STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue) as AccessCodeRequest[];
        if (Array.isArray(parsed)) onUpdate(parsed);
      } catch {
        // ignore
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('imam_access_code_requests_channel');
        bc.onmessage = (ev) => {
          if (ev.data?.type === 'ACCESS_CODE_REQUEST_UPDATED' && Array.isArray(ev.data.payload)) {
            onUpdate(ev.data.payload as AccessCodeRequest[]);
          }
        };
      } catch {
        // ignore
      }
    }
  }

  void (async () => {
    if (cancelled) return;
    try {
      const colRef = collection(db, 'access_code_requests');
      unsubscribeSnapshot = onSnapshot(
        colRef,
        (snapshot) => {
          if (snapshot.empty) return;
          const list: AccessCodeRequest[] = snapshot.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              studentName:
                typeof data.studentName === 'string' ? data.studentName : 'طالب الأكاديمية',
              guardianPhone:
                typeof data.guardianPhone === 'string' ? data.guardianPhone : '',
              circleOrTeacherName:
                typeof data.circleOrTeacherName === 'string'
                  ? data.circleOrTeacherName
                  : undefined,
              portalType:
                data.portalType === 'student' ? 'student' : 'guardian',
              status: data.status === 'resolved' ? 'resolved' : 'pending',
              matchedStudentId:
                typeof data.matchedStudentId === 'string' && data.matchedStudentId
                  ? data.matchedStudentId
                  : undefined,
              matchedStudentName:
                typeof data.matchedStudentName === 'string' && data.matchedStudentName
                  ? data.matchedStudentName
                  : undefined,
              matchedStudentCode:
                typeof data.matchedStudentCode === 'string' && data.matchedStudentCode
                  ? data.matchedStudentCode
                  : undefined,
              matchedStudentPin:
                typeof data.matchedStudentPin === 'string' && data.matchedStudentPin
                  ? data.matchedStudentPin
                  : undefined,
              matchedTeacherName:
                typeof data.matchedTeacherName === 'string' && data.matchedTeacherName
                  ? data.matchedTeacherName
                  : undefined,
              matchedCircleName:
                typeof data.matchedCircleName === 'string' && data.matchedCircleName
                  ? data.matchedCircleName
                  : undefined,
              createdAt:
                typeof data.createdAt === 'string'
                  ? data.createdAt
                  : new Date().toISOString().slice(0, 16).replace('T', ' '),
              resolvedAt:
                typeof data.resolvedAt === 'string' && data.resolvedAt
                  ? data.resolvedAt
                  : undefined,
            };
          });
          onUpdate(list);
        },
        () => {
          // Ignore permission/offline errors
        }
      );
    } catch {
      // Ignore offline errors
    }
  })();

  return () => {
    cancelled = true;
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    if (bc) bc.close();
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
}

export const LATE_SESSION_ALERTS_STORAGE_KEY = 'imam_late_session_alerts_v1';

/**
 * Syncs a LateSessionAlertRecord to Firestore (`/late_session_alerts/{alertId}`)
 * and mirrors to localStorage + BroadcastChannel for real-time cross-tab/background sync.
 */
export async function syncLateSessionAlertToFirestore(
  alertRecord: import('../types').LateSessionAlertRecord
): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(LATE_SESSION_ALERTS_STORAGE_KEY);
      const list: import('../types').LateSessionAlertRecord[] = raw
        ? JSON.parse(raw)
        : [];
      const next = [
        alertRecord,
        ...list.filter((item) => item.id !== alertRecord.id),
      ].slice(0, 120);
      window.localStorage.setItem(
        LATE_SESSION_ALERTS_STORAGE_KEY,
        JSON.stringify(next)
      );
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('imam_late_session_alerts_channel');
        bc.postMessage({ type: 'LATE_SESSION_ALERT_UPDATED', payload: next });
        bc.close();
      }
    } catch {
      // ignore storage quota errors
    }
  }

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;
  if (!(await ensureHealthyAuthToken(currentUser))) return false;

  const cleanAlertId = (alertRecord.id || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  const cleanOwnerUid = currentUser.uid
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  const cleanStudentId = (alertRecord.studentId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);

  if (!cleanAlertId || !cleanOwnerUid || !cleanStudentId) return false;

  const safeStudentName = (alertRecord.studentName || 'طالب الحلقة')
    .trim()
    .slice(0, 120);
  const safeCircleName = (alertRecord.circleName || 'الحلقة القرآنية')
    .trim()
    .slice(0, 120);
  const safeScheduledTime = (alertRecord.scheduledTime || '17:00')
    .trim()
    .slice(0, 32);
  const safeDate = (alertRecord.date || new Date().toISOString().slice(0, 10))
    .trim()
    .slice(0, 32);
  const safeMinutesLate = Math.max(
    1,
    Math.min(1440, Math.round(alertRecord.minutesLate || 5))
  );
  const safeStage: 'late_5m' | 'late_15m' =
    alertRecord.stage === 'late_15m' ? 'late_15m' : 'late_5m';
  const safeStatus: 'active' | 'resolved' =
    alertRecord.status === 'resolved' ? 'resolved' : 'active';
  const safeSurahName = (alertRecord.surahName || 'الورد المقرر')
    .trim()
    .slice(0, 120);
  const safeAyahNumber = Math.max(
    1,
    Math.min(300, Math.round(alertRecord.ayahNumber || 1))
  );

  const path = `late_session_alerts/${cleanAlertId}`;
  const ref = doc(db, 'late_session_alerts', cleanAlertId);

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        alertId: cleanAlertId,
        ownerUid: cleanOwnerUid,
        studentId: cleanStudentId,
        studentName: safeStudentName,
        circleName: safeCircleName,
        scheduledTime: safeScheduledTime,
        date: safeDate,
        minutesLate: safeMinutesLate,
        stage: safeStage,
        status: safeStatus,
        surahName: safeSurahName,
        ayahNumber: safeAyahNumber,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        minutesLate: safeMinutesLate,
        stage: safeStage,
        status: safeStatus,
        surahName: safeSurahName,
        ayahNumber: safeAyahNumber,
        updatedAt: serverTimestamp(),
      });
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Real-time subscription (`onSnapshot`) to `/late_session_alerts` in Firestore
 * combined with local BroadcastChannel and storage listeners.
 */
export function subscribeToLateSessionAlertsFromFirestore(
  onUpdate: (alerts: import('../types').LateSessionAlertRecord[]) => void
): () => void {
  let unsubscribeSnapshot: (() => void) | null = null;
  let bc: BroadcastChannel | null = null;
  let cancelled = false;

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === LATE_SESSION_ALERTS_STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(
          e.newValue
        ) as import('../types').LateSessionAlertRecord[];
        if (Array.isArray(parsed)) onUpdate(parsed);
      } catch {
        // ignore
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('imam_late_session_alerts_channel');
        bc.onmessage = (ev) => {
          if (
            ev.data?.type === 'LATE_SESSION_ALERT_UPDATED' &&
            Array.isArray(ev.data.payload)
          ) {
            onUpdate(
              ev.data.payload as import('../types').LateSessionAlertRecord[]
            );
          }
        };
      } catch {
        // ignore
      }
    }
  }

  void (async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.emailVerified || cancelled) return;
    const healthy = await ensureHealthyAuthToken(currentUser);
    if (!healthy || cancelled) return;

    try {
      const colRef = collection(db, 'late_session_alerts');
      const targetQuery = isMasterOwnerEmail(currentUser.email)
        ? colRef
        : query(colRef, where('ownerUid', '==', currentUser.uid));
      unsubscribeSnapshot = onSnapshot(
        targetQuery,
        (snapshot) => {
          if (snapshot.empty) return;
          const list: import('../types').LateSessionAlertRecord[] =
            snapshot.docs.map((d) => {
              const data = d.data() as Record<string, unknown>;
              return {
                id: typeof data.alertId === 'string' ? data.alertId : d.id,
                ownerUid:
                  typeof data.ownerUid === 'string' ? data.ownerUid : undefined,
                studentId:
                  typeof data.studentId === 'string' ? data.studentId : '',
                studentName:
                  typeof data.studentName === 'string'
                    ? data.studentName
                    : 'طالب الحلقة',
                circleName:
                  typeof data.circleName === 'string'
                    ? data.circleName
                    : 'الحلقة القرآنية',
                scheduledTime:
                  typeof data.scheduledTime === 'string'
                    ? data.scheduledTime
                    : '17:00',
                date:
                  typeof data.date === 'string'
                    ? data.date
                    : new Date().toISOString().slice(0, 10),
                minutesLate:
                  typeof data.minutesLate === 'number' ? data.minutesLate : 5,
                stage: data.stage === 'late_15m' ? 'late_15m' : 'late_5m',
                status: data.status === 'resolved' ? 'resolved' : 'active',
                surahName:
                  typeof data.surahName === 'string'
                    ? data.surahName
                    : 'الورد المقرر',
                ayahNumber:
                  typeof data.ayahNumber === 'number' ? data.ayahNumber : 1,
                notifiedAt: new Date().toISOString(),
              };
            });
          onUpdate(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, 'late_session_alerts');
        }
      );
    } catch {
      // Ignore offline errors
    }
  })();

  return () => {
    cancelled = true;
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    if (bc) bc.close();
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
}

export const RECITATION_ENGINE_STATUS_STORAGE_KEY =
  'imam_recitation_engine_status_v1';

/**
 * Syncs a RecitationEngineStatusRecord to Firestore (`/recitation_engine_status/{engineStatusId}`)
 * and mirrors to localStorage so the Cron-like Teacher Push Scheduler in AcademyContext knows
 * whether 'محرك التسميع' has been started for each circle today.
 */
export async function syncRecitationEngineStatusToFirestore(
  record: import('../types').RecitationEngineStatusRecord
): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(
        RECITATION_ENGINE_STATUS_STORAGE_KEY
      );
      const list: import('../types').RecitationEngineStatusRecord[] = raw
        ? JSON.parse(raw)
        : [];
      const next = [
        record,
        ...list.filter((item) => item.id !== record.id),
      ].slice(0, 120);
      window.localStorage.setItem(
        RECITATION_ENGINE_STATUS_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // ignore storage quota errors
    }
  }

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;
  if (!(await ensureHealthyAuthToken(currentUser))) return false;

  const cleanStatusId = (record.id || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  const cleanOwnerUid = currentUser.uid
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  const cleanCircleId = (record.circleId || 'circle-default')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);

  if (!cleanStatusId || !cleanOwnerUid || !cleanCircleId) return false;

  const safeCircleName = (record.circleName || 'الحلقة القرآنية')
    .trim()
    .slice(0, 120);
  const safeTeacherName = (record.teacherName || 'محفظ الحلقة')
    .trim()
    .slice(0, 120);
  const safeTeacherEmail = (record.teacherEmail || currentUser.email || '')
    .trim()
    .toLowerCase()
    .slice(0, 160);
  const safeScheduledTime = (record.scheduledTime || '17:00')
    .trim()
    .slice(0, 32);
  const safeDate = (record.date || new Date().toISOString().slice(0, 10))
    .trim()
    .slice(0, 32);
  const safeEngineState: 'not_started' | 'started' | 'completed' =
    record.engineState === 'completed'
      ? 'completed'
      : record.engineState === 'started'
      ? 'started'
      : 'not_started';
  const safeActiveStudentId = (record.activeStudentId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);

  const path = `recitation_engine_status/${cleanStatusId}`;
  const ref = doc(db, 'recitation_engine_status', cleanStatusId);

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        engineStatusId: cleanStatusId,
        ownerUid: cleanOwnerUid,
        circleId: cleanCircleId,
        circleName: safeCircleName,
        teacherName: safeTeacherName,
        teacherEmail: safeTeacherEmail,
        scheduledTime: safeScheduledTime,
        date: safeDate,
        engineState: safeEngineState,
        activeStudentId: safeActiveStudentId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingData = existingSnap.data() as Record<string, unknown>;
      if (existingData.engineState === 'completed' && !isMasterOwnerEmail(currentUser.email)) {
        return true;
      }
      await updateDoc(ref, {
        engineState: safeEngineState,
        activeStudentId: safeActiveStudentId,
        teacherName: safeTeacherName,
        teacherEmail: safeTeacherEmail,
        scheduledTime: safeScheduledTime,
        updatedAt: serverTimestamp(),
      });
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Fetches today's RecitationEngineStatusRecord documents from Firestore (`/recitation_engine_status`)
 * merged with the local cache for reliable Cron-like evaluation.
 */
export async function fetchRecitationEngineStatusesFromFirestore(
  dateStr: string
): Promise<import('../types').RecitationEngineStatusRecord[]> {
  const mergedMap = new Map<
    string,
    import('../types').RecitationEngineStatusRecord
  >();

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(
        RECITATION_ENGINE_STATUS_STORAGE_KEY
      );
      if (raw) {
        const list = JSON.parse(
          raw
        ) as import('../types').RecitationEngineStatusRecord[];
        if (Array.isArray(list)) {
          list
            .filter((r) => r && r.date === dateStr)
            .forEach((r) => mergedMap.set(r.id, r));
        }
      }
    } catch {
      // ignore
    }
  }

  const currentUser = auth.currentUser;
  if (currentUser && currentUser.emailVerified) {
    const healthy = await ensureHealthyAuthToken(currentUser);
    if (healthy) {
      const path = 'recitation_engine_status';
      try {
        const colRef = collection(db, path);
        const q = isMasterOwnerEmail(currentUser.email)
          ? colRef
          : query(colRef, where('ownerUid', '==', currentUser.uid));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const dDate =
            typeof data.date === 'string' ? data.date : '';
          if (dDate !== dateStr) return;
          const id =
            typeof data.engineStatusId === 'string'
              ? data.engineStatusId
              : d.id;
          mergedMap.set(id, {
            id,
            ownerUid:
              typeof data.ownerUid === 'string' ? data.ownerUid : undefined,
            circleId:
              typeof data.circleId === 'string' ? data.circleId : '',
            circleName:
              typeof data.circleName === 'string'
                ? data.circleName
                : 'الحلقة القرآنية',
            teacherName:
              typeof data.teacherName === 'string'
                ? data.teacherName
                : 'محفظ الحلقة',
            teacherEmail:
              typeof data.teacherEmail === 'string'
                ? data.teacherEmail
                : undefined,
            scheduledTime:
              typeof data.scheduledTime === 'string'
                ? data.scheduledTime
                : '17:00',
            date: dDate,
            engineState:
              data.engineState === 'completed'
                ? 'completed'
                : data.engineState === 'started'
                ? 'started'
                : 'not_started',
            activeStudentId:
              typeof data.activeStudentId === 'string'
                ? data.activeStudentId
                : undefined,
          });
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      }
    }
  }

  return Array.from(mergedMap.values());
}

export const SCHEDULE_SLOTS_STORAGE_KEY = 'imam_schedule_slots_v1';

/**
 * Syncs a drag-and-drop schedule change (`ScheduleSlotRecord`) from `ScheduleBoard`
 * to `/schedule_slots/{slotId}` in Firestore and mirrors to local cache.
 */
export async function syncScheduleSlotToFirestore(
  slot: import('../types').ScheduleSlotRecord
): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(SCHEDULE_SLOTS_STORAGE_KEY);
      const list = raw
        ? (JSON.parse(raw) as import('../types').ScheduleSlotRecord[])
        : [];
      const next = [
        slot,
        ...list.filter((item) => item && item.id !== slot.id),
      ].slice(0, 200);
      window.localStorage.setItem(
        SCHEDULE_SLOTS_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // ignore storage quota errors
    }
  }

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;
  if (!(await ensureHealthyAuthToken(currentUser))) return false;

  const cleanSlotId = (slot.id || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  const cleanOwnerUid = currentUser.uid
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  const cleanTargetId = (slot.targetId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);

  if (!cleanSlotId || !cleanOwnerUid || !cleanTargetId) return false;

  const safeEntityType: 'circle' | 'student' =
    slot.entityType === 'student' ? 'student' : 'circle';
  const safeTargetName = (slot.targetName || 'حلقة قرآنية').trim().slice(0, 120);
  const safeCircleName = (slot.circleName || 'الحلقة القرآنية')
    .trim()
    .slice(0, 120);
  const safeTeacherName = (slot.teacherName || 'محفظ الحلقة')
    .trim()
    .slice(0, 120);
  const safeTeacherEmail = (slot.teacherEmail || currentUser.email || '')
    .trim()
    .toLowerCase()
    .slice(0, 160);
  const cleanDays = Array.isArray(slot.scheduleDays)
    ? Array.from(
        new Set(
          slot.scheduleDays
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        )
      ).sort((a, b) => a - b)
    : [0, 2, 4];
  const safeScheduleDaysCsv = (
    cleanDays.length > 0 ? cleanDays.join(',') : '0,2,4'
  ).slice(0, 32);
  const safeScheduleTime = (slot.scheduleTime || '17:00').trim().slice(0, 32);
  const safeDurationMinutes = Math.max(
    5,
    Math.min(360, Math.floor(Number(slot.durationMinutes) || 45))
  );

  const path = `schedule_slots/${cleanSlotId}`;
  const ref = doc(db, 'schedule_slots', cleanSlotId);

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        slotId: cleanSlotId,
        ownerUid: cleanOwnerUid,
        entityType: safeEntityType,
        targetId: cleanTargetId,
        targetName: safeTargetName,
        circleName: safeCircleName,
        teacherName: safeTeacherName,
        teacherEmail: safeTeacherEmail,
        scheduleDaysCsv: safeScheduleDaysCsv,
        scheduleTime: safeScheduleTime,
        durationMinutes: safeDurationMinutes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        targetName: safeTargetName,
        circleName: safeCircleName,
        teacherName: safeTeacherName,
        teacherEmail: safeTeacherEmail,
        scheduleDaysCsv: safeScheduleDaysCsv,
        scheduleTime: safeScheduleTime,
        durationMinutes: safeDurationMinutes,
        updatedAt: serverTimestamp(),
      });
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Fetches all saved `ScheduleSlotRecord` documents from Firestore (`/schedule_slots`)
 * merged with local cache.
 */
export async function fetchScheduleSlotsFromFirestore(): Promise<
  import('../types').ScheduleSlotRecord[]
> {
  const mergedMap = new Map<string, import('../types').ScheduleSlotRecord>();

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(SCHEDULE_SLOTS_STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(raw) as import('../types').ScheduleSlotRecord[];
        if (Array.isArray(list)) {
          list.filter(Boolean).forEach((item) => mergedMap.set(item.id, item));
        }
      }
    } catch {
      // ignore
    }
  }

  const currentUser = auth.currentUser;
  if (currentUser && currentUser.emailVerified) {
    const healthy = await ensureHealthyAuthToken(currentUser);
    if (healthy) {
      const path = 'schedule_slots';
      try {
        const colRef = collection(db, path);
        const q = isMasterOwnerEmail(currentUser.email)
          ? colRef
          : query(colRef, where('ownerUid', '==', currentUser.uid));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const id =
            typeof data.slotId === 'string' ? data.slotId : d.id;
          const csv =
            typeof data.scheduleDaysCsv === 'string'
              ? data.scheduleDaysCsv
              : '0,2,4';
          const parsedDays = csv
            .split(',')
            .map((x) => Number(x.trim()))
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
          mergedMap.set(id, {
            id,
            ownerUid:
              typeof data.ownerUid === 'string' ? data.ownerUid : undefined,
            entityType: data.entityType === 'student' ? 'student' : 'circle',
            targetId: typeof data.targetId === 'string' ? data.targetId : '',
            targetName:
              typeof data.targetName === 'string'
                ? data.targetName
                : 'حلقة قرآنية',
            circleName:
              typeof data.circleName === 'string'
                ? data.circleName
                : 'الحلقة القرآنية',
            teacherName:
              typeof data.teacherName === 'string'
                ? data.teacherName
                : 'محفظ الحلقة',
            teacherEmail:
              typeof data.teacherEmail === 'string'
                ? data.teacherEmail
                : undefined,
            scheduleDays: parsedDays.length > 0 ? parsedDays : [0, 2, 4],
            scheduleTime:
              typeof data.scheduleTime === 'string'
                ? data.scheduleTime
                : '17:00',
            durationMinutes:
              typeof data.durationMinutes === 'number'
                ? data.durationMinutes
                : 45,
          });
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      }
    }
  }

  return Array.from(mergedMap.values());
}

export const QURAN_TRACKER_LOGS_STORAGE_KEY = 'imam_quran_tracker_logs_v1';

/**
 * Syncs a student's `ev/quran-tracker` memory freshness & 1-tap revision log (`QuranTrackerStudentRecord`)
 * to `/quran_tracker_logs/{trackerId}` in Firestore and mirrors to local cache.
 */
export async function syncQuranTrackerLogToFirestore(
  record: import('../types').QuranTrackerStudentRecord
): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(QURAN_TRACKER_LOGS_STORAGE_KEY);
      const list = raw
        ? (JSON.parse(raw) as import('../types').QuranTrackerStudentRecord[])
        : [];
      const next = [
        record,
        ...list.filter((item) => item && item.id !== record.id),
      ].slice(0, 300);
      window.localStorage.setItem(
        QURAN_TRACKER_LOGS_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // ignore local storage quota errors
    }
  }

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;
  if (!(await ensureHealthyAuthToken(currentUser))) return false;

  const cleanTrackerId = (record.id || `tracker_${record.studentId}`)
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  const cleanOwnerUid = currentUser.uid
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  const cleanStudentId = (record.studentId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);

  if (!cleanTrackerId || !cleanOwnerUid || !cleanStudentId) return false;

  const safeStudentName = (record.studentName || 'طالب الأكاديمية')
    .trim()
    .slice(0, 120);
  const safeCircleName = (record.circleName || 'الحلقة القرآنية')
    .trim()
    .slice(0, 120);
  const safeStreakDays = Math.max(
    0,
    Math.min(10000, Math.floor(Number(record.streakDays) || 0))
  );
  const safeLastActiveDate = (
    record.lastActiveDate || new Date().toISOString().slice(0, 10)
  )
    .trim()
    .slice(0, 32);
  const safeDailyGoalSurahs = Math.max(
    1,
    Math.min(114, Math.floor(Number(record.dailyGoalSurahs) || 3))
  );
  const safeMapJson = (record.surahRevisionMapJson || '{}').slice(0, 118000);

  const path = `quran_tracker_logs/${cleanTrackerId}`;
  const ref = doc(db, 'quran_tracker_logs', cleanTrackerId);

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        trackerId: cleanTrackerId,
        ownerUid: cleanOwnerUid,
        studentId: cleanStudentId,
        studentName: safeStudentName,
        circleName: safeCircleName,
        streakDays: safeStreakDays,
        lastActiveDate: safeLastActiveDate,
        dailyGoalSurahs: safeDailyGoalSurahs,
        surahRevisionMapJson: safeMapJson,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        studentName: safeStudentName,
        circleName: safeCircleName,
        streakDays: safeStreakDays,
        lastActiveDate: safeLastActiveDate,
        dailyGoalSurahs: safeDailyGoalSurahs,
        surahRevisionMapJson: safeMapJson,
        updatedAt: serverTimestamp(),
      });
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Fetches all saved `QuranTrackerStudentRecord` documents from Firestore (`/quran_tracker_logs`)
 * merged with local cache.
 */
export async function fetchQuranTrackerLogsFromFirestore(): Promise<
  import('../types').QuranTrackerStudentRecord[]
> {
  const mergedMap = new Map<
    string,
    import('../types').QuranTrackerStudentRecord
  >();

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(QURAN_TRACKER_LOGS_STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(
          raw
        ) as import('../types').QuranTrackerStudentRecord[];
        if (Array.isArray(list)) {
          list.filter(Boolean).forEach((item) => mergedMap.set(item.id, item));
        }
      }
    } catch {
      // ignore
    }
  }

  const currentUser = auth.currentUser;
  if (currentUser && currentUser.emailVerified) {
    const healthy = await ensureHealthyAuthToken(currentUser);
    if (healthy) {
      const path = 'quran_tracker_logs';
      try {
        const colRef = collection(db, path);
        const q = isMasterOwnerEmail(currentUser.email)
          ? colRef
          : query(colRef, where('ownerUid', '==', currentUser.uid));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const id =
            typeof data.trackerId === 'string' ? data.trackerId : d.id;
          mergedMap.set(id, {
            id,
            ownerUid:
              typeof data.ownerUid === 'string' ? data.ownerUid : undefined,
            studentId:
              typeof data.studentId === 'string' ? data.studentId : '',
            studentName:
              typeof data.studentName === 'string'
                ? data.studentName
                : 'طالب الأكاديمية',
            circleName:
              typeof data.circleName === 'string'
                ? data.circleName
                : 'الحلقة القرآنية',
            streakDays:
              typeof data.streakDays === 'number' ? data.streakDays : 1,
            lastActiveDate:
              typeof data.lastActiveDate === 'string'
                ? data.lastActiveDate
                : new Date().toISOString().slice(0, 10),
            dailyGoalSurahs:
              typeof data.dailyGoalSurahs === 'number'
                ? data.dailyGoalSurahs
                : 3,
            surahRevisionMapJson:
              typeof data.surahRevisionMapJson === 'string'
                ? data.surahRevisionMapJson
                : '{}',
          });
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      }
    }
  }

  return Array.from(mergedMap.values());
}

export { onAuthStateChanged };
export type { FirebaseUser };

