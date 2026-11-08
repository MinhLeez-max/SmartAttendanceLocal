import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getListAcademicSectionsQueryKey, getListAcademicStudentsQueryKey, getListSchoolUsersQueryKey, useCreateAcademicStudent, useGetAcademicCatalog, useListAcademicStudents, useUpdateAcademicStudent } from '@workspace/api-client-react';
import type { AcademicStudent } from '@workspace/api-client-react';
import { ArrowRightLeft, Link2, LoaderCircle, Pencil, Plus, RefreshCw, Search, UserRound, UsersRound } from 'lucide-react';
import { EmptyState, ErrorState, Field, LoadingState, Modal, PageHeading } from '@/components/portal-ui';
import { errorText } from '@/lib/portal';

export function AcademicStudentsPage() {
  const students = useListAcademicStudents();
  const catalog = useGetAcademicCatalog();
  const [search, setSearch] = useState('');
  const [cohort, setCohort] = useState('');
  const [status, setStatus] = useState<'active' | 'all' | 'inactive'>('active');
  const [editing, setEditing] = useState<AcademicStudent | 'new' | null>(null);
  const [transferMode, setTransferMode] = useState(false);
  const cohorts = catalog.data?.cohorts ?? [];
  const list = useMemo(() => (students.data ?? []).filter((s) =>
    (status === 'all' || (status === 'active' ? s.active : !s.active)) &&
    (!cohort || (cohort === 'none' ? s.cohortId == null : String(s.cohortId) === cohort)) &&
    `${s.fullName} ${s.studentCode} ${s.cohortName ?? ''}`.toLowerCase().includes(search.toLowerCase())), [students.data, search, cohort, status]);
  const all = students.data ?? [];
  const unlinked = all.filter((s) => s.active && s.accountId == null).length;
  const noCohort = all.filter((s) => s.active && s.cohortId == null).length;
  return <main className="page-wrap">
    <PageHeading eyebrow="Danh bạ sinh viên" title="Sinh viên toàn trường" subtitle="Mỗi sinh viên có một danh tính và một mã duy nhất, dùng chung cho mọi lớp học phần."
      action={<button className="btn" onClick={() => { setTransferMode(false); setEditing('new'); }} data-testid="button-create-student"><Plus /> Thêm sinh viên</button>} />
    <div className="stat-grid">
      <div className="card stat-card"><div className="stat-top"><span>Đang học</span><span className="stat-icon"><UsersRound /></span></div><div className="stat-value" data-testid="text-active-students">{students.isLoading ? '–' : all.filter((s) => s.active).length}</div><div className="stat-foot">Trên {all.length} hồ sơ</div></div>
      <div className="card stat-card"><div className="stat-top"><span>Lớp hành chính</span><span className="stat-icon"><UserRound /></span></div><div className="stat-value">{cohorts.filter((c) => c.active).length}</div><div className="stat-foot"><Link href="/academic" className="text-link">Quản lý danh mục</Link></div></div>
      <div className="card stat-card"><div className="stat-top"><span>Chưa liên kết tài khoản</span><span className="stat-icon"><Link2 /></span></div><div className="stat-value">{unlinked}</div><div className="stat-foot"><Link href="/admin/users" className="text-link">Liên kết tại Tài khoản</Link></div></div>
      <div className="card stat-card"><div className="stat-top"><span>Thiếu lớp hành chính</span><span className="stat-icon"><ArrowRightLeft /></span></div><div className="stat-value">{noCohort}</div><div className="stat-foot">Cần bổ sung để hoàn thiện hồ sơ</div></div>
    </div>
    <section className="card section-card">
      <div className="filter-bar">
        <div className="toolbar">
          <label className="search-field"><Search /><input className="field" placeholder="Tên hoặc mã sinh viên…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-students" /></label>
          <select className="select-field" value={cohort} onChange={(e) => setCohort(e.target.value)} data-testid="select-filter-cohort"><option value="">Mọi lớp hành chính</option><option value="none">Chưa có lớp hành chính</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}{c.active ? '' : ' (đã ngừng)'}</option>)}</select>
          <select className="select-field" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} data-testid="select-filter-status"><option value="active">Đang học</option><option value="inactive">Ngừng hoạt động</option><option value="all">Tất cả</option></select>
          <span className="page-subtitle">{list.length} sinh viên</span>
        </div>
        <button className="icon-button" onClick={() => void students.refetch()} aria-label="Làm mới" data-testid="button-refresh-students"><RefreshCw /></button>
      </div>
      {students.isLoading ? <LoadingState rows={4} label="Đang tải danh bạ…" /> : students.isError ? <ErrorState error={students.error} retry={() => void students.refetch()} /> : !list.length ?
        <EmptyState icon={<UsersRound />} title={all.length ? 'Không có sinh viên phù hợp' : 'Danh bạ còn trống'} detail={all.length ? 'Đổi bộ lọc để xem thêm.' : 'Thêm sinh viên trước khi ghi danh vào lớp học phần.'} /> :
        <div className="table-wrap"><table><thead><tr><th>Sinh viên</th><th>Lớp hành chính</th><th>Tài khoản</th><th>Trạng thái</th><th></th></tr></thead><tbody>
          {list.map((s) => <tr key={s.id} className={s.active ? '' : 'row-muted'} data-testid={`row-academic-student-${s.id}`}>
            <td><div className="student-name">{s.fullName}</div><div className="student-code">{s.studentCode}</div></td>
            <td>{s.cohortName ?? <span className="setup-flag">Chưa xếp lớp</span>}</td>
            <td>{s.accountId ? <span className="pill">Đã liên kết</span> : <span className="pill closed">Chưa liên kết</span>}</td>
            <td><span className={`pill ${s.active ? '' : 'closed'}`}>{s.active ? 'Đang học' : 'Ngừng'}</span></td>
            <td><div className="row-actions">
              <button className="icon-button" title="Chuyển lớp hành chính" aria-label="Chuyển lớp hành chính" onClick={() => { setTransferMode(true); setEditing(s); }} data-testid={`button-transfer-student-${s.id}`}><ArrowRightLeft /></button>
              <button className="icon-button" title="Sửa hồ sơ" aria-label="Sửa hồ sơ" onClick={() => { setTransferMode(false); setEditing(s); }} data-testid={`button-edit-student-${s.id}`}><Pencil /></button>
            </div></td>
          </tr>)}
        </tbody></table></div>}
    </section>
    {editing && <StudentDialog student={editing === 'new' ? null : editing} transfer={transferMode} cohorts={cohorts} onClose={() => setEditing(null)} />}
  </main>;
}

