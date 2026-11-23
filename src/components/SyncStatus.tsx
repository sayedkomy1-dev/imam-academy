import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  DownloadCloud,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';

export interface SyncStatusProps {
  variant?: 'sidebar' | 'header' | 'banner';
  compact?: boolean;
  /** Optional external dropdown controller for Zero-Overlap architecture */
  isOpen?: boolean;
  onToggleOpen?: () => void;
}

export const SyncStatus: React.FC<SyncStatusProps> = ({
  variant = 'banner',
  compact = false,
  isOpen,
  onToggleOpen,
}) => {
  const {
    cloudSyncStatus,
    lastSyncTimestamp,
    triggerCloudSyncNow,
    restoreFromCloudFirestoreNow,
    students,
    circles,
    sessions,
    tasks,
    pendingOutboxMessages,
    activeStaffEmail,
  } = useAcademy();

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [internalOpen, setInternalOpen] = useState(false);
  const [isForcingSync, setIsForcingSync] = useState(false);
  const [isRestoringCloud, setIsRestoringCloud] = useState(false);
  const [lastSyncModeLabel, setLastSyncModeLabel] = useState<string>(
    'مزامنة تلقائية (Cloud + Local)'
  );
  const [networkToast, setNetworkToast] = useState<{
    show: boolean;
    msg: string;
    type: 'offline' | 'online' | 'synced';
  }>({
    show: false,
    msg: '',
    type: 'online',
  });

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const isDetailsOpen = isOpen !== undefined ? isOpen : internalOpen;

  const toggleDetails = () => {
    if (onToggleOpen) {
      onToggleOpen();
    } else {
      setInternalOpen((prev) => !prev);
    }
  };

  const closeDetails = () => {
    if (onToggleOpen && isOpen) {
      onToggleOpen();
    } else {
      setInternalOpen(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setLastSyncModeLabel('مزامنة تلقائية فور عودة الاتصال');
      setNetworkToast({
        show: true,
        msg: 'تمت استعادة الاتصال بالسحابة (Online) — جارٍ مزامنة أحدث البيانات تلقائياً ✓',
        type: 'online',
      });
      void triggerCloudSyncNow(false);
      window.setTimeout(
        () => setNetworkToast((p) => ({ ...p, show: false })),
        4500
      );
    };

    const handleOffline = () => {
      setIsOnline(false);
      setLastSyncModeLabel('حفظ محلي فوري (Offline-First)');
      setNetworkToast({
        show: true,
        msg: 'انقطع الاتصال بالإنترنت (Offline) — يعمل التطبيق بكامل كفاءته محلياً وسيتم المزامنة فور عودة الشبكة ☁️',
        type: 'offline',
      });
      window.setTimeout(
        () => setNetworkToast((p) => ({ ...p, show: false })),
        5500
      );
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [triggerCloudSyncNow]);

  // Click-outside & Escape listener for internal popover mode
  useEffect(() => {
    if (!isDetailsOpen || isOpen !== undefined) return;
    const handleDocClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setInternalOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInternalOpen(false);
    };
    document.addEventListener('mousedown', handleDocClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isDetailsOpen, isOpen]);

  const handleForceSync = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isForcingSync || cloudSyncStatus === 'syncing') return;
    setIsForcingSync(true);
    setLastSyncModeLabel('مزامنة فورية يدوية (Force Sync)');
    try {
      await triggerCloudSyncNow(true);
      setNetworkToast({
        show: true,
        msg: `تمت المزامنة الفورية (Force Sync) بنجاح (${students.length} طالباً • ${circles.length} حلقات • ${sessions.length} حصة) ✓`,
        type: 'synced',
      });
      window.setTimeout(
        () => setNetworkToast((p) => ({ ...p, show: false })),
        3800
      );
    } finally {
      setIsForcingSync(false);
    }
  };

  const handleRestoreFromCloud = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isRestoringCloud) return;
    setIsRestoringCloud(true);
    setLastSyncModeLabel('استرجاع ومطابقة من السحابة');
    try {
      await restoreFromCloudFirestoreNow(false);
    } finally {
      setIsRestoringCloud(false);
    }
  };

  const isSyncingNow = isForcingSync || cloudSyncStatus === 'syncing';

  const statusMeta = !isOnline
    ? {
        badgeText: 'دون اتصال (Offline)',
        subText: 'حفظ محلي مؤمّن (IndexedDB + Local)',
        dotClass: 'bg-amber-500 animate-pulse',
        pillClass:
          'border-amber-400/60 bg-amber-50/90 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200',
        icon: <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />,
      }
    : isSyncingNow
    ? {
        badgeText: 'جارٍ المزامنة...',
        subText: 'تحديث السحابة والنسخة المحلية',
        dotClass: 'bg-sky-500 animate-ping',
        pillClass:
          'border-sky-400/60 bg-sky-50/90 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200',
        icon: (
          <RefreshCw className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0 animate-spin" />
        ),
      }
    : cloudSyncStatus === 'synced'
    ? {
        badgeText: 'متصل بالسحابة (Online)',
        subText: 'متزامن مع Firebase Firestore',
        dotClass: 'bg-emerald-500',
        pillClass:
          'border-emerald-500/40 bg-emerald-50/80 dark:bg-emerald-950/40 text-[#145a3a] dark:text-emerald-200',
        icon: <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
      }
    : {
        badgeText: 'متصل • جاهز محلياً وسحابياً',
        subText: 'مؤمّن (Local-First + Cloud Ready)',
        dotClass: 'bg-emerald-500',
        pillClass:
          'border-neutral-200/90 dark:border-emerald-900/60 bg-[#f6f7f2] dark:bg-[#0b1711] text-[#14281d] dark:text-emerald-200',
        icon: <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
      };

  // Shared Detailed Sync Panel Content
  const renderSyncDetailsPanel = () => (
    <div
      dir="rtl"
      onClick={(e) => e.stopPropagation()}
      className="space-y-3 text-right text-xs"
    >
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-100 dark:border-emerald-900/60">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              !isOnline
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                : 'bg-[#145a3a]/10 dark:bg-emerald-950 text-[#145a3a] dark:text-[#dfbd69]'
            }`}
          >
            {!isOnline ? (
              <CloudOff className="w-4 h-4" />
            ) : (
              <Cloud className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="font-extrabold text-[#14281d] dark:text-white flex items-center gap-1.5">
              <span>حالة المزامنة والاتصال بالسحابة</span>
              <span
                className={`w-2 h-2 rounded-full ${statusMeta.dotClass}`}
              />
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
              {statusMeta.badgeText} • {statusMeta.subText}
            </div>
          </div>
        </div>
        {variant === 'header' && (
          <button
            type="button"
            onClick={closeDetails}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Last Sync Timestamp & Operation Details */}
      <div className="p-3 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200/80 dark:border-emerald-900/50 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-neutral-500 dark:text-neutral-400 font-bold">
            آخر عملية مزامنة:
          </span>
          <span className="font-mono font-extrabold text-[#145a3a] dark:text-[#dfbd69] tabular-nums">
            {lastSyncTimestamp || 'الآن'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-neutral-500 dark:text-neutral-400 font-bold">
            نوع آخر عملية:
          </span>
          <span className="font-extrabold text-[#14281d] dark:text-emerald-100">
            {lastSyncModeLabel}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-neutral-500 dark:text-neutral-400 font-bold">
            حالة الشبكة:
          </span>
          <span
            className={`font-extrabold ${
              isOnline
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {isOnline ? '🟢 متصل (Online)' : '🟠 غير متصل (Offline)'}
          </span>
        </div>
        {activeStaffEmail && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-500 dark:text-neutral-400 font-bold">
              النطاق السحابي:
            </span>
            <span
              className="font-mono text-[10px] text-neutral-600 dark:text-emerald-300 truncate max-w-[160px]"
              dir="ltr"
            >
              {activeStaffEmail}
            </span>
          </div>
        )}
      </div>

      {/* Synced Records Counters */}
      <div className="grid grid-cols-4 gap-1.5 text-center">
        <div className="p-2 rounded-xl bg-neutral-50 dark:bg-emerald-950/40 border border-neutral-200/70 dark:border-emerald-900/40">
          <div className="text-xs font-black font-mono tabular-nums text-[#145a3a] dark:text-[#dfbd69]">
            {students.length}
          </div>
          <div className="text-[10px] text-neutral-500 font-bold">طالب</div>
        </div>
        <div className="p-2 rounded-xl bg-neutral-50 dark:bg-emerald-950/40 border border-neutral-200/70 dark:border-emerald-900/40">
          <div className="text-xs font-black font-mono tabular-nums text-[#145a3a] dark:text-[#dfbd69]">
            {circles.length}
          </div>
          <div className="text-[10px] text-neutral-500 font-bold">حلقات</div>
        </div>
        <div className="p-2 rounded-xl bg-neutral-50 dark:bg-emerald-950/40 border border-neutral-200/70 dark:border-emerald-900/40">
          <div className="text-xs font-black font-mono tabular-nums text-[#145a3a] dark:text-[#dfbd69]">
            {sessions.length}
          </div>
          <div className="text-[10px] text-neutral-500 font-bold">حصة</div>
        </div>
        <div className="p-2 rounded-xl bg-neutral-50 dark:bg-emerald-950/40 border border-neutral-200/70 dark:border-emerald-900/40">
          <div className="text-xs font-black font-mono tabular-nums text-[#145a3a] dark:text-[#dfbd69]">
            {tasks.length}
          </div>
          <div className="text-[10px] text-neutral-500 font-bold">مهمة</div>
        </div>
      </div>

      {pendingOutboxMessages.length > 0 && (
        <div className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-400/50 text-[11px] font-bold text-amber-800 dark:text-amber-200 flex items-center justify-between">
          <span>رسائل واتساب بانتظار الإرسال:</span>
          <span className="font-mono font-black">
            {pendingOutboxMessages.length} رسالة
          </span>
        </div>
      )}

      {/* Primary Action: Force Sync Now + Secondary Restore */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={(e) => void handleForceSync(e)}
          disabled={isSyncingNow}
          className="flex-1 py-2.5 px-3 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] disabled:opacity-60 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all"
          title="طلب مزامنة فورية مع السحابة والنسخة المحلية الآن"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-[#dfbd69] ${
              isSyncingNow ? 'animate-spin' : ''
            }`}
          />
          <span>
            {isSyncingNow ? 'جارٍ المزامنة الفورية...' : 'مزامنة فورية (Force Sync)'}
          </span>
        </button>

        <button
          type="button"
          onClick={(e) => void handleRestoreFromCloud(e)}
          disabled={isRestoringCloud || !isOnline}
          className="py-2.5 px-2.5 rounded-xl border border-neutral-200 dark:border-emerald-800 hover:border-[#145a3a] disabled:opacity-50 text-[#145a3a] dark:text-[#dfbd69] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
          title="استرجاع أحدث نسخة محفوظة من السحابة"
        >
          <DownloadCloud
            className={`w-3.5 h-3.5 ${isRestoringCloud ? 'animate-bounce' : ''}`}
          />
          <span className="hidden sm:inline">استرجاع</span>
        </button>
      </div>

      <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1 border-t border-neutral-100 dark:border-emerald-950">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          <span>حفظ ثلاثي: Firestore + IndexedDB + LocalStorage</span>
        </span>
        <Database className="w-3 h-3 text-[#c59b27]" />
      </div>
    </div>
  );

  // 1) SIDEBAR VARIANT (Embedded cleanly in Desktop Right Sidebar bottom zone)
  if (variant === 'sidebar') {
    return (
      <div
        ref={popoverRef}
        className="rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200/80 dark:border-emerald-900/60 p-2.5 space-y-2 text-xs"
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleDetails}
            className="flex items-center gap-2 min-w-0 text-right cursor-pointer group"
            title="عرض تفاصيل آخر عملية مزامنة وحالة السحابة"
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusMeta.dotClass}`} />
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold text-[#14281d] dark:text-white truncate group-hover:text-[#145a3a] dark:group-hover:text-[#dfbd69]">
                {statusMeta.badgeText}
              </div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono truncate">
                آخر مزامنة: {lastSyncTimestamp || 'الآن'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={(e) => void handleForceSync(e)}
            disabled={isSyncingNow}
            className="px-2.5 py-1.5 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] disabled:opacity-60 text-white text-[10px] font-extrabold flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs transition-all"
            title="مزامنة فورية يدوية (Force Sync)"
          >
            <RefreshCw
              className={`w-3 h-3 text-[#dfbd69] ${
                isSyncingNow ? 'animate-spin' : ''
              }`}
            />
            <span>مزامنة</span>
          </button>
        </div>

        {isDetailsOpen && (
          <div className="pt-2 border-t border-neutral-200/70 dark:border-emerald-900/50">
            {renderSyncDetailsPanel()}
          </div>
        )}
      </div>
    );
  }

  // 2) HEADER VARIANT (Compact interactive pill + z-40 popover for Top Header Bar)
  if (variant === 'header') {
    return (
      <div
        ref={popoverRef}
        className="relative shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-flex items-center rounded-xl border border-neutral-200/80 dark:border-emerald-900/60 bg-[#f6f7f2] dark:bg-[#0b1711] p-0.5">
          <button
            type="button"
            onClick={toggleDetails}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-extrabold text-[#14281d] dark:text-emerald-100 hover:bg-white/70 dark:hover:bg-[#12231a] transition-colors cursor-pointer"
            title={`حالة الاتصال بالسحابة: ${statusMeta.badgeText} — آخر مزامنة: ${lastSyncTimestamp}`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${statusMeta.dotClass}`} />
            {!compact && (
              <span className="hidden md:inline whitespace-nowrap">
                {isOnline ? 'متصل' : 'أوفلاين'}
              </span>
            )}
            <span className="hidden lg:inline font-mono text-[10px] text-neutral-500 dark:text-emerald-300/80 tabular-nums">
              {lastSyncTimestamp}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => void handleForceSync(e)}
            disabled={isSyncingNow}
            className="p-1.5 rounded-lg text-[#145a3a] dark:text-[#dfbd69] hover:bg-[#145a3a]/10 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
            title="مزامنة فورية يدوية (Force Sync)"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {isDetailsOpen && (
          <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 rounded-3xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-800 shadow-2xl p-4 z-40">
            {renderSyncDetailsPanel()}
          </div>
        )}
      </div>
    );
  }

  // 3) BANNER / TOAST VARIANT (Global non-overlapping status toast + offline recovery bar)
  return (
    <>
      {networkToast.show && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-5 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl shadow-2xl border text-xs sm:text-sm font-extrabold flex items-center gap-2.5 transition-all duration-300 animate-in slide-in-from-top-4 ${
            networkToast.type === 'offline'
              ? 'bg-amber-600 text-white border-amber-300 ring-2 ring-amber-400/40'
              : 'bg-emerald-700 text-white border-emerald-300 ring-2 ring-emerald-400/40'
          }`}
        >
          {networkToast.type === 'offline' ? (
            <WifiOff className="w-5 h-5 shrink-0 animate-pulse text-amber-200" />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-200" />
          )}
          <span>{networkToast.msg}</span>
        </div>
      )}

      {!isOnline && (
        <div
          dir="rtl"
          className="fixed bottom-20 lg:bottom-4 left-4 z-40 flex items-center gap-2.5 rounded-2xl bg-amber-600/95 backdrop-blur-md px-3.5 py-2 text-xs font-extrabold text-white shadow-xl border border-amber-300/60"
        >
          <WifiOff className="w-4 h-4 shrink-0 animate-pulse text-amber-200" />
          <span>
            وضع دون اتصال (Offline) • آخر مزامنة: {lastSyncTimestamp}
          </span>
          <button
            type="button"
            onClick={(e) => void handleForceSync(e)}
            disabled={isSyncingNow}
            className="px-2.5 py-1 rounded-xl bg-white text-amber-900 hover:bg-amber-50 text-[11px] font-black flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <RefreshCw
              className={`w-3 h-3 ${isSyncingNow ? 'animate-spin' : ''}`}
            />
            <span>مزامنة فورية</span>
          </button>
        </div>
      )}
    </>
  );
};

// Keep OfflineIndicator export as a backward-compatible alias to SyncStatus
export const OfflineIndicator = SyncStatus;
export default SyncStatus;
