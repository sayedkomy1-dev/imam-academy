import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ActiveTab, AcademyProvider, useAcademy } from './context/AcademyContext';
import { AuthGateModal } from './components/AuthGateModal';
import { DashboardView } from './components/DashboardView';
import {
  ExitConfirmationModal,
  PWAInstallButton,
  PortalInstallAndShareBar,
  SyncStatus,
  detectPortalRouteFromLocation,
  updatePortalManifest,
} from './components/PWAComponents';
import { useBackButtonGuard } from './hooks/useBackButtonGuard';
import { OFFICIAL_ACADEMY_WHATSAPP } from './data/hybridFoundationData';
import { ACADEMY_BRAND_CONFIG } from './constants/brandConfig';
import { DeveloperSignatureFooter } from './components/DeveloperSupportModal';
import { formatGregorianAndHijri } from './utils/dateUtils';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BellOff,
  BookOpen,
  Bot,
  CheckSquare,
  ChevronDown,
  Compass,
  Crown,
  FileText,
  FolderDown,
  GraduationCap,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react';

const StudentsView = lazy(() =>
  import('./components/StudentsView').then((m) => ({ default: m.StudentsView }))
);
const SessionEngineView = lazy(() =>
  import('./components/SessionEngineView').then((m) => ({ default: m.SessionEngineView }))
);
const SmartBoardView = lazy(() =>
  import('./components/SmartBoardView').then((m) => ({ default: m.SmartBoardView }))
);
const MakharijTajweedView = lazy(() =>
  import('./components/MakharijTajweedView').then((m) => ({ default: m.MakharijTajweedView }))
);
const CirclesManagerView = lazy(() =>
  import('./components/CirclesManagerView').then((m) => ({ default: m.CirclesManagerView }))
);
const ExamsIjazahView = lazy(() =>
  import('./components/ExamsIjazahView').then((m) => ({ default: m.ExamsIjazahView }))
);
const StrugglingAndTasksView = lazy(() =>
  import('./components/StrugglingAndTasksView').then((m) => ({ default: m.StrugglingAndTasksView }))
);
const FinanceView = lazy(() =>
  import('./components/FinanceView').then((m) => ({ default: m.FinanceView }))
);
const BroadcastCenterView = lazy(() =>
  import('./components/BroadcastCenterView').then((m) => ({ default: m.BroadcastCenterView }))
);
const GuardianAndGuestView = lazy(() =>
  import('./components/GuardianAndGuestView').then((m) => ({ default: m.GuardianAndGuestView }))
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const QuickSearchModal = lazy(() =>
  import('./components/QuickSearchModal').then((m) => ({ default: m.QuickSearchModal }))
);
const PortalAISuiteModal = lazy(() =>
  import('./components/PortalAISuiteModal').then((m) => ({ default: m.PortalAISuiteModal }))
);
const HybridFoundationView = lazy(() =>
  import('./components/HybridFoundationView').then((m) => ({ default: m.HybridFoundationView }))
);
const OfflineResourceCenterView = lazy(() =>
  import('./components/OfflineResourceCenterView').then((m) => ({
    default: m.OfflineResourceCenterView,
  }))
);
const PublicMushafWaqfPortalView = lazy(() =>
  import('./components/PublicMushafWaqfPortalView').then((m) => ({
    default: m.PublicMushafWaqfPortalView,
  }))
);
const OwnerControlPanelView = lazy(() =>
  import('./components/OwnerControlPanelView').then((m) => ({ default: m.OwnerControlPanelView }))
);
const FaithOasisView = lazy(() =>
  import('./components/FaithOasisView').then((m) => ({ default: m.FaithOasisView }))
);
const AcademyPdfGuideModal = lazy(() =>
  import('./components/AcademyPdfGuideModal').then((m) => ({ default: m.AcademyPdfGuideModal }))
);

const ViewLoadingFallback: React.FC = () => (
  <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
    <div className="w-10 h-10 rounded-2xl bg-[#145a3a]/15 border-2 border-[#c59b27] flex items-center justify-center text-lg animate-pulse">
      🕌
    </div>
    <p className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
      جارٍ فتح القسم القرآني...
    </p>
  </div>
);

const MainShell: React.FC = () => {
  const {
    isLoggedIn,
    userRole,
    activeTab,
    setActiveTab,
    setSelectedStudentId,
    settings,
    updateSettings,
    setQuickSearchOpen,
    toastMessage,
    logout,
    loginAsGuardianDirect,
    students,
    teacherAlerts,
    triggerPushReminderNow,
    publicMushafPortalOpen,
    setPublicMushafPortalOpen,
    isFullScreenFocus,
    pendingOutboxMessages,
    sendOutboxMessage,
    sendAllQueuedMessages,
    deleteOutboxMessage,
    currentStaffTier,
    activePortalRoute,
    setActivePortalRoute,
    activeRoleMode,
    setActiveRoleMode,
    accessCodeRequests,
    resolveAccessCodeRequestAndSendWhatsApp,
    deleteAccessCodeRequest,
    effectiveTeacherPermissions,
    managedTeachers,
    googleAuthUser,
    setIsDeveloperModalOpen,
    restoreFromCloudFirestoreNow,
    triggerCloudSyncNow,
    showToast,
  } = useAcademy();

  // Unified Overlay Controller: Single active dropdown & modal state
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [outboxModalOpen, setOutboxModalOpen] = useState(false);
  const [showAcademyPdfGuide, setShowAcademyPdfGuide] = useState(false);
  const [aiSuiteModalOpen, setAiSuiteModalOpen] = useState(false);

  // Global Click-Outside & Escape Key Listener for Zero-Overlap Dropdowns
  useEffect(() => {
    if (!activeDropdownId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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

  // Mobile Pull-to-Refresh state & touch handlers
  const [pullStartY, setPullStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [isRefreshingPull, setIsRefreshingPull] = useState<boolean>(false);

  const handleTouchStartPull = (e: React.TouchEvent<HTMLElement>) => {
    const scrollTop =
      e.currentTarget.scrollTop ||
      window.scrollY ||
      document.documentElement.scrollTop ||
      0;
    if (scrollTop <= 4 && !isRefreshingPull) {
      setPullStartY(e.touches[0].clientY);
    } else {
      setPullStartY(null);
    }
  };

  const handleTouchMovePull = (e: React.TouchEvent<HTMLElement>) => {
    if (pullStartY === null || isRefreshingPull) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - pullStartY;
    if (delta > 0) {
      setPullDistance(Math.min(115, Math.round(delta * 0.55)));
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEndPull = async () => {
    if (pullStartY === null) return;
    if (pullDistance >= 64 && !isRefreshingPull) {
      setIsRefreshingPull(true);
      setPullDistance(60);
      try {
        await restoreFromCloudFirestoreNow();
        await triggerCloudSyncNow(false);
        showToast('🔄 تم السحب وتحديث أحدث بيانات الأكاديمية من السحابة بنجاح', 'success');
      } catch {
        // handled inside context
      } finally {
        setTimeout(() => {
          setIsRefreshingPull(false);
          setPullDistance(0);
        }, 450);
      }
    } else {
      setPullDistance(0);
    }
    setPullStartY(null);
  };

  // Sync URL route and Dynamic PWA Manifest per portal
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const detectedRoute = detectPortalRouteFromLocation();
      if (params.get('waqf') || detectedRoute === 'almushaf' || detectedRoute === 'sadaqa') {
        setPublicMushafPortalOpen(true);
        setActivePortalRoute(detectedRoute === 'sadaqa' ? 'sadaqa' : 'almushaf');
      } else if (detectedRoute) {
        setActivePortalRoute(detectedRoute);
      }
    } catch {
      // ignore
    }
  }, [setPublicMushafPortalOpen, setActivePortalRoute]);

  useEffect(() => {
    if (publicMushafPortalOpen) {
      updatePortalManifest(
        activePortalRoute === 'sadaqa' ? 'sadaqa' : 'almushaf'
      );
      return;
    }
    if (isLoggedIn) {
      if (userRole === 'guardian') {
        updatePortalManifest(
          activePortalRoute === 'student' ? 'student' : 'guardian'
        );
      } else if (userRole === 'teacher') {
        updatePortalManifest(
          currentStaffTier === 'owner' ? 'owner' : 'general'
        );
      } else {
        updatePortalManifest(activePortalRoute);
      }
    } else {
      updatePortalManifest(activePortalRoute);
    }
  }, [
    activePortalRoute,
    publicMushafPortalOpen,
    isLoggedIn,
    userRole,
    currentStaffTier,
  ]);

  const canGoBackInternally = Boolean(
    activeDropdownId ||
      aiSuiteModalOpen ||
      showAcademyPdfGuide ||
      outboxModalOpen ||
      publicMushafPortalOpen ||
      (isLoggedIn && userRole === 'teacher' && activeTab !== 'dashboard')
  );

  const handleInternalBack = () => {
    if (activeDropdownId) {
      setActiveDropdownId(null);
      return;
    }
    if (aiSuiteModalOpen) {
      setAiSuiteModalOpen(false);
      return;
    }
    if (showAcademyPdfGuide) {
      setShowAcademyPdfGuide(false);
      return;
    }
    if (outboxModalOpen) {
      setOutboxModalOpen(false);
      return;
    }
    if (publicMushafPortalOpen) {
      setPublicMushafPortalOpen(false);
      return;
    }
    if (isLoggedIn && userRole === 'teacher' && activeTab !== 'dashboard') {
      setActiveTab('dashboard');
    }
  };

  const { showExitConfirm, confirmExit, cancelExit } = useBackButtonGuard({
    canGoBackInternally,
    onBackAction: handleInternalBack,
  });

  if (publicMushafPortalOpen) {
    return (
      <div className="min-h-screen bg-[#f6f7f2] dark:bg-[#0b1711] text-[#14281d] dark:text-[#e9f2ec]">
        <div className="max-w-7xl mx-auto px-4 pt-3 flex flex-wrap items-center justify-between gap-2 no-print">
          <button
            type="button"
            onClick={() => setPublicMushafPortalOpen(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#145a3a] text-[#dfbd69] text-xs font-black cursor-pointer shadow-xs"
          >
            <ArrowRight className="w-4 h-4" />
            <span>🔙 رجوع للبوابة الرئيسية</span>
          </button>
          <button
            type="button"
            onClick={() => setAiSuiteModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-l from-[#c59b27] to-amber-500 text-[#14281d] text-xs font-black cursor-pointer shadow-xs"
          >
            <Bot className="w-4 h-4" />
            <span>🤖 باحث التدبر القرآني والوقف الذكي (AI)</span>
          </button>
        </div>
        <Suspense fallback={<ViewLoadingFallback />}>
          <PublicMushafWaqfPortalView
            onBackToAcademy={() => setPublicMushafPortalOpen(false)}
          />
        </Suspense>
        <div className="max-w-7xl mx-auto px-4 pb-6">
          <PortalInstallAndShareBar
            route={activePortalRoute === 'sadaqa' ? 'sadaqa' : 'almushaf'}
          />
        </div>
        {aiSuiteModalOpen && (
          <Suspense fallback={null}>
            <PortalAISuiteModal
              isOpen={aiSuiteModalOpen}
              onClose={() => setAiSuiteModalOpen(false)}
              defaultPortal={activePortalRoute === 'sadaqa' ? 'sadaqa' : 'almushaf'}
            />
          </Suspense>
        )}
        <ExitConfirmationModal
          isOpen={showExitConfirm}
          onCancel={cancelExit}
          onConfirmExit={confirmExit}
        />
        <SyncStatus variant="banner" />
        {toastMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-2xl bg-[#145a3a] text-white text-xs font-extrabold shadow-xl border border-[#c59b27]">
            {toastMessage.text}
          </div>
        )}
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <>
        <AuthGateModal />
        <ExitConfirmationModal
          isOpen={showExitConfirm}
          onCancel={cancelExit}
          onConfirmExit={confirmExit}
        />
        <SyncStatus variant="banner" />
        {toastMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-2xl bg-[#145a3a] text-white text-xs font-extrabold shadow-xl border border-[#c59b27]">
            {toastMessage.text}
          </div>
        )}
      </>
    );
  }

  // If logged in as Guardian or Guest, render the dedicated Guardian/Student Portal (No Floating Button Pile-up)
  if (userRole === 'guardian' || userRole === 'guest') {
    return (
      <div
        onTouchStart={handleTouchStartPull}
        onTouchMove={handleTouchMovePull}
        onTouchEnd={() => void handleTouchEndPull()}
        className="min-h-screen bg-[#f8f9f6] dark:bg-[#0b1510] text-[#14281d] dark:text-[#e9f2ec] selection:bg-[#145a3a] selection:text-white"
      >
        {(pullDistance > 12 || isRefreshingPull) && (
          <div
            style={{ height: `${Math.max(42, pullDistance)}px` }}
            className="flex items-center justify-center gap-2 bg-gradient-to-l from-[#145a3a] to-[#0d3b26] text-[#dfbd69] text-xs font-black border-b border-[#c59b27]/40 transition-all overflow-hidden"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                isRefreshingPull || pullDistance >= 64 ? 'animate-spin' : ''
              }`}
            />
            <span>
              {isRefreshingPull
                ? 'جاري مزامنة أحدث سجلات التسميع من سحابة الأكاديمية (Firestore)...'
                : pullDistance >= 64
                ? 'أفلت الآن لتحديث البيانات من السحابة ⚡'
                : 'اسحب للأسفل لتحديث البيانات من السحابة...'}
            </span>
          </div>
        )}
        <div className="max-w-[1380px] mx-auto pt-4 pb-28 md:pb-10 px-4 md:px-8 space-y-6">
          <Suspense fallback={<ViewLoadingFallback />}>
            <GuardianAndGuestView />
          </Suspense>
          <PortalInstallAndShareBar
            route={activePortalRoute === 'student' ? 'student' : 'guardian'}
          />
          <DeveloperSignatureFooter
            onOpenModal={() => setIsDeveloperModalOpen(true)}
          />
          <div className="hidden print:block pt-4 border-t border-neutral-300 text-center text-xs font-bold text-neutral-800">
            {ACADEMY_BRAND_CONFIG.printAndBoardFooterText}
          </div>
        </div>
        <ExitConfirmationModal
          isOpen={showExitConfirm}
          onCancel={cancelExit}
          onConfirmExit={confirmExit}
        />
        <SyncStatus variant="banner" />
        {toastMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-2xl bg-[#145a3a] text-white text-xs font-extrabold shadow-xl border border-[#c59b27]">
            {toastMessage.text}
          </div>
        )}
      </div>
    );
  }

  const activeStaffMember = googleAuthUser?.email
    ? managedTeachers.find(
        (m) => m.email.toLowerCase() === googleAuthUser.email.toLowerCase()
      )
    : undefined;
  const isFinancialManager =
    activeStaffMember?.staffRole === 'financial_manager';
  const pendingStaffCount = managedTeachers.filter(
    (m) => m.status === 'pending'
  ).length;
  const pendingAccessCodeRequests = accessCodeRequests.filter(
    (r) => r.status === 'pending'
  );
  const totalNotifBadgeCount =
    teacherAlerts.length + pendingAccessCodeRequests.length;

  // Map every activeTab to one of the 4 Primary Spatial Tabs
  const isRecitationClusterTab = [
    'session',
    'smartboard',
    'tajweed',
    'foundation',
  ].includes(activeTab);

  const isDashboardClusterTab = [
    'dashboard',
    'circles',
    'faith_oasis',
  ].includes(activeTab);

  const isAdminClusterTab = [
    'tasks',
    'struggling',
    'owner_panel',
    'finance',
    'settings',
    'exams',
    'broadcast',
    'resources',
    'public_mushaf',
  ].includes(activeTab);

  // The 4 Unified Primary Navigation Tabs (Zone 2: Desktop Sidebar & Mobile Bottom Bar)
  const primaryFourTabs: {
    id: 'dashboard' | 'session' | 'students' | 'tasks';
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    isActive: boolean;
    badge?: number;
  }[] = [
    {
      id: 'dashboard',
      label: '📊 الرئيسية والحلقات',
      shortLabel: 'الرئيسية',
      icon: <LayoutDashboard className="w-5 h-5" />,
      isActive: isDashboardClusterTab,
    },
    {
      id: 'session',
      label: '🎙️ التسميع والسبورة الذكية',
      shortLabel: 'التسميع',
      icon: <BookOpen className="w-5 h-5" />,
      isActive: isRecitationClusterTab,
    },
    {
      id: 'students',
      label: '👥 سجل الطلاب والأكواد',
      shortLabel: 'الطلاب',
      icon: <Users className="w-5 h-5" />,
      isActive: activeTab === 'students',
    },
    {
      id: 'tasks',
      label: '⚙️ الإدارة والمساعد الذكي',
      shortLabel: 'الإدارة',
      icon: <Settings className="w-5 h-5" />,
      isActive: isAdminClusterTab,
      badge:
        pendingStaffCount + pendingAccessCodeRequests.length + teacherAlerts.length >
        0
          ? pendingStaffCount +
            pendingAccessCodeRequests.length +
            teacherAlerts.length
          : undefined,
    },
  ];

  // Sub-tabs inside Tab 1 (Dashboard & Circles Cluster)
  const dashboardSubTabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'لوحة القيادة والحلقات', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
    { id: 'circles', label: 'إدارة الحلقات والتحضير', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'faith_oasis', label: 'واحة الإيمان والإنجاز', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  // Sub-tabs inside Tab 2 (Recitation & SmartBoard Cluster)
  const recitationSubTabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'session', label: '🎙️ محرك التسميع الخماسي', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'smartboard', label: '🎨 السبورة القرآنية الذكية', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'tajweed', label: '🧭 مخارج الحروف والتجويد', icon: <Compass className="w-3.5 h-3.5" /> },
    { id: 'foundation', label: '🧱 منهج التأسيس الهجين', icon: <Layers className="w-3.5 h-3.5" /> },
  ];

  // Sub-tabs inside Tab 4 (Admin & Smart Assistant Cluster)
  const rawAdminSubTabs: {
    id: ActiveTab;
    label: string;
    icon: React.ReactNode;
    allowed: boolean;
  }[] = [
    {
      id: 'tasks',
      label: '📋 المهام والطلاب المتعثرون',
      icon: <CheckSquare className="w-3.5 h-3.5" />,
      allowed: true,
    },
    {
      id: 'owner_panel',
      label: '👑 إدارة المحفظين والصلاحيات',
      icon: <Shield className="w-3.5 h-3.5" />,
      allowed: currentStaffTier === 'owner',
    },
    {
      id: 'finance',
      label: '💰 السجل المالي والاشتراكات',
      icon: <Wallet className="w-3.5 h-3.5" />,
      allowed:
        currentStaffTier === 'owner' ||
        isFinancialManager ||
        Boolean(settings.supervisorPermissions?.canViewFinancialRecords) ||
        Boolean(effectiveTeacherPermissions.canAccessFinanceSection),
    },
    {
      id: 'exams',
      label: '🏅 الاختبارات والإجازات',
      icon: <GraduationCap className="w-3.5 h-3.5" />,
      allowed:
        currentStaffTier === 'owner' ||
        currentStaffTier === 'supervisor' ||
        Boolean(effectiveTeacherPermissions.canIssueExamsAndCertificates),
    },
    {
      id: 'broadcast',
      label: '💬 رسائل واتساب الجماعية',
      icon: <MessageSquare className="w-3.5 h-3.5" />,
      allowed: true,
    },
    {
      id: 'resources',
      label: '📥 مكتبة المواد أوفلاين',
      icon: <FolderDown className="w-3.5 h-3.5" />,
      allowed: true,
    },
    {
      id: 'settings',
      label: '⚙️ الإعدادات والنسخ الاحتياطي',
      icon: <Settings className="w-3.5 h-3.5" />,
      allowed: true,
    },
  ];
  const adminSubTabs = rawAdminSubTabs.filter((t) => t.allowed);

  const currentPortalBadgeLabel =
    currentStaffTier === 'owner' && activeRoleMode === 'owner_mode'
      ? '👑 بوابة المالك'
      : currentStaffTier === 'supervisor' || activeRoleMode === 'supervisor_mode'
      ? '🛡️ بوابة الإشراف'
      : '📖 بوابة المحفظ';

  return (
    <div className="h-screen overflow-hidden bg-[#f6f7f2] dark:bg-[#0b1711] text-[#14281d] dark:text-[#e9f2ec] flex">
      {/* ZONE 2 (Desktop): Fixed Right Sidebar (w-64) with 4 Primary Tabs */}
      <aside
        aria-hidden={isFullScreenFocus}
        className={`hidden lg:flex flex-col justify-between shrink-0 bg-white dark:bg-[#12231a] h-screen scrollbar-thin no-print smart-focus-shell-transition ${
          isFullScreenFocus
            ? 'w-0 max-w-0 p-0 opacity-0 translate-x-12 border-l-0 overflow-hidden pointer-events-none select-none'
            : 'w-64 max-w-64 p-4 opacity-100 translate-x-0 border-l border-neutral-200 dark:border-emerald-900/50 overflow-y-auto'
        }`}
      >
        <div className="space-y-5">
          {/* Sidebar Brand Card */}
          <div className="flex items-center gap-3 px-2 pt-1 pb-3 border-b border-neutral-100 dark:border-emerald-900/40">
            <img
              src="/assets/aistudio/icon-192_29a1c2ce.png"
              alt="شعار أكاديمية الإمام"
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-2xl border border-[#c59b27]/50 shadow-xs object-cover shrink-0"
            />
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69] truncate">
                أكاديمية الإمام
              </div>
              <div className="text-[11px] font-bold text-[#c59b27] truncate">
                {ACADEMY_BRAND_CONFIG.slogan}
              </div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                {currentPortalBadgeLabel}
              </div>
            </div>
          </div>

          {/* 4 Primary Spatial Tabs */}
          <nav className="space-y-2" aria-label="التنقل الرئيسي">
            <div className="px-2 text-[11px] font-extrabold text-neutral-400 dark:text-emerald-400/70">
              الأقسام الرئيسية (4)
            </div>
            {primaryFourTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveDropdownId(null);
                  if (item.id === 'tasks' && currentStaffTier === 'owner' && activeRoleMode === 'owner_mode' && activeTab === 'owner_panel') {
                    setActiveTab('owner_panel');
                  } else {
                    setActiveTab(item.id);
                  }
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-3 rounded-2xl text-xs font-extrabold transition-all duration-150 cursor-pointer ${
                  item.isActive
                    ? 'bg-[#145a3a] text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-300 hover:bg-[#f6f7f2] dark:hover:bg-[#0b1711] hover:text-[#145a3a] dark:hover:text-[#dfbd69]'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <span
                    className={
                      item.isActive ? 'text-[#dfbd69]' : 'text-neutral-400'
                    }
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-mono font-bold">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Contextual Sub-Links for Active Primary Cluster */}
          {isRecitationClusterTab && (
            <div className="p-3 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200/70 dark:border-emerald-900/40 space-y-1.5">
              <div className="text-[10px] font-extrabold text-neutral-400 px-1">
                أدوات التسميع والسبورة:
              </div>
              {recitationSubTabs.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setActiveTab(sub.id)}
                  className={`w-full text-right px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                    activeTab === sub.id
                      ? 'bg-[#c59b27]/20 text-[#145a3a] dark:text-[#dfbd69] font-extrabold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-[#145a3a]'
                  }`}
                >
                  {sub.icon}
                  <span className="truncate">{sub.label}</span>
                </button>
              ))}
            </div>
          )}

          {isAdminClusterTab && (
            <div className="p-3 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200/70 dark:border-emerald-900/40 space-y-1">
              <div className="text-[10px] font-extrabold text-neutral-400 px-1">
                وحدات الإدارة والمساعد:
              </div>
              {adminSubTabs.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setActiveTab(sub.id)}
                  className={`w-full text-right px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                    activeTab === sub.id ||
                    (sub.id === 'tasks' && activeTab === 'struggling')
                      ? 'bg-[#c59b27]/20 text-[#145a3a] dark:text-[#dfbd69] font-extrabold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-[#145a3a]'
                  }`}
                >
                  {sub.icon}
                  <span className="truncate">{sub.label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAiSuiteModalOpen(true)}
                className="w-full text-right px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-2 text-[#145a3a] dark:text-[#dfbd69] hover:bg-[#145a3a]/10 cursor-pointer"
              >
                <Bot className="w-3.5 h-3.5 text-[#c59b27]" />
                <span>🤖 المساعد الذكي الشامل</span>
              </button>
            </div>
          )}
        </div>

        {/* Compact Bottom Status & Support Card (with SyncStatus + Force Sync) */}
        <div className="pt-3 border-t border-neutral-200/80 dark:border-emerald-900/50 space-y-2">
          <SyncStatus variant="sidebar" />

          <div className="flex items-center gap-1.5">
            <a
              href={`https://wa.me/${OFFICIAL_ACADEMY_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600/90 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>الدعم الفني</span>
            </a>
            <button
              type="button"
              onClick={logout}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-neutral-200 dark:border-emerald-900/60 text-neutral-500 hover:text-red-600 text-[11px] font-bold transition-colors cursor-pointer"
              title="تسجيل الخروج"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsDeveloperModalOpen(true)}
            className="w-full text-right px-2 py-1 rounded-lg text-[10px] font-semibold text-neutral-400 hover:text-[#145a3a] dark:hover:text-[#dfbd69] transition-colors cursor-pointer truncate"
          >
            {ACADEMY_BRAND_CONFIG.signatureFooterText}
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div
        onTouchStart={handleTouchStartPull}
        onTouchMove={handleTouchMovePull}
        onTouchEnd={() => void handleTouchEndPull()}
        className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto"
      >
        {(pullDistance > 12 || isRefreshingPull) && (
          <div
            style={{ height: `${Math.max(40, pullDistance)}px` }}
            className="flex items-center justify-center gap-2 bg-[#145a3a] text-[#dfbd69] text-xs font-bold border-b border-[#c59b27]/30 transition-all shrink-0 overflow-hidden no-print"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                isRefreshingPull || pullDistance >= 64 ? 'animate-spin' : ''
              }`}
            />
            <span>
              {isRefreshingPull
                ? 'جاري مزامنة أحدث سجلات الأكاديمية...'
                : pullDistance >= 64
                ? 'أفلت الآن لتحديث البيانات'
                : 'اسحب للأسفل لتحديث البيانات...'}
            </span>
          </div>
        )}

        {/* ZONE 1: Unified Top Header Bar (64px / h-16, z-30, 3 Clean Elements) */}
        <header
          aria-hidden={isFullScreenFocus}
          className={`sticky top-0 z-30 bg-white/95 dark:bg-[#12231a]/95 backdrop-blur-md px-4 md:px-6 no-print smart-focus-shell-transition ${
            isFullScreenFocus
              ? 'h-0 py-0 opacity-0 -translate-y-4 border-b-0 overflow-hidden pointer-events-none select-none'
              : 'h-16 opacity-100 translate-y-0 border-b border-neutral-200/80 dark:border-emerald-900/50 flex items-center'
          }`}
        >
          <div className="w-full flex items-center justify-between gap-2">
            {/* Element 1 (Right): Academy Logo + Name + Active Portal Badge */}
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/assets/aistudio/icon-96_3bce66e2.png"
                alt="أيقونة أكاديمية الإمام"
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-xl border border-[#c59b27]/50 shrink-0 object-cover"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-extrabold text-[#14281d] dark:text-white truncate">
                    أكاديمية الإمام
                  </span>
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-[#145a3a]/10 dark:bg-emerald-950 border border-[#c59b27]/40 text-[10px] font-extrabold text-[#145a3a] dark:text-[#dfbd69] whitespace-nowrap">
                    {currentPortalBadgeLabel}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate hidden md:block">
                  بالقرآن نحيا • {settings.teacherName}
                </div>
              </div>
            </div>

            {/* Element 2 (Center): Single Smart Dropdown [ 🧭 البوابة والوضع ▾ ] */}
            <div
              className="relative shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() =>
                  setActiveDropdownId(
                    activeDropdownId === 'portal-mode-menu'
                      ? null
                      : 'portal-mode-menu'
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] hover:border-[#145a3a] border border-neutral-200/90 dark:border-emerald-900/70 text-xs font-extrabold text-[#14281d] dark:text-[#dfbd69] transition-colors cursor-pointer shadow-2xs"
                title="تبديل البوابة أو وضع الصلاحية"
              >
                <span>🧭 البوابة والوضع</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#c59b27]" />
              </button>

              {activeDropdownId === 'portal-mode-menu' && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-72 rounded-3xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-800 shadow-2xl p-3 z-40 space-y-3 text-xs">
                  {/* Role Mode Switcher (Owner & Supervisor Only) */}
                  {(currentStaffTier === 'owner' ||
                    currentStaffTier === 'supervisor') && (
                    <div className="space-y-1.5 pb-2.5 border-b border-neutral-100 dark:border-emerald-900/50">
                      <div className="text-[10px] font-extrabold text-neutral-400 px-1">
                        تبديل وضع العمل الصلاحي:
                      </div>
                      <div className="grid grid-cols-1 gap-1">
                        {currentStaffTier === 'owner' && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveRoleMode('owner_mode');
                              setActiveDropdownId(null);
                            }}
                            className={`w-full px-3 py-2 rounded-xl text-right font-extrabold flex items-center justify-between cursor-pointer ${
                              activeRoleMode === 'owner_mode'
                                ? 'bg-[#145a3a] text-[#dfbd69]'
                                : 'hover:bg-neutral-100 dark:hover:bg-[#0b1711] text-neutral-700 dark:text-neutral-200'
                            }`}
                          >
                            <span>👑 وضع المالك الأعلى</span>
                            {activeRoleMode === 'owner_mode' && <span>✓</span>}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveRoleMode('supervisor_mode');
                            if (activeTab === 'owner_panel')
                              setActiveTab('dashboard');
                            setActiveDropdownId(null);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-right font-extrabold flex items-center justify-between cursor-pointer ${
                            activeRoleMode === 'supervisor_mode'
                              ? 'bg-[#145a3a] text-[#dfbd69]'
                              : 'hover:bg-neutral-100 dark:hover:bg-[#0b1711] text-neutral-700 dark:text-neutral-200'
                          }`}
                        >
                          <span>🛡️ وضع المشرف العام</span>
                          {activeRoleMode === 'supervisor_mode' && (
                            <span>✓</span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveRoleMode('teacher_mode');
                            setActiveTab('session');
                            setActiveDropdownId(null);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-right font-extrabold flex items-center justify-between cursor-pointer ${
                            activeRoleMode === 'teacher_mode'
                              ? 'bg-emerald-700 text-white'
                              : 'hover:bg-neutral-100 dark:hover:bg-[#0b1711] text-neutral-700 dark:text-neutral-200'
                          }`}
                        >
                          <span>📖 وضع المحفظ (تركيز التسميع)</span>
                          {activeRoleMode === 'teacher_mode' && <span>✓</span>}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 6 Independent Portals Switcher */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-extrabold text-neutral-400 px-1">
                      الانتقال السريع بين البوابات الـ 6:
                    </div>
                    {currentStaffTier === 'owner' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDropdownId(null);
                          setActiveRoleMode('owner_mode');
                          setActivePortalRoute('owner');
                          setActiveTab('owner_panel');
                        }}
                        className="w-full px-3 py-2 rounded-xl text-right font-bold hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center justify-between cursor-pointer"
                      >
                        <span>👑 بوابة المالك والإدارة</span>
                        <span className="text-[10px] font-mono text-neutral-400">
                          /owner
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdownId(null);
                        setActivePortalRoute('general');
                        setActiveTab('dashboard');
                      }}
                      className="w-full px-3 py-2 rounded-xl text-right font-bold hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center justify-between cursor-pointer"
                    >
                      <span>🛡️ بوابة الإشراف والمحفظين</span>
                      <span className="text-[10px] font-mono text-neutral-400">
                        /General
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdownId(null);
                        setActivePortalRoute('student');
                        loginAsGuardianDirect(students[0]?.id || 'st-1');
                      }}
                      className="w-full px-3 py-2 rounded-xl text-right font-bold hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center justify-between cursor-pointer"
                    >
                      <span>🎓 بوابة الطالب الذكية</span>
                      <span className="text-[10px] font-mono text-neutral-400">
                        /student
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdownId(null);
                        setActivePortalRoute('guardian');
                        loginAsGuardianDirect(students[0]?.id || 'st-1');
                      }}
                      className="w-full px-3 py-2 rounded-xl text-right font-bold hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center justify-between cursor-pointer"
                    >
                      <span>👨‍👩‍👦 بوابة ولي الأمر</span>
                      <span className="text-[10px] font-mono text-neutral-400">
                        /Guardian
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdownId(null);
                        setActivePortalRoute('almushaf');
                        setPublicMushafPortalOpen(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-right font-bold hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center justify-between cursor-pointer"
                    >
                      <span>📖 بوابة المصحف الشامل</span>
                      <span className="text-[10px] font-mono text-neutral-400">
                        /almushaf
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdownId(null);
                        setActivePortalRoute('sadaqa');
                        setPublicMushafPortalOpen(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-right font-bold hover:bg-neutral-100 dark:hover:bg-[#0b1711] flex items-center justify-between cursor-pointer"
                    >
                      <span>🌱 بوابة الصدقة الجارية والوقف</span>
                      <span className="text-[10px] font-mono text-neutral-400">
                        /sadaqa
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Element 3 (Left): SyncStatus + Theme Toggle + [ 📲 تثبيت البوابة ] + Quick Search 🔍 (+ Notifications) */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Cloud & Network SyncStatus Pill + Force Sync */}
              <SyncStatus
                variant="header"
                isOpen={activeDropdownId === 'sync-status-popover'}
                onToggleOpen={() =>
                  setActiveDropdownId(
                    activeDropdownId === 'sync-status-popover'
                      ? null
                      : 'sync-status-popover'
                  )
                }
              />

              {/* Quick Search Button 🔍 */}
              <button
                type="button"
                onClick={() => {
                  setActiveDropdownId(null);
                  setQuickSearchOpen(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-neutral-200/80 dark:border-emerald-900/60 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:border-[#145a3a] transition-colors cursor-pointer"
                title="بحث سريع (Ctrl+K)"
              >
                <Search className="w-3.5 h-3.5 text-[#145a3a] dark:text-[#dfbd69]" />
                <span className="hidden xl:inline">بحث</span>
              </button>

              {/* PWA Install Button [ 📲 تثبيت البوابة ] */}
              <div className="hidden sm:block">
                <PWAInstallButton
                  route={currentStaffTier === 'owner' ? 'owner' : 'general'}
                  compact
                />
              </div>

              {/* Notification Center Popover (z-40) */}
              <div
                className="relative"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() =>
                    setActiveDropdownId(
                      activeDropdownId === 'notif-popover'
                        ? null
                        : 'notif-popover'
                    )
                  }
                  className="relative p-2 rounded-xl border border-neutral-200/80 dark:border-emerald-900/60 bg-[#f6f7f2] dark:bg-[#0b1711] hover:border-[#145a3a] transition-colors cursor-pointer"
                  title="مركز التنبيهات وطلبات الأكواد"
                >
                  {settings.notificationsEnabled ? (
                    <Bell className="w-4 h-4 text-[#145a3a] dark:text-[#dfbd69]" />
                  ) : (
                    <BellOff className="w-4 h-4 text-neutral-400" />
                  )}
                  {totalNotifBadgeCount > 0 && (
                    <span className="absolute -top-1 -left-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-mono font-bold flex items-center justify-center tabular-nums">
                      {totalNotifBadgeCount}
                    </span>
                  )}
                </button>

                {activeDropdownId === 'notif-popover' && (
                  <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 rounded-3xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-800 shadow-2xl p-4 z-40 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-emerald-900">
                      <div>
                        <div className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                          مركز التنبيهات ({totalNotifBadgeCount})
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          طلبات الأكواد ({pendingAccessCodeRequests.length}) • مهام ({teacherAlerts.length})
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void triggerPushReminderNow()}
                        className="px-2.5 py-1 rounded-lg bg-[#145a3a] text-white text-[10px] font-bold cursor-pointer"
                      >
                        دفع إشعار الآن
                      </button>
                    </div>

                    {pendingAccessCodeRequests.length > 0 && (
                      <div className="space-y-2 border-b border-neutral-100 dark:border-emerald-900 pb-2.5">
                        <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>
                            طلبات أكواد الدخول ({pendingAccessCodeRequests.length})
                          </span>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-2 pl-1">
                          {pendingAccessCodeRequests.map((req) => (
                            <div
                              key={req.id}
                              className="p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-400/40 space-y-1.5 text-right"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#14281d] dark:text-white">
                                <span>الطالب: {req.studentName}</span>
                                <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300">
                                  {req.generatedCode || 'جديد'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    resolveAccessCodeRequestAndSendWhatsApp(req.id)
                                  }
                                  className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-[#14281d] text-[10px] font-bold cursor-pointer"
                                >
                                  ⚡ إرسال الكود واتساب
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteAccessCodeRequest(req.id)}
                                  className="py-1.5 px-2 rounded-lg bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[10px] font-bold cursor-pointer"
                                >
                                  حذف
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {teacherAlerts.length === 0 ? (
                      <div className="py-4 text-center text-xs text-neutral-500">
                        لا توجد مهام متأخرة أو طلاب بحاجة لمتابعة عاجلة حالياً.
                      </div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto space-y-2 pl-1">
                        {teacherAlerts.map((alert) => (
                          <button
                            key={alert.id}
                            type="button"
                            onClick={() => {
                              setActiveDropdownId(null);
                              if (alert.category === 'overdue_task') {
                                setActiveTab('tasks');
                              } else {
                                if (alert.studentId) {
                                  setSelectedStudentId(alert.studentId);
                                }
                                setActiveTab('struggling');
                              }
                            }}
                            className="w-full text-right p-2.5 rounded-xl border border-neutral-100 dark:border-emerald-900/60 hover:border-[#145a3a] bg-[#f6f7f2] dark:bg-[#0b1711] transition-colors cursor-pointer block"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  alert.category === 'overdue_task'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                }`}
                              >
                                {alert.category === 'overdue_task'
                                  ? 'مهمة مستحقة'
                                  : 'متابعة عاجلة'}
                              </span>
                              <span className="text-[10px] font-mono text-neutral-400">
                                {formatGregorianAndHijri(
                                  alert.timestamp,
                                  settings.showHijriDates ?? true,
                                  'compact'
                                )}
                              </span>
                            </div>
                            <div className="text-xs font-bold mt-1 text-[#14281d] dark:text-[#e9f2ec]">
                              {alert.title}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Theme Toggle 🌙 / ☀️ / 📜 */}
              <button
                type="button"
                onClick={() => {
                  const nextTheme =
                    settings.theme === 'light'
                      ? 'dark'
                      : settings.theme === 'dark'
                      ? 'sepia'
                      : 'light';
                  updateSettings({ theme: nextTheme });
                }}
                className="p-2 rounded-xl border border-neutral-200/80 dark:border-emerald-900/60 bg-[#f6f7f2] dark:bg-[#0b1711] hover:border-[#145a3a] text-xs font-bold cursor-pointer"
                title="تبديل المظهر (نهاري / ليلي / كريمي)"
              >
                {settings.theme === 'dark'
                  ? '🌙'
                  : settings.theme === 'sepia'
                  ? '📜'
                  : '☀️'}
              </button>
            </div>
          </div>
        </header>

        {/* ZONE 3: Active Tab Workspace (Safe-Area Padding: pt-4 pb-28 md:pb-10 px-4 md:px-8) */}
        <main
          className={`${
            isFullScreenFocus
              ? 'max-w-full w-full mx-auto p-2 md:p-4 flex-1'
              : 'max-w-7xl w-full mx-auto pt-4 pb-28 md:pb-10 px-4 md:px-8 flex-1'
          } smart-focus-shell-transition space-y-5`}
        >
          {/* Contextual Sub-Bar for Tab 1 (Dashboard & Circles) on Mobile/Desktop */}
          {!isFullScreenFocus && isDashboardClusterTab && (
            <div className="flex items-center justify-between gap-2 p-1.5 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200/80 dark:border-emerald-900/50 shadow-2xs overflow-x-auto no-scrollbar no-print">
              <div className="flex items-center gap-1.5">
                {dashboardSubTabs.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setActiveTab(sub.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                      activeTab === sub.id
                        ? 'bg-[#145a3a] text-white shadow-2xs'
                        : 'text-neutral-600 dark:text-neutral-300 hover:bg-[#f6f7f2] dark:hover:bg-[#0b1711]'
                    }`}
                  >
                    {sub.icon}
                    <span>{sub.label}</span>
                  </button>
                ))}
              </div>
              {pendingOutboxMessages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOutboxModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-800 dark:text-amber-300 text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                  <span>طابور واتساب ({pendingOutboxMessages.length})</span>
                </button>
              )}
            </div>
          )}

          {/* Contextual Sub-Bar for Tab 2 (Recitation & SmartBoard) */}
          {!isFullScreenFocus && isRecitationClusterTab && (
            <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200/80 dark:border-emerald-900/50 shadow-2xs overflow-x-auto no-scrollbar no-print">
              {recitationSubTabs.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setActiveTab(sub.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                    activeTab === sub.id
                      ? 'bg-[#145a3a] text-white shadow-2xs'
                      : 'text-neutral-600 dark:text-neutral-300 hover:bg-[#f6f7f2] dark:hover:bg-[#0b1711]'
                  }`}
                >
                  {sub.icon}
                  <span>{sub.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Contextual Sub-Bar for Tab 4 (Admin & Smart Assistant Hub) */}
          {!isFullScreenFocus && isAdminClusterTab && (
            <div className="flex items-center justify-between gap-2 p-1.5 rounded-2xl bg-white dark:bg-[#12231a] border border-neutral-200/80 dark:border-emerald-900/50 shadow-2xs overflow-x-auto no-scrollbar no-print">
              <div className="flex items-center gap-1.5">
                {adminSubTabs.map((sub) => {
                  const active =
                    activeTab === sub.id ||
                    (sub.id === 'tasks' && activeTab === 'struggling');
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setActiveTab(sub.id)}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#145a3a] text-white shadow-2xs'
                          : 'text-neutral-600 dark:text-neutral-300 hover:bg-[#f6f7f2] dark:hover:bg-[#0b1711]'
                      }`}
                    >
                      {sub.icon}
                      <span>{sub.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setAiSuiteModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-[#c59b27] hover:bg-[#b58c1e] text-[#14281d] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>🤖 المساعد الذكي</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAcademyPdfGuide(true)}
                  className="px-3 py-2 rounded-xl bg-[#f6f7f2] dark:bg-[#0b1711] text-[#145a3a] dark:text-[#dfbd69] text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>الدليل PDF</span>
                </button>
              </div>
            </div>
          )}

          {/* Active Tab View */}
          <Suspense fallback={<ViewLoadingFallback />}>
            <div key={activeTab} className="calm-view-enter">
              {activeTab === 'dashboard' && <DashboardView />}
              {activeTab === 'faith_oasis' && <FaithOasisView />}
              {activeTab === 'owner_panel' && <OwnerControlPanelView />}
              {activeTab === 'students' && <StudentsView />}
              {activeTab === 'session' && <SessionEngineView />}
              {activeTab === 'smartboard' && <SmartBoardView />}
              {activeTab === 'foundation' && <HybridFoundationView />}
              {activeTab === 'tajweed' && <MakharijTajweedView />}
              {activeTab === 'circles' && <CirclesManagerView />}
              {activeTab === 'exams' && <ExamsIjazahView />}
              {activeTab === 'struggling' && (
                <StrugglingAndTasksView mode="struggling" />
              )}
              {activeTab === 'tasks' && <StrugglingAndTasksView mode="tasks" />}
              {activeTab === 'finance' && <FinanceView />}
              {activeTab === 'resources' && <OfflineResourceCenterView />}
              {activeTab === 'public_mushaf' && (
                <PublicMushafWaqfPortalView
                  onBackToAcademy={() => setActiveTab('dashboard')}
                />
              )}
              {activeTab === 'broadcast' && <BroadcastCenterView />}
              {activeTab === 'settings' && <SettingsView />}
            </div>
          </Suspense>

          {/* Clean Footer Signature (No Duplicate Action Buttons) */}
          {!isFullScreenFocus && (
            <div className="mt-8 pt-4 space-y-4">
              <DeveloperSignatureFooter
                onOpenModal={() => setIsDeveloperModalOpen(true)}
              />
              <div className="hidden print:block mt-4 pt-3 border-t border-neutral-300 text-center text-xs font-bold text-neutral-800">
                {ACADEMY_BRAND_CONFIG.printAndBoardFooterText}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ZONE 2 (Mobile/Tablet): Fixed Bottom Navigation Bar (h-16, grid-cols-4, z-30) */}
      <nav
        aria-hidden={isFullScreenFocus}
        aria-label="شريط التنقل السفلي"
        className={`lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-[#12231a]/95 backdrop-blur-md border-t border-neutral-200 dark:border-emerald-900/50 grid grid-cols-4 items-center h-16 px-2 no-print smart-focus-shell-transition ${
          isFullScreenFocus
            ? 'translate-y-24 opacity-0 pointer-events-none select-none'
            : 'translate-y-0 opacity-100'
        }`}
      >
        {primaryFourTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setActiveDropdownId(null);
              setActiveTab(t.id);
            }}
            className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[44px] rounded-xl text-[11px] font-extrabold cursor-pointer transition ${
              t.isActive
                ? 'text-[#145a3a] dark:text-[#dfbd69] bg-[#145a3a]/10 dark:bg-[#dfbd69]/10'
                : 'text-neutral-500 dark:text-neutral-400'
            }`}
          >
            {t.icon}
            <span>{t.shortLabel}</span>
            {t.badge !== undefined && (
              <span className="absolute top-1 left-3 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-mono font-bold flex items-center justify-center">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Global Modals (z-50 with bg-slate-900/60 backdrop-blur-sm) */}
      <Suspense fallback={null}>
        <QuickSearchModal />
      </Suspense>

      {/* WhatsApp Offline Outbox Modal (z-50) */}
      {outboxModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOutboxModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border-2 border-emerald-600/40 overflow-hidden my-auto p-5 md:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#25D366]/20 border border-[#25D366]/40 flex items-center justify-center text-[#25D366]">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                    طابور رسائل واتساب المعلقة ({pendingOutboxMessages.length})
                  </h3>
                  <p className="text-xs text-neutral-500">
                    تم حفظ هذه الرسائل أثناء انقطاع الإنترنت، ويمكنك إرسالها الآن مباشرة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOutboxModalOpen(false)}
                className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-rose-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pendingOutboxMessages.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-500 space-y-1">
                <p>طابور رسائل الواتساب فارغ حالياً.</p>
                <p className="text-[11px] text-emerald-600 font-bold">
                  كافة الرسائل تم إرسالها بنجاح ✓
                </p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-3 pl-1">
                {pendingOutboxMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                          {msg.recipientName}
                        </span>
                        <span className="font-mono text-neutral-500 text-[11px]">
                          ({msg.recipientPhone})
                        </span>
                      </div>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        {msg.createdAt}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-900 p-2.5 rounded-xl border border-neutral-200/60 dark:border-neutral-800 whitespace-pre-wrap leading-relaxed line-clamp-3">
                      {msg.text}
                    </p>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => deleteOutboxMessage(msg.id)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold text-neutral-400 hover:text-rose-600 cursor-pointer"
                      >
                        حذف
                      </button>
                      <button
                        type="button"
                        onClick={() => sendOutboxMessage(msg.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-l from-[#25D366] to-[#128C7E] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>إرسال عبر واتساب</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pendingOutboxMessages.length > 0 && (
              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setOutboxModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-bold text-neutral-600 dark:text-neutral-300 cursor-pointer"
                >
                  إغلاق
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sendAllQueuedMessages();
                    setOutboxModalOpen(false);
                  }}
                  className="py-2.5 px-5 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-white text-xs font-black flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <MessageCircle className="w-4 h-4 text-[#dfbd69]" />
                  <span>
                    إرسال كافة الرسائل الآن ({pendingOutboxMessages.length})
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showAcademyPdfGuide && (
        <Suspense fallback={null}>
          <AcademyPdfGuideModal
            isOpen={showAcademyPdfGuide}
            onClose={() => setShowAcademyPdfGuide(false)}
          />
        </Suspense>
      )}

      {aiSuiteModalOpen && (
        <Suspense fallback={null}>
          <PortalAISuiteModal
            isOpen={aiSuiteModalOpen}
            onClose={() => setAiSuiteModalOpen(false)}
            defaultPortal={currentStaffTier === 'owner' ? 'owner' : 'general'}
          />
        </Suspense>
      )}

      <ExitConfirmationModal
        isOpen={showExitConfirm}
        onCancel={cancelExit}
        onConfirmExit={confirmExit}
      />

      <SyncStatus variant="banner" />

      {toastMessage && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-2xl bg-[#145a3a] text-white text-xs font-extrabold shadow-xl border border-[#c59b27]">
          {toastMessage.text}
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AcademyProvider>
      <MainShell />
    </AcademyProvider>
  );
}
