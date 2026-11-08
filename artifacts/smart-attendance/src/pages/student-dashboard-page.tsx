import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { getGetMyAcademicAttendanceQueryKey, useGetAcademicCatalog, useGetCurrentSchoolUser, useGetMyAcademicAttendance, useListAcademicSections } from '@workspace/api-client-react';
import { BookMarked, CalendarDays, CheckCheck, Clock3, RefreshCw, UserX } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '@/components/portal-ui';
import { QrScanner } from '@/components/qr-scanner';
import { initials, longDate, statusText } from '@/lib/portal';

export function StudentDashboardPage() {
  const me = useGetCurrentSchoolUser();
  const sections = useListAcademicSections();
  const catalog = useGetAcademicCatalog();
  const [semesterId, setSemesterId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [classId, setClassId] = useState('');
  const params = useMemo(() => ({ ...(semesterId ? { semesterId: Number(semesterId) } : {}), ...(subjectId ? { subjectId: Number(subjectId) } : {}), ...(classId ? { classId: Number(classId) } : {}) }), [semesterId, subjectId, classId]);
  const attendance = useGetMyAcademicAttendance(params, { query: { queryKey: getGetMyAcademicAttendanceQueryKey(params), refetchInterval: 60_000 } });
  const user = me.data;
  const semName = new Map((catalog.data?.semesters ?? []).map((s) => [s.id, s.name]));
  const mySections = (sections.data ?? []).filter((s) => (!semesterId || String(s.semesterId) === semesterId) && (!subjectId || String(s.subjectId) === subjectId));
  const a = attendance.data;
  const total = a ? a.present + a.late + a.absent : 0;
  const rate = total ? ((a!.present + a!.late) / total) * 100 : 0;
  return <main className="page-wrap">
    <section className="student-hero" data-testid="section-student-hero">
      <div className="hero-avatar">{initials(user?.studentName || user?.displayName)}</div>
      <div><div className="eyebrow" style={{ color: '#e9cf91' }}>Không gian sinh viên</div>
        <h1 data-testid="text-student-name">{user?.studentName || user?.displayName || 'Sinh viên'}</h1>
        <div className="hero-facts"><span>MSSV <strong data-testid="text-student-code">{user?.studentCode ?? 'chưa liên kết'}</strong></span><span>Lớp hành chính <strong>{user?.cohortName ?? 'chưa xếp'}</strong></span>{user?.major && <span>Ngành <strong>{user.major}</strong></span>}</div></div>
      <div className="hero-actions"><Link href="/timetable" className="btn" data-testid="link-student-timetable"><CalendarDays /> Thời khóa biểu</Link><Link href="/profile" className="btn secondary" data-testid="link-student-profile">Hồ sơ</Link></div>
    </section>
    {!user?.studentId && <div className="notice" style={{ marginTop: 14 }}>Tài khoản chưa được liên kết với hồ sơ sinh viên. Hãy nhờ quản trị viên kết nối trước khi điểm danh.</div>}
    <div className="dashboard-grid" style={{ marginTop: 18 }}>
      <section className="card section-card">
        <div className="section-head"><div><h2>Điểm danh buổi học</h2><div className="section-kicker">Quét mã QR giảng viên đang chiếu; hệ thống dùng tài khoản đã đăng nhập của bạn.</div></div><span className="subject-chip">QR · 45 GIÂY</span></div>
        <QrScanner />
        <p className="form-help">Cũng có thể quét bằng ứng dụng Camera của điện thoại: liên kết sẽ mở trang điểm danh, đăng nhập và quay lại đúng phiên.</p>
      </section>
      <section className="card section-card">
        <div className="section-head"><div><h2>Lớp học phần của tôi</h2><div className="section-kicker">{mySections.length} lớp trong phạm vi lọc</div></div><BookMarked size={17} color="#71877a" /></div>
        {sections.isLoading ? <LoadingState rows={2} label="Đang tải lớp…" /> : sections.isError ? <ErrorState error={sections.error} retry={() => void sections.refetch()} /> : !mySections.length ? <EmptyState title="Chưa ghi danh lớp nào" detail="Phòng đào tạo sẽ thêm bạn vào lớp học phần." /> :
          <div className="mini-list">{mySections.map((s) => <button key={s.id} className={`mini-row ${classId === String(s.id) ? 'on' : ''}`} onClick={() => setClassId(classId === String(s.id) ? '' : String(s.id))} data-testid={`button-student-section-${s.id}`}>
            <span className="code-tag">{s.code ?? '—'}</span><span><strong>{s.name}</strong><small>{s.subject} · {s.semesterId ? semName.get(s.semesterId) ?? '' : ''} · {s.room}</small></span></button>)}</div>}
      </section>
    </div>
    <section className="card section-card" style={{ marginTop: 18 }}>
      <div className="section-head"><div><h2>Lịch sử điểm danh</h2><div className="section-kicker">Chỉ hiển thị kết quả của chính bạn</div></div><button className="icon-button" onClick={() => void attendance.refetch()} aria-label="Làm mới" data-testid="button-refresh-my-attendance"><RefreshCw /></button></div>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <select className="select-field" value={semesterId} onChange={(e) => setSemesterId(e.target.value)} data-testid="select-my-semester"><option value="">Mọi học kỳ</option>{(catalog.data?.semesters ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="select-field" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} data-testid="select-my-subject"><option value="">Mọi môn</option>{(catalog.data?.subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="select-field" value={classId} onChange={(e) => setClassId(e.target.value)} data-testid="select-my-class"><option value="">Mọi lớp học phần</option>{(sections.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.code ?? '—'} · {s.name}</option>)}</select>
      </div>
      {attendance.isLoading ? <LoadingState rows={3} label="Đang tải kết quả…" /> : attendance.isError ? <ErrorState error={attendance.error} retry={() => void attendance.refetch()} /> : <>
        <div className="tally">
          <div className="tally-item ok"><CheckCheck /><strong data-testid="text-my-present">{a?.present ?? 0}</strong><span>Có mặt</span></div>
          <div className="tally-item late"><Clock3 /><strong data-testid="text-my-late">{a?.late ?? 0}</strong><span>Đi muộn</span></div>
          <div className="tally-item absent"><UserX /><strong data-testid="text-my-absent">{a?.absent ?? 0}</strong><span>Vắng</span></div>
          <div className="tally-item rate"><strong>{rate.toFixed(1)}%</strong><span>Chuyên cần</span><div className="meter" style={{ width: '100%' }}><span style={{ width: `${rate}%` }} /></div></div>
        </div>
        {!a?.rows.length ? <EmptyState title="Chưa có buổi được ghi nhận" detail="Kết quả xuất hiện sau khi giảng viên mở phiên điểm danh." /> :
          <div className="table-wrap"><table><thead><tr><th>Ngày</th><th>Lớp học phần</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead><tbody>
            {a.rows.map((r) => <tr key={r.id} data-testid={`row-my-attendance-${r.id}`}><td>{/^\d{4}-\d{2}-\d{2}$/.test(r.date) ? longDate(r.date) : r.date}</td><td><div className="student-name">{r.className}</div><div className="student-code">{r.subject}</div></td>
              <td><span className={`pill ${r.status === 'absent' ? 'review' : r.status === 'late' ? 'closed' : ''}`}>{statusText[r.status]}</span></td><td className="cell-detail">{r.note ?? '—'}</td></tr>)}
          </tbody></table></div>}
      </>}
    </section>
  </main>;
}
