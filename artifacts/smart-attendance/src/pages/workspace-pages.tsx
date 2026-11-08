import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useClerk } from '@clerk/react';
import QRCode from 'qrcode';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

const ensureTensorFlowBackend = async () => {
  if (tf.getBackend()) return;
  try {
    await tf.setBackend('webgl');
  } catch {
    await tf.setBackend('cpu');
  }
  await tf.ready();
};
import {
  getGetCurrentSchoolUserQueryKey,
  useGetAttendanceOverview,
  getGetAttendanceOverviewQueryKey,
  getGetQrCheckInSessionQueryKey,
  useListClasses,
  getListClassesQueryKey,
  useSetClassLocation,
  useCreateClassStudent,
  useListAcademicSections,
  useGetCurrentSchoolUser,
  useGetQrCheckInSession,
  useCreateQrStudentCheckIn,
  useListClassStudents,
  getListClassStudentsQueryKey,
  useListAttendanceSessions,
  getListAttendanceSessionsQueryKey,
  useCreateAttendanceSession,
  useGetAttendanceSession,
  getGetAttendanceSessionQueryKey,
  useCloseAttendanceSession,
  useListSessionCheckIns,
  getListSessionCheckInsQueryKey,
  useCreateCountSnapshot,
  useGetSessionReconciliation,
  getGetSessionReconciliationQueryKey,
} from '@workspace/api-client-react';
import type { AttendanceRecord, Classroom } from '@workspace/api-client-react';
import { AttendanceRecordRow } from '@/components/attendance-record-row';
import { ManualCheckInRow } from '@/components/manual-check-in-row';
import {
  BookOpen, CalendarClock, Camera, Check, CheckCheck, ChevronRight,
  CircleAlert, Clock3, ExternalLink, GraduationCap, LogOut, MapPin,
  LoaderCircle, Plus, QrCode, RefreshCw, Search, ShieldCheck, Users,
  VideoOff, X,
} from 'lucide-react';

const dateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(value))
  : 'Chưa ghi nhận';

const errorText = (error: unknown) => {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return data.error;
    }
  }
  return error instanceof Error ? error.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.';
};
const appBasePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const checkInHref = (token: string) => `${appBasePath}/check-in?token=${encodeURIComponent(token)}`;

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function LoadingState({ label = 'Đang đồng bộ dữ liệu lớp học…' }: { label?: string }) {
  return <div className="loading-row" role="status" data-testid="status-loading">{label}</div>;
}

function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="empty-state card" data-testid="status-error">
      <div className="empty-icon"><CircleAlert /></div>
      <strong>Chưa thể tải dữ liệu</strong>
      <p>{errorText(error)}</p>
      <button className="btn secondary" style={{ marginTop: 15 }} onClick={retry} data-testid="button-retry">
        <RefreshCw /> Thử lại
      </button>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state" data-testid="status-empty">
      <div className="empty-icon"><BookOpen /></div>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const active = status === 'active';
  return <span className={`pill ${active ? '' : 'closed'}`} data-testid={`status-session-${status}`}>{active ? 'Đang mở' : 'Đã kết thúc'}</span>;
}

