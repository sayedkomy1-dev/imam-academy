import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  ChevronRight,
  ChevronLeft,
  Moon,
  Sun,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Bookmark,
  RotateCcw,
  X,
  Volume2,
  Pause,
} from 'lucide-react';
import { SURAHS, getEveryAyahAudioUrl } from '../data/quranData';
import { SessionRecord, Student, ReciterId } from '../types';

// Official Madinah Mushaf 604-page starting pages for all 114 Surahs
export const SURAH_START_PAGE_604: number[] = [
  1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267, 282,
  293, 305, 312, 322, 332, 342, 350, 359, 367, 377, 385, 396, 404, 411, 415,
  418, 428, 434, 440, 446, 453, 458, 467, 477, 483, 489, 496, 499, 502, 507,
  511, 515, 518, 520, 523, 526, 528, 531, 534, 537, 542, 545, 549, 551, 553,
  554, 556, 558, 560, 562, 564, 566, 568, 570, 572, 574, 575, 577, 578, 580,
  582, 583, 585, 586, 587, 587, 589, 590, 591, 591, 592, 593, 594, 595, 595,
  596, 596, 597, 597, 598, 598, 599, 599, 600, 600, 601, 601, 601, 602, 602,
  602, 603, 603, 603, 604, 604, 604,
];

// Official Madinah Mushaf 30 Juz starting pages
export const JUZ_START_PAGE_604: number[] = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322,
  342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

const MUSHAF_BOOKMARK_KEY = 'al_imam_unified_hd_mushaf_bookmark_v1';

export function getPageMetadata604(page: number) {
  const safePage = Math.max(1, Math.min(604, Math.round(page || 1)));
  let surahId = 1;
  for (let i = 0; i < SURAH_START_PAGE_604.length; i++) {
    if (SURAH_START_PAGE_604[i] <= safePage) {
      surahId = i + 1;
    } else {
      break;
    }
  }
  let juz = 1;
  for (let j = 0; j < JUZ_START_PAGE_604.length; j++) {
    if (JUZ_START_PAGE_604[j] <= safePage) {
      juz = j + 1;
    } else {
      break;
    }
  }
  const surahObj = SURAHS.find((s) => s.id === surahId) || SURAHS[0];
  return {
    page: safePage,
    surahId: surahObj.id,
    surahName: surahObj.name,
    surahAyahs: surahObj.ayahs,
    juz,
  };
}

interface UnifiedHdMushafModalProps {
  open: boolean;
  onClose: () => void;
  initialPage?: number;
  initialSurahId?: number;
  studentName?: string;
  defaultReciter?: ReciterId;
  returnContextLabel?: string;
}

