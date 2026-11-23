import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAcademy } from '../context/AcademyContext';
import {
  AyahEntry,
  getEveryAyahAudioUrl,
  loadSurahVerses,
  SURAHS,
} from '../data/quranData';
import { ReciterId, Student } from '../types';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import { getLocalDateString } from '../data/seedData';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Download,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Send,
  Share2,
  SkipBack,
  Sparkles,
  Volume2,
} from 'lucide-react';

export type NewMemVoiceOptionId =
  | 'teacher_custom'
  | 'Husary_128kbps'
  | 'Husary_Muallim_128kbps'
  | 'Minshawy_Murattal_128kbps'
  | 'Minshawy_Teacher_128kbps'
  | 'Alafasy_128kbps'
  | 'MaherAlMuaiqly128kbps';

export type TahfeezRepeatMode = 'range' | 'group' | 'single';

interface GeminiSmartCoachResult {
  memorizationSteps: string;
  simplifiedMeaningForFamily: string;
  keyTajweedHighlights: string[];
  readyParentWhatsAppNote: string;
}

interface NewMemAudioPlayerAndWhatsAppToolProps {
  student: Student;
  contextLocation: 'student_profile' | 'session_engine';
  controlledSurahId?: number;
  controlledFromAyah?: number;
  controlledToAyah?: number;
  onRangeChange?: (
    surahId: number,
    surahName: string,
    fromAyah: number,
    toAyah: number
  ) => void;
  externalTeacherAudioUrl?: string;
  onTeacherAudioRecorded?: (
    dataUrl: string,
    fileName: string,
    durationSec: number
  ) => void;
  nearReviewLabel?: string;
  farReviewLabel?: string;
}

/**
 * RC14 Tahfeez Flow Planner (ported directly from `sayedkomy1-dev/quran-tracker` `js/features/tahfeez-flow-rc14.js`):
 * Computes the playback sequence and starting index when tapping any verse or switching repeat mode.
 */
export function planTahfeezSequence(input: {
  from: number;
  to: number;
  selected?: number | null;
  mode: TahfeezRepeatMode;
  groupFrom?: number;
  groupTo?: number;
  single?: number;
}): {
  sequence: number[];
  start: number;
  index: number;
} {
  const from = Math.max(1, Math.floor(input.from || 1));
  const to = Math.max(from, Math.floor(input.to || from));
  let seqStart = from;
  let seqEnd = to;

  if (input.mode === 'group') {
    const gf = Math.max(from, Math.min(to, Math.floor(input.groupFrom || from)));
    const gt = Math.max(gf, Math.min(to, Math.floor(input.groupTo || to)));
    seqStart = gf;
    seqEnd = gt;
  } else if (input.mode === 'single') {
    const sg = Math.max(
      from,
      Math.min(to, Math.floor(input.single || input.selected || from))
    );
    seqStart = sg;
    seqEnd = sg;
  }

  const sequence: number[] = [];
  for (let a = seqStart; a <= seqEnd; a++) {
    sequence.push(a);
  }
  const candidate =
    input.selected && input.selected >= seqStart && input.selected <= seqEnd
      ? input.selected
      : seqStart;
  const index = Math.max(0, sequence.indexOf(candidate));
  return {
    sequence,
    start: sequence[index] ?? seqStart,
    index,
  };
}

/**
 * RC14 Opening Basmala Rule (`showOpeningBasmala(chapter, from)`):
 * Shows opening Basmala banner for chapters 2..114 except chapter 9 (At-Tawbah) when starting at ayah 1.
 */
export function showOpeningBasmala(chapter: number, fromAyah: number): boolean {
  const ch = Math.floor(chapter || 0);
  return ch >= 2 && ch <= 114 && ch !== 9 && Math.floor(fromAyah || 0) === 1;
}

/**
 * RC13 MP3 ID3v2 header stripper so concatenated verse MP3 frames play seamlessly as a single MP3 file.
 */
function stripId3v2Header(bytes: Uint8Array): Uint8Array {
  if (
    bytes.length > 10 &&
    bytes[0] === 0x49 && // 'I'
    bytes[1] === 0x44 && // 'D'
    bytes[2] === 0x33    // '3'
  ) {
    const size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    const offset = 10 + size;
    if (offset < bytes.length) {
      return bytes.subarray(offset);
    }
  }
  return bytes;
}

export const NewMemAudioPlayerAndWhatsAppTool: React.FC<
  NewMemAudioPlayerAndWhatsAppToolProps
