import { Link, useLocation } from 'wouter';
import { useClerk } from '@clerk/react';
import { BookOpenCheck, LayoutDashboard, ChartNoAxesCombined, ShieldCheck, LogOut, Users, Library, UsersRound, CalendarDays, BookMarked, CircleUser, GraduationCap } from 'lucide-react';
import type { ReactNode } from 'react';
import { getGetCurrentSchoolUserQueryKey, useGetCurrentSchoolUser } from '@workspace/api-client-react';

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const signInUrl = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/sign-in`;
  const current = useGetCurrentSchoolUser();
  const role = current.data?.role ?? 'teacher';
  const navItems = role === 'admin'
    ? [{ href: '/', label: 'Tổng quan', icon: LayoutDashboard }, { href: '/academic', label: 'Danh mục', icon: Library }, { href: '/academic/students', label: 'Sinh viên', icon: UsersRound }, { href: '/academic/sections', label: 'Lớp học phần', icon: BookMarked }, { href: '/timetable', label: 'Thời khóa biểu', icon: CalendarDays }, { href: '/classes', label: 'Danh sách lớp', icon: BookOpenCheck }, { href: '/reports', label: 'Báo cáo', icon: ChartNoAxesCombined }, { href: '/admin/users', label: 'Tài khoản', icon: Users }, { href: '/profile', label: 'Hồ sơ', icon: CircleUser }]
    : role === 'student'
      ? [{ href: '/student', label: 'Trang của tôi', icon: GraduationCap }, { href: '/timetable', label: 'Thời khóa biểu', icon: CalendarDays }, { href: '/profile', label: 'Hồ sơ', icon: CircleUser }]
      : [{ href: '/timetable', label: 'Lịch dạy', icon: CalendarDays }, { href: '/classes', label: 'Lớp học phần', icon: BookOpenCheck }, { href: '/reports', label: 'Báo cáo', icon: ChartNoAxesCombined }, { href: '/profile', label: 'Hồ sơ', icon: CircleUser }];
  const roleLabel = role === 'admin' ? 'Quản trị viên' : role === 'student' ? 'Sinh viên' : 'Giảng viên';
  const active = (href: string) => href === '/' || href === '/academic' ? location === href : location.startsWith(href);
  return (
    <div className="app-shell">
      <aside className="sidebar" data-testid="navigation-sidebar">
        <Link href="/" className="brand-mark" data-testid="link-brand-home">
          <span className="brand-icon">Đ</span>
          <span>
            <span className="brand-name">Điểm danh</span>
            <span className="brand-caption">Sổ lớp thông minh</span>
          </span>
        </Link>
        <div className="nav-label">{role === 'admin' ? 'Điều phối đào tạo' : role === 'student' ? 'Không gian sinh viên' : 'Không gian giảng dạy'}</div>
        <nav>
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${active(href) ? 'active' : ''}`} data-testid={`link-nav-${label}`}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <strong><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />Quyền riêng tư</strong>
            <p>Camera chỉ ghi nhận số lượng tổng hợp. Không nhận diện hay lưu danh tính.</p>
          </div>
          <div className="teacher-chip">
            <div className="teacher-avatar">{role === 'admin' ? 'QT' : role === 'student' ? 'SV' : 'GV'}</div>
            <div>
              <div className="teacher-name">{current.data?.studentName || current.data?.displayName || roleLabel}</div>
              <div className="teacher-role">{roleLabel}</div>
            </div>
          </div>
          <button className="nav-link" style={{ width: '100%', border: 0, background: 'transparent', marginTop: 8 }} onClick={() => void signOut({ redirectUrl: signInUrl })} data-testid="button-sign-out"><LogOut /><span>Đăng xuất</span></button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <div className="mobile-brand"><span className="brand-icon">Đ</span><span>Điểm danh</span></div>
            <span className="breadcrumb">Trường học <span style={{ margin: '0 7px' }}>/</span> {roleLabel}</span>
          </div>
          <div className="topbar-actions">
            <div className="topbar-date" data-testid="text-current-date">
              {new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}
            </div>
            <button className="btn secondary topbar-signout" onClick={() => void signOut({ redirectUrl: signInUrl })} title="Đăng xuất để đăng nhập bằng tài khoản khác" data-testid="button-topbar-sign-out">
              <LogOut /><span>Đổi tài khoản</span>
            </button>
          </div>
        </header>
        <nav className="mobile-nav" aria-label="Điều hướng chính">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${active(href) ? 'active' : ''}`} data-testid={`mobile-nav-${label}`}>
              <Icon /><span>{label}</span>
            </Link>
          ))}
          <button className="nav-link" style={{ border: 0, background: 'transparent' }} onClick={() => void signOut({ redirectUrl: signInUrl })} data-testid="mobile-button-sign-out"><LogOut /><span>Đăng xuất</span></button>
        </nav>
        {children}
      </div>
    </div>
  );
}