export const UnifiedHdMushafModal: React.FC<UnifiedHdMushafModalProps> = ({
  open,
  onClose,
  initialPage,
  initialSurahId,
  studentName,
  defaultReciter = 'Husary_128kbps',
  returnContextLabel = 'العودة للحصة',
}) => {
  const [page, setPage] = useState<number>(() => {
    if (initialPage && initialPage >= 1 && initialPage <= 604) return initialPage;
    if (initialSurahId && initialSurahId >= 1 && initialSurahId <= 114) {
      return SURAH_START_PAGE_604[initialSurahId - 1] || 1;
    }
    try {
      const saved = Number(localStorage.getItem(MUSHAF_BOOKMARK_KEY) || 0);
      if (saved >= 1 && saved <= 604) return saved;
    } catch {
      // ignore
    }
    return 1;
  });

  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [nightMode, setNightMode] = useState<boolean>(false);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [imageLoading, setImageLoading] = useState<boolean>(true);
  const [imageFailed, setImageFailed] = useState<boolean>(false);
  const [sourceIndex, setSourceIndex] = useState<number>(0);
  const [retryToken, setRetryToken] = useState<number>(0);
  const [bookmarkedPage, setBookmarkedPage] = useState<number | null>(() => {
    try {
      const saved = Number(localStorage.getItem(MUSHAF_BOOKMARK_KEY) || 0);
      return saved >= 1 && saved <= 604 ? saved : null;
    } catch {
      return null;
    }
  });
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlayingAudio(false);
      }
      return;
    }
    if (initialPage && initialPage >= 1 && initialPage <= 604) {
      setPage(initialPage);
    } else if (initialSurahId && initialSurahId >= 1 && initialSurahId <= 114) {
      setPage(SURAH_START_PAGE_604[initialSurahId - 1] || 1);
    }
  }, [open, initialPage, initialSurahId]);

  const meta = useMemo(() => getPageMetadata604(page), [page]);

  const imageSources = useMemo(() => {
    const p3 = String(meta.page).padStart(3, '0');
    const sources: string[] = [];
    if (meta.page === 1 || meta.page === 2) {
      sources.push(`/assets/kfgqpc/mushaf604/page-${p3}.png`);
    }
    sources.push(
      `https://raw.githubusercontent.com/akram-seid/quran-hd-images/main/images/${p3}.jpg`,
      `https://cdn.jsdelivr.net/gh/akram-seid/quran-hd-images@main/images/${p3}.jpg`,
      `https://everyayah.com/data/images_png/${meta.page}.png`
    );
    return sources;
  }, [meta.page]);

  useEffect(() => {
    setImageLoading(true);
    setImageFailed(false);
    setSourceIndex(0);
  }, [meta.page, retryToken]);

  if (!open) return null;

  const currentSrc = imageSources[sourceIndex] || imageSources[0];
  const progressPct = Math.max(1, Math.min(100, Math.round((meta.page / 604) * 100)));

  const handleSaveBookmark = () => {
    try {
      localStorage.setItem(MUSHAF_BOOKMARK_KEY, String(meta.page));
      setBookmarkedPage(meta.page);
    } catch {
      // ignore
    }
  };

  const handlePlaySurahFirstAyah = () => {
    if (audioRef.current && isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
      return;
    }
    const url = getEveryAyahAudioUrl(defaultReciter, meta.surahId, 1);
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    setIsPlayingAudio(true);
    audio.onended = () => setIsPlayingAudio(false);
    audio.onerror = () => setIsPlayingAudio(false);
    audio.play().catch(() => setIsPlayingAudio(false));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 md:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`relative w-full ${
          focusMode ? 'max-w-5xl' : 'max-w-4xl'
        } rounded-3xl border-2 border-[#c59b27]/60 shadow-2xl overflow-hidden transition-all ${
          nightMode
            ? 'bg-[#09140e] text-[#f3ead3]'
            : 'bg-[#fcfaf2] text-[#14281d]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar — Clean, Uncluttered & Focused */}
        <div className="px-4 py-3 bg-gradient-to-l from-[#0f3d26] via-[#145a3a] to-[#1b7049] text-white flex flex-wrap items-center justify-between gap-2 border-b border-[#c59b27]/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#dfbd69]/20 border border-[#dfbd69]/50 flex items-center justify-center text-[#dfbd69]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm md:text-base font-extrabold">
                  مصحف المدينة النبوية المصور (٦٠٤ صفحات)
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-[#dfbd69] text-[#14281d] text-[10px] font-extrabold">
                  مجمع الملك فهد KFGQPC
                </span>
              </div>
              <p className="text-[11px] text-emerald-100/90">
                سورة {meta.surahName} • الجزء {meta.juz} • صفحة {meta.page} من ٦٠٤
                {studentName ? ` • الطالب: ${studentName}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handlePlaySurahFirstAyah}
              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              title="الاستماع لتلاوة مطلع السورة"
            >
              {isPlayingAudio ? (
                <Pause className="w-3.5 h-3.5 text-[#dfbd69]" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-[#dfbd69]" />
              )}
              <span>{isPlayingAudio ? 'إيقاف الصوت' : 'تلاوة السورة'}</span>
            </button>

            <button
              type="button"
              onClick={() => setFocusMode((v) => !v)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer ${
                focusMode
                  ? 'bg-[#dfbd69] text-[#14281d]'
                  : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
              title="وضع التركيز وإخفاء أشرطة التحكم الفرعية"
            >
              {focusMode ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
              <span>{focusMode ? 'إنهاء التركيز' : 'التركيز'}</span>
            </button>

            <button
              type="button"
              onClick={() => setNightMode((v) => !v)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer ${
                nightMode
                  ? 'bg-[#dfbd69] text-[#14281d]'
                  : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
              title="تبديل القراءة الليلية المريحة للعين"
            >
              {nightMode ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
              <span>{nightMode ? 'نهاري' : 'ليلي'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <X className="w-3.5 h-3.5" />
              <span>{returnContextLabel}</span>
            </button>
          </div>
        </div>

        {/* Navigation & Official KFGQPC Calligraphy Strip (hidden in Focus Mode) */}
        {!focusMode && (
          <div
            className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs ${
              nightMode
                ? 'bg-[#0e1f16] border-emerald-900/60'
                : 'bg-[#f6f1de] border-[#c59b27]/30'
            }`}
          >
            {/* Official KFGQPC Surah & Juz Calligraphy Banners */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/90 dark:bg-[#12231a] border border-[#c59b27]/40 shadow-2xs">
                <img
                  src={`/assets/kfgqpc/sura-names/${meta.surahId}.png`}
                  alt={`سورة ${meta.surahName}`}
                  className="h-6 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span className="font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                  سورة {meta.surahName}
                </span>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/90 dark:bg-[#12231a] border border-[#c59b27]/40 shadow-2xs">
                <img
                  src={`/assets/kfgqpc/part-names/${meta.juz}.png`}
                  alt={`الجزء ${meta.juz}`}
                  className="h-5 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span className="font-bold text-neutral-700 dark:text-neutral-200">
                  الجزء {meta.juz}
                </span>
              </div>
            </div>

            {/* Quick Selectors: Surah, Juz, Page, Zoom, Bookmark */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                aria-label="اختيار السورة"
                value={meta.surahId}
                onChange={(e) => {
                  const sId = Number(e.target.value);
                  setPage(SURAH_START_PAGE_604[sId - 1] || 1);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#12231a] border border-neutral-300 dark:border-emerald-800 text-xs font-bold text-[#14281d] dark:text-white"
              >
                {SURAHS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}. سورة {s.name} (ص {SURAH_START_PAGE_604[s.id - 1]})
                  </option>
                ))}
              </select>

              <select
                aria-label="اختيار الجزء"
                value={meta.juz}
                onChange={(e) => {
                  const jId = Number(e.target.value);
                  setPage(JUZ_START_PAGE_604[jId - 1] || 1);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#12231a] border border-neutral-300 dark:border-emerald-800 text-xs font-bold text-[#14281d] dark:text-white"
              >
                {JUZ_START_PAGE_604.map((startP, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    الجزء {idx + 1} (ص {startP})
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 bg-white dark:bg-[#12231a] border border-neutral-300 dark:border-emerald-800 rounded-xl px-2 py-1">
                <span className="text-[11px] font-bold text-neutral-500">ص:</span>
                <input
                  type="number"
                  min={1}
                  max={604}
                  value={meta.page}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= 1 && val <= 604) setPage(val);
                  }}
                  className="w-14 text-center font-mono font-extrabold text-xs bg-transparent focus:outline-none text-[#14281d] dark:text-white"
                />
                <span className="text-[10px] text-neutral-400">/604</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoomPercent((z) => Math.max(80, z - 10))}
                  className="p-1.5 rounded-lg bg-white dark:bg-[#12231a] border border-neutral-300 dark:border-emerald-800 hover:border-[#145a3a] cursor-pointer"
                  title="تصغير الصفحة"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono font-bold w-10 text-center">
                  {zoomPercent}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomPercent((z) => Math.min(160, z + 10))}
                  className="p-1.5 rounded-lg bg-white dark:bg-[#12231a] border border-neutral-300 dark:border-emerald-800 hover:border-[#145a3a] cursor-pointer"
                  title="تكبير الصفحة"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleSaveBookmark}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer border ${
                  bookmarkedPage === meta.page
                    ? 'bg-[#c59b27] text-[#14281d] border-[#c59b27]'
                    : 'bg-white dark:bg-[#12231a] text-[#145a3a] dark:text-[#dfbd69] border-[#c59b27]/50'
                }`}
                title="حفظ موضع القراءة الحالي كعلامة مرجعية"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>
                  {bookmarkedPage === meta.page
                    ? `محفوظة (ص ${meta.page})`
                    : 'حفظ العلامة'}
                </span>
              </button>

              {bookmarkedPage && bookmarkedPage !== meta.page && (
                <button
                  type="button"
                  onClick={() => setPage(bookmarkedPage)}
                  className="px-2 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 text-[11px] font-bold cursor-pointer"
                >
                  الانتقال للعلامة (ص {bookmarkedPage})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Progress Bar across 604 pages */}
        <div className="h-1.5 w-full bg-neutral-200 dark:bg-emerald-950 overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-[#145a3a] to-[#c59b27] transition-all duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Main 604 Page Canvas Area */}
        <div className="relative flex items-center justify-between px-2 md:px-6 py-4 min-h-[65vh] max-h-[78vh] overflow-auto">
          {/* Previous Page Button (Right side in RTL) */}
          <button
            type="button"
            disabled={meta.page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="sticky top-1/2 -translate-y-1/2 z-20 p-2.5 md:p-3 rounded-2xl bg-[#145a3a] hover:bg-[#0f442b] disabled:opacity-30 text-white shadow-lg cursor-pointer shrink-0"
            title="الصفحة السابقة"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Page Frame */}
          <div className="mx-auto flex flex-col items-center justify-center w-full">
            {imageLoading && !imageFailed && (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-10 h-10 rounded-full border-3 border-[#c59b27] border-t-transparent animate-spin" />
                <p className="text-xs font-bold text-neutral-500">
                  جاري تحميل لوحة الصفحة ({meta.page}) من مصحف المدينة النبوية...
                </p>
              </div>
            )}

            {!imageFailed ? (
              <div
                className="relative rounded-2xl overflow-hidden border-2 border-[#c59b27]/50 shadow-xl bg-[#fffdf7] transition-transform"
                style={{
                  width: `${Math.min(100, zoomPercent)}%`,
                  maxWidth: `${Math.round(560 * (zoomPercent / 100))}px`,
                }}
              >
                <img
                  src={currentSrc}
                  alt={`صفحة المصحف ${meta.page} - سورة ${meta.surahName}`}
                  className={`w-full h-auto block select-none ${
                    nightMode ? 'mushaf-dark-filter' : ''
                  }`}
                  onLoad={() => {
                    setImageLoading(false);
                    setImageFailed(false);
                  }}
                  onError={() => {
                    if (sourceIndex + 1 < imageSources.length) {
                      setSourceIndex((idx) => idx + 1);
                    } else {
                      setImageLoading(false);
                      setImageFailed(true);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="max-w-lg w-full p-6 rounded-3xl bg-white dark:bg-[#12231a] border-2 border-amber-400/60 text-center space-y-3 shadow-md">
                <p className="text-sm font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                  تعذر تحميل الصورة المصورة للصفحة ({meta.page}) بسبب ضعف الاتصال
                </p>
                <p className="text-xs text-neutral-600 dark:text-neutral-300">
                  سورة {meta.surahName} • الجزء {meta.juz} • يمكنك إعادة المحاولة فوراً أو استخدام القارئ النصي العثماني.
                </p>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setRetryToken((t) => t + 1)}
                    className="px-4 py-2 rounded-xl bg-[#145a3a] hover:bg-[#0f442b] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>↻ إعادة محاولة تحميل الصفحة</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Next Page Button (Left side in RTL) */}
          <button
            type="button"
            disabled={meta.page >= 604}
            onClick={() => setPage((p) => Math.min(604, p + 1))}
            className="sticky top-1/2 -translate-y-1/2 z-20 p-2.5 md:p-3 rounded-2xl bg-[#145a3a] hover:bg-[#0f442b] disabled:opacity-30 text-white shadow-lg cursor-pointer shrink-0"
            title="الصفحة التالية"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Bottom Status Footer */}
        <div
          className={`px-4 py-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold ${
            nightMode
              ? 'bg-[#0e1f16] border-emerald-900/60 text-emerald-200'
              : 'bg-[#f6f1de] border-[#c59b27]/30 text-[#145a3a]'
          }`}
        >
          <span>
            صفحة {meta.page} من ٦٠٤ ({progressPct}% من الختمة) • الحزب{' '}
            {Math.min(60, (meta.juz - 1) * 2 + 1)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={meta.page <= 1}
              className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-[#12231a] border border-[#c59b27]/40 disabled:opacity-40 cursor-pointer"
            >
              ← الصفحة السابقة
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(604, p + 1))}
              disabled={meta.page >= 604}
              className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-[#12231a] border border-[#c59b27]/40 disabled:opacity-40 cursor-pointer"
            >
              الصفحة التالية →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// v11.7.4.5 Vector HTML/PDF Teacher Correction Document Exporter
// ============================================================================
export function exportVectorCorrectionDocumentHtml(params: {
  student?: Student;
  session: Partial<SessionRecord>;
  academyName: string;
  teacherName: string;
  mode: 'print' | 'download';
}) {
  const { student, session, academyName, teacherName, mode } = params;
  const studentName = student?.name || 'طالب الحلقة';
  const circleName = student?.circle || 'حلقة القرآن الكريم';
  const sessionDate = session.date || new Date().toISOString().slice(0, 10);
  const mastery = session.masteryScore ?? 92;
  const status = session.status || 'حضر';
  const errors = session.errors || [];

  const newMemText = session.newMemorization?.enabled
    ? `سورة ${session.newMemorization.surahName} (${
        session.newMemorization.isFullSurah
          ? 'السورة كاملة'
          : `من آية ${session.newMemorization.fromAyah} إلى آية ${session.newMemorization.toAyah}`
      })`
    : 'غير محدد';

  const nearRevText = session.nearReview?.enabled
    ? `سورة ${session.nearReview.surahName} (${
        session.nearReview.isFullSurah
          ? 'السورة كاملة'
          : `من آية ${session.nearReview.fromAyah} إلى آية ${session.nearReview.toAyah}`
      })`
    : '—';

  const farRevText = session.farReview?.enabled
    ? `سورة ${session.farReview.surahName} (${
        session.farReview.isFullSurah
          ? 'السورة كاملة'
          : `من آية ${session.farReview.fromAyah} إلى آية ${session.farReview.toAyah}`
      })`
    : '—';

  const errorsRowsHtml =
    errors.length > 0
      ? errors
          .map(
            (err, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${err.type || 'تجويد'}</strong></td>
            <td>${err.surah || '—'} ${err.ayah ? `آية (${err.ayah})` : ''}</td>
            <td class="quran-word">${err.word || '—'}</td>
            <td>${err.correctedInSession || err.followUpStatus === 'mastered' ? 'تم التصحيح والإتقان ✓' : 'مفتوح للمتابعة في الحصة القادمة'}</td>
          </tr>`
          )
          .join('')
      : `<tr><td colspan="5" style="text-align:center;color:#145a3a;font-weight:bold;">ما شاء الله! تلاوة متقنة بلا أخطاء مسجلة في هذه الحصة 🌟</td></tr>`;

  const htmlString = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>وثيقة تصحيح التلاوة — ${studentName} — ${sessionDate}</title>
  <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@500;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Cairo', sans-serif;
      background: #fcfaf2;
      color: #14281d;
      margin: 0;
      padding: 20px;
      line-height: 1.65;
    }
    .doc-frame {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      border: 3px double #c59b27;
      border-radius: 20px;
      padding: 24px 28px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #c59b27;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      color: #145a3a;
    }
    .header p {
      margin: 4px 0 0;
      font-size: 12px;
      color: #5c4b37;
      font-weight: 700;
    }
    .badge {
      background: #145a3a;
      color: #dfbd69;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 18px;
    }
    .kpi-box {
      background: #f8f5e8;
      border: 1px solid #e2d4a5;
      border-radius: 12px;
      padding: 10px 12px;
      text-align: center;
    }
    .kpi-box .lbl { font-size: 11px; color: #5c4b37; font-weight: 700; }
    .kpi-box .val { font-size: 15px; color: #145a3a; font-weight: 800; margin-top: 2px; }
    h2 {
      font-size: 14px;
      color: #145a3a;
      margin: 16px 0 8px;
      border-right: 4px solid #c59b27;
      padding-right: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 14px;
    }
    th, td {
      border: 1px solid #dfd3b0;
      padding: 8px 10px;
      text-align: right;
    }
    th {
      background: #145a3a;
      color: #ffffff;
      font-weight: 800;
    }
    .quran-word {
      font-family: 'Amiri', serif;
      font-size: 16px;
      font-weight: 700;
      color: #991b1b;
    }
    .notes-box {
      background: #fcfaf2;
      border: 1px solid #dfd3b0;
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 12.5px;
      white-space: pre-wrap;
    }
    .footer {
      margin-top: 22px;
      padding-top: 12px;
      border-top: 1px dashed #c59b27;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #5c4b37;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="doc-frame">
    <div class="header">
      <div>
        <h1>📄 وثيقة تصحيح التلاوة والمتابعة القرآنية</h1>
        <p>${academyName} • إشراف المحفظ: ${teacherName}</p>
      </div>
      <div class="badge">درجة الإتقان: ${mastery}% (${status})</div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box"><div class="lbl">اسم الطالب</div><div class="val">${studentName}</div></div>
      <div class="kpi-box"><div class="lbl">الحلقة</div><div class="val">${circleName}</div></div>
      <div class="kpi-box"><div class="lbl">تاريخ الحصة</div><div class="val">${sessionDate}</div></div>
      <div class="kpi-box"><div class="lbl">عدد الملاحظات</div><div class="val">${errors.length}</div></div>
    </div>

    <h2>📖 مقرر الحصة والتسميع</h2>
    <table>
      <thead>
        <tr>
          <th>المحور</th>
          <th>النطاق القرآني المقرر</th>
          <th>التقدير</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>الحفظ الجديد</strong></td>
          <td>${newMemText}</td>
          <td>${session.previousEvaluation?.newGrade || 'ممتاز'}</td>
        </tr>
        <tr>
          <td><strong>المراجعة القريبة</strong></td>
          <td>${nearRevText}</td>
          <td>${session.previousEvaluation?.nearGrade || 'جيد جداً'}</td>
        </tr>
        <tr>
          <td><strong>المراجعة البعيدة</strong></td>
          <td>${farRevText}</td>
          <td>${session.previousEvaluation?.farGrade || 'ممتاز'}</td>
        </tr>
      </tbody>
    </table>

    <h2>🎯 جدول تصحيح الأخطاء والملاحظات التجويدية</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>تصنيف الملاحظة</th>
          <th>السورة والآية</th>
          <th>الكلمة / الموضع</th>
          <th>حالة المتابعة</th>
        </tr>
      </thead>
      <tbody>
        ${errorsRowsHtml}
      </tbody>
    </table>

    <h2>💡 توجيهات المحفظ وخطة العمل المنزلي لولي الأمر</h2>
    <div class="notes-box">${session.parentNotes || 'بارك الله في همة الطالب؛ يُرجى المداومة على الاستماع للورد المقرر ٣ مرات قبل الحصة القادمة.'}</div>

    <div class="footer">
      <span>أكاديمية الإمام لتحفيظ القرآن الكريم — بالقرآن نحيا</span>
      <span>توقيع المحفظ المعتمد: ${teacherName}</span>
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  if (mode === 'download') {
    const a = document.createElement('a');
    a.href = url;
    a.download = `correction-doc-${studentName.replace(/\s+/g, '-')}-${sessionDate}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } else {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.srcdoc = htmlString;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        // fallback download if print blocked
      }
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
        URL.revokeObjectURL(url);
      }, 4000);
    };
  }
}