> = ({
  student,
  contextLocation,
  controlledSurahId,
  controlledFromAyah,
  controlledToAyah,
  onRangeChange,
  externalTeacherAudioUrl,
  nearReviewLabel,
  farReviewLabel,
}) => {
  const { sessions, settings, showToast } = useAcademy();

  const latestStudentSession = useMemo(() => {
    const list = sessions
      .filter((s) => s.studentId === student.id && s.status === 'حضر')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list[0] || null;
  }, [sessions, student.id]);

  const defaultSurahId =
    controlledSurahId ||
    latestStudentSession?.newMemorization?.surahId ||
    student.currentStop.surahId ||
    78;
  const defaultFromAyah =
    controlledFromAyah ||
    latestStudentSession?.newMemorization?.fromAyah ||
    student.currentStop.ayah ||
    1;
  const defaultToAyah =
    controlledToAyah ||
    latestStudentSession?.newMemorization?.toAyah ||
    Math.min(
      SURAHS.find((s) => s.id === defaultSurahId)?.ayahs || 40,
      defaultFromAyah + 7
    );

  const [localSurahId, setLocalSurahId] = useState<number>(defaultSurahId);
  const [localFromAyah, setLocalFromAyah] = useState<number>(defaultFromAyah);
  const [localToAyah, setLocalToAyah] = useState<number>(defaultToAyah);

  // RC14 Tahfeez Flow State (`mode: 'range' | 'group' | 'single'`)
  const [repeatMode, setRepeatMode] = useState<TahfeezRepeatMode>('range');
  const [groupFromAyah, setGroupFromAyah] = useState<number>(defaultFromAyah);
  const [groupToAyah, setGroupToAyah] = useState<number>(
    Math.min(defaultToAyah, defaultFromAyah + 3)
  );
  const [singleTargetAyah, setSingleTargetAyah] =
    useState<number>(defaultFromAyah);

  useEffect(() => {
    if (controlledSurahId !== undefined) setLocalSurahId(controlledSurahId);
  }, [controlledSurahId]);

  useEffect(() => {
    if (controlledFromAyah !== undefined) {
      setLocalFromAyah(controlledFromAyah);
      setGroupFromAyah(controlledFromAyah);
      setSingleTargetAyah(controlledFromAyah);
    }
  }, [controlledFromAyah]);

  useEffect(() => {
    if (controlledToAyah !== undefined) {
      setLocalToAyah(controlledToAyah);
      setGroupToAyah(controlledToAyah);
    }
  }, [controlledToAyah]);

  useEffect(() => {
    if (controlledSurahId === undefined) {
      const nextSId =
        latestStudentSession?.newMemorization?.surahId ||
        student.currentStop.surahId ||
        78;
      const nextFrom =
        latestStudentSession?.newMemorization?.fromAyah ||
        student.currentStop.ayah ||
        1;
      const sMeta = SURAHS.find((s) => s.id === nextSId) || SURAHS[0];
      const nextTo =
        latestStudentSession?.newMemorization?.toAyah ||
        Math.min(sMeta.ayahs, nextFrom + 7);
      setLocalSurahId(nextSId);
      setLocalFromAyah(nextFrom);
      setLocalToAyah(nextTo);
      setGroupFromAyah(nextFrom);
      setGroupToAyah(Math.min(nextTo, nextFrom + 3));
      setSingleTargetAyah(nextFrom);
    }
  }, [student.id, latestStudentSession, controlledSurahId]);

  const surahMeta = useMemo(
    () => SURAHS.find((s) => s.id === localSurahId) || SURAHS[0],
    [localSurahId]
  );

  // RC13 Six Official Reciter Profiles + Teacher Custom Clip
  const [selectedVoice, setSelectedVoice] =
    useState<NewMemVoiceOptionId>('Husary_128kbps');

  const existingTeacherClip = useMemo(() => {
    if (externalTeacherAudioUrl) return externalTeacherAudioUrl;
    const fromClips = (student.recitationAudioClips || []).find(
      (c) =>
        c.axisKey === 'newMemorization' ||
        c.axisLabel.includes('بصوت المحفظ') ||
        c.axisLabel.includes('تسجيل المحفظ')
    );
    if (fromClips?.audioUrl) return fromClips.audioUrl;
    if (latestStudentSession?.memorizationAudioDataUrl) {
      return latestStudentSession.memorizationAudioDataUrl;
    }
    if (latestStudentSession?.newMemorization?.recordedAudioUrl) {
      return latestStudentSession.newMemorization.recordedAudioUrl;
    }
    return student.lastRecitationAudioUrl || '';
  }, [externalTeacherAudioUrl, student, latestStudentSession]);

  const [teacherCustomAudioUrl, setTeacherCustomAudioUrl] = useState<string>(
    existingTeacherClip
  );

  useEffect(() => {
    setTeacherCustomAudioUrl(existingTeacherClip);
  }, [existingTeacherClip]);

  // Audio Player State
  const [verses, setVerses] = useState<AyahEntry[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  const [ayahRepeatCount, setAyahRepeatCount] = useState<number>(1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // RC13 Single-MP3 Assignment Export & WhatsApp Lock State
  const [mp3ExportProgress, setMp3ExportProgress] = useState<{
    done: number;
    total: number;
    phase: string;
  } | null>(null);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState<boolean>(false);

  // Gemini AI Smart Coach State
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiCoachData, setAiCoachData] = useState<GeminiSmartCoachResult | null>(
    null
  );
  const [isToolExpanded, setIsToolExpanded] = useState<boolean>(
    () => contextLocation === 'student_profile'
  );

  useEffect(() => {
    let mounted = true;
    const startA = Math.max(1, localFromAyah);
    const endA = Math.min(surahMeta.ayahs, Math.max(startA, localToAyah));
    loadSurahVerses(localSurahId, startA, endA)
      .then((res) => {
        if (mounted) setVerses(res);
      })
      .catch(() => {
        if (mounted) setVerses([]);
      });
    return () => {
      mounted = false;
    };
  }, [localSurahId, localFromAyah, localToAyah, surahMeta.ayahs]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // RC13 Six Official Reciters List
  const voiceOptions: {
    id: NewMemVoiceOptionId;
    title: string;
    subtitle: string;
    badge: string;
  }[] = [
    {
      id: 'teacher_custom',
      title: `تسجيل المحفظ الخاص (${settings.teacherName || 'المعلم'})`,
      subtitle: 'تلقين خاص بصوت معلم الحلقة',
      badge: teacherCustomAudioUrl ? 'مسجل وجاهز ✓' : 'سجّل الآن 🎙️',
    },
    {
      id: 'Husary_128kbps',
      title: 'الشيخ محمود خليل الحصري — مرتل',
      subtitle: 'المصحف المرتل المعتمد',
      badge: 'قارئ معتمد',
    },
    {
      id: 'Husary_Muallim_128kbps',
      title: 'الشيخ محمود خليل الحصري — معلم',
      subtitle: 'المصحف المعلم للترديد والتثبيت',
      badge: 'مصحف معلم',
    },
    {
      id: 'Minshawy_Murattal_128kbps',
      title: 'الشيخ محمد صديق المنشاوي — مرتل',
      subtitle: 'المصحف المرتل بخشوع وإتقان',
      badge: 'قارئ معتمد',
    },
    {
      id: 'Minshawy_Teacher_128kbps',
      title: 'الشيخ محمد صديق المنشاوي — معلم',
      subtitle: 'المصحف المعلم للناشئة والتلقين',
      badge: 'مصحف معلم',
    },
    {
      id: 'Alafasy_128kbps',
      title: 'الشيخ مشاري راشد العفاسي',
      subtitle: 'تلاوة مرتلة واضحة المخارج',
      badge: 'قارئ معتمد',
    },
    {
      id: 'MaherAlMuaiqly128kbps',
      title: 'الشيخ ماهر المعيقلي',
      subtitle: 'إمام الحرم المكي الشريف',
      badge: 'قارئ معتمد',
    },
  ];

  const activeVoiceLabel = useMemo(() => {
    const found = voiceOptions.find((v) => v.id === selectedVoice);
    return found ? found.title : 'الشيخ محمود خليل الحصري — مرتل';
  }, [selectedVoice, settings.teacherName, teacherCustomAudioUrl]);

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setPlayingAyah(null);
  };

  /**
   * RC14 Sequence-Aware Audio Playback:
   * Plays from `startFromSpecificAyah` (or current planned start) and continues automatically
   * through the remaining verses in the planned sequence (`range`, `group`, or `single`).
   */
  const startPlannedPlayback = (
    startFromSpecificAyah?: number,
    overrideMode?: TahfeezRepeatMode
  ) => {
    const effectiveMode = overrideMode || repeatMode;
    if (overrideMode && overrideMode !== repeatMode) {
      setRepeatMode(overrideMode);
    }

    if (selectedVoice === 'teacher_custom') {
      if (!teacherCustomAudioUrl) {
        showToast(
          '🎙️ اختر أحد القراء الستة المعتمدين للاستماع الفوري للآيات',
          'info'
        );
        return;
      }
      stopPlayback();
      const audio = new Audio(teacherCustomAudioUrl);
      audio.playbackRate = playbackSpeed;
      audioRef.current = audio;
      setIsPlaying(true);
      setPlayingAyah(localFromAyah);
      audio.onended = () => {
        setIsPlaying(false);
        setPlayingAyah(null);
      };
      audio.onerror = () => {
        setIsPlaying(false);
        setPlayingAyah(null);
      };
      audio.play().catch(() => {
        setIsPlaying(false);
        setPlayingAyah(null);
      });
      return;
    }

    const plan = planTahfeezSequence({
      from: localFromAyah,
      to: localToAyah,
      selected: startFromSpecificAyah ?? playingAyah ?? localFromAyah,
      mode: effectiveMode,
      groupFrom: groupFromAyah,
      groupTo: groupToAyah,
      single:
        effectiveMode === 'single'
          ? startFromSpecificAyah ?? singleTargetAyah
          : singleTargetAyah,
    });

    const qariId: ReciterId = selectedVoice;

    const playSequenceIndex = (seqIdx: number, repeatsLeft: number) => {
      if (seqIdx < 0 || seqIdx >= plan.sequence.length) {
        setIsPlaying(false);
        setPlayingAyah(null);
        return;
      }
      const ayahNum = plan.sequence[seqIdx];
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const url = getEveryAyahAudioUrl(qariId, localSurahId, ayahNum);
      const audio = new Audio(url);
      audio.playbackRate = playbackSpeed;
      audioRef.current = audio;
      setIsPlaying(true);
      setPlayingAyah(ayahNum);

      audio.onended = () => {
        if (repeatsLeft > 1) {
          playSequenceIndex(seqIdx, repeatsLeft - 1);
        } else if (seqIdx + 1 < plan.sequence.length) {
          playSequenceIndex(seqIdx + 1, ayahRepeatCount);
        } else {
          setIsPlaying(false);
          setPlayingAyah(null);
        }
      };
      audio.onerror = () => {
        setIsPlaying(false);
        setPlayingAyah(null);
      };
      audio.play().catch(() => {
        setIsPlaying(false);
        setPlayingAyah(null);
      });
    };

    playSequenceIndex(plan.index, ayahRepeatCount);
  };

  const handlePlayOrStopAudio = (startFromSpecificAyah?: number) => {
    if (isPlaying && startFromSpecificAyah === undefined) {
      stopPlayback();
      return;
    }
    if (startFromSpecificAyah !== undefined && repeatMode === 'single') {
      setSingleTargetAyah(startFromSpecificAyah);
    }
    startPlannedPlayback(startFromSpecificAyah);
  };

  /**
   * RC14 `replayCurrentAyah`:
   * Replays the currently selected/playing verse and continues through the configured range.
   * If in `single` mode, automatically switches to `range` mode so playback continues after the verse.
   */
  const handleReplayCurrentAyahAndContinue = () => {
    const targetAyah = playingAyah ?? localFromAyah;
    const nextMode: TahfeezRepeatMode =
      repeatMode === 'single' ? 'range' : repeatMode;
    startPlannedPlayback(targetAyah, nextMode);
  };

  /**
   * RC14 `restartRange`:
   * Explicitly restarts playback from the beginning of the configured range (`localFromAyah`).
   */
  const handleRestartRangeFromBeginning = () => {
    const startAyah =
      repeatMode === 'group' ? groupFromAyah : Math.max(1, localFromAyah);
    startPlannedPlayback(
      startAyah,
      repeatMode === 'single' ? 'range' : repeatMode
    );
  };

  /**
   * RC13 Single-MP3 Concatenated Assignment Builder & Native Share Sheet (`quran-audio-export.js`):
   * Concatenates all verses in `localFromAyah..localToAyah` into a single `.mp3` file,
   * prepending Al-Fatihah 1:1 Basmala for mid-Surah assignments (`chapter !== 9 && from > 1`),
   * and shares via Native Share Sheet or downloads cleanly.
   */
  const handleBuildAndShareSingleAssignmentMp3 = async () => {
    if (mp3ExportProgress) return;
    const qariId: ReciterId =
      selectedVoice === 'teacher_custom' ? 'Husary_128kbps' : selectedVoice;
    const startA = Math.max(1, localFromAyah);
    const endA = Math.min(surahMeta.ayahs, Math.max(startA, localToAyah));
    const count = endA - startA + 1;
    if (count > 286) {
      showToast('نطاق الآيات كبير جداً لدمجه في ملف واحد', 'warning');
      return;
    }

    // RC13 Mid-surah Basmala rule: prepend 001001.mp3 when chapter !== 9 && startA > 1
    const needsMidSurahBasmala = localSurahId !== 9 && startA > 1;
    const totalSteps = count + (needsMidSurahBasmala ? 1 : 0);
    const parts: Uint8Array[] = [];

    try {
      let stepDone = 0;
      if (needsMidSurahBasmala) {
        setMp3ExportProgress({
          done: 0,
          total: totalSteps,
          phase: 'جاري تضمين البسملة الاستفتاحية...',
        });
        const basmalaUrl = getEveryAyahAudioUrl(qariId, 1, 1);
        const bRes = await fetch(basmalaUrl);
        if (bRes.ok) {
          const raw = new Uint8Array(await bRes.arrayBuffer());
          const clean = stripId3v2Header(raw);
          if (clean.byteLength > 0) parts.push(clean);
        }
        stepDone += 1;
      }

      for (let ayah = startA; ayah <= endA; ayah++) {
        setMp3ExportProgress({
          done: stepDone,
          total: totalSteps,
          phase: `جاري دمج الآية (${ayah}) من سورة ${surahMeta.name}...`,
        });
        const verseUrl = getEveryAyahAudioUrl(qariId, localSurahId, ayah);
        const vRes = await fetch(verseUrl);
        if (!vRes.ok) {
          throw new Error(`تعذر تحميل الآية ${ayah}`);
        }
        const raw = new Uint8Array(await vRes.arrayBuffer());
        const clean = stripId3v2Header(raw);
        if (clean.byteLength > 0) {
          parts.push(clean);
        }
        stepDone += 1;
      }

      setMp3ExportProgress({
        done: totalSteps,
        total: totalSteps,
        phase: 'اكتمل تجهيز ملف MP3 الموحد ✓',
      });

      const blob = new Blob(parts as unknown as BlobPart[], { type: 'audio/mpeg' });
      const cleanVoiceName = activeVoiceLabel
        .replace(/^الشيخ\s+/, '')
        .replace(/[\\/:*?"<>|]/g, '-')
        .trim();
      const fileName = `تكليف-سورة-${surahMeta.name}-${startA}-${endA}-${cleanVoiceName}.mp3`;
      const mp3File = new File([blob], fileName, {
        type: 'audio/mpeg',
        lastModified: Date.now(),
      });

      // Try Android / Mobile Native Share Sheet first (RC13 contract)
      if (
        typeof navigator !== 'undefined' &&
        navigator.canShare &&
        navigator.canShare({ files: [mp3File] })
      ) {
        await navigator.share({
          title: `صوت التكليف — سورة ${surahMeta.name} (${startA}-${endA})`,
          text: `ملف صوتي موحد لتكليف الطالب (${student.name}) — سورة ${surahMeta.name} من الآية ${startA} إلى ${endA} بصوت (${activeVoiceLabel}).`,
          files: [mp3File],
        });
        showToast(
          `🎵 تم تجهيز ومشاركة ملف MP3 الموحد (${fileName}) عبر نافذة المشاركة بنجاح ✓`,
          'success'
        );
      } else {
        // Desktop fallback: clean single-file download
        const objUrl = URL.createObjectURL(mp3File);
        const dl = document.createElement('a');
        dl.href = objUrl;
        dl.download = fileName;
        document.body.appendChild(dl);
        dl.click();
        document.body.removeChild(dl);
        setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
        showToast(
          `🎵 تم دمج الآيات (${startA}-${endA}) في ملف MP3 واحد (${fileName}) وتنزيله لإرفاقه في واتساب ✓`,
          'success'
        );
      }
    } catch {
      showToast(
        'تعذر دمج ملف MP3 الموحد؛ تأكد من الاتصال بالإنترنت أو اختر نطاق آيات أقصر',
        'warning'
      );
    } finally {
      setTimeout(() => setMp3ExportProgress(null), 900);
    }
  };

  // Generate AI Smart Coach Plan & Simplified Tafsir via Server-Side Gemini API (/api/gemini/student-smart-coach)
  const handleGenerateAiSmartCoach = async () => {
    setAiLoading(true);
    const versesText = verses.map((v) => `${v.text} (${v.ayah})`).join(' ');
    try {
      const res = await fetch('/api/gemini/student-smart-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: student.name,
          level: student.level,
          riwayah: student.riwayah || 'حفص عن عاصم',
          surahName: surahMeta.name,
          fromAyah: localFromAyah,
          toAyah: localToAyah,
          versesText,
          selectedVoiceLabel: activeVoiceLabel,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.result) {
          setAiCoachData(data.result);
          showToast(
            '✨ تم توليد خطة التثبيت والتفسير المبسط بالذكاء الاصطناعي (Gemini AI) بنجاح ✓',
            'success'
          );
          setAiLoading(false);
          return;
        }
      }
    } catch {
      // Fallback to local pedagogical coach when offline or static
    }

    setAiCoachData({
      memorizationSteps: `١) استمع للمقطع الجديد من سورة ${surahMeta.name} (الآيات ${localFromAyah}-${localToAyah}) بصوت (${activeVoiceLabel}) ٣ مرات بتركيز مع النظر في المصحف. ٢) ردّد كل آية خلف القارئ ٣ مرات. ٣) اربط الآيات ببعضها غيباً ثم سمّعها لولي الأمر.`,
      simplifiedMeaningForFamily: `تتناول هذه الآيات المباركة من سورة ${surahMeta.name} تذكير المؤمن بعظمة الله تعالى وقدرته، وتغرس في قلب الطالب اليقين والعمل الصالح وتقوى الله في السر والعلن.`,
      keyTajweedHighlights: [
        'تحقيق مخارج الحروف وإتمام الحركات (الفتحة والكسرة والضمة) دون تمطيط',
        'مراعاة زمن الغنة بمقدار حركتين في النون والميم المشددتين والتنوين',
        'ضبط مقادير المد الطبيعي والمد العارض للسكون عند الوقف على رؤوس الآيات',
      ],
      readyParentWhatsAppNote: `بارك الله في البطل (${student.name})؛ نرجو الاستماع للمقطع الصوتي المرفق لسورة ${surahMeta.name} (${localFromAyah}-${localToAyah}) بصوت (${activeVoiceLabel}) وتكراره ٣ مرات قبل النوم لتثبيت الحفظ الجديد بإتقان.`,
    });
    showToast(
      '✨ تم تجهيز التوجيه القرآني وخطة التثبيت الذكية للنص الجديد بنجاح ✓',
      'success'
    );
    setAiLoading(false);
  };

  // Send Selected Audio Clip + New Memorization Text Directly to Guardian via WhatsApp (with RC13 in-progress lock)
  const handleSendAudioToGuardianWhatsApp = async (
    overrideVoice?: NewMemVoiceOptionId
  ) => {
    if (isSendingWhatsApp) return;
    setIsSendingWhatsApp(true);

    try {
      const targetVoice = overrideVoice || selectedVoice;
      if (overrideVoice) {
        setSelectedVoice(overrideVoice);
      }

      const chosenOption =
        voiceOptions.find((v) => v.id === targetVoice) || voiceOptions[1];
      const startA = Math.max(1, localFromAyah);
      const endA = Math.min(surahMeta.ayahs, Math.max(startA, localToAyah));

      const versesSnippet = verses
        .slice(0, 12)
        .map((v) => `${v.text} ﴿${v.ayah}﴾`)
        .join(' ');

      const nearRevStr =
        nearReviewLabel ||
        (latestStudentSession?.nearReview?.enabled
          ? `سورة ${latestStudentSession.nearReview.surahName} (آية ${latestStudentSession.nearReview.fromAyah} إلى ${latestStudentSession.nearReview.toAyah})`
          : `سورة ${student.currentStop.surahName} (مراجعة ربط المحفوظ)`);

      const farRevStr =
        farReviewLabel ||
        (latestStudentSession?.farReview?.enabled
          ? `سورة ${latestStudentSession.farReview.surahName} (آية ${latestStudentSession.farReview.fromAyah} إلى ${latestStudentSession.farReview.toAyah})`
          : 'مراجعة آخر جزء محفوظ لتثبيته');

      let audioSectionText = '';
      if (targetVoice === 'teacher_custom') {
        audioSectionText =
          `🎙️ *المقطع الصوتي للنص الجديد (تسجيل المحفظ الخاص - ${settings.teacherName}):*\n` +
          `• تم تجهيز وإرفاق التسجيل الصوتي الخاص بصوت المحفظ لتلقين الطالب.\n` +
          `• رابط استماع مساند للآية الأولى بصوت الشيخ الحصري:\n${getEveryAyahAudioUrl(
            'Husary_128kbps',
            localSurahId,
            startA
          )}`;
      } else {
        const qariLinks: string[] = [];
        const maxLinks = Math.min(startA + 5, endA);
        for (let a = startA; a <= maxLinks; a++) {
          qariLinks.push(
            `  - الآية (${a}): ${getEveryAyahAudioUrl(targetVoice, localSurahId, a)}`
          );
        }
        audioSectionText =
          `🎧 *المقطع الصوتي للنص الجديد بصوت (${chosenOption.title}):*\n` +
          `اضغط على الرابط للاستماع الفوري وترديد الآيات مع القارئ:\n` +
          qariLinks.join('\n');
      }

      const messageLines = [
        `${settings.whatsappHeader}`,
        ``,
        `🔊 *إهداء المقطع الصوتي للحفظ الجديد وخطة المتابعة المنزلية*`,
        `👤 *الطالب:* ${student.name} (${student.level} • ${student.riwayah || 'حفص عن عاصم'})`,
        `📖 *مقرر الحفظ الجديد:* سورة ${surahMeta.name} — من الآية (${startA}) إلى الآية (${endA})`,
        versesSnippet
          ? `\n📜 *نص الآيات الجديدة مكتوباً للمتابعة السهلة:*\n﴿ ${versesSnippet} ﴾`
          : '',
        `\n${audioSectionText}`,
        `\n🔄 *المراجعات المطلوبة مع الحفظ الجديد:*`,
        `• *المراجعة القريبة (الربط):* ${nearRevStr}`,
        `• *المراجعة البعيدة:* ${farRevStr}`,
        aiCoachData?.simplifiedMeaningForFamily
          ? `\n💡 *المعنى المبسّط للآيات (للأم والطالب):*\n${aiCoachData.simplifiedMeaningForFamily}`
          : '',
        aiCoachData?.readyParentWhatsAppNote
          ? `\n✨ *توجيه المحفظ:* ${aiCoachData.readyParentWhatsAppNote}`
          : '',
        `\n${settings.whatsappFooter}`,
      ].filter(Boolean);

      const fullMsg = messageLines.join('\n');

      if (targetVoice === 'teacher_custom' && teacherCustomAudioUrl) {
        try {
          const res = await fetch(teacherCustomAudioUrl);
          const blob = await res.blob();
          const file = new File(
            [blob],
            `teacher-recitation-${student.name}-${surahMeta.name}.wav`,
            { type: blob.type || 'audio/wav' }
          );
          if (
            typeof navigator !== 'undefined' &&
            navigator.canShare &&
            navigator.canShare({ files: [file] })
          ) {
            await navigator.share({
              title: `تسجيل المحفظ الخاص — سورة ${surahMeta.name}`,
              text: fullMsg,
              files: [file],
            });
            showToast(
              `🎙️ تم مشاركة «تسجيل المحفظ الخاص» مع رسالة النص الجديد لولي أمر (${student.name}) ✓`,
              'success'
            );
            return;
          }
        } catch {
          // Fallback to download + WhatsApp link below
        }

        const dl = document.createElement('a');
        dl.href = teacherCustomAudioUrl;
        dl.download = `تسجيل-المحفظ-الخاص-${student.name}-سورة-${surahMeta.name}.wav`;
        document.body.appendChild(dl);
        dl.click();
        document.body.removeChild(dl);
      }

      const waUrl = buildWhatsAppUrl(student.whatsappPhone, fullMsg);
      navigator.clipboard?.writeText(fullMsg).catch(() => {});

      const a = document.createElement('a');
      a.href = waUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      showToast(
        `📲 تم تجهيز فتح واتساب ولي أمر (${student.name}) مع المقطع الصوتي (${chosenOption.title}). راجع المحادثة واضغط إرسال ✓`,
        'success'
      );
    } finally {
      setTimeout(() => setIsSendingWhatsApp(false), 1200);
    }
  };

  const shouldShowOpeningBasmala = showOpeningBasmala(
    localSurahId,
    localFromAyah
  );

  return (
    <div className="rounded-3xl bg-gradient-to-l from-[#145a3a]/15 via-[#fcfaf2] to-[#c59b27]/20 dark:from-[#0b1711] dark:via-[#12231a] dark:to-[#0b1711] border border-[#c59b27] p-4 sm:p-5 shadow-xs space-y-4">
      {/* Header + Open/Close Toggle Button */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#145a3a] text-[#dfbd69] flex items-center justify-center shrink-0">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                🔊 مشغل التحفيظ والتكرار الذكي وتصدير MP3 الموحد (
                {contextLocation === 'student_profile'
                  ? 'ملف الطالب'
                  : 'واجهة التسميع'}
                )
              </h3>
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black font-mono tabular-nums">
                سورة {surahMeta.name} (آية {localFromAyah} - {localToAyah})
              </span>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-0.5">
              يدعم القراء الستة المعتمدين (مرتل ومعلم)، النقر على أي آية للاستماع والمتابعة التلقائية، وتصدير المقطع كملف MP3 واحد لمشاركته مع ولي الأمر.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsToolExpanded((prev) => !prev)}
            className="px-3.5 py-2 rounded-2xl bg-[#145a3a] hover:bg-[#0f452c] text-[#dfbd69] border border-[#c59b27] text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
          >
            {isToolExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                <span>إغلاق مشغل التحفيظ</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span>فتح مشغل التحفيظ وتصدير MP3</span>
              </>
            )}
          </button>

          {isToolExpanded && (
            <>
              <button
                type="button"
                onClick={() => void handleBuildAndShareSingleAssignmentMp3()}
                disabled={Boolean(mp3ExportProgress)}
                className="px-3.5 py-2 rounded-2xl bg-[#145a3a] hover:bg-[#0f452c] text-white border border-[#c59b27] text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
                title="دمج آيات التكليف مع البسملة في ملف MP3 واحد ومشاركته"
              >
                <Share2 className="w-3.5 h-3.5 text-[#dfbd69]" />
                <span>
                  {mp3ExportProgress
                    ? `${mp3ExportProgress.phase} (${mp3ExportProgress.done}/${mp3ExportProgress.total})`
                    : '🎵 تصدير/مشاركة ملف MP3 موحد'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleGenerateAiSmartCoach()}
                disabled={aiLoading}
                className="px-3.5 py-2 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-[#c59b27] text-[#14281d] dark:text-[#dfbd69] text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
              >
                <Sparkles className="w-4 h-4 text-[#c59b27]" />
                <span>
                  {aiLoading ? 'جاري التحليل...' : '✨ خطة وتفسير ذكي (AI)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleSendAudioToGuardianWhatsApp()}
                disabled={isSendingWhatsApp}
                className="px-4 py-2 rounded-2xl bg-gradient-to-l from-emerald-700 via-[#145a3a] to-green-700 hover:brightness-110 text-white text-xs font-black flex items-center justify-center gap-2 border border-[#c59b27] cursor-pointer transition disabled:opacity-60"
              >
                <Send className="w-4 h-4 text-[#dfbd69]" />
                <span>
                  {isSendingWhatsApp
                    ? '⏳ جاري تجهيز واتساب...'
                    : '📲 إرسال التكليف واتساب'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {isToolExpanded && (
        <div className="pt-3 border-t border-[#c59b27]/40 space-y-4">
          {/* Surah & Ayah Range Selector Bar + RC14 Repeat Mode (Range / Group / Single) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center bg-white/90 dark:bg-[#0b1711]/90 p-3 rounded-2xl border border-[#c59b27]/40 text-xs">
            <div className="lg:col-span-4 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#145a3a] dark:text-[#dfbd69] shrink-0" />
              <span className="font-extrabold text-[#14281d] dark:text-white whitespace-nowrap">
                السورة:
              </span>
              <select
                value={localSurahId}
                onChange={(e) => {
                  const nextId = Number(e.target.value);
                  const nextMeta =
                    SURAHS.find((s) => s.id === nextId) || SURAHS[0];
                  const nextTo = Math.min(nextMeta.ayahs, 8);
                  stopPlayback();
                  setLocalSurahId(nextId);
                  setLocalFromAyah(1);
                  setLocalToAyah(nextTo);
                  setGroupFromAyah(1);
                  setGroupToAyah(Math.min(nextTo, 4));
                  setSingleTargetAyah(1);
                  onRangeChange?.(nextId, nextMeta.name, 1, nextTo);
                }}
                className="w-full px-2.5 py-1.5 rounded-xl border border-neutral-300 dark:border-emerald-800 bg-[#fcfaf2] dark:bg-[#12231a] font-bold"
              >
                {SURAHS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}. سورة {s.name} ({s.ayahs} آية)
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3 flex items-center gap-2">
              <span className="font-bold text-neutral-600 dark:text-neutral-300">
                من:
              </span>
              <input
                type="number"
                min={1}
                max={surahMeta.ayahs}
                value={localFromAyah}
                onChange={(e) => {
                  const v = Math.max(
                    1,
                    Math.min(surahMeta.ayahs, Number(e.target.value) || 1)
                  );
                  const nextTo = Math.max(v, localToAyah);
                  setLocalFromAyah(v);
                  setLocalToAyah(nextTo);
                  setGroupFromAyah(v);
                  setSingleTargetAyah(v);
                  onRangeChange?.(localSurahId, surahMeta.name, v, nextTo);
                }}
                className="w-16 px-2 py-1.5 rounded-xl border border-neutral-300 dark:border-emerald-800 bg-[#fcfaf2] dark:bg-[#12231a] text-center font-mono tabular-nums font-bold"
              />
              <span className="font-bold text-neutral-600 dark:text-neutral-300">
                إلى:
              </span>
              <input
                type="number"
                min={localFromAyah}
                max={surahMeta.ayahs}
                value={localToAyah}
                onChange={(e) => {
                  const v = Math.max(
                    localFromAyah,
                    Math.min(
                      surahMeta.ayahs,
                      Number(e.target.value) || localFromAyah
                    )
                  );
                  setLocalToAyah(v);
                  setGroupToAyah(v);
                  onRangeChange?.(
                    localSurahId,
                    surahMeta.name,
                    localFromAyah,
                    v
                  );
                }}
                className="w-16 px-2 py-1.5 rounded-xl border border-neutral-300 dark:border-emerald-800 bg-[#fcfaf2] dark:bg-[#12231a] text-center font-mono tabular-nums font-bold"
              />
            </div>

            {/* RC14 Mode Selector: Range | Group | Single */}
            <div className="lg:col-span-3 flex items-center gap-1">
              <span className="font-bold text-neutral-600 dark:text-neutral-300 whitespace-nowrap">
                نمط التلاوة:
              </span>
              {(
                [
                  { id: 'range', label: 'المقطع كاملاً' },
                  { id: 'group', label: 'مجموعة فرعية' },
                  { id: 'single', label: 'آية مفردة' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setRepeatMode(m.id)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer transition ${
                    repeatMode === m.id
                      ? 'bg-[#145a3a] text-[#dfbd69]'
                      : 'bg-neutral-100 dark:bg-emerald-950 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="lg:col-span-2 flex items-center justify-end gap-1">
              <Repeat className="w-3.5 h-3.5 text-[#c59b27]" />
              <span className="font-bold text-neutral-600 dark:text-neutral-300">
                تكرار:
              </span>
              {[1, 2, 3, 5].map((rep) => (
                <button
                  key={rep}
                  type="button"
                  onClick={() => setAyahRepeatCount(rep)}
                  className={`px-2 py-1 rounded-lg font-mono tabular-nums font-black cursor-pointer ${
                    ayahRepeatCount === rep
                      ? 'bg-[#145a3a] text-[#dfbd69]'
                      : 'bg-neutral-100 dark:bg-emerald-950 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {rep}×
                </button>
              ))}
            </div>
          </div>

          {/* Sub-controls when RepeatMode === 'group' or 'single' */}
          {repeatMode !== 'range' && (
            <div className="p-2.5 rounded-2xl bg-amber-50/70 dark:bg-emerald-950/30 border border-amber-400/50 flex flex-wrap items-center gap-3 text-xs">
              {repeatMode === 'group' ? (
                <>
                  <span className="font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                    تحديد المجموعة الفرعية للتكرار داخل المقطع:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span>من آية:</span>
                    <input
                      type="number"
                      min={localFromAyah}
                      max={localToAyah}
                      value={groupFromAyah}
                      onChange={(e) =>
                        setGroupFromAyah(
                          Math.max(
                            localFromAyah,
                            Math.min(localToAyah, Number(e.target.value) || localFromAyah)
                          )
                        )
                      }
                      className="w-14 px-2 py-1 rounded-lg border border-amber-400 bg-white dark:bg-slate-900 text-center font-mono tabular-nums font-bold"
                    />
                    <span>إلى آية:</span>
                    <input
                      type="number"
                      min={groupFromAyah}
                      max={localToAyah}
                      value={groupToAyah}
                      onChange={(e) =>
                        setGroupToAyah(
                          Math.max(
                            groupFromAyah,
                            Math.min(localToAyah, Number(e.target.value) || groupFromAyah)
                          )
                        )
                      }
                      className="w-14 px-2 py-1 rounded-lg border border-amber-400 bg-white dark:bg-slate-900 text-center font-mono tabular-nums font-bold"
                    />
                  </div>
                </>
              ) : (
                <>
                  <span className="font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                    تحديد الآية المفردة للتكرار المركز:
                  </span>
                  <input
                    type="number"
                    min={localFromAyah}
                    max={localToAyah}
                    value={singleTargetAyah}
                    onChange={(e) =>
                      setSingleTargetAyah(
                        Math.max(
                          localFromAyah,
                          Math.min(localToAyah, Number(e.target.value) || localFromAyah)
                        )
                      )
                    }
                    className="w-16 px-2 py-1 rounded-lg border border-amber-400 bg-white dark:bg-slate-900 text-center font-mono tabular-nums font-bold"
                  />
                  <span className="text-[11px] text-neutral-500">
                    (عند الضغط على «إعادة الآية والمتابعة» سينتقل المشغل تلقائياً لإكمال بقية المقطع)
                  </span>
                </>
              )}
            </div>
          )}

          {/* RC13 Six Official Qaris Dropdown Selector */}
          <div className="p-3.5 rounded-2xl bg-white/90 dark:bg-[#0b1711] border border-[#c59b27]/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <label className="text-xs font-extrabold text-[#14281d] dark:text-white whitespace-nowrap">
                🎧 القراء الستة المعتمدون (مرتل ومعلم):
              </label>
              <select
                value={
                  selectedVoice === 'teacher_custom'
                    ? 'Husary_128kbps'
                    : selectedVoice
                }
                onChange={(e) => {
                  stopPlayback();
                  setSelectedVoice(e.target.value as NewMemVoiceOptionId);
                }}
                className="px-3.5 py-2 rounded-xl border border-[#c59b27] bg-[#fcfaf2] dark:bg-[#12231a] text-[#14281d] dark:text-white text-xs font-black cursor-pointer min-w-[260px]"
              >
                {voiceOptions.slice(1).map((qari) => (
                  <option key={qari.id} value={qari.id}>
                    🎧 {qari.title} ({qari.badge})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handlePlayOrStopAudio()}
                className="px-3.5 py-2 rounded-xl bg-[#145a3a] hover:bg-[#0f452c] text-[#dfbd69] text-xs font-black cursor-pointer transition"
              >
                {isPlaying ? '⏹️ إيقاف التلاوة' : `▶️ استماع (${activeVoiceLabel})`}
              </button>
              <button
                type="button"
                onClick={() => void handleBuildAndShareSingleAssignmentMp3()}
                disabled={Boolean(mp3ExportProgress)}
                className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-[#c59b27] text-[#14281d] dark:text-[#dfbd69] text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ملف MP3 موحد</span>
              </button>
            </div>
          </div>

          {/* Main Audio Player Controls + RC14 Replay Current & Restart Range + Written Uthmani Verses */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0b1711] border border-[#c59b27]/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePlayOrStopAudio()}
                  className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer transition ${
                    isPlaying
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-[#145a3a] hover:bg-[#0f452c] text-[#dfbd69]'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>
                        ⏹️ إيقاف الاستماع{' '}
                        {playingAyah ? `(الآية ${playingAyah})` : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>▶️ تشغيل التلاوة المتسلسلة</span>
                    </>
                  )}
                </button>

                {/* RC14 Button 1: Replay Current Ayah & Continue (`tahfeezReplayCurrentAyah`) */}
                <button
                  type="button"
                  onClick={handleReplayCurrentAyahAndContinue}
                  className="px-3 py-2 rounded-xl bg-[#f6f7f2] dark:bg-[#12231a] hover:border-[#145a3a] border border-neutral-200 dark:border-emerald-800 text-[#14281d] dark:text-[#dfbd69] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition"
                  title="إعادة تلاوة الآية الحالية ثم المتابعة التلقائية لبقية آيات المقطع"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#c59b27]" />
                  <span>
                    إعادة الآية {playingAyah ? `(${playingAyah})` : ''} والمتابعة
                  </span>
                </button>

                {/* RC14 Button 2: Restart Range from Beginning (`tahfeezRestartRange`) */}
                <button
                  type="button"
                  onClick={handleRestartRangeFromBeginning}
                  className="px-3 py-2 rounded-xl bg-[#f6f7f2] dark:bg-[#12231a] hover:border-[#145a3a] border border-neutral-200 dark:border-emerald-800 text-[#14281d] dark:text-[#dfbd69] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition"
                  title="إعادة تشغيل المقطع المحدد من أول آية"
                >
                  <SkipBack className="w-3.5 h-3.5 text-emerald-600" />
                  <span>بدء المقطع من أوله (آية {localFromAyah})</span>
                </button>

                {/* Playback Speed */}
                <div className="flex items-center gap-1 bg-[#fcfaf2] dark:bg-[#12231a] px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-emerald-900 text-[11px]">
                  <span className="font-bold text-neutral-500">السرعة:</span>
                  {[0.75, 1, 1.25].map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => {
                        setPlaybackSpeed(sp);
                        if (audioRef.current) audioRef.current.playbackRate = sp;
                      }}
                      className={`px-1.5 py-0.5 rounded font-mono tabular-nums font-bold cursor-pointer ${
                        playbackSpeed === sp
                          ? 'bg-[#c59b27] text-[#14281d]'
                          : 'text-neutral-600 dark:text-neutral-300'
                      }`}
                    >
                      {sp}x
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                💡 انقر على أي آية بالأسفل لبدء التلاوة منها وإكمال المقطع تلقائياً
              </span>
            </div>

            {/* RC14 Opening Basmala Banner (`showOpeningBasmala(localSurahId, localFromAyah)`) */}
            {shouldShowOpeningBasmala && (
              <div
                id="tahfeezBasmala"
                className="py-2 px-4 rounded-xl bg-emerald-950/5 dark:bg-emerald-900/25 border border-[#c59b27]/40 text-center font-quran text-base sm:text-lg font-bold text-[#145a3a] dark:text-[#dfbd69]"
              >
                بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
              </div>
            )}

            {/* Written Uthmani Verses with RC14 Tap-to-Start-and-Continue */}
            {verses.length > 0 && (
              <div className="p-3.5 rounded-xl bg-[#fcfaf2] dark:bg-[#12231a] border border-neutral-200/80 dark:border-emerald-900/50 text-sm sm:text-base font-quran leading-loose text-[#14281d] dark:text-emerald-50 max-h-48 overflow-y-auto">
                {verses.map((v) => {
                  const isCurrent = playingAyah === v.ayah;
                  return (
                    <span
                      key={v.ayah}
                      data-ayah={v.ayah}
                      onClick={() => handlePlayOrStopAudio(v.ayah)}
                      className={`inline cursor-pointer rounded-lg px-1.5 py-0.5 transition ${
                        isCurrent
                          ? 'bg-[#c59b27]/35 text-[#145a3a] dark:text-[#dfbd69] font-bold ring-1 ring-[#c59b27]'
                          : 'hover:bg-emerald-500/10'
                      }`}
                    >
                      {v.text}{' '}
                      <span className="text-xs font-mono tabular-nums text-[#c59b27]">
                        ﴿{v.ayah}﴾
                      </span>{' '}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Gemini AI Smart Coach Output Card */}
            {aiCoachData && (
              <div className="p-4 rounded-2xl bg-gradient-to-l from-amber-500/10 via-[#fcfaf2] to-emerald-500/10 dark:from-[#12231a] dark:to-[#0b1711] border border-[#c59b27] space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-black text-[#145a3a] dark:text-[#dfbd69] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#c59b27]" />
                    <span>
                      ✨ توصيات المساعد القرآني الذكي لتثبيت سورة {surahMeta.name} ({localFromAyah}-{localToAyah}):
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSendAudioToGuardianWhatsApp()}
                    className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    <span>إرسال مع الفويس لولي الأمر</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-900">
                    <div className="font-extrabold text-[#145a3a] dark:text-[#dfbd69] mb-1">
                      🎯 خطوات الحفظ والتثبيت المقترحة:
                    </div>
                    <p className="text-neutral-700 dark:text-neutral-200 leading-relaxed">
                      {aiCoachData.memorizationSteps}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-900">
                    <div className="font-extrabold text-amber-700 dark:text-amber-400 mb-1">
                      🌿 المعنى المبسّط للآيات (للأم والطالب):
                    </div>
                    <p className="text-neutral-700 dark:text-neutral-200 leading-relaxed">
                      {aiCoachData.simplifiedMeaningForFamily}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
