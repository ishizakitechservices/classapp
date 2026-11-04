import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * Conversations are the durable copy of chat history. The flat CHAT_MESSAGES store in
 * IndexedDB is only a mirror: it is cleared by "New chat" and holds a partial transcript
 * (just the messages of whatever chat was on screen), so it must never be used to
 * overwrite what the threads already saved.
 */
const THREADS_KEY = 'classapp_chat_threads';
const ACTIVE_THREAD_KEY = 'classapp_active_chat_thread';
const LAST_USER_KEY = 'classapp_last_user';

/** Collision-resistant client ids (per-thread DB ids are namespaced server-side too). */
let localIdCounter = 0;
function makeMessageId(prefix: 'u' | 'a'): string {
  localIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${localIdCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function readThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    const parsed = raw ? (JSON.parse(raw) as ChatThread[]) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => t?.messages?.length) : [];
  } catch {
    return [];
  }
}

/** The conversation the student was last reading, else the most recent one. */
function readActiveThread(): ChatThread | null {
  const threads = readThreads();
  if (!threads.length) return null;
  const key = localStorage.getItem(ACTIVE_THREAD_KEY);
  if (key === '') return null; // the student explicitly started a blank chat
  return (key && threads.find((t) => t.id === key)) || threads[0];
}
import { useAuth } from './AuthContext';
import {
  TabType,
  UserRole,
  ThemeMode,
  UserProfile,
  Subject,
  Notice,
  ChatMessage,
  ChatThread,
  AppSettings,
  ClassActivity,
  QuizAttempt,
  QuizQuestion,
  Flashcard,
  ConnectedService,
  canManageClass,
  canPublishSchoolNotices,
  type LocalVaultFile,
  type ClassroomLink,
} from '../types';
import {
  PROFILES,
  INITIAL_SUBJECTS,
  INITIAL_VAULT_FILES,
  INITIAL_NOTICES,
  SAMPLE_CHAT_HISTORY,
  INITIAL_CONNECTED_SERVICES,
} from '../data/mockData';
import {
  STORES,
  dbGetAll,
  dbPut,
  dbPutMany,
  dbDelete,
  dbClear,
  getStorageQuotaEstimate,
} from '../services/db';
import {
  checkServerHealth,
  streamStudyResponse,
  generateQuizQuestions,
  generateFlashcardDeck,
  summarizeDocument,
  AiUnavailableError,
} from '../services/aiService';
import { STUDY_SIZES, clampStudyCount, type StudyKind, type StudySize } from '../shared/studyLimits';
import { formOf } from '../shared/subjects';
import { type ChartSpec } from '../shared/mathCharts';
import { getStoredStudySet, putStoredStudySet } from '../services/studyCache';
import {
  startSpeechToText,
  isSpeechToTextAvailable,
  speak,
  stopSpeaking,
  isReadAloudAvailable,
} from '../lib/voice';
import { ocrImage } from '../lib/ocr';
import { type ImageResult } from '../services/aiService';
import {
  auth,
  signInWithPopup,
  signOut,
  googleAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from '../lib/firebase';
import {
  syncUserProfileToFirestore,
  fetchUserProfileFromFirestore,
  syncQuizAttemptToFirestore,
  fetchQuizAttemptsFromFirestore,
} from '../services/firestoreSyncService';
import {
  requestGoogleAccessToken,
  fetchClassroomCourses,
  fetchCourseWork,
  fetchClassroomMaterials,
  fetchClassroomTeachers,
  fetchStudentSubmissions,
  fetchCourseAnnouncements,
  fetchDriveFiles,
  getCachedToken,
  setCachedToken,
  clearCachedToken,
  restoreGoogleTokenFromServer,
  storeGoogleTokenOnServer,
  clearGoogleTokenOnServer,
  ClassroomCourse,
  ClassroomCourseWork,
  ClassroomCourseWorkMaterial,
  ClassroomAnnouncement,
  ClassroomTeacher,
  StudentSubmission,
  DriveFileItem,
} from '../services/googleWorkspaceService';

interface AppContextType {
  // Navigation
  currentTab: TabType;
  setCurrentTab: (tab: TabType) => void;
  activeSubjectId: string | null;
  setActiveSubjectId: (id: string | null) => void;
  activeFileId: string | null;
  setActiveFileId: (id: string | null) => void;
  activeReaderFileId: string | null;
  setActiveReaderFileId: (id: string | null) => void;
  activeNoticeId: string | null;
  setActiveNoticeId: (id: string | null) => void;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  activeQuizOpen: boolean;
  setActiveQuizOpen: (open: boolean) => void;
  activeFlashcardsOpen: boolean;
  setActiveFlashcardsOpen: (open: boolean) => void;
  activeRevisionTopic: string | null;
  setActiveRevisionTopic: (topic: string | null) => void;

  // Profile & Role
  userProfile: UserProfile;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  canManageCurrentClass: (classId: string) => boolean;
  canPublishNotices: boolean;

  // Firebase Auth
  firebaseUser: User | null;
  isAuthLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutAccount: () => Promise<void>;

  // Settings & Theme
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  setTheme: (theme: ThemeMode) => void;

  // Data & Mutators
  subjects: Subject[];
  addSubject: (data: { code: string; name: string; description?: string; instructor?: string; room?: string; schedule?: string }) => Promise<void>;
  removeSubject: (subjectId: string) => Promise<void>;
  addSubjectActivity: (subjectId: string, activity: Omit<ClassActivity, 'id' | 'date'>) => Promise<void>;
  vaultFiles: LocalVaultFile[];
  addVaultFile: (data: { name: string; content: string; subjectCode?: string; folder?: LocalVaultFile['folder']; description?: string; previewUrl?: string; mimeType?: string }) => Promise<void>;
  removeVaultFile: (fileId: string) => Promise<void>;
  toggleOffline: (fileId: string) => Promise<void>;
  clearOfflineStorage: () => Promise<void>;
  totalOfflineStorageMB: number;
  saveDocumentNotes: (fileId: string, notes: string) => Promise<void>;

  notices: Notice[];
  toggleNoticeRead: (noticeId: string) => Promise<void>;
  toggleNoticePin: (noticeId: string) => Promise<void>;
  addNotice: (notice: Omit<Notice, 'id' | 'timeAgo'>) => Promise<void>;
  unreadNoticesCount: number;

  // Adom AI Chat, Intelligent Study Tools & Quizzes
  chatMessages: ChatMessage[];

  sendMessage: (text: string, contextSubject?: string, fileContext?: { name: string; content: string }, deep?: boolean, opts?: { wantImage?: boolean; wantChart?: boolean; teacherMode?: boolean }) => Promise<void>;
  stopAiResponse: () => void;
  retryLastMessage: (deep?: boolean) => Promise<void>;
  /** Saved conversations, newest first, with automatic titles. */
  chatThreads: ChatThread[];
  newChat: () => void;
  openThread: (id: string) => Promise<void>;
  deleteThread: (id: string) => void;
  clearChat: () => Promise<void>;
  isAiThinking: boolean;
  /** True only while a chat answer is streaming, so Stop never pretends to cancel a quiz. */
  isChatThinking: boolean;
  /** The cloud thread currently being fetched, if any. */
  threadLoadingId: string | null;
  threadError: string | null;
  aiEngineStatus: 'deepseek' | 'local_fallback' | 'checking';

  // Teacher mode & rich AI output
  teacherMode: boolean;
  setTeacherMode: (enabled: boolean) => void;
  activeChart: ChartSpec | null;
  setActiveChart: (spec: ChartSpec | null) => void;
  activeImages: ImageResult[];
  setActiveImages: (imgs: ImageResult[]) => void;

  // Voice & OCR (free, browser-based, zero server cost)
  isListening: boolean;
  startListening: (onResult: (text: string, isFinal: boolean) => void) => void;
  stopListening: () => void;
  isSpeechToTextAvailable: () => boolean;
  readAloud: (text: string, onEnd?: () => void) => void;
  stopReadAloud: () => void;
  isReadAloudAvailable: () => boolean;
  ocrImage: (file: File | Blob | string) => Promise<string>;

  activeQuizData: { title: string; subjectCode?: string; questions: QuizQuestion[] } | null;
  setActiveQuizData: React.Dispatch<React.SetStateAction<{ title: string; subjectCode?: string; questions: QuizQuestion[] } | null>>;
  activeFlashcardsData: { topic: string; flashcards: Flashcard[] } | null;
  setActiveFlashcardsData: React.Dispatch<React.SetStateAction<{ topic: string; flashcards: Flashcard[] } | null>>;
  generateCustomQuiz: (
    topic: string,
    options?: {
      subjectCode?: string;
      fileContext?: string;
      count?: number;
      strand?: string;
      variant?: number;
      size?: StudySize;
      /** True when the student explicitly asked for another set: bumps the variant. */
      fresh?: boolean;
      /** False when the caller wants to decide whether to show the runner. */
      openOnSuccess?: boolean;
    }
  ) => Promise<GenerateStudyOutcome>;
  generateCustomFlashcards: (
    topic: string,
    options?: {
      subjectCode?: string;
      fileContext?: string;
      count?: number;
      strand?: string;
      variant?: number;
      size?: StudySize;
      fresh?: boolean;
    }
  ) => Promise<GenerateStudyOutcome>;
  /** Opens Adom AI practice questions instantly: saved set first, otherwise generated. */
  openAiQuiz: (options?: {
    topic?: string;
    subjectCode?: string;
    count?: number;
    strand?: string;
  }) => Promise<GenerateStudyOutcome>;
  /** Opens an Adom AI flashcard deck instantly: saved deck first, otherwise generated. */
  openAiFlashcards: (options?: {
    topic?: string;
    subjectCode?: string;
    count?: number;
    strand?: string;
  }) => Promise<GenerateStudyOutcome>;
  generateDocumentSummary: (file: LocalVaultFile) => Promise<string>;
  quizAttempts: QuizAttempt[];
  recordQuizAttempt: (attempt: Omit<QuizAttempt, 'id' | 'timestamp' | 'dateFormatted'>) => Promise<void>;

  // Connected Services & Google Workspace
  connectedServices: ConnectedService[];
  toggleConnectedService: (serviceId: 'google_classroom' | 'google_drive') => Promise<void>;
  classroomCourses: ClassroomCourse[];
  classroomCourseWork: Record<string, ClassroomCourseWork[]>;
  classroomMaterials: Record<string, ClassroomCourseWorkMaterial[]>;
  classroomAnnouncements: Record<string, ClassroomAnnouncement[]>;
  classroomTeachers: Record<string, ClassroomTeacher[]>;
  classroomSubmissions: Record<string, StudentSubmission[]>;
  selectedClassroomId: string | null;
  setSelectedClassroomId: (id: string | null) => void;
  driveFiles: DriveFileItem[];
  isLoadingWorkspace: boolean;
  workspaceError: string | null;
  syncGoogleClassroom: (token?: string) => Promise<boolean>;
  /** Open the Google sign-in popup and load the student's Classroom courses. */
  connectGoogleClassroom: () => Promise<boolean>;
  /** Forget the stored Google token and clear everything loaded from it. */
  disconnectGoogleWorkspace: () => Promise<void>;

  // Per-class autosync
  classroomAutosyncEnabled: boolean;
  classroomAutosyncCourseId: string | null;
  setClassroomAutosyncCourseId: (id: string | null) => void;
  classroomAutosyncIntervalMs: number;
  setClassroomAutosyncInterval: (ms: number) => void;
  classroomLastSyncedAt: string | null;
  toggleClassroomAutosync: (courseId: string | null, enable?: boolean) => Promise<void>;

  // Subject <-> Google Classroom course links
  classroomLinks: ClassroomLink[];
  linksLoading: boolean;
  fetchClassroomLinks: () => Promise<void>;
  linkClassroomCourse: (
    subjectCode: string,
    courseId: string,
    courseName?: string
  ) => Promise<ClassroomLink | null>;
  unlinkClassroomCourse: (subjectCode: string) => Promise<boolean>;
  getLinkedClassroomCourse: (subjectCode: string) => ClassroomLink | undefined;
  refreshClassroomCourse: (courseId: string) => Promise<void>;
  createClassroomSubmission: (
    courseId: string,
    courseWorkId: string,
    answer: string
  ) => Promise<any>;
  turnInClassroomSubmission: (
    courseId: string,
    courseWorkId: string,
    submissionId: string
  ) => Promise<any>;
  addClassroomComment: (
    courseId: string,
    courseWorkId: string,
    submissionId: string,
    text: string
  ) => Promise<any>;

  // Adom AI draft context carried from a Classroom assignment
  adomDraftContext: {
    courseId: string;
    courseWorkId: string;
    title: string;
    description?: string;
  } | null;
  setAdomDraftContext: (
    ctx: { courseId: string; courseWorkId: string; title: string; description?: string } | null
  ) => void;
  clearAdomDraftContext: () => void;
  syncGoogleDrive: (query?: string, token?: string) => Promise<void>;
  importDriveFileToVault: (driveFile: DriveFileItem) => Promise<void>;
  importClassroomMaterialToVault: (item: { title: string; description?: string; courseName?: string; courseId?: string; material: any }) => Promise<void>;

  // Storage & Network Health
  isOnline: boolean;
  storageQuota: { usageMB: number; quotaMB: number; percentageUsed: number };
  refreshStorageStats: () => Promise<void>;
  resetToSampleData: () => Promise<void>;
  isDbReady: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

/** Honest result of a study generation: the UI needs to know a shortfall when it happens. */
export interface GenerateStudyOutcome {
  ok: boolean;
  /** Items actually delivered. */
  count: number;
  /** Items asked for. */
  requested: number;
  /** True when served straight from the device with no network call. */
  instant?: boolean;
  /** Safe message for the student when `ok` is false. */
  error?: string;
}

/** A "fresh set" tap gets a unique variant, so it never reuses a set the student already saw. */
function nextVariant(_topic: string, _kind: StudyKind, fresh: boolean, explicit?: number): number {
  if (Number.isFinite(explicit)) return Math.max(0, Math.trunc(Number(explicit)));
  // Time-based, not a per-session counter: a reload used to restart the counter at 1 and
  // serve the same "fresh" set again.
  return fresh ? Date.now() : 0;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTab, setCurrentTabState] = useState<TabType>('home');
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [activeReaderFileId, setActiveReaderFileId] = useState<string | null>(null);
  const [activeNoticeId, setActiveNoticeId] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeQuizOpen, setActiveQuizOpen] = useState(false);
  const [activeFlashcardsOpen, setActiveFlashcardsOpen] = useState(false);
  const [activeRevisionTopic, setActiveRevisionTopic] = useState<string | null>(null);

  // Intelligent Study Tools & DeepSeek AI State
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const [threadLoadingId, setThreadLoadingId] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const threadRequestRef = React.useRef(0);
  const [aiEngineStatus, setAiEngineStatus] = useState<'deepseek' | 'local_fallback' | 'checking'>('checking');
  const [activeQuizData, setActiveQuizData] = useState<{
    title: string;
    subjectCode?: string;
    questions: QuizQuestion[];
  } | null>(null);
  const [activeFlashcardsData, setActiveFlashcardsData] = useState<{
    topic: string;
    flashcards: Flashcard[];
  } | null>(null);

  // Teacher mode & rich output
  const [teacherMode, setTeacherModeState] = useState(false);
  const [activeChart, setActiveChartState] = useState<ChartSpec | null>(null);
  const [activeImages, setActiveImagesState] = useState<ImageResult[]>([]);
  const [isListening, setIsListening] = useState(false);

  // Network status
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Periodic and on-network-change check of server DeepSeek status
  useEffect(() => {
    let isMounted = true;
    async function evaluateAiHealth() {
      if (!isOnline) {
        if (isMounted) setAiEngineStatus('local_fallback');
        return;
      }
      setAiEngineStatus('checking');
      const health = await checkServerHealth();
      if (isMounted) {
        if (health.isServerReachable && health.hasDeepSeekKey && health.modelValid) {
          setAiEngineStatus('deepseek');
        } else {
          setAiEngineStatus('local_fallback');
        }
      }
    }
    evaluateAiHealth();
    return () => {
      isMounted = false;
    };
  }, [isOnline]);

  // Role state — comes ONLY from the real signed-in account, never localStorage.
  const { user: authUser, isLoading: authLoading } = useAuth();
  const userRole: UserRole =
    authUser?.role === 'admin' ? 'admin' : authUser?.role === 'prefect' ? 'prefect' : 'student';
  const [customProfile, setCustomProfile] = useState<UserProfile | null>(null);
  const authProfile: UserProfile | null = authUser
    ? {
        name: authUser.displayName,
        idNumber: authUser.studentId.toUpperCase(),
        email: '',
        role: authUser.role,
        program: 'Senior High School (SHS)',
        semester: '2025/2026',
        avatarInitials:
          authUser.displayName
            .split(/\s+/)
            .map((part) => part[0] || '')
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'ST',
        assignedClassIds: [],
      }
    : null;
  const userProfile = authProfile || customProfile || PROFILES[userRole] || PROFILES.student;

  // Firebase Auth State
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Google Workspace (Classroom & Drive) State
  const [classroomCourses, setClassroomCourses] = useState<ClassroomCourse[]>([]);
  const [classroomCourseWork, setClassroomCourseWork] = useState<Record<string, ClassroomCourseWork[]>>({});
  const [classroomMaterials, setClassroomMaterials] = useState<Record<string, ClassroomCourseWorkMaterial[]>>({});
  const [classroomAnnouncements, setClassroomAnnouncements] = useState<Record<string, ClassroomAnnouncement[]>>({});
  const [classroomTeachers, setClassroomTeachers] = useState<Record<string, ClassroomTeacher[]>>({});
  const [classroomSubmissions, setClassroomSubmissions] = useState<Record<string, StudentSubmission[]>>({});
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // Per-class autosync state (Google Classroom assignments / posts refresh)
  const [classroomAutosyncEnabled, setClassroomAutosyncEnabled] = useState(false);
  const [classroomAutosyncCourseId, setClassroomAutosyncCourseId] = useState<string | null>(null);
  const [classroomAutosyncIntervalMs, setClassroomAutosyncIntervalMs] = useState(30000);
  const [classroomLastSyncedAt, setClassroomLastSyncedAt] = useState<string | null>(null);

  // Manual subject <-> Google Classroom course links (student picks the match)
  const [classroomLinks, setClassroomLinks] = useState<ClassroomLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  // Adom AI draft context carried from a Classroom assignment into the Adom AI tab
  const [adomDraftContext, setAdomDraftContext] = useState<{
    courseId: string;
    courseWorkId: string;
    title: string;
    description?: string;
  } | null>(null);

  // Settings & Theme
  const [settings, setSettings] = useState<AppSettings>(() => {
    const savedTheme = (localStorage.getItem('classapp_theme') as ThemeMode) || 'system';
    return {
      theme: savedTheme,
      fontSize: 'default',
      reducedMotion: false,
      highContrast: false,
      offlineCacheEnabled: true,
      pushNotifications: true,
      quietHours: false,
    };
  });

  // Storage quota
  const [storageQuota, setStorageQuota] = useState({
    usageMB: 0,
    quotaMB: 0,
    percentageUsed: 0,
  });

  // State collections
  const [subjects, setSubjects] = useState<Subject[]>(INITIAL_SUBJECTS);
  const [vaultFiles, setVaultFiles] = useState<LocalVaultFile[]>(INITIAL_VAULT_FILES);
  const [notices, setNotices] = useState<Notice[]>(INITIAL_NOTICES);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(SAMPLE_CHAT_HISTORY);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>(() => {
    try {
      const raw = localStorage.getItem('classapp_chat_threads');
      return raw ? (JSON.parse(raw) as ChatThread[]) : [];
    } catch {
      return [];
    }
  });
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [connectedServices, setConnectedServices] = useState<ConnectedService[]>(INITIAL_CONNECTED_SERVICES);
  const [isDbReady, setIsDbReady] = useState(false);
  /** Bumped on account change so a slow IndexedDB load cannot repopulate the previous user. */
  const dataGenerationRef = React.useRef(0);

  const refreshStorageStats = useCallback(async () => {
    const est = await getStorageQuotaEstimate();
    setStorageQuota({
      usageMB: est.usageMB,
      quotaMB: est.quotaMB,
      percentageUsed: est.percentageUsed,
    });
  }, []);

  // Initialize from IndexedDB with safe seeding
  useEffect(() => {
    let isMounted = true;

    async function loadFromDB() {
      const generation = dataGenerationRef.current;
      try {
        const [
          savedSubjects,
          savedFiles,
          savedNotices,
          savedMessages,
          savedAttempts,
          savedServices,
        ] = await Promise.all([
          dbGetAll<Subject>(STORES.SUBJECTS),
          dbGetAll<LocalVaultFile>(STORES.VAULT_FILES),
          dbGetAll<Notice>(STORES.NOTICES),
          dbGetAll<ChatMessage>(STORES.CHAT_MESSAGES),
          dbGetAll<QuizAttempt>(STORES.QUIZ_ATTEMPTS),
          dbGetAll<ConnectedService>(STORES.CONNECTED_SERVICES),
        ]);

        if (!isMounted || generation !== dataGenerationRef.current) return;

        // Detect and purge any mock/demo data across all stores
        const demoPurgeKey = 'classapp_demo_purged_v4';
        const hasPurged = localStorage.getItem(demoPurgeKey);
        const hasDemoSubjects = savedSubjects.some((s) =>
          ['emath301', 'phy301', 'chem301', 'bio301', 'cs204', 'cs210'].includes(s.id) ||
          s.instructor?.includes('Mensah') ||
          s.instructor?.includes('Al-Mansoor')
        );
        const hasDemoFiles = savedFiles.some((f) =>
          ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].includes(f.id) ||
          f.name.includes('WASSCE_Elective_Math_Calculus_Revision_Guide')
        );
        const hasDemoNotices = savedNotices.some((n) =>
          ['not-1', 'not-2', 'not-3', 'not-4'].includes(n.id) ||
          n.author?.includes('Grace Osei-Tutu')
        );
        const hasDemoChat = savedMessages.some((m) =>
          ['c1', 'c2', 'c3', 'c4'].includes(m.id) ||
          m.content.includes('first principles, and why do we take the limit')
        );

        if (!hasPurged || hasDemoSubjects || hasDemoFiles || hasDemoNotices || hasDemoChat) {
          await Promise.all([
            dbClear(STORES.SUBJECTS),
            dbClear(STORES.VAULT_FILES),
            dbClear(STORES.NOTICES),
            dbClear(STORES.CHAT_MESSAGES),
          ]);
          if (!isMounted || generation !== dataGenerationRef.current) return;
          localStorage.setItem(demoPurgeKey, 'true');
          setSubjects([]);
          setVaultFiles([]);
          setNotices([]);
          setChatMessages([]);
        } else {
          setSubjects(savedSubjects);
          setVaultFiles(savedFiles);
          setNotices(savedNotices);
        }

        // Restore the conversation from the saved threads, not from the flat message
        // mirror (which "New chat" empties). Only fall back to the mirror when no
        // thread has been saved yet, and never overwrite a chat the student already
        // started while this load was in flight.
        const activeThread = readActiveThread();
        const restored = activeThread?.messages?.length ? activeThread.messages : savedMessages;
        if (restored.length) setChatMessages((prev) => (prev.length ? prev : restored));

        // Populate attempts
        if (savedAttempts.length > 0) {
          setQuizAttempts(savedAttempts.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
        }

        // Populate services
        if (savedServices.length > 0) {
          setConnectedServices(savedServices);
        } else {
          await dbPutMany(STORES.CONNECTED_SERVICES, INITIAL_CONNECTED_SERVICES);
          if (!isMounted || generation !== dataGenerationRef.current) return;
          setConnectedServices(INITIAL_CONNECTED_SERVICES);
        }

        setIsDbReady(true);
        refreshStorageStats();
      } catch (err) {
        console.warn('Could not initialize from IndexedDB, falling back to memory state:', err);
        setIsDbReady(true);
      }
    }

    loadFromDB();

    return () => {
      isMounted = false;
    };
  }, [refreshStorageStats]);

  // Firebase Auth Observer & Firestore Synchronizer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      setFirebaseUser(user);
      if (user) {
        // Restore the Google Classroom token stored server-side so the student does not
        // need to re-authorize Google Classroom when they open the app on another device.
        const restored = await restoreGoogleTokenFromServer();
        if (restored) {
          setCachedToken(restored);
        }
        // Load the student's subject <-> Google Classroom links once signed in.
        await fetchClassroomLinks();

        const initials = (user.displayName || user.email || 'ST')
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();

        const activeStudentProfile: UserProfile = {
          name: user.displayName || 'Student',
          idNumber: `SHS-${user.uid.slice(0, 4).toUpperCase()}`,
          email: user.email || '',
          role: 'student',
          program: 'Senior High School (SHS)',
          semester: '2025/2026',
          avatarInitials: initials,
          assignedClassIds: [],
        };
        setCustomProfile(activeStudentProfile);

        // Sync student profile to Firestore
        syncUserProfileToFirestore({
          uid: user.uid,
          email: user.email || '',
          name: user.displayName || 'Student',
          schoolLevel: 'SHS',
          targetExam: 'WASSCE 2026',
        }).catch((err: Error) => console.warn('Firestore user profile sync warning:', err));

        // Load quiz attempts from Firestore and merge
        fetchQuizAttemptsFromFirestore(user.uid)
          .then((firestoreAttempts) => {
            if (firestoreAttempts && firestoreAttempts.length > 0) {
              setQuizAttempts((prev) => {
                const map = new Map<string, QuizAttempt>();
                firestoreAttempts.forEach((a) => map.set(a.id, a));
                prev.forEach((a) => {
                  if (!map.has(a.id)) map.set(a.id, a);
                });
                return Array.from(map.values()).sort((a: QuizAttempt, b: QuizAttempt) => b.timestamp.localeCompare(a.timestamp));
              });
            }
          })
          .catch((err: Error) => console.warn('Firestore quiz fetch error:', err));
      }
    });

    return () => unsubscribe();
  }, []);

  // Pull the student's cloud-saved Adom AI conversations on sign-in so chats survive
  // reloads and new devices. The list endpoint carries titles only; message bodies are
  // fetched per thread when it is opened (see openThread).
  useEffect(() => {
    let mounted = true;
    async function loadCloudThreads() {
      if (!authUser) return;
      const generation = dataGenerationRef.current;
      try {
        const res = await fetch('/api/ai/threads', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted || generation !== dataGenerationRef.current || !Array.isArray(data?.threads)) return;

        const local = readThreads();
        const localById = new Map(local.map((t) => [t.id, t]));
        const cloudThreads: ChatThread[] = data.threads.map((t: any) => {
          const existing = localById.get(t.id);
          return {
            id: t.id,
            title: t.title || existing?.title || 'New chat',
            titleIsAi: Boolean(t.titleIsAi ?? existing?.titleIsAi),
            createdAt: Number(t.createdAt) || existing?.createdAt || Date.now(),
            updatedAt: Number(t.updatedAt) || existing?.updatedAt || Date.now(),
            // Never replace real local messages with the list endpoint's empty array.
            messages: existing?.messages?.length ? existing.messages : [],
          };
        });
        for (const existing of local) {
          if (!cloudThreads.some((t) => t.id === existing.id)) cloudThreads.push(existing);
        }
        cloudThreads.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
        setChatThreads(cloudThreads);
        // Persist only threads that actually have messages. Persisting metadata-only
        // rows made readThreads() drop them and lose the conversation.
        saveThreads(cloudThreads.filter((t) => t.messages.length > 0));
      } catch {
        // Cloud unreachable: the localStorage copy still loads above.
      }
    }
    loadCloudThreads();
    return () => {
      mounted = false;
    };
  }, [authUser?.id]);

  // Handle Tab Switch
  const setCurrentTab = (tab: TabType) => {
    setCurrentTabState(tab);
    setActiveFileId(null);
    setActiveReaderFileId(null);
    setActiveNoticeId(null);
  };

  // Sync theme and accessibility options to DOM
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const isDark =
        settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
      root.classList.toggle('dark', isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';
    };

    applyTheme();

    // In System mode, follow live OS theme changes.
    const onSystemChange = () => {
      if (settings.theme === 'system') applyTheme();
    };
    media.addEventListener('change', onSystemChange);
    return () => media.removeEventListener('change', onSystemChange);
  }, [settings.theme]);

  // Sync display settings (contrast, text size)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('contrast-more', settings.highContrast);
    root.style.fontSize =
      settings.fontSize === 'small' ? '14px' : settings.fontSize === 'large' ? '17px' : '16px';
    localStorage.setItem('classapp_theme', settings.theme);
  }, [settings.theme, settings.highContrast, settings.fontSize]);

  const setTheme = (theme: ThemeMode) => {
    setSettings((prev) => ({ ...prev, theme }));
  };

  const updateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  // Role can no longer be set client-side; it follows the real account. Kept as a
  // no-op because the context type still exposes it and tests touch permissions.
  const setUserRole = (_role: UserRole) => {
    // no-op: the displayed role always comes from the signed-in account.
  };

  // Permission checkers — prefects manage only the class the server assigned them.
  const canManageCurrentClass = (classId: string) => {
    if (userRole === 'prefect') {
      return classId === (authUser?.prefectOfClass || authUser?.className);
    }
    return canManageClass(userRole, classId, userProfile.assignedClassIds || []);
  };

  const canPublishNotices = canPublishSchoolNotices(userRole);

  // Storage calculation
  const totalOfflineStorageMB = vaultFiles
    .filter((f) => f.isOffline)
    .reduce((acc, f) => {
      const num = parseFloat(f.fileSize);
      if (f.fileSize.includes('KB')) return acc + num / 1024;
      return acc + (isNaN(num) ? 1 : num);
    }, 0);

  const toggleOffline = async (fileId: string) => {
    const updated = vaultFiles.map((f) =>
      f.id === fileId
        ? {
            ...f,
            isOffline: !f.isOffline,
            lastCachedAt: !f.isOffline ? new Date().toLocaleDateString() : f.lastCachedAt,
            syncStatus: (!f.isOffline ? 'synced' : 'local_only') as LocalVaultFile['syncStatus'],
          }
        : f
    );
    setVaultFiles(updated);

    const changed = updated.find((f) => f.id === fileId);
    if (changed) {
      await dbPut(STORES.VAULT_FILES, changed);
      refreshStorageStats();
    }
  };

  const addVaultFile = async (fileData: {
    name: string;
    content: string;
    subjectCode?: string;
    folder?: LocalVaultFile['folder'];
    description?: string;
    previewUrl?: string;
    mimeType?: string;
  }) => {
    const sizeNumber = Math.max(0.1, Number((fileData.content.length / (1024 * 1024)).toFixed(1)));
    const format: LocalVaultFile['fileFormat'] = fileData.name.endsWith('.docx')
      ? 'DOCX'
      : fileData.name.endsWith('.pptx')
      ? 'PPTX'
      : fileData.name.endsWith('.zip')
      ? 'ZIP'
      : fileData.name.endsWith('.png') || fileData.name.endsWith('.jpg') || fileData.name.endsWith('.jpeg') || fileData.name.endsWith('.svg') || fileData.name.endsWith('.webp')
      ? 'IMAGE'
      : fileData.name.endsWith('.txt')
      ? 'TXT'
      : 'PDF';

    const newFile: LocalVaultFile = {
      id: `vf-${Date.now()}`,
      name: fileData.name.trim(),
      folder: fileData.folder || 'notes',
      subjectId: fileData.subjectCode ? fileData.subjectCode.toLowerCase().replace(/\s+/g, '') : 'general',
      subjectCode: fileData.subjectCode || 'GENERAL',
      fileSize: `${sizeNumber} MB`,
      fileFormat: format,
      updatedAt: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      isOffline: true,
      downloadsCount: 1,
      description: fileData.description || 'Personal high school revision and study note',
      keyConcepts: ['Study Notes', fileData.subjectCode || 'General'],
      content: fileData.content,
      previewUrl: fileData.previewUrl,
      mimeType: fileData.mimeType,
      lastCachedAt: new Date().toLocaleDateString(),
      syncStatus: 'synced',
    };
    const updated = [newFile, ...vaultFiles];
    setVaultFiles(updated);
    await dbPut(STORES.VAULT_FILES, newFile);
    refreshStorageStats();
  };

  const saveDocumentNotes = async (fileId: string, notes: string) => {
    const updated = vaultFiles.map((f) => (f.id === fileId ? { ...f, notes } : f));
    setVaultFiles(updated);
    const target = updated.find((f) => f.id === fileId);
    if (target) await dbPut(STORES.VAULT_FILES, target);
  };

  const removeVaultFile = async (fileId: string) => {
    const updated = vaultFiles.filter((f) => f.id !== fileId);
    setVaultFiles(updated);
    await dbDelete(STORES.VAULT_FILES, fileId);
    refreshStorageStats();
  };

  const clearOfflineStorage = async () => {
    const updated = vaultFiles.map((f) => ({ ...f, isOffline: false, syncStatus: 'local_only' as const }));
    setVaultFiles(updated);
    await dbPutMany(STORES.VAULT_FILES, updated);
    refreshStorageStats();
  };

  // Notices operations
  const toggleNoticeRead = async (noticeId: string) => {
    const updated = notices.map((n) => (n.id === noticeId ? { ...n, isUnread: !n.isUnread } : n));
    setNotices(updated);
    const item = updated.find((n) => n.id === noticeId);
    if (item) await dbPut(STORES.NOTICES, item);
  };

  const toggleNoticePin = async (noticeId: string) => {
    const updated = notices.map((n) => (n.id === noticeId ? { ...n, isPinned: !n.isPinned } : n));
    setNotices(updated);
    const item = updated.find((n) => n.id === noticeId);
    if (item) await dbPut(STORES.NOTICES, item);
  };

  const addNotice = async (notice: Omit<Notice, 'id' | 'timeAgo'>) => {
    const newNotice: Notice = {
      ...notice,
      id: `not-${Date.now()}`,
      timeAgo: 'Just now',
    };
    const updated = [newNotice, ...notices];
    setNotices(updated);
    await dbPut(STORES.NOTICES, newNotice);
  };

  const unreadNoticesCount = notices.filter((n) => n.isUnread).length;

  // Subject operations
  const addSubject = async (newSubjectData: {
    code: string;
    name: string;
    description?: string;
    instructor?: string;
    room?: string;
    schedule?: string;
  }) => {
    const newSubj: Subject = {
      id: `subj-${Date.now()}`,
      code: newSubjectData.code.trim().toUpperCase(),
      name: newSubjectData.name.trim(),
      description: newSubjectData.description || 'Personal high school subject coursework and study plan.',
      instructor: newSubjectData.instructor || 'Self-Study / Class',
      instructorEmail: '',
      room: newSubjectData.room || 'Classroom',
      schedule: newSubjectData.schedule || 'Scheduled Study',
      progressPercent: 0,
      totalLectures: 0,
      attendedLectures: 0,
      nextSession: 'Upcoming Session',
      syllabus: [],
      activities: [],
    };
    const updated = [...subjects, newSubj];
    setSubjects(updated);
    await dbPut(STORES.SUBJECTS, newSubj);
  };

  const removeSubject = async (subjectId: string) => {
    const updated = subjects.filter((s) => s.id !== subjectId);
    setSubjects(updated);
    await dbDelete(STORES.SUBJECTS, subjectId);
  };

  // Class activity
  const addSubjectActivity = async (subjectId: string, activity: Omit<ClassActivity, 'id' | 'date'>) => {
    const newAct: ClassActivity = {
      ...activity,
      id: `act-${Date.now()}`,
      date: 'Just now',
    };
    let updatedSubj: Subject | null = null;
    const updated = subjects.map((subj) => {
      if (subj.id === subjectId) {
        updatedSubj = { ...subj, activities: [newAct, ...subj.activities] };
        return updatedSubj;
      }
      return subj;
    });
    setSubjects(updated);
    if (updatedSubj) {
      await dbPut(STORES.SUBJECTS, updatedSubj);
    }
  };

  // Chat message operations
  const aiAbortRef = React.useRef<AbortController | null>(null);
  const partialSaveControllerRef = React.useRef<AbortController | null>(null);
  const lastChatRequestRef = React.useRef<{
    contextSubject?: string;
    fileContext?: { name: string; content: string };
    deep?: boolean;
    wantImage?: boolean;
    wantChart?: boolean;
    teacherMode?: boolean;
  }>({});

  /**
   * Account isolation. A shared school phone must never show the previous student's
   * chats, quiz attempts or cached study sets. Same-account reloads keep local data;
   * logout or a different account clears it. Runs only after auth has finished loading.
   */
  useEffect(() => {
    if (authLoading) return;
    const id = authUser?.id ?? null;
    let previous = '';
    try {
      previous = localStorage.getItem(LAST_USER_KEY) || '';
    } catch {
      previous = '';
    }
    const changed = id === null ? previous !== '' : previous !== '' && previous !== String(id);
    if (changed) {
      // Do not save an aborted answer into the next account.
      partialSaveControllerRef.current = null;
      aiAbortRef.current?.abort();
      aiAbortRef.current = null;
      dataGenerationRef.current += 1;
      threadRequestRef.current += 1;
      setThreadLoadingId(null);
      setIsAiThinking(false);
      setIsChatThinking(false);
      setChatMessages([]);
      setChatThreads([]);
      setQuizAttempts([]);
      setVaultFiles([]);
      setNotices([]);
      setSubjects([]);
      setThreadError(null);
      setIsProfileOpen(false);
      setActiveQuizData(null);
      setActiveFlashcardsData(null);
      setActiveQuizOpen(false);
      setActiveFlashcardsOpen(false);

      // Google Classroom/Drive data belongs to the previous account too.
      clearCachedToken();
      void signOut(auth).catch(() => {});
      setFirebaseUser(null);
      setCustomProfile(null);
      setClassroomCourses([]);
      setClassroomCourseWork({});
      setClassroomMaterials({});
      setClassroomAnnouncements({});
      setClassroomTeachers({});
      setClassroomSubmissions({});
      setSelectedClassroomId(null);
      setClassroomLinks([]);
      setDriveFiles([]);
      setClassroomAutosyncEnabled(false);
      setClassroomAutosyncCourseId(null);
      setWorkspaceError(null);
      setConnectedServices(INITIAL_CONNECTED_SERVICES);

      try {
        localStorage.removeItem(THREADS_KEY);
        localStorage.removeItem(ACTIVE_THREAD_KEY);
      } catch {
        // Storage unavailable; state is still cleared.
      }
      void dbClear(STORES.CHAT_MESSAGES);
      void dbClear(STORES.QUIZ_ATTEMPTS);
      void dbClear(STORES.STUDY_SETS);
    }
    try {
      localStorage.setItem(LAST_USER_KEY, id === null ? '' : String(id));
    } catch {
      // Non-fatal.
    }
  }, [authUser?.id, authLoading]);

  const stopAiResponse = () => {
    const controller = aiAbortRef.current;
    if (!controller) return;
    // Keep whatever genuinely arrived; sendMessage's abort path saves it to the thread.
    partialSaveControllerRef.current = controller;
    controller.abort();
    aiAbortRef.current = null;
    // Drop the streaming flag immediately: the abort propagates through the async catch a
    // moment later, and until then the caret and floating actions stayed on screen.
    setChatMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
    setIsAiThinking(false);
    setIsChatThinking(false);
  };

  const speechRecognitionRef = React.useRef<any>(null);

  // ---- Teacher mode & rich output ----
  const setTeacherMode = (enabled: boolean) => {
    setTeacherModeState(enabled);
  };

  const setActiveChart = (spec: ChartSpec | null) => {
    setActiveChartState(spec);
  };

  const setActiveImages = (imgs: ImageResult[]) => {
    setActiveImagesState(imgs);
  };

  // ---- Voice (free, browser Web Speech API) ----
  const startListening = (onResult: (text: string, isFinal: boolean) => void) => {
    if (isListening) return;
    const controller = startSpeechToText((text, isFinal) => {
      onResult(text, isFinal);
    }, (err) => {
      console.warn('Speech-to-text error:', err);
      setIsListening(false);
    });
    speechRecognitionRef.current = controller;
    setIsListening(true);
  };

  const stopListening = () => {
    setIsListening(false);
    speechRecognitionRef.current?.stop();
    speechRecognitionRef.current = null;
  };

  // ---- Read aloud (free, browser Web Speech API) ----
  const readAloud = (text: string, onEnd?: () => void) => {
    speak(text, { lang: 'en-GB', rate: 1, onEnd });
  };

  const stopReadAloud = () => {
    stopSpeaking();
  };

  // ---- OCR (free, Tesseract.js in browser) ----
  const handleOcrImage = async (file: File | Blob | string): Promise<string> => {
    return ocrImage(file);
  };

  /**
   * Long-term memory: a short, capped digest of recent questions from ALL chats so a new
   * conversation still "remembers" what the student has been studying. Capped to keep
   * token cost flat no matter how much history builds up.
   */
  const buildMemoryDigest = (): string => {
    const lines: string[] = [];
    for (const thread of chatThreads) {
      for (let i = thread.messages.length - 1; i >= 0; i--) {
        const m = thread.messages[i];
        if (m.sender === 'user' && m.content.trim()) {
          lines.push(m.content.trim().replace(/\s+/g, ' ').slice(0, 90));
          break;
        }
      }
    }
    return lines.slice(0, 6).reverse().join(' | ');
  };

  const sendMessage = async (
    text: string,
    contextSubject?: string,
    fileContext?: { name: string; content: string },
    deep?: boolean,
    opts?: {
      /** Transcript to send as history (used by retry, which must not duplicate the question). */
      history?: ChatMessage[];
      /** false when the question is already on screen and must not be appended again. */
      appendUser?: boolean;
      /** The already-visible user message, reused so thread IDs stay stable on retry. */
      existingUserMsg?: ChatMessage;
      /** Ask DeepSeek whether a web image helps and fetch real results. */
      wantImage?: boolean;
      /** Ask DeepSeek for a chart spec rendered client-side. */
      wantChart?: boolean;
      /** Socratic tutoring: guide with questions instead of direct answers. */
      teacherMode?: boolean;
    }
  ) => {
    if (!text.trim()) return;
    // One live answer at a time. This guard is in the context, not just the composer,
    // so quiz/flashcard "Ask Adom AI" callbacks cannot start a second stream.
    if (aiAbortRef.current || isAiThinking) return;

    // Auto-detect image intent: only genuine requests for a real photograph or
    // diagram. Common filler ("what do", "show me", "view") must NOT trigger it,
    // otherwise every routine question fires an unnecessary image search.
    const imageKeywords = [
      'picture', 'photo', 'image', 'photograph', 'drawing', 'diagram of', 'look like',
    ];
    const autoWantImage = imageKeywords.some((kw) => text.toLowerCase().includes(kw));

    // Auto-detect chart intent: only genuine requests for a graph/chart. Broad math
    // words ("function", "equation", "data", "solve") must NOT trigger it on their own.
    const chartKeywords = [
      'graph', 'chart', 'plot', 'line graph', 'bar chart', 'pie chart', 'scatter plot',
      'inequality', 'inequalities', 'sine wave', 'cosine wave',
    ];
    const autoWantChart = chartKeywords.some((kw) => text.toLowerCase().includes(kw));

    // Auto teacher mode: explanatory questions trigger Socratic tutoring.
    const autoTeacher = /^(explain|how|why|what is|what are|teach me|show me|solve|step by step|walk me through|break down)/i.test(text);

    const appendUser = opts?.appendUser !== false;
    const userMsg: ChatMessage =
      opts?.existingUserMsg || {
        id: makeMessageId('u'),
        sender: 'user',
        content: text.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

    const baseHistory = opts?.history ?? chatMessages;
    // The API sends the current question separately, so it must not also be the last
    // entry of `history` (the old code sent the opening question twice).
    const historyForApi = appendUser
      ? baseHistory
      : baseHistory.filter((m) => m.id !== userMsg.id);

    // Title request only on the very first message of a brand-new conversation.
    const isFirstMessage = !baseHistory.some((m) => m.sender === 'user');

    const controller = new AbortController();
    aiAbortRef.current = controller;
    lastChatRequestRef.current = {
      contextSubject,
      fileContext,
      deep,
      wantImage: autoWantImage,
      wantChart: autoWantChart,
      teacherMode: opts?.teacherMode === true || autoTeacher,
    };
    setIsAiThinking(true);
    setIsChatThinking(true);

    const botId = makeMessageId('a');
    let partialText = '';

    try {
      if (appendUser) {
        setChatMessages((prev) => [...prev, userMsg]);
        await dbPut(STORES.CHAT_MESSAGES, userMsg);
        await saveThread([...baseHistory, userMsg]);
      }

      // Live answer bubble: it appears empty and fills as words arrive, so the student is
      // never looking at a blank spinner while a long answer is written.
      setChatMessages((prev) => [
        ...prev,
        {
          id: botId,
          sender: 'assistant',
          content: '',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          engine: 'deepseek',
          streaming: true,
        },
      ]);

      const response = await streamStudyResponse(text, {
        contextSubject,
        fileContext,
        history: historyForApi,
        deep,
        memory: buildMemoryDigest(),
        // Only the opening question asks for a title, so later turns cost nothing extra.
        wantTitle: isFirstMessage,
        wantImage: autoWantImage,
        wantChart: autoWantChart,
        teacherMode: opts?.teacherMode === true || autoTeacher,
        signal: controller.signal,
        onDelta: (delta) => {
          // A stop must not leave half a sentence streaming in after the tap.
          if (controller.signal.aborted) return;
          partialText += delta;
          setChatMessages((prev) =>
            prev.map((m) => (m.id === botId ? { ...m, content: m.content + delta } : m))
          );
        },
      });

      // Rich output: chart, images, teacher mode
      if (response.chart) setActiveChartState(response.chart);
      if (response.images?.length) setActiveImagesState(response.images);
      if (response.teacherMode) setTeacherModeState(true);

      const botMsg: ChatMessage = {
        id: botId,
        sender: 'assistant',
        content: response.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: response.mode,
        engine: response.engine,
        interactiveData: response.interactiveData,
        ...(response.chart ? { chartData: response.chart } : {}),
        ...(response.images?.length ? { images: response.images } : {}),
        ...(response.partial
          ? {
              error: 'The connection ended before this answer finished. You can retry for the rest.',
              retryable: true,
            }
          : {}),
      };

      setChatMessages((prev) => prev.map((m) => (m.id === botId ? botMsg : m)));
      await dbPut(STORES.CHAT_MESSAGES, botMsg);

      // First answer names the conversation (the model supplies it with the reply).
      if (response.title && isFirstMessage) {
        setThreadTitle(`t-${userMsg.id}`, response.title);
      }

      await saveThread(
        appendUser ? [...baseHistory, userMsg, botMsg] : [...baseHistory, botMsg]
      );
    } catch (err) {
      // A user stop keeps whatever was already written — it is real, visible output.
      if (controller.signal.aborted) {
        setChatMessages((prev) =>
          prev
            .map((m) => (m.streaming ? { ...m, streaming: false } : m))
            .filter((m) => !(m.id === botId && !m.content.trim()))
        );
        // Save the partial answer to the old conversation, even if the student has
        // already moved to a new chat. It is genuine output and should not disappear.
        if (partialSaveControllerRef.current === controller && partialText.trim()) {
          const botMsg: ChatMessage = {
            id: botId,
            sender: 'assistant',
            content: partialText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            engine: 'deepseek',
          };
          void saveThread(
            appendUser ? [...baseHistory, userMsg, botMsg] : [...baseHistory, botMsg],
            { markActive: false }
          );
        }
      } else {
        // No fabricated answer. Report the real reason and keep it out of saved history so the
        // transcript stays a record of actual AI responses only.
        const reason =
          err instanceof AiUnavailableError
            ? err.message
            : 'Adom AI could not answer that request. Please try again.';
        const retryable =
          err instanceof AiUnavailableError
            ? err.reason !== 'not_configured' && err.reason !== 'rate_limited'
            : true;
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === botId
              ? {
                  ...m,
                  streaming: false,
                  // Partial genuine output stays readable, with the failure noted underneath.
                  content: m.content.trim() ? m.content : '',
                  error: reason,
                  retryable,
                }
              : m
          )
        );
        // NOT saved to the thread: reopening a conversation must not replay stale errors
        // with a "Try again" button that no longer matches the last question.
      }
    } finally {
      if (aiAbortRef.current === controller) {
        aiAbortRef.current = null;
        setIsAiThinking(false);
        setIsChatThinking(false);
        if (partialSaveControllerRef.current === controller) {
          partialSaveControllerRef.current = null;
        }
      }
    }
  };

  /** Retry the last question after a failure — reuses the same question, no retyping. */
  const retryLastMessage = async () => {
    const lastUser = [...chatMessages].reverse().find((m) => m.sender === 'user');
    if (!lastUser) return;

    // Remove the failed bubble(s) after the last question. Index comparison (not object
    // order) is used because a failed stream leaves an assistant message *containing*
    // partial output, which must go too or the retry would stack under it.
    const lastUserIndex = chatMessages.lastIndexOf(lastUser);
    const kept = chatMessages.filter(
      (m, idx) => !(idx > lastUserIndex && m.sender === 'assistant' && (m.error || !m.content.trim()))
    );
    setChatMessages(kept);

    // Keep the original subject, attached note and deep flag. Retrying a grounded
    // question as a plain one silently changes what the student asked.
    const last = lastChatRequestRef.current;
    await sendMessage(lastUser.content, last.contextSubject, last.fileContext, last.deep, {
      history: kept,
      appendUser: false,
      existingUserMsg: lastUser,
      wantImage: last.wantImage,
      wantChart: last.wantChart,
      teacherMode: last.teacherMode,
    });
  };

  // ---- Conversation threads (real, persisted, auto-titled) ----
  /** Fallback name used only until Adom AI supplies its own. */
  const makeTitle = (text: string): string => {
    const clean = text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^(please\s+)?(can you|could you|would you|explain|tell me|help me|what is|what are|how do i|how does|why is|give me)\s+/i, '')
      .replace(/[?!.]+$/g, '');
    const words = clean.split(' ').slice(0, 6).join(' ');
    return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 46) || 'New chat';
  };

  const loadThreads = (): ChatThread[] => readThreads();

  /** Applies the AI-generated title to the current conversation. */
  const setThreadTitle = (threadId: string, title: string) => {
    const clean = title.trim().replace(/["'.]/g, '').slice(0, 48);
    if (!clean) return;
    const threads = loadThreads();
    const next = threads.map((t) => (t.id === threadId ? { ...t, title: clean, titleIsAi: true } : t));
    saveThreads(next);
    setChatThreads(next);
  };

  const saveThreads = (threads: ChatThread[]) => {
    const list = threads.slice(0, 40);
    // Try the full history first; on a full quota, shrink instead of silently
    // dropping the conversation the student is actually having.
    for (const keep of [list.length, 10, 3, 1]) {
      try {
        localStorage.setItem(THREADS_KEY, JSON.stringify(list.slice(0, keep)));
        return;
      } catch {
        // Quota full: try fewer threads.
      }
    }
    // Still too big: keep the newest conversation with a trimmed transcript.
    try {
      const newest = list[0];
      if (newest) {
        localStorage.setItem(
          THREADS_KEY,
          JSON.stringify([{ ...newest, messages: newest.messages.slice(-20) }])
        );
      }
    } catch {
      // Storage truly full: chat still works for this session.
    }
  };

  /** Push one conversation to the cloud so it survives reloads and new devices. */
  const saveThreadToCloud = async (thread: ChatThread) => {
    try {
      const res = await fetch('/api/ai/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: thread.id,
          title: thread.title,
          titleIsAi: Boolean(thread.titleIsAi),
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          messages: thread.messages,
        }),
      });
      if (!res.ok) {
        // Honest: the cloud save failed, but localStorage still holds the chat.
        console.warn('Cloud chat save declined:', await res.text());
      }
    } catch (err) {
      // Network failure: the local copy is still complete.
      console.warn('Cloud chat save unavailable:', err instanceof Error ? err.message : err);
    }
  };

  const newChat = async () => {
    threadRequestRef.current += 1;
    setThreadLoadingId(null);
    const hadActive = Boolean(aiAbortRef.current);
    stopAiResponse();
    // When a stream is live, the abort handler saves the partial answer to the old
    // thread. Otherwise save the finished conversation before clearing the screen.
    if (!hadActive && chatMessages.length) await saveThread(chatMessages);
    setChatMessages([]);
    setThreadError(null);
    // Remember that this is a deliberately empty chat, so a reload does not jump
    // back into the previous conversation.
    try {
      localStorage.setItem(ACTIVE_THREAD_KEY, '');
    } catch {
      // Storage full: non-fatal.
    }
    void dbClear(STORES.CHAT_MESSAGES);
  };

  /**
   * Saves / updates the conversation under an automatic title taken from its first
   * question. Called after EVERY message (not only on "New chat") so a reload never
   * loses the chat.
   */
  const saveThread = async (messages: ChatMessage[], opts?: { markActive?: boolean }) => {
    const firstUser = messages.find((m) => m.sender === 'user');
    if (!firstUser) return;

    const threads = chatThreads.length ? chatThreads : loadThreads();
    const id = `t-${firstUser.id}`; // stable ID from the first message: no duplicates
    const existing = threads.find((t) => t.id === id);

    // Keep the AI's own name once it has arrived; only fall back to the question
    // itself while waiting for it.
    const title = existing?.titleIsAi ? existing.title : makeTitle(firstUser.content);

    const next: ChatThread = {
      id,
      title,
      titleIsAi: existing?.titleIsAi ?? false,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
      messages,
    };
    const merged = [next, ...threads.filter((t) => t.id !== id)];
    saveThreads(merged.filter((t) => t.messages.length > 0));
    setChatThreads(merged);
    await saveThreadToCloud(next);
    if (opts?.markActive === false) return;
    // This conversation is the one on screen, so it is the one a reload should reopen.
    try {
      localStorage.setItem(ACTIVE_THREAD_KEY, id);
    } catch {
      // Storage full: non-fatal.
    }
  };

  const openThread = async (id: string) => {
    const requestId = threadRequestRef.current + 1;
    threadRequestRef.current = requestId;
    // Switching threads must not leave the previous answer streaming into the new one.
    stopAiResponse();
    setThreadError(null);

    const local =
      chatThreads.find((t) => t.id === id) || loadThreads().find((t) => t.id === id);
    if (local?.messages?.length) {
      setChatMessages(local.messages);
      try {
        localStorage.setItem(ACTIVE_THREAD_KEY, id);
      } catch {
        // Storage full: non-fatal.
      }
      return;
    }

    setThreadLoadingId(id);
    try {
      const res = await fetch(`/api/ai/threads/${encodeURIComponent(id)}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not load that chat.');
      }
      const data = await res.json();
      if (requestId !== threadRequestRef.current) return;
      const messages: ChatMessage[] = Array.isArray(data?.thread?.messages)
        ? data.thread.messages.map((m: any) => ({
            ...m,
            interactiveData: m.interactiveData ?? undefined,
            streaming: false,
          }))
        : [];
      setChatMessages(messages);
      const base = chatThreads.length ? chatThreads : loadThreads();
      const next = base.map((t) =>
        t.id === id
          ? {
              ...t,
              messages,
              title: data?.thread?.title || t.title,
              titleIsAi: Boolean(data?.thread?.titleIsAi ?? t.titleIsAi),
            }
          : t
      );
      saveThreads(next.filter((t) => t.messages.length > 0));
      setChatThreads(next);
      try {
        localStorage.setItem(ACTIVE_THREAD_KEY, id);
      } catch {
        // Storage full: non-fatal.
      }
    } catch (err) {
      if (requestId !== threadRequestRef.current) return;
      setThreadError(err instanceof Error ? err.message : 'Could not load that chat.');
      setChatMessages([]);
    } finally {
      if (requestId === threadRequestRef.current) setThreadLoadingId(null);
    }
  };

  // Restore the open (or most recent) conversation on reload so a refresh never looks "lost".
  const restoredRef = React.useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (chatMessages.length > 0) return;
    const thread = readActiveThread();
    if (thread?.messages?.length) setChatMessages(thread.messages);
  }, []);

  const deleteThread = async (id: string) => {
    let activeId = '';
    try {
      activeId = localStorage.getItem(ACTIVE_THREAD_KEY) || '';
    } catch {
      activeId = '';
    }
    if (activeId === id) {
      // Deleting the chat that is on screen must clear it too, or the next message
      // would re-create the same thread from the still-visible transcript.
      threadRequestRef.current += 1;
      setThreadLoadingId(null);
      stopAiResponse();
      setChatMessages([]);
      try {
        localStorage.setItem(ACTIVE_THREAD_KEY, '');
      } catch {
        // Storage full: non-fatal.
      }
    }

    const next = (chatThreads.length ? chatThreads : loadThreads()).filter((t) => t.id !== id);
    saveThreads(next.filter((t) => t.messages.length > 0));
    setChatThreads(next);
    try {
      await fetch(`/api/ai/threads/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch (err) {
      console.warn('Cloud chat delete unavailable:', err instanceof Error ? err.message : err);
    }
  };

  const clearChat = async () => {
    stopAiResponse();
    setChatMessages([]);
    setThreadError(null);
    await dbClear(STORES.CHAT_MESSAGES);
  };

  // Dynamic Quiz & Flashcard generation actions
  const generateCustomQuiz = async (
    topic: string,
    options?: {
      subjectCode?: string;
      fileContext?: string;
      count?: number;
      strand?: string;
      variant?: number;
      size?: StudySize;
      fresh?: boolean;
      openOnSuccess?: boolean;
    }
  ): Promise<GenerateStudyOutcome> => {
    const requested = clampStudyCount('quiz', options?.count ?? (options?.size ? STUDY_SIZES.quiz[options.size] : undefined));
    const strand = options?.strand;
    const formLevel = authUser ? formOf(authUser.className) : null;
    const variant = nextVariant(topic, 'quiz', options?.fresh === true, options?.variant);
    const signature = {
      kind: 'quiz' as StudyKind,
      topic,
      subjectCode: options?.subjectCode,
      strand,
      formLevel,
      count: requested,
      userId: authUser?.id,
      variant,
    };
    setIsAiThinking(true);
    try {
      // A set generated from a private note is never device-cached: another student on
      // the same phone must not be able to reopen it.
      const cacheable = !options?.fileContext;
      const cached = cacheable ? await getStoredStudySet(signature) : null;
      if (cached && Array.isArray((cached as any).questions) && (cached as any).questions.length > 0) {
        setActiveQuizData({
          title: (cached as any).quizTitle || `${topic} Practice`,
          subjectCode: options?.subjectCode,
          questions: (cached as any).questions,
        });
        if (options?.openOnSuccess !== false) setActiveQuizOpen(true);
        return { ok: true, count: (cached as any).questions.length, requested };
      }

      const res = await generateQuizQuestions(topic, {
        subjectCode: options?.subjectCode,
        fileContext: options?.fileContext,
        count: requested,
        strand,
        variant,
        formLevel,
      });
      setActiveQuizData({
        title: res.quizTitle,
        subjectCode: options?.subjectCode,
        questions: res.questions,
      });
      if (options?.openOnSuccess !== false) setActiveQuizOpen(true);
      if (cacheable) {
        await putStoredStudySet(signature, { questions: res.questions, quizTitle: res.quizTitle });
      }
      return { ok: true, count: res.questions.length, requested: res.requested ?? requested };
    } catch (err) {
      // Caller shows the honest failure state. No sample questions are substituted.
      return {
        ok: false,
        count: 0,
        requested,
        error: err instanceof AiUnavailableError ? err.message : 'Adom AI could not build that quiz.',
      };
    } finally {
      setIsAiThinking(false);
    }
  };

  const generateCustomFlashcards = async (
    topic: string,
    options?: {
      subjectCode?: string;
      fileContext?: string;
      count?: number;
      strand?: string;
      variant?: number;
      size?: StudySize;
      fresh?: boolean;
    }
  ): Promise<GenerateStudyOutcome> => {
    const requested = clampStudyCount(
      'flashcards',
      options?.count ?? (options?.size ? STUDY_SIZES.flashcards[options.size] : undefined)
    );
    const strand = options?.strand;
    const formLevel = authUser ? formOf(authUser.className) : null;
    const variant = nextVariant(topic, 'flashcards', options?.fresh === true, options?.variant);
    const signature = {
      kind: 'flashcards' as StudyKind,
      topic,
      subjectCode: options?.subjectCode,
      strand,
      formLevel,
      count: requested,
      userId: authUser?.id,
      variant,
    };
    setIsAiThinking(true);
    try {
      const cacheable = !options?.fileContext;
      const cached = cacheable ? await getStoredStudySet(signature) : null;
      if (cached && Array.isArray((cached as any).flashcards) && (cached as any).flashcards.length > 0) {
        setActiveFlashcardsData({
          topic: (cached as any).topic || topic,
          flashcards: (cached as any).flashcards,
        });
        setActiveFlashcardsOpen(true);
        return { ok: true, count: (cached as any).flashcards.length, requested };
      }

      const res = await generateFlashcardDeck(topic, {
        subjectCode: options?.subjectCode,
        fileContext: options?.fileContext,
        count: requested,
        strand,
        variant,
        formLevel,
      });
      setActiveFlashcardsData({
        topic: res.topic,
        flashcards: res.flashcards,
      });
      setActiveFlashcardsOpen(true);
      if (cacheable) {
        await putStoredStudySet(signature, { flashcards: res.flashcards, topic: res.topic });
      }
      return { ok: true, count: res.flashcards.length, requested: res.requested ?? requested };
    } catch (err) {
      return {
        ok: false,
        count: 0,
        requested,
        error: err instanceof AiUnavailableError ? err.message : 'Adom AI could not build that deck.',
      };
    } finally {
      setIsAiThinking(false);
    }
  };

  /**
   * Instant study tools.
   *
   * "Practice quizzes", "Flashcards" and "Custom quiz" used to open hardcoded sample sets,
   * or leave the student staring at a spinner while Adom AI generated a fresh set. Now:
   * - a set this student already has on the device opens immediately (no network at all),
   * - otherwise Adom AI generates it WITHOUT the "thinking" indicator, so the tool opens
   *   straight away and fills as the questions arrive,
   * - if generation fails, the real reason is returned and the caller says so — no sample
   *   content is ever substituted.
   */
  const openAiQuiz = async (options?: {
    topic?: string;
    subjectCode?: string;
    count?: number;
    strand?: string;
  }): Promise<GenerateStudyOutcome> => {
    const topic = (options?.topic || 'Revision practice').trim();
    const count = clampStudyCount('quiz', options?.count ?? STUDY_SIZES.quiz.quick);
    const formLevel = authUser ? formOf(authUser.className) : null;
    const signature = {
      kind: 'quiz' as StudyKind,
      topic,
      subjectCode: options?.subjectCode,
      strand: options?.strand,
      formLevel,
      count,
      userId: authUser?.id,
      variant: 0,
    };

    // 1. Instant: the exact set this student already has on this device (works offline too).
    // No fuzzy matching: a Quick 5 must not open someone else's Full 25.
    const instant = await getStoredStudySet(signature);
    if (instant) {
      const payload = instant as { questions?: QuizQuestion[]; quizTitle?: string };
      if (Array.isArray(payload?.questions) && payload.questions.length > 0) {
        setActiveQuizData({
          title: payload.quizTitle || `${topic} Practice`,
          subjectCode: options?.subjectCode,
          questions: payload.questions,
        });
        return { ok: true, count: payload.questions.length, requested: count, instant: true };
      }
    }

    // 2. Generate in the background: no thinking indicator, called directly (not through
    //    generateCustomQuiz) so it cannot flash the global "thinking" state on and off.
    try {
      const res = await generateQuizQuestions(topic, {
        subjectCode: options?.subjectCode,
        count,
        strand: options?.strand,
        variant: 0,
        formLevel,
      });
      setActiveQuizData({
        title: res.quizTitle,
        subjectCode: options?.subjectCode,
        questions: res.questions,
      });
      await putStoredStudySet(signature, { questions: res.questions, quizTitle: res.quizTitle });
      return { ok: true, count: res.questions.length, requested: res.requested ?? count };
    } catch (err) {
      return {
        ok: false,
        count: 0,
        requested: count,
        error: err instanceof AiUnavailableError ? err.message : 'Adom AI could not build that quiz.',
      };
    }
  };

  const openAiFlashcards = async (options?: {
    topic?: string;
    subjectCode?: string;
    count?: number;
    strand?: string;
  }): Promise<GenerateStudyOutcome> => {
    const topic = (options?.topic || 'Key definitions').trim();
    const count = clampStudyCount('flashcards', options?.count ?? STUDY_SIZES.flashcards.quick);
    const formLevel = authUser ? formOf(authUser.className) : null;
    const signature = {
      kind: 'flashcards' as StudyKind,
      topic,
      subjectCode: options?.subjectCode,
      strand: options?.strand,
      formLevel,
      count,
      userId: authUser?.id,
      variant: 0,
    };

    const instant = await getStoredStudySet(signature);
    if (instant) {
      const payload = instant as { flashcards?: Flashcard[]; topic?: string };
      if (Array.isArray(payload?.flashcards) && payload.flashcards.length > 0) {
        setActiveFlashcardsData({
          topic: payload.topic || topic,
          flashcards: payload.flashcards,
        });
        return { ok: true, count: payload.flashcards.length, requested: count, instant: true };
      }
    }

    try {
      const res = await generateFlashcardDeck(topic, {
        subjectCode: options?.subjectCode,
        count,
        strand: options?.strand,
        variant: 0,
        formLevel,
      });
      setActiveFlashcardsData({ topic: res.topic, flashcards: res.flashcards });
      await putStoredStudySet(signature, { flashcards: res.flashcards, topic: res.topic });
      return { ok: true, count: res.flashcards.length, requested: res.requested ?? count };
    } catch (err) {
      return {
        ok: false,
        count: 0,
        requested: count,
        error: err instanceof AiUnavailableError ? err.message : 'Adom AI could not build that deck.',
      };
    }
  };

  const generateDocumentSummary = async (file: LocalVaultFile): Promise<string> => {
    setIsAiThinking(true);
    try {
      // Errors propagate so the reader can show a retry state instead of echoing the file.
      const res = await summarizeDocument(file.name, file.content || file.description, file.subjectCode);
      return res.summary;
    } finally {
      setIsAiThinking(false);
    }
  };

  // Quiz attempt tracking (indexedDB + Firestore sync)
  const recordQuizAttempt = async (attempt: Omit<QuizAttempt, 'id' | 'timestamp' | 'dateFormatted'>) => {
    const record: QuizAttempt = {
      ...attempt,
      id: `qa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      dateFormatted: new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
    const updated = [record, ...quizAttempts];
    setQuizAttempts(updated);
    await dbPut(STORES.QUIZ_ATTEMPTS, record);

    if (auth.currentUser) {
      syncQuizAttemptToFirestore(auth.currentUser.uid, record).catch((err: Error) => {
        console.warn('Could not sync quiz attempt to Firestore:', err);
      });
    }
  };

  // Firebase Auth methods
  const signInWithGoogle = async () => {
    setIsAuthLoading(true);
    setWorkspaceError(null);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (token) {
        setCachedToken(token);
        // Persist server-side so the next device does not need another popup.
        void storeGoogleTokenOnServer(token, 3600);
      }

      if (result.user) {
        setFirebaseUser(result.user);
        const u = result.user;
        const initials = u.displayName
          ? u.displayName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()
          : 'ST';
        const profile: UserProfile = {
          name: u.displayName || 'Student',
          email: u.email || '',
          idNumber: u.email ? u.email.split('@')[0].toUpperCase() : 'SHS-STUDENT',
          role: 'student',
          program: 'Senior High School (SHS)',
          semester: '2025/2026',
          avatarInitials: initials,
          assignedClassIds: [],
        };
        setCustomProfile(profile);

        // Mark services connected with the user's real email
        setConnectedServices((prev) =>
          prev.map((s) => ({
            ...s,
            isConnected: true,
            accountEmail: u.email || undefined,
            lastSyncedAt: 'Just now',
          }))
        );
      }

      // Automatically sync Google Classroom and Google Drive as part of login
      if (token) {
        await Promise.allSettled([
          syncGoogleClassroom(token),
          syncGoogleDrive(undefined, token),
        ]);
      }
    } catch (err: any) {
      console.error('Sign-in failed:', err);
      if (err?.code !== 'auth/popup-closed-by-user') {
        setWorkspaceError(err?.message || 'Failed to sign in with Google');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const signOutAccount = async () => {
    clearCachedToken();
    await clearGoogleTokenOnServer();
    await signOut(auth);
    setFirebaseUser(null);
    setCustomProfile(null);
    setClassroomCourses([]);
    setClassroomCourseWork({});
    setClassroomMaterials({});
    setClassroomAnnouncements({});
    setClassroomTeachers({});
    setClassroomSubmissions({});
    setSelectedClassroomId(null);
    setDriveFiles([]);
    setConnectedServices((prev) =>
      prev.map((s) => ({ ...s, isConnected: false, accountEmail: undefined }))
    );
  };

  // Google Classroom & Drive Workspace sync methods
  const syncGoogleClassroom = async (token?: string): Promise<boolean> => {
    setIsLoadingWorkspace(true);
    setWorkspaceError(null);
    try {
      const activeToken = token || (await requestGoogleAccessToken());
      const courses = await fetchClassroomCourses(activeToken);
      setClassroomCourses(courses);
      const accountEmail = auth.currentUser?.email || userProfile.email;
      setConnectedServices((prev) =>
        prev.map((s) =>
          s.id === 'google_classroom'
            ? { ...s, isConnected: true, lastSyncedAt: 'Just now', accountEmail }
            : s
        )
      );

      // Concurrently fetch assignments, materials, announcements, teachers, and submissions
      const cwMap: Record<string, ClassroomCourseWork[]> = {};
      const matMap: Record<string, ClassroomCourseWorkMaterial[]> = {};
      const annMap: Record<string, ClassroomAnnouncement[]> = {};
      const tchMap: Record<string, ClassroomTeacher[]> = {};
      const subMap: Record<string, StudentSubmission[]> = {};

      await Promise.allSettled(
        courses.slice(0, 10).map(async (course) => {
          try {
            const [works, mats, anns, teachers, subs] = await Promise.all([
              fetchCourseWork(course.id, activeToken).catch(() => []),
              fetchClassroomMaterials(course.id, activeToken).catch(() => []),
              fetchCourseAnnouncements(course.id, activeToken).catch(() => []),
              fetchClassroomTeachers(course.id, activeToken).catch(() => []),
              fetchStudentSubmissions(course.id, activeToken).catch(() => []),
            ]);
            cwMap[course.id] = works;
            matMap[course.id] = mats;
            annMap[course.id] = anns;
            tchMap[course.id] = teachers;
            subMap[course.id] = subs;
          } catch {
            // ignore individual course error
          }
        })
      );

      setClassroomCourseWork(cwMap);
      setClassroomMaterials(matMap);
      setClassroomAnnouncements(annMap);
      setClassroomTeachers(tchMap);
      setClassroomSubmissions(subMap);
      return true;
    } catch (err: any) {
      console.error('Failed to sync Google Classroom:', err);
      if (err?.code !== 'auth/popup-closed-by-user') {
        setWorkspaceError(err?.message || 'Could not connect to Google Classroom.');
      }
      return false;
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  /**
   * Connect Google Classroom for the signed-in ClassApp account.
   *
   * `signInWithPopup` is the first awaited call on purpose: browsers only allow a
   * popup while the user's click is still active, so loading a script or probing
   * the network first loses that permission and the window is blocked.
   */
  const connectGoogleClassroom = async (): Promise<boolean> => {
    setWorkspaceError(null);
    setIsLoadingWorkspace(true);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (!token) {
        throw new Error('Google signed in but did not return an access token. Try again.');
      }
      setCachedToken(token);
      setFirebaseUser(result.user);
      // Persist server-side so a reload or another device does not need a second popup.
      void storeGoogleTokenOnServer(token, 3600);
      return await syncGoogleClassroom(token);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        // The student closed the window; that is not an error worth shouting about.
        return false;
      }
      console.error('Failed to connect Google Classroom:', err);
      const code = err?.code as string | undefined;
      const hint =
        code === 'auth/popup-blocked'
          ? 'Google sign-in could not open. Allow pop-ups for this site, and make sure its address is listed under Firebase Authentication → Settings → Authorized domains.'
          : code === 'auth/unauthorized-domain'
            ? 'This site is not authorised for Google sign-in yet. Add its address under Firebase Authentication → Settings → Authorized domains.'
            : code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found'
              ? 'Google sign-in is not enabled for this project. Enable the Google provider under Firebase Authentication → Sign-in method.'
              : code === 'auth/operation-not-supported-in-this-environment'
                ? 'This browser does not support Google sign-in. Open the app in Chrome or Safari.'
                : err?.message || 'Could not connect to Google Classroom.';
      setWorkspaceError(hint);
      return false;
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  /** Forget the stored Google token and everything loaded from it. */
  const disconnectGoogleWorkspace = async (): Promise<void> => {
    setWorkspaceError(null);
    clearCachedToken();
    await clearGoogleTokenOnServer();
    try {
      await signOut(auth);
    } catch {
      // Not signed into Firebase; there is no session to end.
    }
    setFirebaseUser(null);
    setClassroomCourses([]);
    setClassroomCourseWork({});
    setClassroomMaterials({});
    setClassroomAnnouncements({});
    setClassroomTeachers({});
    setClassroomSubmissions({});
    setSelectedClassroomId(null);
    setClassroomLinks([]);
    setDriveFiles([]);
    setConnectedServices((prev) =>
      prev.map((s) => ({ ...s, isConnected: false, accountEmail: undefined, lastSyncedAt: undefined }))
    );
  };

  const syncGoogleDrive = async (query?: string, token?: string) => {
    setIsLoadingWorkspace(true);
    setWorkspaceError(null);
    try {
      const activeToken = token || (await requestGoogleAccessToken());
      const files = await fetchDriveFiles({ query, token: activeToken });
      setDriveFiles(files);
      setConnectedServices((prev) =>
        prev.map((s) =>
          s.id === 'google_drive'
            ? { ...s, isConnected: true, lastSyncedAt: 'Just now', accountEmail: auth.currentUser?.email || userProfile.email }
            : s
        )
      );
    } catch (err: any) {
      console.error('Failed to sync Google Drive:', err);
      if (err?.code !== 'auth/popup-closed-by-user') {
        setWorkspaceError(err?.message || 'Could not connect to Google Drive.');
      }
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  /**
   * Refresh a single Google Classroom course's assignments, posts, materials,
   * teachers and submissions without re-syncing every connected course.
   */
  const refreshClassroomCourse = async (courseId: string) => {
    setIsLoadingWorkspace(true);
    setWorkspaceError(null);
    try {
      const activeToken = await requestGoogleAccessToken();
      const [works, anns, mats, teachers, subs] = await Promise.all([
        fetchCourseWork(courseId, activeToken).catch(() => []),
        fetchCourseAnnouncements(courseId, activeToken).catch(() => []),
        fetchClassroomMaterials(courseId, activeToken).catch(() => []),
        fetchClassroomTeachers(courseId, activeToken).catch(() => []),
        fetchStudentSubmissions(courseId, activeToken).catch(() => []),
      ]);
      setClassroomCourseWork((prev) => ({ ...prev, [courseId]: works || [] }));
      setClassroomAnnouncements((prev) => ({ ...prev, [courseId]: anns || [] }));
      setClassroomMaterials((prev) => ({ ...prev, [courseId]: mats || [] }));
      setClassroomTeachers((prev) => ({ ...prev, [courseId]: teachers || [] }));
      setClassroomSubmissions((prev) => ({ ...prev, [courseId]: subs || [] }));
      setClassroomLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      const accountEmail = auth.currentUser?.email || userProfile.email;
      setConnectedServices((prev) =>
        prev.map((s) =>
          s.id === 'google_classroom'
            ? { ...s, isConnected: true, lastSyncedAt: 'Just now', accountEmail }
            : s
        )
      );
    } catch (err: any) {
      console.error('Failed to refresh classroom course:', err);
      if (err?.code !== 'auth/popup-closed-by-user') {
        setWorkspaceError(err?.message || 'Could not refresh that class.');
      }
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  /**
   * Load the signed-in student's subject <-> Google Classroom course links.
   */
  const fetchClassroomLinks = async () => {
    setLinksLoading(true);
    try {
      const res = await fetch('/api/classroom/links');
      if (!res.ok) return;
      const data = await res.json().catch(() => ({ links: [] }));
      const links: ClassroomLink[] = Array.isArray(data.links) ? data.links : [];
      setClassroomLinks(links);
    } catch (err) {
      console.warn('Could not load classroom links:', err);
    } finally {
      setLinksLoading(false);
    }
  };

  /**
   * On every account change, load the subject <-> Google Classroom links from the
   * server. If a still-valid Google token is stored for that account, also reload the
   * courses it points at so a new device does not need the popup again. This never
   * opens a popup on its own; an expired token leaves the Connect button in charge.
   */
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    (async () => {
      await fetchClassroomLinks();
      const token = await restoreGoogleTokenFromServer();
      if (!token || cancelled) return;
      setCachedToken(token);
      await syncGoogleClassroom(token);
    })();
    return () => {
      cancelled = true;
    };
    // Only re-run for a different account, not for every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  /**
   * Link a subject to a Google Classroom course the student has connected to.
   */
  const linkClassroomCourse = async (
    subjectCode: string,
    courseId: string,
    courseName?: string
  ): Promise<ClassroomLink | null> => {
    try {
      const res = await fetch('/api/classroom/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectCode, courseId, courseName }),
      });
      if (!res.ok) throw new Error('Could not link that classroom.');
      const data = await res.json().catch(() => ({}));
      const link: ClassroomLink = {
        subjectCode: data.link?.subject_code ?? String(subjectCode).toUpperCase().trim(),
        courseId: data.link?.classroom_course_id ?? String(courseId).trim(),
        courseName: data.link?.classroom_course_name ?? courseName,
      };
      setClassroomLinks((prev) => {
        const next = prev.filter((l) => l.subjectCode !== link.subjectCode);
        return [link, ...next];
      });
      return link;
    } catch (err: any) {
      console.error('Failed to link classroom:', err);
      setWorkspaceError(err?.message || 'Could not link that classroom.');
      return null;
    }
  };

  /**
   * Unlink a subject from its Google Classroom course.
   */
  const unlinkClassroomCourse = async (subjectCode: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/classroom/links/${encodeURIComponent(subjectCode)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Could not unlink.');
      setClassroomLinks((prev) => prev.filter((l) => l.subjectCode !== subjectCode.toUpperCase().trim()));
      return true;
    } catch (err: any) {
      console.error('Failed to unlink classroom:', err);
      setWorkspaceError(err?.message || 'Could not unlink that classroom.');
      return false;
    }
  };

  /** Get the linked Google Classroom course for a subject code, if any. */
  const getLinkedClassroomCourse = (subjectCode: string): ClassroomLink | undefined =>
    classroomLinks.find((l) => l.subjectCode === subjectCode.toUpperCase().trim());

  /**
   * Create a student submission (answer draft) for an assignment or short-answer question.
   */
  const createClassroomSubmission = async (
    courseId: string,
    courseWorkId: string,
    answer: string
  ) => {
    const activeToken = await requestGoogleAccessToken();
    const body: Record<string, any> = {};
    if (answer.trim()) body.shortAnswerSubmission = { answer };
    const res = await fetch(
      `/api/workspace/classroom/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(
        courseWorkId
      )}/studentSubmissions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || err?.error || 'Could not create your answer draft.');
    }
    await refreshClassroomCourse(courseId);
    return res.json();
  };

  /** Turn in a student submission. */
  const turnInClassroomSubmission = async (courseId: string, courseWorkId: string, submissionId: string) => {
    const activeToken = await requestGoogleAccessToken();
    const res = await fetch(
      `/api/workspace/classroom/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(
        courseWorkId
      )}/studentSubmissions/${encodeURIComponent(submissionId)}/turnIn`,
      { method: 'POST', headers: { Authorization: `Bearer ${activeToken}`, 'Content-Length': '0' } }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || err?.error || 'Could not turn that in.');
    }
    await refreshClassroomCourse(courseId);
    return res.json();
  };

  /** Add a private comment to a student submission. */
  const addClassroomComment = async (
    courseId: string,
    courseWorkId: string,
    submissionId: string,
    text: string
  ) => {
    const activeToken = await requestGoogleAccessToken();
    const res = await fetch(
      `/api/workspace/classroom/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(
        courseWorkId
      )}/studentSubmissions/${encodeURIComponent(submissionId)}/comments`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || err?.error || 'Could not post that comment.');
    }
    await refreshClassroomCourse(courseId);
    return res.json();
  };

  /** Clear the Adom AI draft context. */
  const clearAdomDraftContext = () => setAdomDraftContext(null);

  const toggleClassroomAutosync = async (courseId: string | null, enable?: boolean) => {
    const next = enable ?? !classroomAutosyncEnabled;
    setClassroomAutosyncEnabled(next);
    if (courseId) {
      setClassroomAutosyncCourseId(courseId);
      setSelectedClassroomId(courseId);
      await refreshClassroomCourse(courseId).catch(() => {});
    } else if (!next) {
      setClassroomAutosyncCourseId(null);
    }
  };

  const setClassroomAutosyncInterval = (ms: number) => {
    setClassroomAutosyncIntervalMs(Math.max(5000, Math.trunc(ms)));
  };

  /**
   * Per-class autosync: re-fetches the selected Classroom course on an interval.
   * Pauses when the tab is hidden or offline so it does not burn Google API quota
   * while no one is looking.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let active = true;

    const tick = async () => {
      if (!active || !classroomAutosyncEnabled || !classroomAutosyncCourseId || !isOnline) return;
      await refreshClassroomCourse(classroomAutosyncCourseId).catch(() => {});
    };

    if (classroomAutosyncEnabled && classroomAutosyncCourseId) {
      tick();
      timer = setInterval(tick, Math.max(5000, classroomAutosyncIntervalMs));
    }

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearInterval(timer);
        timer = null;
      } else if (!timer && classroomAutosyncEnabled && classroomAutosyncCourseId) {
        timer = setInterval(tick, Math.max(5000, classroomAutosyncIntervalMs));
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [classroomAutosyncEnabled, classroomAutosyncCourseId, classroomAutosyncIntervalMs, isOnline]);

  /**
   * Save an imported Google item into the REAL vault (the previous version wrote it into
   * a local list nothing displayed, so an import silently vanished).
   *
   * These are links, not files: downloading Drive bytes through the browser is slow and
   * often blocked by sharing permissions. A small text note records where it came from,
   * so it appears in the vault immediately, can be opened, and survives a reinstall.
   */
  const saveImportedLinkToVault = async (params: {
    title: string;
    description?: string;
    url?: string;
    subjectCode?: string;
  }): Promise<void> => {
    const title = params.title.trim().slice(0, 180) || 'Imported item';
    const safeName = `${title.replace(/[/\\]/g, '-')}.md`.slice(0, 200);
    const body = [
      `# ${title}`,
      '',
      params.description ? params.description : 'Imported study material.',
      '',
      params.url ? `[Open the original](${params.url})` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const query = new URLSearchParams({ name: safeName, type: 'text/markdown', folder: 'readings' });
    if (params.subjectCode) query.set('subject', params.subjectCode);
    if (params.description) query.set('description', params.description.slice(0, 500));

    const res = await fetch(`/api/vault/files?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Could not save that item to your vault.');
    }
  };

  const importDriveFileToVault = async (driveFile: DriveFileItem) => {
    await saveImportedLinkToVault({
      title: driveFile.name,
      description: `Imported from Google Drive (${driveFile.mimeType || 'file'}).`,
      url: driveFile.webViewLink,
      subjectCode: 'DRIVE',
    });
  };

  const importClassroomMaterialToVault = async (item: {
    title: string;
    description?: string;
    courseName?: string;
    courseId?: string;
    material: any;
  }) => {
    const driveObj = item.material?.driveFile?.driveFile;
    const linkObj = item.material?.link;
    const ytObj = item.material?.youtubeVideo;

    await saveImportedLinkToVault({
      title: driveObj?.title || linkObj?.title || ytObj?.title || item.title,
      description: item.description || `Classroom material from ${item.courseName || 'course'}.`,
      url: driveObj?.alternateLink || linkObj?.url || ytObj?.alternateLink,
      subjectCode: item.courseName ? item.courseName.slice(0, 40) : undefined,
    });
  };

  // Connected Services toggle (Google Classroom / Google Drive)
  const toggleConnectedService = async (serviceId: 'google_classroom' | 'google_drive') => {
    const target = connectedServices.find((s) => s.id === serviceId);
    if (!target?.isConnected) {
      if (serviceId === 'google_classroom') {
        await syncGoogleClassroom();
        return;
      }
      if (serviceId === 'google_drive') {
        await syncGoogleDrive();
        return;
      }
    }

    const updated = connectedServices.map((svc) => {
      if (svc.id === serviceId) {
        const nextState = !svc.isConnected;
        return {
          ...svc,
          isConnected: nextState,
          accountEmail: nextState ? userProfile.email : undefined,
          lastSyncedAt: nextState ? 'Just now' : undefined,
        };
      }
      return svc;
    });
    setConnectedServices(updated);
    const changed = updated.find((s) => s.id === serviceId);
    if (changed) await dbPut(STORES.CONNECTED_SERVICES, changed);
  };

  // Clear all local data
  const resetToSampleData = async () => {
    await Promise.all([
      dbClear(STORES.SUBJECTS),
      dbClear(STORES.VAULT_FILES),
      dbClear(STORES.NOTICES),
      dbClear(STORES.CHAT_MESSAGES),
      dbClear(STORES.QUIZ_ATTEMPTS),
    ]);
    setSubjects([]);
    setVaultFiles([]);
    setNotices([]);
    setChatMessages([]);
    setQuizAttempts([]);
    refreshStorageStats();
  };

  return (
    <AppContext.Provider
      value={{
        currentTab,
        setCurrentTab,
        activeSubjectId,
        setActiveSubjectId,
        activeFileId,
        setActiveFileId,
        activeReaderFileId,
        setActiveReaderFileId,
        activeNoticeId,
        setActiveNoticeId,
        isProfileOpen,
        setIsProfileOpen,
        activeQuizOpen,
        setActiveQuizOpen,
        activeFlashcardsOpen,
        setActiveFlashcardsOpen,
        activeRevisionTopic,
        setActiveRevisionTopic,
        userProfile,
        userRole,
        setUserRole,
        canManageCurrentClass,
        canPublishNotices,
        firebaseUser,
        isAuthLoading,
        signInWithGoogle,
        signOutAccount,
        settings,
        updateSettings,
        setTheme,
        subjects,
        addSubject,
        removeSubject,
        addSubjectActivity,
        vaultFiles,
        addVaultFile,
        removeVaultFile,
        toggleOffline,
        clearOfflineStorage,
        totalOfflineStorageMB,
        notices,
        toggleNoticeRead,
        toggleNoticePin,
        addNotice,
        unreadNoticesCount,
        chatMessages,
        sendMessage,
        stopAiResponse,
        retryLastMessage,
        chatThreads,
        newChat,
        openThread,
        deleteThread,
        clearChat,
        isAiThinking,
        isChatThinking,
        threadLoadingId,
        threadError,
        aiEngineStatus,
        teacherMode,
        setTeacherMode,
        activeChart,
        setActiveChart,
        activeImages,
        setActiveImages,
        isListening,
        startListening,
        stopListening,
        readAloud,
        stopReadAloud,
        isSpeechToTextAvailable,
        isReadAloudAvailable,
        ocrImage: handleOcrImage,
        activeQuizData,
        setActiveQuizData,
        activeFlashcardsData,
        setActiveFlashcardsData,
        generateCustomQuiz,
        generateCustomFlashcards,
        openAiQuiz,
        openAiFlashcards,
        generateDocumentSummary,
        quizAttempts,
        recordQuizAttempt,
        connectedServices,
        toggleConnectedService,
        classroomCourses,
        classroomCourseWork,
        classroomMaterials,
        classroomAnnouncements,
        classroomTeachers,
        classroomSubmissions,
        selectedClassroomId,
        setSelectedClassroomId,
        driveFiles,
        isLoadingWorkspace,
        workspaceError,
        syncGoogleClassroom,
        connectGoogleClassroom,
        disconnectGoogleWorkspace,
        syncGoogleDrive,
        importDriveFileToVault,
        importClassroomMaterialToVault,
        classroomAutosyncEnabled,
        classroomAutosyncCourseId,
        setClassroomAutosyncCourseId,
        classroomAutosyncIntervalMs,
        setClassroomAutosyncInterval,
        classroomLastSyncedAt,
        toggleClassroomAutosync,
        classroomLinks,
        linksLoading,
        fetchClassroomLinks,
        linkClassroomCourse,
        unlinkClassroomCourse,
        getLinkedClassroomCourse,
        refreshClassroomCourse,
        createClassroomSubmission,
        turnInClassroomSubmission,
        addClassroomComment,
        adomDraftContext,
        setAdomDraftContext,
        clearAdomDraftContext,
        saveDocumentNotes,
        isOnline,
        storageQuota,
        refreshStorageStats,
        resetToSampleData,
        isDbReady,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