export function DashboardPage() {
  const overview = useGetAttendanceOverview();
  const sessionsQuery = useListAttendanceSessions();
  const refresh = () => {
    void overview.refetch();
    void sessionsQuery.refetch();
  };
  const data = overview.data;
  const active = data?.activeSession;
  const sessions = data?.recentSessions ?? sessionsQuery.data ?? [];
  return (
    <main className="page-wrap">
      <PageHeading
        eyebrow="Không gian hôm nay"
        title="Lớp học, trong tầm mắt."
        subtitle="Một bảng điểm danh rõ ràng để bạn bắt đầu tiết học thật nhẹ nhàng."
        action={<Link href="/classes" className="btn" data-testid="button-start-session"><Plus /> Bắt đầu điểm danh</Link>}
      />
      {overview.isLoading ? <LoadingState /> : overview.isError ? <ErrorState error={overview.error} retry={refresh} /> : (
        <>
          <section className="stat-grid" aria-label="Tổng quan" data-testid="dashboard-overview">
            <div className="card stat-card">
              <div className="stat-top"><span>Lớp đang phụ trách</span><span className="stat-icon"><BookOpen /></span></div>
              <div className="stat-value" data-testid="text-class-count">{data?.classCount ?? 0}</div>
              <div className="stat-foot">Các lớp học đã được kết nối</div>
            </div>
            <div className="card stat-card">
              <div className="stat-top"><span>Sinh viên</span><span className="stat-icon"><Users /></span></div>
              <div className="stat-value" data-testid="text-student-count">{data?.studentCount ?? 0}</div>
              <div className="stat-foot">Trong danh sách lớp hiện tại</div>
            </div>
            <div className="card stat-card">
              <div className="stat-top"><span>Buổi học hôm nay</span><span className="stat-icon"><CalendarClock /></span></div>
              <div className="stat-value" data-testid="text-sessions-today">{data?.sessionsToday ?? 0}</div>
              <div className="stat-foot">Lịch sử được cập nhật tức thời</div>
            </div>
            <div className="card stat-card">
              <div className="stat-top"><span>Tỷ lệ có mặt</span><span className="stat-icon"><CheckCheck /></span></div>
              <div className="stat-value" data-testid="text-attendance-rate">{data?.averageAttendanceRate == null ? '—' : `${data.averageAttendanceRate.toFixed(1)}%`}</div>
              <div className="stat-foot">Trung bình các buổi ghi nhận</div>
            </div>
          </section>
          <section className="dashboard-grid">
            <div className="card section-card">
              <div className="section-head">
                <div><h2>Buổi học gần đây</h2><div className="section-kicker">Nhịp lớp trong những buổi mới nhất</div></div>
                <Link href="/reports" className="text-link" data-testid="link-all-reports">Xem báo cáo <ChevronRight size={14} style={{ verticalAlign: 'middle' }} /></Link>
              </div>
              {sessionsQuery.isLoading && !data ? <LoadingState label="Đang tải các buổi học…" /> : sessions.length === 0 ? <EmptyState title="Chưa có buổi điểm danh" detail="Mở lớp học để tạo buổi điểm danh đầu tiên." /> : (
                <div className="session-list">
                  {sessions.slice(0, 5).map((session) => (
                    <Link href={`/sessions/${session.id}`} className="session-row" key={session.id} data-testid={`row-recent-session-${session.id}`}>
                      <div className="session-symbol"><GraduationCap /></div>
                      <div><div className="session-title">{session.className} <StatusPill status={session.status} /></div><div className="session-detail">{session.subject} · {dateTime(session.startedAt)}</div></div>
                      <div className="session-count">{session.checkedInCount}<small>/ {session.studentCount} đã điểm danh</small></div>
                    </Link>
                  ))}
                </div>
              )}
              {sessionsQuery.isError && !data && <ErrorState error={sessionsQuery.error} retry={refresh} />}
            </div>
            <div className="card active-panel">
              <div className="section-head">
                <div><h2>Đang diễn ra</h2><div className="section-kicker">Theo dõi buổi học hiện tại</div></div>
                {active && <span className="live-dot" aria-label="Buổi học đang hoạt động" />}
              </div>
              {active ? (
                <>
                  <div style={{ font: '700 18px var(--app-font-display)' }} data-testid="text-active-class">{active.className}</div>
                  <div className="active-subject">{active.subject} · Bắt đầu lúc {dateTime(active.startedAt)}</div>
                  <div className="attendance-big">{active.checkedInCount}<span> / {active.studentCount}</span></div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${active.studentCount ? Math.min(100, active.checkedInCount / active.studentCount * 100) : 0}%` }} /></div>
                  <div className="active-meta"><span>Đã xác nhận</span><span>{active.studentCount ? Math.round(active.checkedInCount / active.studentCount * 100) : 0}%</span></div>
                  <div className="actions-stack">
                    <Link href={`/sessions/${active.id}`} className="btn" data-testid="button-open-active-session">Mở buổi điểm danh <ChevronRight /></Link>
                    <Link href="/check-in" className="btn secondary" data-testid="button-student-checkin">Hướng dẫn sinh viên <ExternalLink /></Link>
                  </div>
                </>
              ) : (
                <div className="empty-state" style={{ padding: '18px 4px' }} data-testid="status-no-active-session">
                  <div className="empty-icon"><Clock3 /></div><strong>Chưa mở buổi học nào</strong><p>Chọn một lớp để tạo mã QR điểm danh.</p>
                  <Link className="btn" href="/classes" style={{ marginTop: 15 }} data-testid="link-open-classes">Chọn lớp <ChevronRight /></Link>
                </div>
              )}
            </div>
            <div className="card section-card">
              <div className="section-head"><div><h2>Nhật ký hoạt động</h2><div className="section-kicker">Các cập nhật mới nhất</div></div><span className="subject-chip">MỚI NHẤT</span></div>
              {!data?.activities?.length ? <EmptyState title="Chưa có hoạt động" detail="Cập nhật sẽ xuất hiện tại đây." /> : (
                <div className="activity-list">
                  {data.activities.slice(0, 6).map((activity) => (
                    <div className="activity-item" key={activity.id} data-testid={`activity-entry-${activity.id}`}>
                      <div className="activity-marker"><Check /></div>
                      <div><div className="activity-copy">{activity.message}</div><div className="activity-time">{dateTime(activity.createdAt)}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="card section-card" style={{ background: '#f5eddb' }}>
              <div className="section-head"><div><h2>Hai nguồn đối chiếu</h2><div className="section-kicker">Đối chiếu minh bạch, không thay thế giảng viên</div></div><ShieldCheck color="#927338" size={19} /></div>
              <p style={{ color: '#6f6246', fontSize: 11, lineHeight: 1.7, marginBottom: 0 }}>QR xác nhận từng sinh viên bằng tài khoản đã liên kết. Camera, nếu được kết nối, chỉ gửi một con số tổng hợp để tham khảo — không nhận diện khuôn mặt, không lưu hình ảnh.</p>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export function ClassesPage() {
  const qc = useQueryClient();
  const classes = useListClasses();
  const currentUser = useGetCurrentSchoolUser();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [studentModal, setStudentModal] = useState(false);
  const [studentForm, setStudentForm] = useState({ fullName: '', studentCode: '' });
  const [locationForm, setLocationForm] = useState({ latitude: '', longitude: '', checkInRadiusMeters: '50' });
  const [studentError, setStudentError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [locationNotice, setLocationNotice] = useState('');
  const [locatingClass, setLocatingClass] = useState(false);
  const students = useListClassStudents(selectedId ?? 0, { query: { enabled: selectedId !== null, queryKey: getListClassStudentsQueryKey(selectedId ?? 0) } });
  const setClassLocation = useSetClassLocation();
  const createStudent = useCreateClassStudent();
  const createSession = useCreateAttendanceSession();
  const [, setLocation] = useLocation();
  const sectionsQuery = useListAcademicSections();
  const sectionRoomIds = new Set((sectionsQuery.data ?? []).filter((s) => s.roomId != null).map((s) => s.id));
  const items = classes.data ?? [];
  const selectedClass = items.find((classroom) => classroom.id === selectedId);
  const filtered = items.filter((c) => `${c.name} ${c.subject} ${c.room}`.toLowerCase().includes(search.toLowerCase()));
  const refresh = () => void classes.refetch();
  const selectClass = (classroom: Classroom) => {
    setSelectedId(classroom.id);
    setLocationForm({
      latitude: classroom.latitude == null ? '' : String(classroom.latitude),
      longitude: classroom.longitude == null ? '' : String(classroom.longitude),
      checkInRadiusMeters: String(classroom.checkInRadiusMeters ?? 50),
    });
    setLocationError('');
    setLocationNotice('');
  };
  const captureClassLocation = () => {
    setLocationError('');
    setLocationNotice('');
    if (!navigator.geolocation) {
      setLocationError('Trình duyệt này không hỗ trợ lấy vị trí.');
      return;
    }
    setLocatingClass(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocationForm((value) => ({
          ...value,
          latitude: coords.latitude.toFixed(6),
          longitude: coords.longitude.toFixed(6),
        }));
        setLocationNotice(`Đã lấy vị trí hiện tại (sai số khoảng ±${Math.round(coords.accuracy)} m). Hãy lưu khi thiết bị đang ở trong lớp.`);
        setLocatingClass(false);
      },
      (error) => {
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'Bạn chưa cấp quyền vị trí cho trình duyệt.'
            : error.code === error.TIMEOUT
              ? 'Lấy vị trí quá lâu. Hãy thử lại ở nơi có tín hiệu GPS tốt hơn.'
              : 'Không lấy được vị trí. Hãy bật GPS và thử lại.',
        );
        setLocatingClass(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  const submitClassLocation = (event: FormEvent) => {
    event.preventDefault();
    if (selectedId === null) return;
    setLocationError('');
    setLocationNotice('');
    setClassLocation.mutate({
      classId: selectedId,
      data: {
        latitude: Number(locationForm.latitude),
        longitude: Number(locationForm.longitude),
        checkInRadiusMeters: Number(locationForm.checkInRadiusMeters),
      },
    }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListClassesQueryKey() });
        setLocationNotice('Đã lưu vị trí và phạm vi điểm danh cho lớp.');
      },
      onError: (error) => setLocationError(errorText(error)),
    });
  };
  const submitStudent = (event: FormEvent) => {
    event.preventDefault();
    if (selectedId === null) return;
    setStudentError('');
    createStudent.mutate({ classId: selectedId, data: studentForm }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListClassStudentsQueryKey(selectedId) });
        void qc.invalidateQueries({ queryKey: getListClassesQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
        setStudentForm({ fullName: '', studentCode: '' });
        setStudentModal(false);
      },
      onError: (error) => setStudentError(errorText(error)),
    });
  };
  const startSession = (classroom: Classroom) => {
    if (sectionsQuery.data?.find(s => s.id === classroom.id)?.semesterId) {
      setLocation(`/timetable?classId=${classroom.id}`);
      return;
    }
    createSession.mutate({ data: { classId: classroom.id } }, {
      onSuccess: (session) => {
        void qc.invalidateQueries({ queryKey: getListAttendanceSessionsQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
        setLocation(`/sessions/${session.id}`);
      },
    });
  };
  return (
    <main className="page-wrap">
      <PageHeading eyebrow="Lớp học phần" title={currentUser.data?.role === 'admin' ? 'Lớp học phần & danh sách' : 'Lớp học phần được phân công'} subtitle="Xem danh sách sinh viên. Để mở điểm danh đúng buổi, hãy dùng Lịch dạy." action={<div className="toolbar"><Link href="/timetable" className="btn secondary" data-testid="link-classes-timetable"><CalendarClock /> Lịch dạy</Link>{currentUser.data?.role === 'admin' && <Link href="/academic/sections" className="btn" data-testid="button-create-class"><Plus /> Tạo lớp học phần</Link>}</div>} />
      <div className="two-col">
        <section>
          <div className="filter-bar">
            <div className="toolbar">
              <label className="search-field"><Search /><input className="field" placeholder="Tìm lớp, môn học…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-classes" /></label>
              <span className="page-subtitle">{filtered.length} lớp</span>
            </div>
            <button className="icon-button" onClick={refresh} aria-label="Làm mới danh sách lớp" data-testid="button-refresh-classes"><RefreshCw /></button>
          </div>
          {classes.isLoading ? <LoadingState label="Đang tải danh sách lớp…" /> : classes.isError ? <ErrorState error={classes.error} retry={refresh} /> : filtered.length === 0 ? <div className="card"><EmptyState title={search ? 'Không tìm thấy lớp phù hợp' : 'Chưa có lớp học'} detail={search ? 'Thử một từ khóa khác.' : 'Thêm lớp để bắt đầu quản lý điểm danh.'} /></div> : (
            <div className="class-grid">
              {filtered.map((classroom) => (
                <button className={`card class-card ${selectedId === classroom.id ? 'selected' : ''}`} key={classroom.id} onClick={() => selectClass(classroom)} data-testid={`card-class-${classroom.id}`}>
                  <div className="class-card-top"><span className="subject-chip">{classroom.subject}</span><ChevronRight size={15} color="#70867c" /></div>
                  <div className="class-name">{classroom.name}</div>
                  <div className="class-meta"><span>Phòng {classroom.room}</span><span>{classroom.studentCount} sinh viên</span></div>
                  <div className="class-footer"><span>{classroom.latitude == null || classroom.longitude == null ? 'Chưa cài vị trí QR' : `QR trong ${classroom.checkInRadiusMeters} m`}</span><span>#{String(classroom.id).padStart(3, '0')}</span></div>
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="card section-card">
          <div className="section-head">
            <div><h2>{items.find((c) => c.id === selectedId)?.name ?? 'Danh sách sinh viên'}</h2><div className="section-kicker">{selectedId ? 'Sinh viên trong lớp học phần đã chọn' : 'Chọn một lớp để xem danh sách'}</div></div>
            {selectedId && <div className="toolbar">{currentUser.data?.role === 'admin' && <Link className="btn secondary" href="/academic/students" data-testid="button-add-student"><Plus /> Quản lý sinh viên</Link>}<button className="btn" onClick={() => selectedClass && startSession(selectedClass)} disabled={createSession.isPending || !selectedClass || (!sectionRoomIds.has(selectedClass.id) && (selectedClass.latitude == null || selectedClass.longitude == null))} data-testid="button-start-class-session">{createSession.isPending ? <LoaderCircle /> : <QrCode />} {sectionsQuery.data?.find(s => s.id === selectedId)?.semesterId ? 'Chọn buổi trong lịch' : 'Bắt đầu'}</button></div>}
          </div>
          {createSession.isError && <div className="error-banner" role="alert">{errorText(createSession.error)}</div>}
          {selectedClass && currentUser.data?.role === 'admin' && sectionRoomIds.has(selectedClass.id) && (
            <div className="notice" role="status" style={{ marginBottom: 18 }}>Lớp học phần này dùng mốc vị trí của phòng học. Sửa tọa độ và bán kính tại <Link href="/academic" className="text-link">Danh mục học vụ → Phòng học</Link>.</div>
          )}
          {selectedClass && currentUser.data?.role === 'admin' && !sectionRoomIds.has(selectedClass.id) && (
            <form className="form-stack" onSubmit={submitClassLocation} style={{ marginBottom: 20, padding: 16, border: '1px solid #e4e8df', borderRadius: 14, background: '#fafbf8' }} data-testid="form-class-location">
              <div>
                <div className="form-label">Vị trí điểm danh QR</div>
                <div className="form-help">Đứng trong lớp để lấy tọa độ mốc. Vị trí sinh viên chỉ được kiểm tra khi quét, không theo dõi liên tục.</div>
              </div>
              <button className="btn secondary" type="button" onClick={captureClassLocation} disabled={locatingClass} data-testid="button-capture-class-location">
                {locatingClass ? <LoaderCircle /> : <MapPin />} Lấy vị trí hiện tại
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10 }}>
                <label><span className="form-label">Vĩ độ</span><input className="field" type="number" step="any" min="-90" max="90" required value={locationForm.latitude} onChange={(e) => setLocationForm({ ...locationForm, latitude: e.target.value })} data-testid="input-class-latitude" /></label>
                <label><span className="form-label">Kinh độ</span><input className="field" type="number" step="any" min="-180" max="180" required value={locationForm.longitude} onChange={(e) => setLocationForm({ ...locationForm, longitude: e.target.value })} data-testid="input-class-longitude" /></label>
                <label><span className="form-label">Bán kính cho phép (m)</span><input className="field" type="number" min="10" max="500" step="5" required value={locationForm.checkInRadiusMeters} onChange={(e) => setLocationForm({ ...locationForm, checkInRadiusMeters: e.target.value })} data-testid="input-class-radius" /></label>
              </div>
              {locationNotice && <div className="notice" role="status">{locationNotice}</div>}
              {locationError && <div className="error-banner" role="alert">{locationError}</div>}
              <button className="btn" type="submit" disabled={setClassLocation.isPending || !locationForm.latitude || !locationForm.longitude} data-testid="button-save-class-location">
                {setClassLocation.isPending ? <LoaderCircle /> : <Check />} Lưu vị trí lớp
              </button>
            </form>
          )}
          {selectedClass && currentUser.data?.role !== 'admin' && !sectionRoomIds.has(selectedClass.id) && (selectedClass.latitude == null || selectedClass.longitude == null) && (
            <div className="notice" role="status" style={{ marginBottom: 18 }}>Quản trị viên cần cài vị trí lớp trước khi có thể mở phiên QR.</div>
          )}
          {!selectedId ? <EmptyState title="Chọn lớp học phần" detail="Danh sách sinh viên sẽ hiện ở đây." /> : students.isLoading ? <LoadingState label="Đang tải danh sách sinh viên…" /> : students.isError ? <ErrorState error={students.error} retry={() => void students.refetch()} /> : !students.data?.length ? <EmptyState title="Chưa có sinh viên" detail="Quản trị viên thêm sinh viên tại mục Lớp học phần." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Sinh viên</th><th>Chuyên cần</th></tr></thead>
                <tbody>{students.data.map((student) => <tr key={student.id} data-testid={`row-student-${student.id}`}><td><div className="student-name">{student.fullName}</div><div className="student-code">{student.studentCode}</div></td><td>{student.attendanceRate == null ? <span className="form-help">Chưa có bản ghi</span> : <><div className="rate">{student.attendanceRate.toFixed(1)}%</div><div className="meter"><span style={{ width: `${Math.min(100, student.attendanceRate)}%` }} /></div></>}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {studentModal && selectedId !== null && (
        <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setStudentModal(false); }} style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(22,43,39,.48)', display: 'grid', placeItems: 'center', padding: 18 }}>
          <form className="card checkin-card" onSubmit={submitStudent} style={{ width: 'min(100%, 450px)' }} data-testid="form-add-student">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}><div><div className="eyebrow">Danh sách lớp</div><h2 style={{ font: '800 22px var(--app-font-display)', letterSpacing: '-.04em', margin: 0 }}>Thêm học sinh</h2><p className="page-subtitle" style={{ marginTop: 6 }}>{items.find((c) => c.id === selectedId)?.name}</p></div><button type="button" className="icon-button" onClick={() => setStudentModal(false)} aria-label="Đóng biểu mẫu"><X /></button></div>
            <div className="form-stack">
              <label><span className="form-label">Họ và tên</span><input className="field" required maxLength={120} autoFocus value={studentForm.fullName} onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })} placeholder="Ví dụ: Nguyễn Minh Anh" data-testid="input-student-name" /></label>
              <label><span className="form-label">Mã học sinh</span><input className="field" required maxLength={64} value={studentForm.studentCode} onChange={(e) => setStudentForm({ ...studentForm, studentCode: e.target.value })} placeholder="Ví dụ: HS1002" data-testid="input-student-code" /><span className="form-help">Mã này dùng để liên kết tài khoản học sinh sau này.</span></label>
              {studentError && <div className="error-banner" role="alert">{studentError}</div>}
              <button className="btn" type="submit" disabled={createStudent.isPending} data-testid="button-submit-student">{createStudent.isPending ? <LoaderCircle /> : <Plus />} Lưu học sinh</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export function SessionPage() {
  const [, params] = useRoute('/sessions/:sessionId');
  const id = Number(params?.sessionId ?? 0);
  const qc = useQueryClient();
  const session = useGetAttendanceSession(id, { query: { enabled: !!id, queryKey: getGetAttendanceSessionQueryKey(id), refetchInterval: 12000 } });
  const records = useListSessionCheckIns(id, { query: { enabled: !!id, queryKey: getListSessionCheckInsQueryKey(id), refetchInterval: 12000 } });
  const reconciliation = useGetSessionReconciliation(id, { query: { enabled: !!id, queryKey: getGetSessionReconciliationQueryKey(id), refetchInterval: 12000 } });
  const closeSession = useCloseAttendanceSession();
  const roster = useListClassStudents(session.data?.classId ?? 0, { query: { enabled: !!session.data?.classId, queryKey: getListClassStudentsQueryKey(session.data?.classId ?? 0) } });
  const createCount = useCreateCountSnapshot();
  const [qrImage, setQrImage] = useState('');
  const [count, setCount] = useState('');
  const [confidence, setConfidence] = useState('0.8');
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'ready' | 'counting' | 'error'>('idle');
  const [cameraMessage, setCameraMessage] = useState('');
  const [cameraCount, setCameraCount] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const item = session.data;
  const recordList: AttendanceRecord[] = records.data ?? [];
  const presentCount = recordList.filter((r) => r.status === 'present').length;
  const lateCount = recordList.filter((r) => r.status === 'late').length;
  const recordedIds = new Set(recordList.map((r) => r.studentId));
  const missingStudents = (roster.data ?? []).filter((st) => !recordedIds.has(st.id));
  const absentCount = recordList.filter((r) => r.status === 'absent').length + missingStudents.length;
  useEffect(() => {
    if (!item?.qrToken || item.status !== 'active') { setQrImage(''); return; }
    const link = `${window.location.origin}${checkInHref(item.qrToken)}`;
    let cancelled = false;
    QRCode.toDataURL(link, { width: 360, margin: 1, color: { dark: '#173f3a', light: '#ffffff' }, errorCorrectionLevel: 'M' })
      .then((url) => { if (!cancelled) setQrImage(url); })
      .catch(() => { if (!cancelled) setQrImage(''); });
    return () => { cancelled = true; };
  }, [item?.qrToken, item?.status]);
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  const refresh = () => {
    void session.refetch();
    void records.refetch();
    void reconciliation.refetch();
  };
  const invalidateSessionData = () => {
    void qc.invalidateQueries({ queryKey: getGetAttendanceSessionQueryKey(id) });
    void qc.invalidateQueries({ queryKey: getListSessionCheckInsQueryKey(id) });
    void qc.invalidateQueries({ queryKey: getGetSessionReconciliationQueryKey(id) });
    void qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
    void qc.invalidateQueries({ queryKey: getListAttendanceSessionsQueryKey() });
  };
  const saveCount = (event: FormEvent) => {
    event.preventDefault();
    if (!count || Number(count) < 0) return;
    createCount.mutate({ sessionId: id, data: { estimatedCount: Number(count), confidence: Number(confidence), source: 'demo' } }, {
      onSuccess: () => {
        setCount('');
        void qc.invalidateQueries({ queryKey: getGetSessionReconciliationQueryKey(id) });
      },
    });
  };
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState('idle');
    setCameraMessage('');
    setCameraCount(null);
  };
  useEffect(() => {
    if (item?.status !== 'active') {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraState('idle');
    }
  }, [item?.status]);
  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setCameraMessage('Trình duyệt này không hỗ trợ truy cập camera. Hãy dùng camera thử nghiệm trên trình duyệt hiện đại.');
      return;
    }
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setCameraState('error');
      setCameraMessage('Camera trĂªn Ä‘iá»‡n thoáº¡i chá»‰ hoáº¡t Ä‘á»™ng qua HTTPS. HĂ£y má»Ÿ báº±ng liĂªn káº¿t https:// cá»§a ngrok.');
      return;
    }
    setCameraState('starting');
    setCameraMessage('Đang mở camera và tải mô hình đếm người về thiết bị…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState('ready');
      try {
        if (!modelRef.current) {
          await ensureTensorFlowBackend();
          modelRef.current = await cocoSsd.load({ base: 'mobilenet_v2' });
        }
      } catch (error) {
        setCameraMessage(`Camera Ä‘Ă£ káº¿t ná»‘i nhÆ°ng chÆ°a táº£i Ä‘Æ°á»£c mÃ´ hÃ¬nh Ä‘áº¿m: ${error instanceof Error ? error.message : 'kiá»ƒm tra máº¡ng trÃªn thiáº¿t bá»‹'}. HĂ£y thá»­ láº¡i.`);
      }
      setCameraMessage('Camera đã sẵn sàng. Khung hình được phân tích ngay trên thiết bị.');
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraState('error');
      setCameraMessage(error instanceof Error ? error.message : 'Không thể mở camera hoặc tải mô hình đếm người.');
    }
  };
  const analyzeCamera = async () => {
    let model = modelRef.current;
    const video = videoRef.current;
    if (!model) {
      setCameraMessage('Äang thá»­ táº£i láº¡i mÃ´ hÃ¬nh Ä‘áº¿m ngÆ°á»iâ€¦');
      try {
        await ensureTensorFlowBackend();
        model = await cocoSsd.load({ base: 'mobilenet_v2' });
        modelRef.current = model;
      } catch (error) {
        setCameraMessage(`ChÆ°a táº£i Ä‘Æ°á»£c mÃ´ hÃ¬nh Ä‘áº¿m: ${error instanceof Error ? error.message : 'kiá»ƒm tra máº¡ng trÃªn thiáº¿t bá»‹'}.`);
        return;
      }
    }
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setCameraMessage('Camera chưa có khung hình để phân tích.');
      return;
    }
    setCameraState('counting');
    setCameraMessage('Đang ước lượng số người trong khung hình…');
    try {
      const detections = await model.detect(video);
      const people = detections.filter((detection) => detection.class === 'person' && detection.score >= 0.4);
      const estimate = people.length;
      const score = people.length
        ? people.reduce((total, detection) => total + detection.score, 0) / people.length
        : 0.5;
      const normalizedConfidence = Math.round(score * 100) / 100;
      setCameraCount(estimate);
      setCount(String(estimate));
      setConfidence(String(normalizedConfidence));
      createCount.mutate(
        { sessionId: id, data: { estimatedCount: estimate, confidence: normalizedConfidence, source: 'camera' } },
        {
          onSuccess: () => {
            setCameraMessage('Đã lưu số đếm ước lượng. Giảng viên cần xác nhận mọi chênh lệch.');
            void qc.invalidateQueries({ queryKey: getGetSessionReconciliationQueryKey(id) });
          },
          onError: (error) => setCameraMessage(`Không lưu được số đếm: ${errorText(error)}`),
        },
      );
    } catch (error) {
      setCameraMessage(error instanceof Error ? error.message : 'Không thể phân tích khung hình.');
    } finally {
      setCameraState('ready');
    }
  };
  const handleClose = () => {
    if (!window.confirm('Kết thúc buổi điểm danh này?')) return;
    closeSession.mutate({ sessionId: id }, { onSuccess: invalidateSessionData });
  };
  if (!id) return <main className="page-wrap"><ErrorState error={new Error('Mã buổi học không hợp lệ.')} retry={() => {}} /></main>;
  return (
    <main className="page-wrap">
      {session.isLoading ? <LoadingState label="Đang tải buổi điểm danh…" /> : session.isError ? <ErrorState error={session.error} retry={refresh} /> : item ? (
        <>
          <PageHeading eyebrow={`Buổi học #${item.id} · ${dateTime(item.startedAt)}`} title={item.className} subtitle={`${item.subject} · Mã QR dành riêng cho sinh viên của lớp học phần`} action={item.status === 'active' ? <button className="btn danger" onClick={handleClose} disabled={closeSession.isPending} data-testid="button-close-session">{closeSession.isPending ? <LoaderCircle /> : <X />} Kết thúc buổi</button> : <StatusPill status={item.status} />} />
          {closeSession.isError && <div className="error-banner">{errorText(closeSession.error)}</div>}
          <div className="session-layout">
            <section>
              <div className="card section-card" style={{ marginBottom: 15 }}>
                <div className="section-head"><div><h2>Danh sách điểm danh</h2><div className="section-kicker">{presentCount + lateCount} đã xác nhận trên {(records.data?.length ?? 0) + missingStudents.length} sinh viên · QR đổi mỗi 45 giây, muộn sau 15 phút</div></div><button className="icon-button" onClick={refresh} aria-label="Làm mới dữ liệu điểm danh" data-testid="button-refresh-session"><RefreshCw /></button></div>
                <div className="tally compact"><div className="tally-item ok"><strong data-testid="text-count-present">{presentCount}</strong><span>Có mặt</span></div><div className="tally-item late"><strong data-testid="text-count-late">{lateCount}</strong><span>Đi muộn</span></div><div className="tally-item absent"><strong data-testid="text-count-absent">{absentCount}</strong><span>Vắng</span></div></div>
                {records.isLoading ? <LoadingState label="Đang cập nhật điểm danh…" /> : records.isError ? <ErrorState error={records.error} retry={() => void records.refetch()} /> : !records.data?.length && !missingStudents.length ? <EmptyState title="Chưa có sinh viên trong phiên" detail="Danh sách lớp học phần đang trống." /> : (
                  <div className="table-wrap"><table><thead><tr><th>Sinh viên</th><th>Thời gian quét</th><th>Trạng thái</th><th>Điều chỉnh</th></tr></thead><tbody>
                    {(records.data ?? []).map((record) => <AttendanceRecordRow key={record.id} record={record} onSaved={invalidateSessionData} />)}
                    {missingStudents.map((st) => <ManualCheckInRow key={`m-${st.id}`} sessionId={id} qrToken={item.qrToken} active={item.status === 'active'} student={st} onSaved={invalidateSessionData} />)}
                  </tbody></table></div>
                )}
              </div>
              <div className="card section-card">
                <div className="section-head"><div><h2>Đối chiếu sĩ số</h2><div className="section-kicker">Tham khảo số lượng tổng hợp bên cạnh QR xác nhận cá nhân</div></div><span className={`pill ${reconciliation.data?.needsReview ? 'review' : ''}`}>{reconciliation.data?.needsReview ? 'Cần xem lại' : 'Tham khảo'}</span></div>
                {reconciliation.isLoading ? <LoadingState label="Đang tải số liệu đối chiếu…" /> : reconciliation.isError ? <ErrorState error={reconciliation.error} retry={() => void reconciliation.refetch()} /> : (
                  <>
                    <div className="compare-numbers">
                      <div className="compare-number"><span>QR đã xác nhận</span><strong data-testid="text-qr-count">{reconciliation.data?.checkedInCount ?? item.checkedInCount}</strong></div>
                      <div className="compare-number"><span>Số lượng tổng hợp</span><strong data-testid="text-estimated-count">{reconciliation.data?.estimatedCount ?? '—'}</strong></div>
                    </div>
                    <div className="notice" data-testid="text-reconciliation-message">{reconciliation.data?.message ?? 'Chưa có lượt đếm tổng hợp. Camera chưa kết nối.'}{reconciliation.data?.difference !== null && reconciliation.data?.difference !== undefined ? ` Chênh lệch: ${reconciliation.data.difference}.` : ''}</div>
                  </>
                )}
              </div>
            </section>
            <aside>
              <div className="card qr-card">
                <div className="eyebrow">Điểm danh bằng QR</div><h2>Quét để mở biểu mẫu</h2><p className="section-kicker">Sinh viên quét bằng tài khoản đã đăng nhập.</p>
                {item.status === 'active' ? (
                  <>
                    <div className="qr-frame" data-testid="qr-code-display">{qrImage ? <img src={qrImage} alt={`Mã QR điểm danh ${item.className}`} data-testid="img-session-qr" /> : <div className="loading-row">Đang tạo mã QR…</div>}</div>
                    <div className="token-line" data-testid="text-qr-token">{item.qrToken}</div>
                    <a href={checkInHref(item.qrToken)} className="text-link" data-testid="link-checkin-token">Mở liên kết điểm danh <ExternalLink size={12} style={{ verticalAlign: 'middle' }} /></a>
                    <p className="qr-note" style={{ marginTop: 13 }}>Mã hết hạn lúc {dateTime(item.qrExpiresAt)}. Chỉ xác nhận sau khi máy chủ phản hồi thành công.</p>
                  </>
                ) : <div className="notice" data-testid="status-session-qr-closed">Buổi điểm danh đã kết thúc. Mã QR không còn hiệu lực.</div>}
              </div>
               <div className="card section-card" style={{ marginTop: 14 }}>
                <div className="section-head"><div><h2>Đếm sĩ số tổng hợp</h2><div className="section-kicker">AI chạy trên thiết bị · chỉ đếm người</div></div><Camera size={17} color="#71877a" /></div>
                <video ref={videoRef} className={`camera-video ${cameraState === 'ready' || cameraState === 'counting' ? 'visible' : ''}`} autoPlay playsInline muted aria-label="Xem trước camera; chỉ đếm người, không nhận diện danh tính" data-testid="video-camera-preview" />
                {item.status !== 'active' ? <div className="notice">Đã kết thúc buổi học. Camera không chạy cho phiên này.</div> : (
                  <>
                {cameraState === 'idle' || cameraState === 'error' ? <div className="camera-box" data-testid="camera-disconnected-state"><div><VideoOff /><strong>{cameraState === 'error' ? 'Không mở được camera' : 'Camera chưa kết nối'}</strong><span>{cameraMessage || 'Kết nối camera có sẵn trên thiết bị này để thử đếm người trực tiếp.'}</span></div></div> : null}
                {cameraMessage && cameraState !== 'idle' && cameraState !== 'error' && <div className="camera-message" role="status" data-testid="status-camera">{cameraMessage}</div>}
                {cameraCount !== null && <div className="camera-result" data-testid="text-camera-count">Lần đếm gần nhất: <strong>{cameraCount} người</strong></div>}
                <div className="camera-actions">
                  {cameraState === 'idle' || cameraState === 'error' || cameraState === 'starting'
                    ? <button type="button" className="btn secondary" onClick={() => void startCamera()} disabled={cameraState === 'starting'} data-testid="button-connect-camera">{cameraState === 'starting' ? <LoaderCircle /> : <VideoOff />}{cameraState === 'starting' ? 'Đang kết nối…' : 'Kết nối camera'}</button>
                    : <><button type="button" className="btn" onClick={() => void analyzeCamera()} disabled={cameraState !== 'ready' || createCount.isPending} data-testid="button-analyze-camera">{cameraState === 'counting' || createCount.isPending ? <LoaderCircle /> : <Users />} Phân tích một khung hình</button><button type="button" className="btn ghost" onClick={stopCamera} data-testid="button-stop-camera">Ngắt camera</button></>}
                </div>
                <div className="camera-footnote">Camera chỉ cung cấp ước lượng số lượng; mô hình không nhận diện danh tính. Độ che khuất và góc máy có thể làm sai số.</div>
                <details className="manual-count-details">
                  <summary>Nhập số đếm thử nghiệm thủ công</summary>
                <form onSubmit={saveCount} className="camera-form" data-testid="form-count-snapshot">
                  <input type="number" min="0" step="1" required className="field" placeholder="Số lượng" aria-label="Số lượng tổng hợp" value={count} onChange={(e) => setCount(e.target.value)} data-testid="input-estimated-count" />
                  <input type="number" min="0" max="1" step="0.01" required className="field" aria-label="Độ tin cậy" value={confidence} onChange={(e) => setConfidence(e.target.value)} data-testid="input-count-confidence" />
                  <button className="btn secondary" type="submit" disabled={createCount.isPending} data-testid="button-save-count">{createCount.isPending ? <LoaderCircle /> : <Plus />} Lưu số đếm thủ công</button>
                </form>
                </details>
                  </>
                )}
                {createCount.isError && <div className="error-banner" role="alert">{errorText(createCount.error)}</div>}
                {createCount.isSuccess && <div className="success-banner" data-testid="status-count-saved">Đã lưu số đếm tham khảo. Giảng viên cần xác nhận mọi chênh lệch.</div>}
                <div className="privacy-strip"><strong>Chỉ xử lý số đếm.</strong> Khung hình được xử lý trong trình duyệt; chỉ số đếm và độ tin cậy được gửi, không lưu hình ảnh hay danh tính.</div>
              </div>
            </aside>
          </div>
        </>
      ) : <EmptyState title="Không tìm thấy buổi học" detail="Buổi học có thể đã bị xóa hoặc mã không chính xác." />}
    </main>
  );
}

export function CheckInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const searchToken = new URLSearchParams(window.location.search).get('token') ?? '';
  const token = searchToken.trim();
  const currentUser = useGetCurrentSchoolUser({
    query: { enabled: isLoaded && !!isSignedIn, queryKey: getGetCurrentSchoolUserQueryKey() },
  });
  const qrSession = useGetQrCheckInSession(token, {
    query: {
      enabled: isLoaded && !!isSignedIn && currentUser.data?.role === 'student' && !!token,
      queryKey: getGetQrCheckInSessionQueryKey(token),
    },
  });
  const checkIn = useCreateQrStudentCheckIn();
  const [submittedRecord, setSubmittedRecord] = useState<AttendanceRecord | null>(null);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [locatingStudent, setLocatingStudent] = useState(false);
  const submittedToken = useRef('');
  const student = currentUser.data;

  useEffect(() => {
    submittedToken.current = '';
    setSubmittedRecord(null);
    setAlreadyCheckedIn(false);
    setSubmitError('');
  }, [token]);

  const requestLocationAndCheckIn = () => {
    if (locatingStudent || checkIn.isPending || submittedToken.current === token) return;
    setSubmitError('');
    if (!navigator.geolocation) {
      setSubmitError('Trình duyệt này không hỗ trợ lấy vị trí. Hãy thử bằng điện thoại có GPS.');
      return;
    }
    setLocatingStudent(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocatingStudent(false);
        submittedToken.current = token;
        checkIn.mutate({
          token,
          data: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
          },
        }, {
          onSuccess: (record) => {
            setSubmittedRecord(record);
            setAlreadyCheckedIn(false);
          },
          onError: (error) => {
            const apiError = error as { status?: number; data?: unknown };
            if (apiError.status === 409 && apiError.data && typeof apiError.data === 'object' && 'id' in apiError.data) {
              setSubmittedRecord(apiError.data as AttendanceRecord);
              setAlreadyCheckedIn(true);
              return;
            }
            submittedToken.current = '';
            setSubmitError(errorText(error));
          },
        });
      },
      (error) => {
        setLocatingStudent(false);
        setSubmitError(
          error.code === error.PERMISSION_DENIED
            ? 'Bạn chưa cấp quyền vị trí. Hãy cho phép trình duyệt dùng vị trí rồi thử lại.'
            : error.code === error.TIMEOUT
              ? 'Lấy vị trí quá lâu. Hãy bật GPS và thử lại.'
              : 'Không lấy được vị trí. Hãy bật GPS và thử lại.',
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const signInHref = `/sign-in?returnTo=${encodeURIComponent(`/check-in?token=${encodeURIComponent(token)}`)}`;
  const retryCheckIn = () => {
    submittedToken.current = '';
    setSubmittedRecord(null);
    setAlreadyCheckedIn(false);
    setSubmitError('');
    void qrSession.refetch();
  };
  return (
    <main className="page-wrap">
      <div className="checkin-wrap">
        <div className="checkin-brand"><span className="brand-icon">Đ</span><div><div className="brand-name">Điểm danh</div><div className="brand-caption" style={{ color: '#65756d' }}>Cổng xác nhận sinh viên</div></div></div>
        <section className="card checkin-card">
          <div className="eyebrow">Xác nhận có mặt</div>
          {!token ? <>
            <h1>Chưa có mã QR buổi học</h1>
            <p className="page-subtitle">Hãy quét mã QR đang được giảng viên hiển thị để mở đúng phiên điểm danh.</p>
          </> : <>
            <h1>{submittedRecord ? (alreadyCheckedIn ? 'Bạn đã điểm danh rồi' : 'Điểm danh thành công') : 'Xác nhận có mặt'}</h1>
            <p className="page-subtitle">Mã QR được xác nhận bằng tài khoản trường đã liên kết với hồ sơ sinh viên. Không cần nhập mã sinh viên.</p>
            {!isLoaded || (isSignedIn && currentUser.isLoading) ? <div style={{ marginTop: 17 }}><LoadingState label="Đang xác minh tài khoản…" /></div> :
              !isSignedIn ? <div className="form-stack" style={{ marginTop: 18 }}>
                <div className="notice">Đăng nhập bằng tài khoản sinh viên đã được nhà trường liên kết để hệ thống ghi nhận có mặt.</div>
                <Link className="btn" href={signInHref} data-testid="link-checkin-sign-in">Đăng nhập để điểm danh</Link>
                <p className="form-help">Sau khi đăng nhập, bạn sẽ quay lại đúng mã QR này.</p>
              </div> :
                currentUser.isError ? <div className="form-stack"><ErrorState error={currentUser.error} retry={() => void currentUser.refetch()} /><button className="btn secondary" onClick={() => void signOut({ redirectUrl: `${appBasePath}/sign-in` })} data-testid="button-checkin-sign-out"><LogOut /> Đăng xuất / đổi tài khoản</button></div> :
                  student?.role === 'pending' ? <div className="notice" role="status">Tài khoản đang chờ quản trị viên cấp vai trò sinh viên.</div> :
                    student?.role !== 'student' ? <div className="form-stack"><div className="notice" role="status">Mã QR điểm danh chỉ dành cho tài khoản sinh viên. Hãy đăng xuất và dùng tài khoản sinh viên đã được liên kết.</div><button className="btn secondary" onClick={() => void signOut({ redirectUrl: `${appBasePath}/sign-in` })} data-testid="button-checkin-sign-out"><LogOut /> Đăng xuất / đổi tài khoản</button></div> :
                      !student.studentId ? <div className="notice" role="status">Tài khoản chưa được liên kết với hồ sơ sinh viên. Hãy nhờ quản trị viên hoàn tất liên kết trước khi điểm danh.</div> :
                        qrSession.isLoading ? <div style={{ marginTop: 17 }}><LoadingState label="Đang xác minh mã QR…" /></div> :
                          qrSession.isError ? <div className="error-banner" role="alert" data-testid="status-checkin-error">{errorText(qrSession.error)}<button className="text-link" style={{ marginLeft: 8 }} onClick={() => void qrSession.refetch()}>Thử lại</button></div> :
                          qrSession.data && !submittedRecord && <div className="form-stack" style={{ marginTop: 17 }}>
                            <div className="notice">
                              <strong>{qrSession.data.className} · {qrSession.data.subject}</strong><br />
                              Mã QR hợp lệ đến {dateTime(qrSession.data.qrExpiresAt)}.<br />
                              Cần ở trong bán kính {qrSession.data.checkInRadiusMeters} m của lớp. Vị trí chỉ được kiểm tra lúc quét.
                            </div>
                            <button className="btn" type="button" onClick={requestLocationAndCheckIn} disabled={locatingStudent || checkIn.isPending} data-testid="button-checkin-with-location">
                              {locatingStudent ? <LoaderCircle /> : <MapPin />} {locatingStudent ? 'Đang lấy vị trí…' : 'Cho phép vị trí và điểm danh'}
                            </button>
                          </div>
            }
            {checkIn.isPending && <div style={{ marginTop: 17 }}><LoadingState label="Đang ghi nhận điểm danh…" /></div>}
            {submitError && <div className="error-banner" role="alert" data-testid="status-checkin-error">{submitError}<button className="text-link" style={{ marginLeft: 8 }} onClick={retryCheckIn}>Thử lại</button></div>}
            {submittedRecord && <div className="success-banner" role="status" data-testid="status-checkin-success"><strong>{alreadyCheckedIn ? 'Điểm danh đã được ghi nhận trước đó.' : 'Máy chủ đã xác nhận điểm danh.'}</strong><br />{submittedRecord.studentName} · {submittedRecord.studentCode} · {dateTime(submittedRecord.checkedInAt)}</div>}
          </>}
          <div className="privacy-strip" style={{ marginTop: 18 }}><strong>Không nhận diện khuôn mặt.</strong> Điểm danh gắn với tài khoản trường và hồ sơ sinh viên đã được xác minh.</div>
        </section>
      </div>
    </main>
  );
}

