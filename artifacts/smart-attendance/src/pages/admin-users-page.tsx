import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getGetCurrentSchoolUserQueryKey, getListAcademicSectionsQueryKey, getListAcademicStudentsQueryKey, getListClassesQueryKey, getListSchoolInvitationsQueryKey, getListSchoolUsersQueryKey,
  useCreateSchoolInvitation, useListAcademicSections, useListAcademicStudents, useListSchoolInvitations, useListSchoolUsers, useRevokeSchoolInvitation, useUpdateSchoolUser,
} from '@workspace/api-client-react';
import type { SchoolUser, SchoolUserUpdateInput } from '@workspace/api-client-react';
import { AlertCircle, Check, LoaderCircle, MailPlus, RefreshCw, Search, Send, ShieldCheck, UserCog, Users, X } from 'lucide-react';
import { EmptyState, Field } from '@/components/portal-ui';
import { errorText, roleText } from '@/lib/portal';

const invitationStatusText: Record<string, string> = { pending: 'Đang chờ', accepted: 'Đã chấp nhận', revoked: 'Đã hủy', expired: 'Đã hết hạn' };

export function AdminUsersPage() {
  const qc = useQueryClient();
  const users = useListSchoolUsers({ query: { queryKey: getListSchoolUsersQueryKey() } });
  const invitations = useListSchoolInvitations();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const createInvitation = useCreateSchoolInvitation();
  const revokeInvitation = useRevokeSchoolInvitation();
  const all = users.data ?? [];
  const list = all.filter((u) => (!roleFilter || (roleFilter === 'inactive' ? !u.active : u.role === roleFilter)) && `${u.displayName} ${u.email} ${u.studentCode ?? ''} ${u.staffCode ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const pendingCount = useMemo(() => all.filter((u) => u.role === 'pending').length, [all]);
  const chosen = all.find((u) => u.id === selectedId);
  const sendInvitation = (e: FormEvent) => {
    e.preventDefault(); setInviteError('');
    createInvitation.mutate({ data: { email: inviteEmail.trim() } }, { onSuccess: () => { setInviteEmail(''); void qc.invalidateQueries({ queryKey: getListSchoolInvitationsQueryKey() }); }, onError: (err) => setInviteError(errorText(err)) });
  };
  const cancelInvitation = (invitationId: number) => {
    setInviteError('');
    revokeInvitation.mutate({ invitationId }, { onSuccess: () => void qc.invalidateQueries({ queryKey: getListSchoolInvitationsQueryKey() }), onError: (err) => setInviteError(errorText(err)) });
  };
  return <main className="page-wrap">
    <div className="page-heading">
      <div><div className="eyebrow">Thiết lập trường học</div><h1>Tài khoản & hồ sơ</h1><p className="page-subtitle">Cập nhật hồ sơ, vai trò, trạng thái và liên kết sinh viên trong cùng một biểu mẫu.</p></div>
      <button className="btn secondary" onClick={() => void users.refetch()} data-testid="button-refresh-users"><RefreshCw /> Làm mới</button>
    </div>
    <div className="stat-grid">
      <div className="card stat-card"><div className="stat-top"><span>Tổng tài khoản</span><span className="stat-icon"><Users /></span></div><div className="stat-value">{users.data?.length ?? '–'}</div><div className="stat-foot">Trong không gian trường</div></div>
      <div className="card stat-card"><div className="stat-top"><span>Chờ phân quyền</span><span className="stat-icon"><ShieldCheck /></span></div><div className="stat-value">{pendingCount}</div><div className="stat-foot">Chỉ quản trị viên kích hoạt</div></div>
      <div className="card stat-card"><div className="stat-top"><span>Giảng viên</span><span className="stat-icon"><UserCog /></span></div><div className="stat-value">{all.filter((u) => u.role === 'teacher').length}</div><div className="stat-foot">Đang có vai trò giảng viên</div></div>
      <div className="card stat-card"><div className="stat-top"><span>Bị vô hiệu hóa</span><span className="stat-icon"><AlertCircle /></span></div><div className="stat-value">{all.filter((u) => !u.active).length}</div><div className="stat-foot">Bị chặn trên máy chủ</div></div>
    </div>
    {users.isLoading ? <div className="loading-row">Đang tải danh sách tài khoản…</div> : users.isError ? <div className="empty-state card"><div className="empty-icon"><AlertCircle /></div><strong>Chưa thể tải tài khoản</strong><p>{errorText(users.error)}</p><button className="btn secondary" style={{ marginTop: 14 }} onClick={() => void users.refetch()}>Thử lại</button></div> : (
      <div className="two-col">
        <section className="card section-card">
          <div className="section-head"><div><h2>Danh sách tài khoản</h2><div className="section-kicker">Chọn tài khoản để mở hồ sơ</div></div><span className="subject-chip">{list.length} TÀI KHOẢN</span></div>
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <label className="search-field" style={{ flex: 1 }}><Search /><input className="field" style={{ width: '100%' }} placeholder="Tên, email, mã…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-users" /></label>
            <select className="select-field" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} data-testid="select-filter-role"><option value="">Mọi vai trò</option><option value="pending">Chờ phân quyền</option><option value="admin">Quản trị viên</option><option value="teacher">Giảng viên</option><option value="student">Sinh viên</option><option value="inactive">Bị vô hiệu hóa</option></select>
          </div>
          {!list.length ? <EmptyState title="Không có tài khoản phù hợp" detail="Tài khoản xuất hiện sau khi người được mời đăng nhập." /> :
            <div className="table-wrap"><table><thead><tr><th>Người dùng</th><th>Vai trò</th><th></th></tr></thead><tbody>{list.map((u) => <tr key={u.id} className={u.active ? '' : 'row-muted'} data-testid={`row-school-user-${u.id}`}>
              <td className="account-cell"><div className="student-name">{u.displayName || u.email}</div><div className="student-code">{u.email}{u.studentCode ? ` · ${u.studentCode}` : u.staffCode ? ` · ${u.staffCode}` : ''}</div></td>
              <td><span className={`pill ${u.role === 'pending' ? 'review' : !u.active ? 'closed' : ''}`}>{u.active ? roleText[u.role] ?? u.role : 'Vô hiệu hóa'}</span></td>
              <td><button className={`btn ${selectedId === u.id ? '' : 'ghost'}`} onClick={() => setSelectedId(u.id)} data-testid={`button-edit-user-${u.id}`}>{selectedId === u.id ? 'Đang mở' : 'Hồ sơ'}</button></td></tr>)}</tbody></table></div>}
        </section>
        <section className="card section-card">
          {!chosen ? <EmptyState icon={<ShieldCheck />} title="Chọn một tài khoản" detail="Hồ sơ, vai trò, trạng thái và liên kết sinh viên được cập nhật tại đây." /> : <UserEditor key={chosen.id} user={chosen} />}
        </section>
      </div>
    )}
    <section className="card section-card" style={{ marginTop: 18 }}>
      <div className="section-head"><div><h2><MailPlus size={17} style={{ verticalAlign: 'middle', marginRight: 7 }} />Mời tài khoản vào trường</h2><div className="section-kicker">Chỉ người nhận lời mời mới có thể tạo tài khoản.</div></div></div>
      <form className="toolbar" onSubmit={sendInvitation} style={{ alignItems: 'end' }}>
        <label style={{ flex: '1 1 260px' }}><span className="form-label">Email người được mời</span><input className="field" style={{ width: '100%' }} type="email" required maxLength={320} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="ten@truong.edu.vn" data-testid="input-invitation-email" /></label>
        <button className="btn" type="submit" disabled={createInvitation.isPending} data-testid="button-send-invitation">{createInvitation.isPending ? <LoaderCircle /> : <Send />} Gửi lời mời</button>
      </form>
      {inviteError && <div className="error-banner" role="alert">{inviteError}</div>}
      {createInvitation.isSuccess && <div className="success-banner" role="status">Đã gửi lời mời qua email.</div>}
      <div style={{ marginTop: 18 }}>
        {invitations.isLoading ? <div className="loading-row">Đang tải lời mời…</div> : invitations.isError ? <div className="error-banner" role="alert">{errorText(invitations.error)}</div> : !invitations.data?.length ? <EmptyState title="Chưa có lời mời" detail="Lời mời đã gửi sẽ hiển thị tại đây." /> :
          <div className="table-wrap"><table><thead><tr><th>Email</th><th>Trạng thái</th><th>Ngày gửi</th><th></th></tr></thead><tbody>{invitations.data.map((inv) => <tr key={inv.id}><td>{inv.email}</td><td><span className={`pill ${inv.status === 'pending' ? 'review' : ''}`}>{invitationStatusText[inv.status] ?? inv.status}</span></td><td>{new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(inv.createdAt))}</td><td>{inv.status === 'pending' && <button className="btn ghost" type="button" disabled={revokeInvitation.isPending} onClick={() => cancelInvitation(inv.id)} data-testid={`button-revoke-invitation-${inv.id}`}><X size={15} /> Hủy</button>}</td></tr>)}</tbody></table></div>}
      </div>
    </section>
  </main>;
}

function UserEditor({ user }: { user: SchoolUser }) {
  const qc = useQueryClient();
  const update = useUpdateSchoolUser();
  const students = useListAcademicStudents({ query: { queryKey: getListAcademicStudentsQueryKey() } });
  const sections = useListAcademicSections();
  const [form, setForm] = useState({ displayName: user.displayName ?? '', phone: user.phone ?? '', faculty: user.faculty ?? '', major: user.major ?? '', staffCode: user.staffCode ?? '', active: user.active, role: user.role as SchoolUserUpdateInput['role'] });
  const [classIds, setClassIds] = useState<number[]>(user.classIds ?? []);
  const [studentId, setStudentId] = useState(user.studentId ? String(user.studentId) : '');
  const [studentSearch, setStudentSearch] = useState('');
  const linked = (students.data ?? []).find((s) => String(s.id) === studentId);
  const [identity, setIdentity] = useState({ fullName: '', studentCode: '' });
  const [identityFor, setIdentityFor] = useState<number | null>(null);
  if (linked && identityFor !== linked.id) { setIdentityFor(linked.id); setIdentity({ fullName: linked.fullName, studentCode: linked.studentCode }); }
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  const candidates = (students.data ?? []).filter((s) => (s.accountId == null || s.accountId === user.id || String(s.id) === studentId) && `${s.fullName} ${s.studentCode}`.toLowerCase().includes(studentSearch.toLowerCase())).slice(0, 60);
  const invalidate = () => {
    for (const key of [getListSchoolUsersQueryKey(), getGetCurrentSchoolUserQueryKey(), getListClassesQueryKey(), getListAcademicSectionsQueryKey(), getListAcademicStudentsQueryKey()]) void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries();
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaved(''); setError('');
    if (form.role === 'student' && (!studentId || !linked)) { setError('Hãy chọn hồ sơ sinh viên trong danh bạ.'); return; }
    if (!(form.role === 'student' ? identity.fullName.trim() : form.displayName.trim())) { setError('Họ tên không được để trống.'); return; }
    try {
      await update.mutateAsync({ userId: user.id, data: {
        displayName: form.role === 'student' ? identity.fullName.trim() : form.displayName.trim(),
        ...(form.role === 'student' ? { studentCode: identity.studentCode.trim() } : {}),
        phone: form.phone.trim() || null, faculty: form.faculty.trim() || null, major: form.major.trim() || null,
        staffCode: form.role === 'student' ? null : form.staffCode.trim() || null, active: form.active, role: form.role,
        studentId: form.role === 'student' ? Number(studentId) : null, classIds: form.role === 'teacher' ? classIds : [],
      } });
      setSaved('Đã lưu hồ sơ và phân quyền.');
    } catch (err) { setError(errorText(err)); } finally { invalidate(); }
  };
  const pending = update.isPending;
  return <form className="form-stack" style={{ marginTop: 0 }} onSubmit={(e) => void submit(e)} data-testid="form-assign-role">
    <div className="section-head" style={{ marginBottom: 0 }}><div><h2>{user.displayName || user.email}</h2><div className="section-kicker">{user.email} · email do hệ thống đăng nhập quản lý</div></div><span className="subject-chip">#{user.id}</span></div>
    <div className="field-grid">
      {form.role !== 'student' && <Field label="Họ và tên hiển thị"><input className="field" required maxLength={200} value={form.displayName} onChange={(e) => set({ displayName: e.target.value })} data-testid="input-user-displayname" /></Field>}
      <Field label="Số điện thoại (tùy chọn)"><input className="field" maxLength={30} value={form.phone} onChange={(e) => set({ phone: e.target.value })} data-testid="input-user-phone" /></Field>
      <Field label="Khoa (tùy chọn)"><input className="field" maxLength={200} value={form.faculty} onChange={(e) => set({ faculty: e.target.value })} data-testid="input-user-faculty" /></Field>
      <Field label="Ngành (tùy chọn)"><input className="field" maxLength={200} value={form.major} onChange={(e) => set({ major: e.target.value })} data-testid="input-user-major" /></Field>
      <Field label="Vai trò"><select className="select-field" value={form.role} onChange={(e) => set({ role: e.target.value as SchoolUserUpdateInput['role'] })} data-testid="select-user-role"><option value="pending">Chờ phân quyền</option><option value="admin">Quản trị viên</option><option value="teacher">Giảng viên</option><option value="student">Sinh viên</option></select></Field>
      {form.role !== 'student' && <Field label="Mã cán bộ / giảng viên"><input className="field" maxLength={60} value={form.staffCode} onChange={(e) => set({ staffCode: e.target.value })} data-testid="input-user-staffcode" /></Field>}
      <label className="check-inline span-all"><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} data-testid="checkbox-user-active" /> Tài khoản đang hoạt động (bỏ chọn để chặn truy cập; không áp dụng cho quản trị viên hoạt động cuối cùng)</label>
    </div>
    {form.role === 'teacher' && <fieldset className="assign-box"><legend className="form-label">Lớp học phần phụ trách <em>{classIds.length}</em></legend>
      {sections.isLoading ? <div className="loading-row">Đang tải lớp…</div> : !sections.data?.length ? <div className="notice">Chưa có lớp học phần. Tạo tại <Link className="text-link" href="/academic/sections">Lớp học phần</Link>.</div> :
        <div className="check-list">{sections.data.map((s) => <label className={`check-item ${classIds.includes(s.id) ? 'on' : ''}`} key={s.id}><input type="checkbox" checked={classIds.includes(s.id)} onChange={() => setClassIds((l) => l.includes(s.id) ? l.filter((x) => x !== s.id) : [...l, s.id])} data-testid={`checkbox-user-class-${s.id}`} /><span><strong>{s.code ?? '—'} · {s.name}</strong><small>{s.subject} · {s.studentCount} sinh viên</small></span></label>)}</div>}
    </fieldset>}
    {form.role === 'student' && <fieldset className="assign-box"><legend className="form-label">Hồ sơ sinh viên trong danh bạ toàn trường</legend>
      <input className="field" style={{ width: '100%', marginBottom: 8 }} placeholder="Tìm tên hoặc mã sinh viên…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} data-testid="input-search-link-student" />
      {students.isLoading ? <div className="loading-row">Đang tải danh bạ…</div> : students.isError ? <div className="error-banner">{errorText(students.error)}</div> :
        <select className="select-field" style={{ width: '100%' }} size={Math.min(6, Math.max(2, candidates.length + 1))} value={studentId} onChange={(e) => setStudentId(e.target.value)} data-testid="select-linked-student"><option value="">Chưa liên kết</option>{candidates.map((s) => <option key={s.id} value={s.id}>{s.studentCode} · {s.fullName}{s.cohortName ? ` · ${s.cohortName}` : ''}</option>)}</select>}
      <span className="form-help">Chỉ hiện hồ sơ chưa gắn tài khoản khác. Thiếu hồ sơ? <Link className="text-link" href="/academic/students">Thêm trong danh bạ</Link>.</span>
      {linked && <div className="field-grid" style={{ marginTop: 10 }}>
        <Field label="Họ tên sinh viên"><input className="field" required maxLength={200} value={identity.fullName} onChange={(e) => setIdentity({ ...identity, fullName: e.target.value })} data-testid="input-linked-fullname" /></Field>
        <Field label="Mã sinh viên"><input className="field" required maxLength={60} value={identity.studentCode} onChange={(e) => setIdentity({ ...identity, studentCode: e.target.value })} data-testid="input-linked-code" /></Field>
        <p className="form-help span-all">Sửa tên/mã ở đây cập nhật hồ sơ danh bạ dùng chung cho mọi lớp học phần. Lớp hành chính: {linked.cohortName ?? 'chưa xếp'}.</p>
      </div>}
    </fieldset>}
    {form.role === 'pending' && <div className="notice">Tài khoản chưa truy cập được dữ liệu trường cho đến khi được phân vai trò.</div>}
    {error && <div className="error-banner" role="alert" data-testid="status-user-error">{error}</div>}
    {saved && <div className="success-banner" role="status"><Check size={14} style={{ verticalAlign: 'middle' }} /> {saved}</div>}
    <button className="btn" type="submit" disabled={pending} data-testid="button-save-user-role">{pending ? <LoaderCircle /> : <Check />} {pending ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
  </form>;
}
