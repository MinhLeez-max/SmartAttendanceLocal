import { useMemo, useState } from 'react';
import { getGetAttendanceReportQueryKey, getListAcademicStudentsQueryKey, useGetAcademicCatalog, useGetAttendanceReport, useGetCurrentSchoolUser, useListAcademicSections, useListAcademicStudents } from '@workspace/api-client-react';
import { ArrowDownRight, ArrowUpRight, Download, FileBarChart2, RefreshCw } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, PageHeading } from '@/components/portal-ui';

export function ReportsPage() {
  const me = useGetCurrentSchoolUser();
  const isAdmin = me.data?.role === 'admin';
  const [semesterId, setSemesterId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const params = useMemo(() => ({
    ...(semesterId ? { semesterId: Number(semesterId) } : {}), ...(subjectId ? { subjectId: Number(subjectId) } : {}),
    ...(classId ? { classId: Number(classId) } : {}), ...(studentId ? { studentId: Number(studentId) } : {}),
  }), [semesterId, subjectId, classId, studentId]);
  const report = useGetAttendanceReport(params, { query: { queryKey: getGetAttendanceReportQueryKey(params) } });
  const catalog = useGetAcademicCatalog();
  const sections = useListAcademicSections();
  const students = useListAcademicStudents({ query: { enabled: isAdmin, queryKey: getListAcademicStudentsQueryKey() } });
  const sectionOptions = (sections.data ?? []).filter((s) => (!semesterId || String(s.semesterId) === semesterId) && (!subjectId || String(s.subjectId) === subjectId) && (!studentId || s.studentIds.includes(Number(studentId))));
  const filtered = !!(semesterId || subjectId || classId || studentId);
  const exportCsv = () => {
    if (!report.data) return;
    const csvRows = [['Lớp học phần', 'Sĩ số', 'Tỷ lệ có mặt', 'Số buổi'], ...report.data.rows.map((r) => [r.className, String(r.studentCount), r.attendanceRate == null ? 'Chưa có bản ghi' : `${r.attendanceRate.toFixed(1)}%`, String(r.sessionsCount)])];
    const csv = '\uFEFF' + csvRows.map((row) => row.map((v) => `"${v.replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'bao-cao-diem-danh.csv'; a.click(); URL.revokeObjectURL(url);
  };
  return <main className="page-wrap">
    <PageHeading eyebrow="Theo dõi chuyên cần" title="Báo cáo điểm danh" subtitle="Lọc theo học kỳ, môn, lớp học phần hoặc sinh viên trong phạm vi bạn được phép xem."
      action={<button className="btn secondary" onClick={exportCsv} disabled={!report.data?.rows.length} data-testid="button-export-report"><Download /> Tải CSV</button>} />
    <div className="filter-bar">
      <div className="toolbar">
        <select className="select-field" value={semesterId} onChange={(e) => { setSemesterId(e.target.value); setClassId(''); }} data-testid="select-report-semester"><option value="">Mọi học kỳ</option>{(catalog.data?.semesters ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="select-field" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setClassId(''); }} data-testid="select-report-subject"><option value="">Mọi môn</option>{(catalog.data?.subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="select-field" value={classId} onChange={(e) => setClassId(e.target.value)} data-testid="select-report-class"><option value="">Mọi lớp học phần</option>{sectionOptions.map((s) => <option key={s.id} value={s.id}>{s.code ?? '—'} · {s.name}</option>)}</select>
        {isAdmin && <select className="select-field" value={studentId} onChange={(e) => { setStudentId(e.target.value); setClassId(''); }} data-testid="select-report-student"><option value="">Mọi sinh viên</option>{(students.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.studentCode} · {s.fullName}</option>)}</select>}
        {filtered && <button className="text-link" onClick={() => { setSemesterId(''); setSubjectId(''); setClassId(''); setStudentId(''); }} data-testid="button-clear-report-filters">Bỏ lọc</button>}
      </div>
      <button className="icon-button" onClick={() => void report.refetch()} aria-label="Làm mới báo cáo" data-testid="button-refresh-report"><RefreshCw /></button>
    </div>
    {report.isLoading ? <LoadingState rows={3} label="Đang tổng hợp báo cáo…" /> : report.isError ? <ErrorState error={report.error} retry={() => void report.refetch()} /> : <>
      <section className="report-headline" data-testid="report-summary">
        <div><div className="eyebrow">{filtered ? 'Phạm vi đã lọc' : 'Toàn bộ phạm vi được phép'}</div><div className="report-stat">{report.data?.overallAttendanceRate == null ? '—' : `${report.data.overallAttendanceRate.toFixed(1)}%`}</div><div className="report-sub">{report.data?.overallAttendanceRate == null ? 'Chưa có bản ghi điểm danh' : 'Tỷ lệ có mặt trên bản ghi đã có (tính cả đi muộn)'}</div></div>
        <div className="report-side"><FileBarChart2 size={24} style={{ marginBottom: 8 }} /><br /><strong>{report.data?.totalSessions ?? 0}</strong> buổi đã ghi nhận</div>
      </section>
      <section className="card section-card">
        <div className="section-head"><div><h2>Chuyên cần theo lớp học phần</h2><div className="section-kicker">Phiên mới chốt danh sách khi mở; dữ liệu cũ chỉ tính các bản ghi đã có</div></div><span className="subject-chip">{report.data?.rows.length ?? 0} LỚP</span></div>
        {!report.data?.rows.length ? <EmptyState title="Chưa có dữ liệu phù hợp" detail={filtered ? 'Không có buổi điểm danh nào khớp bộ lọc.' : 'Báo cáo xuất hiện sau khi có buổi điểm danh.'} /> :
          <div className="table-wrap"><table><thead><tr><th>Lớp học phần</th><th>Sinh viên</th><th>Tỷ lệ có mặt</th><th>Số buổi</th><th>Xu hướng</th></tr></thead><tbody>
            {report.data.rows.map((r) => <tr key={r.classId} data-testid={`row-report-${r.classId}`}><td><div className="student-name">{r.className}</div><div className="student-code">Mã lớp {r.classId}</div></td><td>{r.studentCount}</td>
              <td>{r.attendanceRate == null ? <span className="form-help">Chưa có bản ghi</span> : <><div className="rate">{r.attendanceRate.toFixed(1)}%</div><div className="meter" style={{ width: 105 }}><span style={{ width: `${Math.max(0, Math.min(100, r.attendanceRate))}%` }} /></div></>}</td><td>{r.sessionsCount}</td>
              <td>{r.attendanceRate == null || report.data?.overallAttendanceRate == null ? '—' : r.attendanceRate >= report.data.overallAttendanceRate ? <span className="pill"><ArrowUpRight size={12} /> Trên TB</span> : <span className="pill closed"><ArrowDownRight size={12} /> Dưới TB</span>}</td></tr>)}
          </tbody></table></div>}
      </section>
      <p className="notice" style={{ marginTop: 15 }}>Tỷ lệ chỉ tính trên các bản ghi điểm danh đã có. Dữ liệu cũ thiếu bản ghi không bị tự tính là vắng; chưa có bản ghi thì chưa có tỷ lệ. Số đếm camera không thay thế kết quả điểm danh.</p>
    </>}
  </main>;
}
