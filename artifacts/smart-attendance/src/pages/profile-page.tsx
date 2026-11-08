import { useGetCurrentSchoolUser } from '@workspace/api-client-react';
import { Lock } from 'lucide-react';
import { ErrorState, LoadingState, PageHeading } from '@/components/portal-ui';
import { initials, roleText, vnDateTime } from '@/lib/portal';

export function ProfilePage() {
  const me = useGetCurrentSchoolUser();
  const u = me.data;
  const rows: [string, string | null | undefined][] = u ? [
    ['Họ và tên', u.studentName || u.displayName], ['Email đăng nhập', u.email], ['Vai trò', roleText[u.role]], ['Số điện thoại', u.phone],
    ['Khoa', u.faculty], ['Ngành', u.major],
    ...(u.role === 'student' ? [['Mã sinh viên', u.studentCode], ['Lớp hành chính', u.cohortName]] as [string, string | null][] : [['Mã cán bộ', u.staffCode]] as [string, string | null][]),
    ['Trạng thái', u.active ? 'Đang hoạt động' : 'Đã vô hiệu hóa'], ['Tham gia từ', vnDateTime(u.createdAt)],
  ] : [];
  return <main className="page-wrap" style={{ maxWidth: 860 }}>
    <PageHeading eyebrow="Hồ sơ cá nhân" title="Thông tin của tôi" subtitle="Hồ sơ do nhà trường quản lý. Liên hệ quản trị viên nếu cần chỉnh sửa." />
    {me.isLoading ? <LoadingState rows={3} label="Đang tải hồ sơ…" /> : me.isError || !u ? <ErrorState error={me.error} retry={() => void me.refetch()} /> :
      <section className="card section-card">
        <div className="profile-head"><div className="hero-avatar dark">{initials(u.studentName || u.displayName)}</div><div><h2 data-testid="text-profile-name">{u.studentName || u.displayName || u.email}</h2><span className="pill">{roleText[u.role]}</span></div></div>
        <dl className="kv-grid">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={v ? '' : 'missing'} data-testid={`text-profile-${k}`}>{v || 'Chưa cập nhật'}</dd></div>)}</dl>
        <div className="privacy-strip"><Lock size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />Chế độ chỉ xem. Vai trò, mã định danh, lớp và trạng thái chỉ quản trị viên được thay đổi; email và mật khẩu do hệ thống đăng nhập quản lý.</div>
      </section>}
  </main>;
}