function StudentDialog({ student, transfer, cohorts, onClose }: { student: AcademicStudent | null; transfer: boolean; cohorts: { id: number; code: string; name: string; active: boolean }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const create = useCreateAcademicStudent();
  const update = useUpdateAcademicStudent();
  const [form, setForm] = useState({ fullName: student?.fullName ?? '', studentCode: student?.studentCode ?? '', cohortId: student?.cohortId ? String(student.cohortId) : '', active: student?.active ?? true });
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    const data = { fullName: form.fullName.trim(), studentCode: form.studentCode.trim(), cohortId: form.cohortId ? Number(form.cohortId) : null, active: form.active };
    const opts = {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListAcademicStudentsQueryKey() });
        void qc.invalidateQueries({ queryKey: getListSchoolUsersQueryKey() });
        void qc.invalidateQueries({ queryKey: getListAcademicSectionsQueryKey() });
        onClose();
      }, onError: (err: unknown) => setError(errorText(err)),
    };
    if (student) update.mutate({ id: student.id, data }, opts); else create.mutate({ data }, opts);
  };
  const pending = create.isPending || update.isPending;
  const current = cohorts.find((c) => c.id === student?.cohortId);
  return <Modal eyebrow={transfer ? 'Chuyển lớp hành chính' : 'Hồ sơ sinh viên'} title={transfer && student ? student.fullName : student ? 'Sửa hồ sơ sinh viên' : 'Thêm sinh viên'} subtitle={transfer ? `Hiện tại: ${current ? `${current.code} · ${current.name}` : 'chưa xếp lớp'}. Lớp học phần đã ghi danh không bị ảnh hưởng.` : 'Mã sinh viên phải duy nhất trong toàn trường.'} onClose={onClose}>
    <form className="field-grid" onSubmit={submit} data-testid="form-academic-student">
      {!transfer && <><Field label="Họ và tên"><input className="field" required maxLength={200} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Nguyễn Minh Anh" data-testid="input-student-fullname" /></Field>
        <Field label="Mã sinh viên"><input className="field" required maxLength={60} value={form.studentCode} onChange={(e) => setForm({ ...form, studentCode: e.target.value })} placeholder="22021347" data-testid="input-student-code" /></Field></>}
      <Field label={transfer ? 'Chuyển đến lớp hành chính' : 'Lớp hành chính'} span><select className="select-field" value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value })} data-testid="select-student-cohort">
        <option value="">Chưa xếp lớp</option>{cohorts.filter((c) => c.active || c.id === student?.cohortId).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
      {!transfer && <label className="check-inline span-all"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} data-testid="checkbox-student-active" /> Đang học (bỏ chọn để lưu trữ, không xóa lịch sử)</label>}
      {error && <div className="error-banner span-all" role="alert">{error}</div>}
      <div className="modal-actions span-all"><button type="button" className="btn secondary" onClick={onClose}>Hủy</button>
        <button className="btn" type="submit" disabled={pending || (transfer && String(student?.cohortId ?? '') === form.cohortId)} data-testid="button-save-student">{pending ? <LoaderCircle /> : transfer ? <ArrowRightLeft /> : <Plus />} {transfer ? 'Xác nhận chuyển' : student ? 'Lưu hồ sơ' : 'Thêm sinh viên'}</button></div>
    </form>
  </Modal>;
}
