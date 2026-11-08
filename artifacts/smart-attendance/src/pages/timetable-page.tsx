import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAttendanceOverviewQueryKey, getListAcademicLessonsQueryKey, getListAttendanceSessionsQueryKey, getListSchoolUsersQueryKey,
  useCreateAttendanceSession, useGetAcademicCatalog, useGetCurrentSchoolUser, useListAcademicLessons, useListAcademicSections, useListSchoolUsers,
} from '@workspace/api-client-react';
import type { AcademicLesson } from '@workspace/api-client-react';
import { CalendarPlus, ChevronLeft, ChevronRight, Clock3, DoorOpen, GraduationCap, LoaderCircle, Pencil, QrCode, RefreshCw } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, PageHeading } from '@/components/portal-ui';
import { LessonEditDialog, LessonSeriesDialog } from '@/components/timetable-dialogs';
import { addDays, dayLabel, errorText, mondayOf, vnDate, vnTime, WEEKDAYS, weekdayOf } from '@/lib/portal';

const OPEN_BEFORE_MS = 30 * 60 * 1000;

export function TimetablePage() {
  const me = useGetCurrentSchoolUser();
  const role = me.data?.role ?? 'student';
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  const today = vnDate(new Date());
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [classId, setClassId] = useState(() => new URLSearchParams(window.location.search).get('classId') ?? '');
  const [now, setNow] = useState(() => Date.now());
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicLesson | null>(null);
  const [openError, setOpenError] = useState('');
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  const params = useMemo(() => ({ weekStart, ...(classId ? { classId: Number(classId) } : {}) }), [weekStart, classId]);
  const lessons = useListAcademicLessons(params, { query: { queryKey: getListAcademicLessonsQueryKey(params), refetchInterval: 60_000 } });
  const sections = useListAcademicSections();
  const catalog = useGetAcademicCatalog();
  const users = useListSchoolUsers({ query: { enabled: isAdmin, queryKey: getListSchoolUsersQueryKey() } });
  const teachers = (users.data ?? []).filter((u) => u.role === 'teacher' && u.active);
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const createSession = useCreateAttendanceSession();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay = useMemo(() => {
    const map = new Map<string, AcademicLesson[]>();
    for (const l of lessons.data ?? []) { const d = vnDate(l.startsAt); map.set(d, [...(map.get(d) ?? []), l]); }
    for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return map;
  }, [lessons.data]);
  const upcoming = (lessons.data ?? []).filter((l) => l.status === 'scheduled' && new Date(l.endsAt).getTime() >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 4);
  const openSession = (l: AcademicLesson) => {
    setOpenError('');
    createSession.mutate({ data: { classId: l.classId, lessonId: l.id } }, {
      onSuccess: (s) => {
        void qc.invalidateQueries({ queryKey: getListAcademicLessonsQueryKey() });
        void qc.invalidateQueries({ queryKey: getListAttendanceSessionsQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
        setLocation(`/sessions/${s.id}`);
      },
      onError: (e) => setOpenError(errorText(e)),
    });
  };
  const title = isTeacher ? 'Lịch dạy của tôi' : isAdmin ? 'Thời khóa biểu toàn trường' : 'Thời khóa biểu của tôi';
  return <main className="page-wrap">
    <PageHeading eyebrow={`Tuần ${dayLabel(weekStart)} – ${dayLabel(addDays(weekStart, 6))} · giờ Việt Nam`} title={title}
      subtitle={isTeacher ? 'Mở điểm danh từ đúng buổi học, từ 30 phút trước giờ học đến khi kết thúc.' : isAdmin ? 'Xếp lịch lặp theo tuần hoặc một buổi, sửa hay hủy riêng từng buổi.' : 'Các buổi học của những lớp học phần bạn đang tham gia.'}
      action={isAdmin ? <button className="btn" onClick={() => setSeriesOpen(true)} disabled={!sections.data?.length} data-testid="button-create-lessons"><CalendarPlus /> Thêm lịch học</button> : undefined} />
    <div className="filter-bar">
      <div className="toolbar">
        <div className="week-nav">
          <button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Tuần trước" data-testid="button-prev-week"><ChevronLeft /></button>
          <button className="btn secondary" onClick={() => setWeekStart(mondayOf(today))} disabled={weekStart === mondayOf(today)} data-testid="button-this-week">Tuần này</button>
          <button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Tuần sau" data-testid="button-next-week"><ChevronRight /></button>
        </div>
        <select className="select-field" value={classId} onChange={(e) => setClassId(e.target.value)} data-testid="select-timetable-section"><option value="">Mọi lớp học phần</option>{(sections.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.code ?? '—'} · {s.name}</option>)}</select>
      </div>
      <button className="icon-button" onClick={() => void lessons.refetch()} aria-label="Làm mới" data-testid="button-refresh-timetable"><RefreshCw /></button>
    </div>
    {openError && <div className="error-banner" role="alert" data-testid="status-open-session-error">{openError}</div>}
    {isTeacher && upcoming.length > 0 && <section className="upcoming-strip" aria-label="Buổi sắp tới">
      {upcoming.map((l) => <div key={l.id} className="upcoming-item"><span className="eyebrow">{WEEKDAYS[weekdayOf(vnDate(l.startsAt))]} · {vnTime(l.startsAt)}</span><strong>{l.className}</strong><small>{l.roomName}</small></div>)}
    </section>}
    {lessons.isLoading ? <LoadingState rows={3} label="Đang tải thời khóa biểu…" /> : lessons.isError ? <ErrorState error={lessons.error} retry={() => void lessons.refetch()} /> : !lessons.data?.length ?
      <div className="card"><EmptyState icon={<Clock3 />} title="Tuần này không có buổi học" detail={isAdmin ? 'Thêm lịch học cho lớp học phần hoặc chuyển sang tuần khác.' : 'Chuyển tuần để xem lịch khác. Lịch do phòng đào tạo sắp xếp.'} /></div> :
      <div className="week-grid" data-testid="grid-timetable">
        {days.map((d) => { const list = byDay.get(d) ?? []; return <section key={d} className={`day-col ${d === today ? 'today' : ''} ${list.length ? '' : 'empty'}`}>
          <header><span>{WEEKDAYS[weekdayOf(d)]}</span><strong>{dayLabel(d)}</strong></header>
          {!list.length ? <div className="day-empty">Trống</div> : list.map((l) => {
            const start = new Date(l.startsAt).getTime(); const end = new Date(l.endsAt).getTime();
            const canOpen = l.status === 'scheduled' && now >= start - OPEN_BEFORE_MS && now <= end;
            const live = now >= start && now <= end && l.status === 'scheduled';
            return <article key={l.id} className={`lesson-card ${l.status} ${live ? 'live' : ''}`} data-testid={`card-lesson-${l.id}`}>
              <div className="lesson-time">{vnTime(l.startsAt)}–{vnTime(l.endsAt)}{l.status === 'cancelled' && <span className="pill review">Đã hủy</span>}</div>
              <div className="lesson-title">{l.className}</div>
              <div className="lesson-sub">{l.subject}</div>
              <div className="lesson-meta"><span><DoorOpen size={11} /> {l.roomName}</span><span><GraduationCap size={11} /> {l.teacherName}</span></div>
              {l.reason && <div className="lesson-reason">{l.reason}</div>}
              <div className="lesson-actions">
                {l.sessionId ? (role !== 'student' ? <Link href={`/sessions/${l.sessionId}`} className="btn ghost" data-testid={`link-lesson-session-${l.id}`}>Xem phiên <ChevronRight /></Link> : <span className="pill">Có phiên điểm danh</span>) :
                  (isTeacher || isAdmin) && l.status === 'scheduled' && <button className="btn" disabled={!canOpen || createSession.isPending} title={canOpen ? 'Mở phiên điểm danh' : 'Chỉ mở được từ 30 phút trước giờ học đến khi kết thúc'} onClick={() => openSession(l)} data-testid={`button-open-lesson-${l.id}`}>{createSession.isPending && createSession.variables?.data.lessonId === l.id ? <LoaderCircle /> : <QrCode />} Mở điểm danh</button>}
                {isAdmin && <button className="icon-button" onClick={() => setEditing(l)} aria-label="Sửa buổi học" data-testid={`button-edit-lesson-${l.id}`}><Pencil /></button>}
              </div>
            </article>;
          })}
        </section>; })}
      </div>}
    {(isTeacher || isAdmin) && <p className="notice" style={{ marginTop: 14 }}>Phiên chỉ mở được từ 30 phút trước giờ học tới khi kết thúc. Mã QR đổi mỗi 45 giây; quét sau 15 phút tính là đi muộn. Khi mở phiên, mọi sinh viên trong danh sách được ghi vắng cho tới khi quét.</p>}
    {seriesOpen && <LessonSeriesDialog sections={sections.data ?? []} teachers={teachers} rooms={catalog.data?.rooms ?? []} semesters={catalog.data?.semesters ?? []} defaultClassId={classId ? Number(classId) : undefined} onClose={() => setSeriesOpen(false)} />}
    {editing && <LessonEditDialog lesson={editing} teachers={teachers} rooms={catalog.data?.rooms ?? []} onClose={() => setEditing(null)} />}
  </main>;
}
