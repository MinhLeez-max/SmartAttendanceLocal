import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListAcademicLessonsQueryKey, getListAcademicSectionsQueryKey, getListClassesQueryKey, getListSchoolUsersQueryKey,
  useCreateAcademicSection, useGetAcademicCatalog, useListAcademicSections, useListAcademicStudents, useListSchoolUsers, useUpdateAcademicSection,
} from '@workspace/api-client-react';
import type { AcademicSection } from '@workspace/api-client-react';
import { AlertTriangle, BookMarked, CalendarDays, DoorOpen, GraduationCap, LoaderCircle, Pencil, Plus, RefreshCw, Search, UsersRound } from 'lucide-react';
import { EmptyState, ErrorState, Field, LoadingState, Modal, PageHeading } from '@/components/portal-ui';
import { errorText } from '@/lib/portal';

export function AcademicSectionsPage() {
  const sections = useListAcademicSections();
  const catalog = useGetAcademicCatalog();
  const users = useListSchoolUsers({ query: { queryKey: getListSchoolUsersQueryKey() } });
  const [search, setSearch] = useState('');
  const [semester, setSemester] = useState('');
  const [onlySetup, setOnlySetup] = useState(false);
  const [editing, setEditing] = useState<AcademicSection | 'new' | null>(null);
  const teacherName = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.displayName || u.email])), [users.data]);
  const semesterName = useMemo(() => new Map((catalog.data?.semesters ?? []).map((s) => [s.id, s.name])), [catalog.data]);
  const all = sections.data ?? [];
  const list = all.filter((s) => (!semester || String(s.semesterId) === semester) && (!onlySetup || s.needsSetup.length > 0) &&
    `${s.code ?? ''} ${s.name} ${s.subject} ${s.room}`.toLowerCase().includes(search.toLowerCase()));
  const setupCount = all.filter((s) => s.needsSetup.length).length;
  return <main className="page-wrap">
    <PageHeading eyebrow="Tổ chức giảng dạy" title="Lớp học phần" subtitle="Mỗi lớp học phần là một môn trong một học kỳ, có phòng, giảng viên và danh sách sinh viên riêng."
      action={<button className="btn" onClick={() => setEditing('new')} data-testid="button-create-section"><Plus /> Tạo lớp học phần</button>} />
    {setupCount > 0 && <div className="notice setup-notice" role="status"><AlertTriangle size={15} /> <span><strong>{setupCount} lớp cần hoàn thiện.</strong> Đây thường là lớp chuyển từ dữ liệu cũ, thiếu môn, học kỳ hoặc phòng. Hệ thống không tự đoán thông tin còn thiếu.</span>
      <button className="text-link" onClick={() => setOnlySetup(true)} data-testid="button-filter-needs-setup">Chỉ xem các lớp này</button></div>}
    <div className="filter-bar">
      <div className="toolbar">
        <label className="search-field"><Search /><input className="field" placeholder="Mã, tên, môn, phòng…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-sections" /></label>
        <select className="select-field" value={semester} onChange={(e) => setSemester(e.target.value)} data-testid="select-filter-semester"><option value="">Mọi học kỳ</option>{(catalog.data?.semesters ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <label className="check-inline"><input type="checkbox" checked={onlySetup} onChange={(e) => setOnlySetup(e.target.checked)} data-testid="checkbox-only-setup" /> Cần hoàn thiện</label>
      </div>
      <button className="icon-button" onClick={() => void sections.refetch()} aria-label="Làm mới" data-testid="button-refresh-sections"><RefreshCw /></button>
    </div>
    {sections.isLoading ? <LoadingState rows={3} label="Đang tải lớp học phần…" /> : sections.isError ? <ErrorState error={sections.error} retry={() => void sections.refetch()} /> : !list.length ?
      <div className="card"><EmptyState icon={<BookMarked />} title={all.length ? 'Không có lớp phù hợp' : 'Chưa có lớp học phần'} detail={all.length ? 'Đổi bộ lọc để xem thêm.' : 'Hãy chuẩn bị học kỳ, môn và phòng trong Danh mục, rồi tạo lớp đầu tiên.'} action={!all.length && <Link href="/academic" className="btn secondary">Mở danh mục học vụ</Link>} /></div> :
      <div className="section-grid">
        {list.map((s) => <article key={s.id} className={`card section-tile ${s.active ? '' : 'row-muted'}`} data-testid={`card-section-${s.id}`}>
          <div className="class-card-top"><span className="subject-chip">{s.code ?? 'CHƯA CÓ MÃ'}</span>
            <button className="icon-button" onClick={() => setEditing(s)} aria-label={`Sửa ${s.name}`} data-testid={`button-edit-section-${s.id}`}><Pencil /></button></div>
          <div className="class-name">{s.name}</div>
          <div className="tile-meta"><span><BookMarked size={12} /> {s.subject || '—'}</span><span><CalendarDays size={12} /> {s.semesterId ? semesterName.get(s.semesterId) ?? `HK #${s.semesterId}` : 'Chưa có học kỳ'}</span><span><DoorOpen size={12} /> {s.room || '—'}</span></div>
          <div className="tile-meta"><span><GraduationCap size={12} /> {s.teacherIds.length ? s.teacherIds.map((id) => teacherName.get(id) ?? `#${id}`).join(', ') : 'Chưa phân công'}</span></div>
          {s.needsSetup.length > 0 && <ul className="setup-list">{s.needsSetup.map((m) => <li key={m}>{m}</li>)}</ul>}
          <div className="class-footer"><span><UsersRound size={12} style={{ verticalAlign: 'middle' }} /> {s.studentCount} sinh viên</span><span className={`pill ${s.active ? '' : 'closed'}`}>{s.active ? 'Đang mở' : 'Đã ngừng'}</span></div>
        </article>)}
      </div>}
    {editing && <SectionDialog section={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
  </main>;
}

function SectionDialog({ section, onClose }: { section: AcademicSection | null; onClose: () => void }) {
  const qc = useQueryClient();
  const catalog = useGetAcademicCatalog();
  const users = useListSchoolUsers({ query: { queryKey: getListSchoolUsersQueryKey() } });
  const students = useListAcademicStudents();
  const create = useCreateAcademicSection();
  const update = useUpdateAcademicSection();
  const [form, setForm] = useState({
    code: section?.code ?? '', name: section?.name ?? '', subjectId: section?.subjectId ? String(section.subjectId) : '',
    semesterId: section?.semesterId ? String(section.semesterId) : '', roomId: section?.roomId ? String(section.roomId) : '', active: section?.active ?? true,
  });
  const [teacherIds, setTeacherIds] = useState<number[]>(section?.teacherIds ?? []);
  const [studentIds, setStudentIds] = useState<number[]>(section?.studentIds ?? []);
  const [studentSearch, setStudentSearch] = useState('');
  const [cohortFilter, setCohortFilter] = useState('');
  const [error, setError] = useState('');
  const teachers = (users.data ?? []).filter((u) => u.role === 'teacher' && (u.active || teacherIds.includes(u.id)));
  const cat = catalog.data;
  const pool = (students.data ?? []).filter((s) => (s.active || studentIds.includes(s.id)) && (!cohortFilter || String(s.cohortId) === cohortFilter) &&
    `${s.fullName} ${s.studentCode}`.toLowerCase().includes(studentSearch.toLowerCase()));
  const toggle = (list: number[], id: number) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  const submit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (!form.subjectId || !form.semesterId || !form.roomId) { setError('Hãy chọn đủ môn học, học kỳ và phòng học.'); return; }
    const data = { code: form.code.trim(), name: form.name.trim(), subjectId: Number(form.subjectId), semesterId: Number(form.semesterId), roomId: Number(form.roomId), teacherIds, studentIds, active: form.active };
    const opts = {
      onSuccess: () => {
        for (const key of [getListAcademicSectionsQueryKey(), getListClassesQueryKey(), getListAcademicLessonsQueryKey(), getListSchoolUsersQueryKey()]) void qc.invalidateQueries({ queryKey: key });
        onClose();
      }, onError: (err: unknown) => setError(errorText(err)),
    };
    if (section) update.mutate({ id: section.id, data }, opts); else create.mutate({ data }, opts);
  };
  const pending = create.isPending || update.isPending;
  const opt = (items: { id: number; code: string; name: string; active: boolean }[] | undefined, current: string) => (items ?? []).filter((i) => i.active || String(i.id) === current).map((i) => <option key={i.id} value={i.id}>{i.code} · {i.name}</option>);
  return <Modal wide eyebrow="Lớp học phần" title={section ? `Sửa ${section.name}` : 'Tạo lớp học phần'} subtitle="Thêm sinh viên có thể bị từ chối nếu lịch học giao nhau; máy chủ sẽ nêu rõ sinh viên bị trùng." onClose={onClose}>
    <form onSubmit={submit} data-testid="form-section">
      <div className="field-grid three">
        <Field label="Mã lớp học phần"><input className="field" required maxLength={60} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="INT2204-1" data-testid="input-section-code" /></Field>
        <Field label="Tên hiển thị"><input className="field" required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lập trình hướng đối tượng - N1" data-testid="input-section-name" /></Field>
        <Field label="Môn học"><select className="select-field" required value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} data-testid="select-section-subject"><option value="">Chọn môn</option>{opt(cat?.subjects, form.subjectId)}</select></Field>
        <Field label="Học kỳ"><select className="select-field" required value={form.semesterId} onChange={(e) => setForm({ ...form, semesterId: e.target.value })} data-testid="select-section-semester"><option value="">Chọn học kỳ</option>{opt(cat?.semesters, form.semesterId)}</select></Field>
        <Field label="Phòng mặc định"><select className="select-field" required value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })} data-testid="select-section-room"><option value="">Chọn phòng</option>{opt(cat?.rooms, form.roomId)}</select></Field>
        <label className="check-inline" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} data-testid="checkbox-section-active" /> Đang mở</label>
      </div>
      {catalog.isError && <div className="error-banner">Không tải được danh mục: {errorText(catalog.error)}</div>}
      <div className="assign-grid">
        <fieldset className="assign-box"><legend className="form-label">Giảng viên phụ trách <em>{teacherIds.length}</em></legend>
          {users.isLoading ? <LoadingState label="Đang tải giảng viên…" /> : !teachers.length ? <div className="notice">Chưa có tài khoản giảng viên. Phân vai trò tại <Link href="/admin/users" className="text-link">Tài khoản</Link>.</div> :
            <div className="check-list">{teachers.map((t) => <label key={t.id} className={`check-item ${teacherIds.includes(t.id) ? 'on' : ''}`}><input type="checkbox" checked={teacherIds.includes(t.id)} onChange={() => setTeacherIds((l) => toggle(l, t.id))} data-testid={`checkbox-teacher-${t.id}`} /><span><strong>{t.displayName || t.email}</strong><small>{t.staffCode ?? 'Chưa có mã GV'} · {t.faculty ?? t.email}</small></span></label>)}</div>}
        </fieldset>
        <fieldset className="assign-box"><legend className="form-label">Sinh viên ghi danh <em>{studentIds.length}</em></legend>
          <div className="toolbar" style={{ marginBottom: 8 }}><input className="field" style={{ flex: 1 }} placeholder="Tìm sinh viên…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} data-testid="input-search-enroll" />
            <select className="select-field" value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)} data-testid="select-enroll-cohort"><option value="">Mọi lớp HC</option>{(cat?.cohorts ?? []).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
            <button type="button" className="btn ghost" onClick={() => setStudentIds((l) => Array.from(new Set([...l, ...pool.filter((s) => s.active).map((s) => s.id)])))} disabled={!pool.length} data-testid="button-enroll-visible">Chọn {pool.length} đang hiện</button></div>
          {students.isLoading ? <LoadingState label="Đang tải danh bạ…" /> : students.isError ? <div className="error-banner">{errorText(students.error)}</div> : !pool.length ? <div className="notice">Không có sinh viên phù hợp. <Link href="/academic/students" className="text-link">Mở danh bạ</Link></div> :
            <div className="check-list tall">{pool.map((s) => <label key={s.id} className={`check-item ${studentIds.includes(s.id) ? 'on' : ''}`}><input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => setStudentIds((l) => toggle(l, s.id))} data-testid={`checkbox-enroll-${s.id}`} /><span><strong>{s.fullName}</strong><small>{s.studentCode} · {s.cohortName ?? 'Chưa xếp lớp HC'}{s.active ? '' : ' · đã ngừng'}</small></span></label>)}</div>}
        </fieldset>
      </div>
      {error && <div className="error-banner" role="alert" data-testid="status-section-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Hủy</button>
        <button className="btn" type="submit" disabled={pending} data-testid="button-save-section">{pending ? <LoaderCircle /> : <Plus />} {section ? 'Lưu lớp học phần' : 'Tạo lớp học phần'}</button></div>
    </form>
  </Modal>;
}
