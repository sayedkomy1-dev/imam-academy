import React, { useMemo, useState } from 'react';
import { useAcademy } from '../context/AcademyContext';
import { DAY_NAMES } from '../data/quranData';
import { CircleGroup } from '../types';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Cloud,
  Copy,
  GripVertical,
  Layers,
  Move,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';

const DEFAULT_TIME_SLOTS = [
  '15:00',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '20:00',
  '21:00',
];

interface DragItemPayload {
  entityType: 'circle' | 'student';
  targetId: string;
  targetName: string;
  fromDay: number;
  fromTime: string;
}

interface ScheduleBoardProps {
  onOpenEditCircleModal?: (circle: CircleGroup) => void;
  compactMode?: boolean;
}

export const ScheduleBoard: React.FC<ScheduleBoardProps> = ({
  onOpenEditCircleModal,
  compactMode = false,
}) => {
  const {
    circles,
    students,
    saveCircle,
    updateStudent,
    rescheduleSessionOrCircleViaDragDrop,
    lastScheduleBoardSyncAt,
    lastSyncTimestamp,
    cloudSyncStatus,
    triggerCloudSyncNow,
    setSelectedStudentId,
    setActiveTab,
    markRecitationEngineStartedInFirestore,
    showToast,
  } = useAcademy();

  const [boardMode, setBoardMode] = useState<'circles' | 'students'>('circles');
  const [circleFilter, setCircleFilter] = useState<string>('الكل');
  const [dragBehavior, setDragBehavior] = useState<'move' | 'copy'>('move');
  const [cascadeCircleToStudents, setCascadeCircleToStudents] =
    useState<boolean>(true);
  const [customTimeInput, setCustomTimeInput] = useState<string>('');
  const [extraTimeSlots, setExtraTimeSlots] = useState<string[]>([]);

  // Drag & Drop + Mobile Tap-to-Move State
  const [activeDragItem, setActiveDragItem] = useState<DragItemPayload | null>(
    null
  );
  const [hoveredCellKey, setHoveredCellKey] = useState<string | null>(null);
  const [lastMovedHighlightId, setLastMovedHighlightId] = useState<
    string | null
  >(null);

  const activeStudents = useMemo(
    () =>
      students.filter(
        (s) => s && (s.accountStatus ?? 'نشط') !== 'مؤرشف'
      ),
    [students]
  );

  const filteredStudents = useMemo(() => {
    if (circleFilter === 'الكل') return activeStudents;
    return activeStudents.filter((s) => s.circle === circleFilter);
  }, [activeStudents, circleFilter]);

  // Combine default time slots with any custom times present on circles or students
  const allTimeSlots = useMemo(() => {
    const set = new Set<string>([...DEFAULT_TIME_SLOTS, ...extraTimeSlots]);
    circles.forEach((c) => {
      if (c.scheduleTime && /^\d{2}:\d{2}$/.test(c.scheduleTime.trim())) {
        set.add(c.scheduleTime.trim());
      }
    });
    activeStudents.forEach((s) => {
      if (s.scheduleTime && /^\d{2}:\d{2}$/.test(s.scheduleTime.trim())) {
        set.add(s.scheduleTime.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [circles, activeStudents, extraTimeSlots]);

  const todayDayIndex = new Date().getDay();

  const handleAddCustomTimeSlot = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customTimeInput.trim();
    if (!/^\d{2}:\d{2}$/.test(clean)) {
      showToast('يرجى اختيار وقت بصيغة صحيحة (HH:mm)', 'warning');
      return;
    }
    if (!extraTimeSlots.includes(clean)) {
      setExtraTimeSlots((prev) => [...prev, clean]);
    }
    setCustomTimeInput('');
    showToast(`تمت إضافة الفترة الزمنية (${clean}) إلى لوحة الجدولة`, 'info');
  };

  const executeDropToCell = async (
    payload: DragItemPayload,
    toDay: number,
    toTime: string
  ) => {
    if (payload.fromDay === toDay && payload.fromTime === toTime) {
      setActiveDragItem(null);
      setHoveredCellKey(null);
      return;
    }

    await rescheduleSessionOrCircleViaDragDrop({
      entityType: payload.entityType,
      targetId: payload.targetId,
      fromDay: payload.fromDay,
      toDay,
      toTime,
      copyDayInsteadOfMove: dragBehavior === 'copy',
      cascadeToCircleStudents: cascadeCircleToStudents,
    });

    setLastMovedHighlightId(`${payload.targetId}_${toDay}_${toTime}`);
    window.setTimeout(() => {
      setLastMovedHighlightId(null);
    }, 2200);

    setActiveDragItem(null);
    setHoveredCellKey(null);
  };

  const handleRemoveSingleDay = (
    entityType: 'circle' | 'student',
    targetId: string,
    dayToRemove: number
  ) => {
    if (entityType === 'circle') {
      const cir = circles.find((c) => c.id === targetId);
      if (!cir) return;
      if (cir.scheduleDays.length <= 1) {
        showToast(
          'يجب أن تحتوي الحلقة على يوم واحد على الأقل؛ اسحب البطاقة ليوم آخر لنقلها',
          'warning'
        );
        return;
      }
      const nextDays = cir.scheduleDays.filter((d) => d !== dayToRemove);
      saveCircle({
        ...cir,
        scheduleDays: nextDays,
      });
      void triggerCloudSyncNow(false);
    } else {
      const st = students.find((s) => s.id === targetId);
      if (!st) return;
      const curDays =
        Array.isArray(st.scheduleDays) && st.scheduleDays.length > 0
          ? st.scheduleDays
          : [0, 2, 4];
      if (curDays.length <= 1) {
        showToast(
          'يجب أن يبقى للطالب يوم تسميع واحد على الأقل؛ اسحب الحصة ليوم آخر لنقلها',
          'warning'
        );
        return;
      }
      updateStudent(st.id, {
        scheduleDays: curDays.filter((d) => d !== dayToRemove),
      });
      void triggerCloudSyncNow(false);
      showToast(
        `تم حذف يوم (${DAY_NAMES[dayToRemove]}) من جدول الطالب (${st.name}) وتحديث Firestore`,
        'info'
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Control & Firestore Live Sync Bar */}
      <div className="rounded-3xl bg-white dark:bg-[#12231a] p-5 border border-neutral-200 dark:border-emerald-900/50 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#145a3a] text-[#dfbd69] text-[10px] font-extrabold">
                ScheduleBoard • سحب وإفلات مباشر
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300/60 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold">
                <Cloud className="w-3 h-3" />
                <span>
                  مزامنة Firestore التلقائية:{' '}
                  {cloudSyncStatus === 'syncing'
                    ? 'جاري الحفظ...'
                    : `مُحدّث (${lastScheduleBoardSyncAt || lastSyncTimestamp})`}
                </span>
              </span>
            </div>
            <h3 className="text-base font-extrabold text-[#14281d] dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#145a3a] dark:text-[#dfbd69]" />
              <span>
                لوحة جدولة الحلقات والحصص التفاعلية (Drag &amp; Drop ScheduleBoard)
              </span>
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              اسحب أي حلقة أو حصة طالب وأفلتها في اليوم والساعة المطلوبة لتعديل الموعد ومزامنة قاعدة بيانات Firestore وإعادة جدولة تنبيهات Push تلقائياً.
            </p>
          </div>

          {/* Mode Switcher: Circles vs Individual Student Sessions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 rounded-2xl bg-[#f6f7f2] dark:bg-[#0b1711] border border-neutral-200 dark:border-emerald-900/60">
              <button
                type="button"
                onClick={() => setBoardMode('circles')}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  boardMode === 'circles'
                    ? 'bg-[#145a3a] text-white shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-300'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>جدولة الحلقات ({circles.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setBoardMode('students')}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  boardMode === 'students'
                    ? 'bg-[#145a3a] text-white shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-300'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>حصص الطلاب الفردية ({filteredStudents.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => void triggerCloudSyncNow(true)}
              className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-100 text-[#145a3a] dark:text-[#dfbd69] border border-emerald-300/60 dark:border-emerald-800 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              title="مزامنة فورية مع Firestore"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تأكيد مزامنة Firestore</span>
            </button>
          </div>
        </div>

        {/* Secondary Toolbar: Drag Behavior (Move vs Copy), Circle Filter, Cascade Toggle, Add Time Slot */}
        <div className="pt-3 border-t border-neutral-100 dark:border-emerald-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-neutral-500">وضع السحب والإفلات:</span>
            <button
              type="button"
              onClick={() => setDragBehavior('move')}
              className={`px-3 py-1.5 rounded-xl font-extrabold flex items-center gap-1 border cursor-pointer ${
                dragBehavior === 'move'
                  ? 'bg-[#145a3a] text-white border-[#145a3a]'
                  : 'bg-[#f6f7f2] dark:bg-[#0b1711] border-neutral-200 dark:border-emerald-900 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              <Move className="w-3.5 h-3.5" />
              <span>نقل الموعد لليوم/الساعة الجديدة</span>
            </button>
            <button
              type="button"
              onClick={() => setDragBehavior('copy')}
              className={`px-3 py-1.5 rounded-xl font-extrabold flex items-center gap-1 border cursor-pointer ${
                dragBehavior === 'copy'
                  ? 'bg-amber-500 text-[#14281d] border-amber-500'
                  : 'bg-[#f6f7f2] dark:bg-[#0b1711] border-neutral-200 dark:border-emerald-900 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>إضافة يوم إضافي مع تغيير الساعة</span>
            </button>

            {boardMode === 'circles' ? (
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-[11px] font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={cascadeCircleToStudents}
                  onChange={(e) => setCascadeCircleToStudents(e.target.checked)}
                  className="accent-[#145a3a]"
                />
                <span>تحديث مواعيد طلاب الحلقة تلقائياً عند سحب الحلقة</span>
              </label>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-neutral-500">تصفية الحلقة:</span>
                <select
                  value={circleFilter}
                  onChange={(e) => setCircleFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-extrabold"
                >
                  <option value="الكل">جميع الحلقات ({activeStudents.length})</option>
                  {circles.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Add Custom Time Slot Form */}
          <form
            onSubmit={handleAddCustomTimeSlot}
            className="flex items-center gap-1.5"
          >
            <input
              type="time"
              value={customTimeInput}
              onChange={(e) => setCustomTimeInput(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-neutral-300 dark:border-emerald-900 bg-[#f6f7f2] dark:bg-[#0b1711] text-xs font-mono"
              aria-label="إضافة فترة زمنية جديدة"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-[#145a3a]/10 hover:bg-[#145a3a] text-[#145a3a] hover:text-white dark:text-[#dfbd69] text-xs font-extrabold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة فترة</span>
            </button>
          </form>
        </div>

        {/* Active Mobile/Quick Selection Banner */}
        {activeDragItem && (
          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-400/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>
                العنصر المحدد للنقل: «{activeDragItem.targetName}» (من يوم{' '}
                {DAY_NAMES[activeDragItem.fromDay]} الساعة {activeDragItem.fromTime})
                — اضغط على أي خانة يوم/ساعة في الجدول لإفلاته فوراً.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveDragItem(null)}
              className="px-3 py-1 rounded-xl bg-white dark:bg-[#12231a] border border-amber-300 text-amber-800 dark:text-amber-300 font-bold cursor-pointer"
            >
              إلغاء التحديد
            </button>
          </div>
        )}
      </div>

      {/* Main 7-Day × Time-Slot Drag-and-Drop Schedule Grid */}
      <div className="rounded-3xl bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900/50 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-right">
            <thead>
              <tr className="bg-[#145a3a] text-white">
                <th className="p-3.5 text-xs font-extrabold border-l border-emerald-800/60 w-28">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#dfbd69]" />
                    <span>الفترة / اليوم</span>
                  </div>
                </th>
                {DAY_NAMES.map((dayName, dayIdx) => {
                  const isToday = dayIdx === todayDayIndex;
                  return (
                    <th
                      key={dayName}
                      className={`p-3 text-xs font-extrabold border-l border-emerald-800/50 min-w-[125px] ${
                        isToday ? 'bg-[#0f442b] text-[#dfbd69]' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>{dayName}</span>
                        {isToday && (
                          <span className="px-2 py-0.5 rounded-full bg-[#c59b27] text-[#14281d] text-[10px] font-black">
                            اليوم
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/80 dark:divide-emerald-900/40">
              {allTimeSlots.map((timeSlot) => (
                <tr
                  key={timeSlot}
                  className="hover:bg-[#f6f7f2]/50 dark:hover:bg-[#0b1711]/40 transition-colors"
                >
                  {/* Time Column */}
                  <td className="p-3 align-top bg-[#f6f7f2]/80 dark:bg-[#0b1711]/80 border-l border-neutral-200/80 dark:border-emerald-900/40 font-mono text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#c59b27]" />
                      <span>{timeSlot}</span>
                    </div>
                  </td>

                  {/* 7 Day Drop Cells */}
                  {DAY_NAMES.map((dayName, dayIdx) => {
                    const cellKey = `${dayIdx}_${timeSlot}`;
                    const isHovered = hoveredCellKey === cellKey;
                    const isTodayCol = dayIdx === todayDayIndex;

                    const cellCircles =
                      boardMode === 'circles'
                        ? circles.filter(
                            (c) =>
                              Array.isArray(c.scheduleDays) &&
                              c.scheduleDays.includes(dayIdx) &&
                              (c.scheduleTime || '17:00') === timeSlot
                          )
                        : [];

                    const cellStudents =
                      boardMode === 'students'
                        ? filteredStudents.filter((st) => {
                            const stCircle = circles.find(
                              (c) => c.name === st.circle || c.id === st.circleId
                            );
                            const stDays =
                              Array.isArray(st.scheduleDays) &&
                              st.scheduleDays.length > 0
                                ? st.scheduleDays
                                : stCircle?.scheduleDays || [0, 2, 4];
                            const stTime =
                              st.scheduleTime ||
                              stCircle?.scheduleTime ||
                              '17:00';
                            return stDays.includes(dayIdx) && stTime === timeSlot;
                          })
                        : [];

                    return (
                      <td
                        key={cellKey}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect =
                            dragBehavior === 'copy' ? 'copy' : 'move';
                          if (hoveredCellKey !== cellKey) {
                            setHoveredCellKey(cellKey);
                          }
                        }}
                        onDragLeave={() => {
                          if (hoveredCellKey === cellKey) {
                            setHoveredCellKey(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          try {
                            const raw =
                              e.dataTransfer.getData('application/json') ||
                              e.dataTransfer.getData('text/plain');
                            if (raw) {
                              const parsed = JSON.parse(
                                raw
                              ) as DragItemPayload;
                              void executeDropToCell(parsed, dayIdx, timeSlot);
                              return;
                            }
                          } catch {
                            // fallback to activeDragItem state
                          }
                          if (activeDragItem) {
                            void executeDropToCell(
                              activeDragItem,
                              dayIdx,
                              timeSlot
                            );
                          }
                        }}
                        onClick={() => {
                          if (activeDragItem) {
                            void executeDropToCell(
                              activeDragItem,
                              dayIdx,
                              timeSlot
                            );
                          }
                        }}
                        className={`p-2 align-top border-l border-neutral-200/70 dark:border-emerald-900/40 min-h-[84px] transition-all ${
                          isHovered
                            ? 'bg-emerald-100/80 dark:bg-emerald-900/50 ring-2 ring-inset ring-[#145a3a] dark:ring-[#dfbd69]'
                            : activeDragItem
                            ? 'cursor-pointer hover:bg-amber-50/70 dark:hover:bg-amber-950/30'
                            : isTodayCol
                            ? 'bg-emerald-50/25 dark:bg-emerald-950/15'
                            : ''
                        }`}
                      >
                        <div className="space-y-2 min-h-[64px]">
                          {/* Render Circle Cards in 'circles' mode */}
                          {cellCircles.map((c) => {
                            const cStudents = activeStudents.filter(
                              (s) => s.circle === c.name
                            );
                            const highlightKey = `${c.id}_${dayIdx}_${timeSlot}`;
                            const isJustMoved =
                              lastMovedHighlightId === highlightKey;

                            return (
                              <div
                                key={`${c.id}_${dayIdx}`}
                                draggable
                                onDragStart={(e) => {
                                  const payload: DragItemPayload = {
                                    entityType: 'circle',
                                    targetId: c.id,
                                    targetName: c.name,
                                    fromDay: dayIdx,
                                    fromTime: timeSlot,
                                  };
                                  setActiveDragItem(payload);
                                  e.dataTransfer.setData(
                                    'application/json',
                                    JSON.stringify(payload)
                                  );
                                  e.dataTransfer.setData(
                                    'text/plain',
                                    JSON.stringify(payload)
                                  );
                                  e.dataTransfer.effectAllowed = 'copyMove';
                                }}
                                onDragEnd={() => {
                                  setHoveredCellKey(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className={`group rounded-2xl p-2.5 border text-xs shadow-2xs cursor-grab active:cursor-grabbing transition-all ${
                                  isJustMoved
                                    ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-500 ring-2 ring-emerald-500/40'
                                    : activeDragItem?.targetId === c.id &&
                                      activeDragItem?.fromDay === dayIdx
                                    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-400 opacity-75'
                                    : 'bg-[#f6f7f2] dark:bg-[#0b1711] border-neutral-200/90 dark:border-emerald-900/70 hover:border-[#145a3a] dark:hover:border-[#dfbd69]'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="flex items-center gap-1 min-w-0">
                                    <GripVertical className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                    <span className="font-extrabold text-[#145a3a] dark:text-[#dfbd69] truncate">
                                      {c.name}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveSingleDay(
                                        'circle',
                                        c.id,
                                        dayIdx
                                      )
                                    }
                                    title={`إزالة يوم ${dayName} من هذه الحلقة`}
                                    className="opacity-70 hover:opacity-100 text-neutral-400 hover:text-rose-600 p-0.5 cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>

                                <div className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400 flex flex-wrap items-center justify-between gap-1">
                                  <span>
                                    👥 {cStudents.length} طلاب • {c.level}
                                  </span>
                                  <span className="font-mono">
                                    {c.duration || 45}د
                                  </span>
                                </div>

                                <div className="mt-2 pt-1.5 border-t border-neutral-200/60 dark:border-emerald-900/40 flex items-center justify-between gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveDragItem({
                                        entityType: 'circle',
                                        targetId: c.id,
                                        targetName: c.name,
                                        fromDay: dayIdx,
                                        fromTime: timeSlot,
                                      });
                                    }}
                                    className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#12231a] border border-neutral-200 dark:border-emerald-900 text-[10px] font-bold text-neutral-600 dark:text-neutral-300 hover:border-[#145a3a] cursor-pointer"
                                  >
                                    نقل سريع
                                  </button>

                                  <div className="flex items-center gap-1">
                                    {onOpenEditCircleModal && (
                                      <button
                                        type="button"
                                        onClick={() => onOpenEditCircleModal(c)}
                                        className="px-2 py-0.5 rounded-lg bg-neutral-200/70 dark:bg-emerald-950 text-[10px] font-bold cursor-pointer"
                                      >
                                        تعديل
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (cStudents[0]) {
                                          setSelectedStudentId(cStudents[0].id);
                                        }
                                        void markRecitationEngineStartedInFirestore(
                                          c.id,
                                          cStudents[0]?.id,
                                          'started'
                                        );
                                        setActiveTab('session');
                                      }}
                                      className="px-2 py-0.5 rounded-lg bg-[#145a3a] text-white text-[10px] font-extrabold flex items-center gap-0.5 cursor-pointer"
                                      title="بدء محرك التسميع للحلقة"
                                    >
                                      <Play className="w-2.5 h-2.5" />
                                      <span>تسميع</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {/* Render Individual Student Session Cards in 'students' mode */}
                          {cellStudents.map((st) => {
                            const highlightKey = `${st.id}_${dayIdx}_${timeSlot}`;
                            const isJustMoved =
                              lastMovedHighlightId === highlightKey;

                            return (
                              <div
                                key={`${st.id}_${dayIdx}`}
                                draggable
                                onDragStart={(e) => {
                                  const payload: DragItemPayload = {
                                    entityType: 'student',
                                    targetId: st.id,
                                    targetName: st.name,
                                    fromDay: dayIdx,
                                    fromTime: timeSlot,
                                  };
                                  setActiveDragItem(payload);
                                  e.dataTransfer.setData(
                                    'application/json',
                                    JSON.stringify(payload)
                                  );
                                  e.dataTransfer.setData(
                                    'text/plain',
                                    JSON.stringify(payload)
                                  );
                                  e.dataTransfer.effectAllowed = 'copyMove';
                                }}
                                onDragEnd={() => {
                                  setHoveredCellKey(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className={`group rounded-2xl p-2.5 border text-xs shadow-2xs cursor-grab active:cursor-grabbing transition-all ${
                                  isJustMoved
                                    ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-500 ring-2 ring-emerald-500/40'
                                    : activeDragItem?.targetId === st.id &&
                                      activeDragItem?.fromDay === dayIdx
                                    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-400 opacity-75'
                                    : 'bg-white dark:bg-[#0b1711] border-neutral-200 dark:border-emerald-900/70 hover:border-[#145a3a] dark:hover:border-[#dfbd69]'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="flex items-center gap-1 min-w-0">
                                    <GripVertical className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                    <span className="font-extrabold text-[#14281d] dark:text-white truncate">
                                      {st.name}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveSingleDay(
                                        'student',
                                        st.id,
                                        dayIdx
                                      )
                                    }
                                    title={`إزالة يوم ${dayName} من جدول الطالب`}
                                    className="opacity-70 hover:opacity-100 text-neutral-400 hover:text-rose-600 p-0.5 cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>

                                <div className="mt-1 text-[10px] text-neutral-500 truncate">
                                  {st.circle} • سورة {st.currentStop.surahName} (
                                  {st.currentStop.ayah})
                                </div>

                                <div className="mt-2 pt-1.5 border-t border-neutral-100 dark:border-emerald-900/40 flex items-center justify-between gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActiveDragItem({
                                        entityType: 'student',
                                        targetId: st.id,
                                        targetName: st.name,
                                        fromDay: dayIdx,
                                        fromTime: timeSlot,
                                      })
                                    }
                                    className="px-2 py-0.5 rounded-lg bg-[#f6f7f2] dark:bg-[#12231a] text-[10px] font-bold text-neutral-600 dark:text-neutral-300 cursor-pointer"
                                  >
                                    نقل
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedStudentId(st.id);
                                      void markRecitationEngineStartedInFirestore(
                                        st.circle,
                                        st.id,
                                        'started'
                                      );
                                      setActiveTab('session');
                                    }}
                                    className="px-2 py-0.5 rounded-lg bg-[#145a3a] text-white text-[10px] font-extrabold flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Play className="w-2.5 h-2.5" />
                                    <span>بدء الحصة</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {/* Subtle Drop Zone Prompt when dragging */}
                          {activeDragItem &&
                            cellCircles.length === 0 &&
                            cellStudents.length === 0 && (
                              <div className="h-14 rounded-xl border border-dashed border-neutral-300 dark:border-emerald-800/60 flex items-center justify-center text-[10px] font-bold text-neutral-400 dark:text-emerald-600/80">
                                أفلت هنا ({dayName} {timeSlot})
                              </div>
                            )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Footer Cards of Circles with Direct Edit triggers */}
      {!compactMode && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {circles.map((c) => {
            const cStudents = activeStudents.filter((s) => s.circle === c.name);
            return (
              <div
                key={c.id}
                className="rounded-2xl bg-white dark:bg-[#12231a] p-4 border border-neutral-200 dark:border-emerald-900/50 flex items-center justify-between gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <h4 className="text-xs font-extrabold text-[#145a3a] dark:text-[#dfbd69] truncate">
                      {c.name}
                    </h4>
                  </div>
                  <p className="text-[11px] text-neutral-500 truncate">
                    الأيام: {c.scheduleDays.map((d) => DAY_NAMES[d]).join('، ')}{' '}
                    • الساعة {c.scheduleTime}
                  </p>
                  <p className="text-[10px] text-neutral-400">
                    {cStudents.length} طلاب مسجلين • المعلم: {c.teacherName}
                  </p>
                </div>
                {onOpenEditCircleModal && (
                  <button
                    type="button"
                    onClick={() => onOpenEditCircleModal(c)}
                    className="px-3 py-1.5 rounded-xl bg-[#f6f7f2] dark:bg-[#0b1711] hover:bg-[#145a3a] hover:text-white text-[11px] font-extrabold transition-colors shrink-0 cursor-pointer"
                  >
                    تعديل شامل
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
