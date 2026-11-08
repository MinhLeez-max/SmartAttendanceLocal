import { type ReactNode, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/app-shell';
import { CheckInPage, ClassesPage, DashboardPage, SessionPage } from '@/pages/workspace-pages';
import { ReportsPage } from '@/pages/reports-page';
import { AcademicCatalogPage } from '@/pages/academic-catalog-page';
import { AcademicStudentsPage } from '@/pages/academic-students-page';
import { AcademicSectionsPage } from '@/pages/academic-sections-page';
import { TimetablePage } from '@/pages/timetable-page';
import { ProfilePage } from '@/pages/profile-page';
import { StudentDashboardPage } from '@/pages/student-dashboard-page';
import { AdminUsersPage } from '@/pages/admin-users-page';
import { Route, Switch, useLocation, Router as WouterRouter, Redirect, Link } from 'wouter';
import { getGetCurrentSchoolUserQueryKey, getGetSchoolBootstrapStatusQueryKey, useGetCurrentSchoolUser, useGetSchoolBootstrapStatus } from '@workspace/api-client-react';
import { BookOpenCheck, ClipboardCheck, GraduationCap, ShieldCheck } from 'lucide-react';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: true } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = undefined;
function apiErrorText(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error;
  }
  return error instanceof Error ? error.message : 'Không thể xác minh tài khoản trường học.';
}
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
const clerkAppearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: { colorPrimary: '#28675d', colorForeground: '#203b3d', colorMutedForeground: '#667774', colorDanger: '#a64238', colorBackground: '#fbf9f1', colorInput: '#fffdf7', colorInputForeground: '#203b3d', colorNeutral: '#d5d0c4', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.75rem' },
  elements: {
    rootBox: 'w-full flex justify-center', cardBox: 'bg-[#fbf9f1] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#203b3d] font-bold', headerSubtitle: 'text-[#667774]', socialButtonsBlockButtonText: 'text-[#203b3d] font-semibold',
    formFieldLabel: 'text-[#203b3d] font-semibold', footerActionLink: 'text-[#28675d] font-semibold', footerActionText: 'text-[#667774]',
    dividerText: 'text-[#667774]', identityPreviewEditButton: 'text-[#28675d]', formFieldSuccessText: 'text-[#28675d]',
    alertText: 'text-[#8f382f]', logoBox: 'rounded-xl', logoImage: 'rounded-xl', socialButtonsBlockButton: 'border-[#d5d0c4]',
    formButtonPrimary: 'bg-[#28675d] hover:bg-[#1f554d]', formFieldInput: 'border-[#d5d0c4] bg-[#fffdf7] text-[#203b3d]',
    footerAction: 'border-0', dividerLine: 'bg-[#d5d0c4]', alert: 'border-[#e7c4b7] bg-[#f8e6df]',
    otpCodeFieldInput: 'border-[#d5d0c4] bg-[#fffdf7]', formFieldRow: '', main: '',
  },
};

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) client.clear();
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function AuthPages({ signUp = false }: { signUp?: boolean }) {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get('returnTo');
  const checkInReturn = returnTo?.startsWith('/check-in?token=') && !returnTo.startsWith('//')
    ? `${basePath}${returnTo}`
    : undefined;
  const hasInvitationTicket = params.has('__clerk_ticket');
  // The local bootstrap account should work on the normal sign-up route too.
  // The API still enforces SCHOOL_BOOTSTRAP_ADMIN_EMAIL, so this does not
  // grant admin access to arbitrary email addresses.
  const bootstrapRoute = true;
  const bootstrapStatus = useGetSchoolBootstrapStatus({
    query: {
      enabled: signUp && !hasInvitationTicket && bootstrapRoute,
      queryKey: getGetSchoolBootstrapStatusQueryKey(),
    },
  });
  if (signUp && !hasInvitationTicket && bootstrapRoute && bootstrapStatus.isLoading) {
    return <main className="page-wrap"><div className="loading-row">Đang kiểm tra quyền thiết lập trường…</div></main>;
  }
  if (signUp && !hasInvitationTicket && (!bootstrapRoute || !bootstrapStatus.data?.available)) {
    return <main className="page-wrap" style={{ maxWidth: 680 }}>
      <section className="card section-card" style={{ padding: 'clamp(24px,5vw,42px)' }}>
        <div className="empty-icon"><ShieldCheck /></div>
        <div className="eyebrow" style={{ textAlign: 'center' }}>Tài khoản trường học</div>
        <h1 style={{ textAlign: 'center' }}>Chỉ nhận tài khoản được mời.</h1>
        <p className="page-subtitle" style={{ textAlign: 'center', lineHeight: 1.7 }}>Hãy yêu cầu quản trị viên trường gửi lời mời đến email của bạn. Liên kết trong email sẽ mở bước tạo tài khoản an toàn.</p>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}><Link className="btn" href="/sign-in">Đăng nhập</Link></div>
      </section>
    </main>;
  }
  return <div className="signin-wrap"><div className="signin-brand"><span className="brand-icon">Đ</span><span><span className="brand-name">Điểm danh</span><span className="brand-caption" style={{ color: '#65756d' }}>Sổ lớp thông minh</span></span></div>
    <div>{signUp ? <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={checkInReturn} fallbackRedirectUrl={`${basePath}/`} /> : <SignIn routing="path" path={`${basePath}/sign-in`} forceRedirectUrl={checkInReturn} fallbackRedirectUrl={`${basePath}/`} />}
      <p className="signin-note">{signUp ? (hasInvitationTicket ? 'Lời mời được xác minh trước khi tài khoản được thêm vào trường.' : 'Email quản trị viên được chỉ định mới có thể tạo tài khoản quản trị.') : 'Tài khoản mới chỉ được tạo theo lời mời của quản trị viên trường.'}</p>
    </div>
  </div>;
}

function HomePage() {
  const { isSignedIn, isLoaded } = useAuth();
  const user = useGetCurrentSchoolUser({ query: { enabled: !!isSignedIn, queryKey: getGetCurrentSchoolUserQueryKey() } });
  const bootstrapStatus = useGetSchoolBootstrapStatus({ query: { queryKey: getGetSchoolBootstrapStatusQueryKey() } });
  if (isSignedIn) {
    if (!isLoaded || user.isLoading) return <main className="page-wrap"><div className="loading-row">Đang mở không gian trường học…</div></main>;
    if (user.data?.role === 'admin') return <AppShell><DashboardPage /></AppShell>;
    if (user.data?.role === 'teacher') return <Redirect to="/timetable" />;
    if (user.data?.role === 'student') return <Redirect to="/student" />;
    if (user.isError) return <main className="page-wrap"><div className="error-banner">{apiErrorText(user.error)} <button className="text-link" onClick={() => void user.refetch()}>Thử lại</button><div style={{ marginTop: 14 }}><LogoutButton /></div></div></main>;
    return <Redirect to="/waiting" />;
  }
  return <main className="page-wrap">
    <section className="welcome-panel">
      <div className="eyebrow" style={{ color: '#e9cf91' }}>Không gian điểm danh của nhà trường</div>
      <h1>Đi học đủ. Ghi nhận rõ. An tâm hơn.</h1>
      <p>Cổng học tập để giảng viên quản lý lịch dạy và điểm danh, quản trị viên tổ chức đào tạo, sinh viên xem thời khóa biểu và xác nhận có mặt bằng QR. Tài khoản chỉ được tạo theo lời mời của trường.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
        {bootstrapStatus.data?.available && <Link href="/sign-up?bootstrap=1" className="btn" data-testid="link-bootstrap-admin">Thiết lập tài khoản quản trị <BookOpenCheck size={15} /></Link>}
        <Link href="/sign-in" className="btn secondary" data-testid="link-sign-in">Đăng nhập</Link>
      </div>
    </section>
    <div className="role-grid">
      <article className="role-tile"><GraduationCap color="#28675d" /><strong>Dành cho giảng viên</strong><p>Xem lịch dạy, mở phiên QR đúng buổi và theo dõi kết quả điểm danh.</p></article>
      <article className="role-tile"><ShieldCheck color="#a07732" /><strong>Dành cho quản trị viên</strong><p>Quản lý hồ sơ, lớp hành chính, học phần, học kỳ và phân công giảng dạy.</p></article>
      <article className="role-tile"><ClipboardCheck color="#28675d" /><strong>Dành cho sinh viên</strong><p>Xem lớp, thời khóa biểu và lịch sử cá nhân. Điểm danh bằng tài khoản trường đã liên kết.</p></article>
    </div>
    <div className="privacy-strip" style={{ marginTop: 18 }}><strong>Quyền riêng tư là mặc định.</strong> Camera chỉ hỗ trợ tham khảo sĩ số tổng hợp; không nhận diện khuôn mặt, không suy luận danh tính và không lưu khung hình.</div>
  </main>;
}

function WaitingPage() {
  const { isSignedIn } = useAuth();
  const current = useGetCurrentSchoolUser({ query: { enabled: !!isSignedIn, queryKey: getGetCurrentSchoolUserQueryKey() } });
  return <main className="page-wrap" style={{ maxWidth: 760 }}>
    <section className="card section-card" style={{ padding: 'clamp(24px,5vw,42px)' }}>
      <div className="empty-icon"><ShieldCheck /></div><div className="eyebrow" style={{ textAlign: 'center' }}>Tài khoản đang chờ</div>
      <h1 style={{ textAlign: 'center' }}>Quản trị viên sẽ sớm cấp quyền.</h1>
      <p className="page-subtitle" style={{ textAlign: 'center', lineHeight: 1.7 }}>Tài khoản <strong>{current.data?.email ?? ''}</strong> đã đăng ký thành công. Sau khi được phân vai trò giảng viên hoặc sinh viên, bạn sẽ thấy không gian phù hợp tại đây.</p>
      <div className="notice" style={{ marginTop: 20 }}>Đây là bước thiết lập bảo vệ dữ liệu sinh viên. Việc chờ duyệt không ảnh hưởng đến trạng thái đăng nhập.</div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}><LogoutButton /></div>
    </section>
  </main>;
}

function LogoutButton({ label = 'Đăng xuất / đổi tài khoản' }: { label?: string }) {
  const { signOut } = useClerk();
  return <button className="btn secondary" onClick={() => void signOut({ redirectUrl: `${basePath}/sign-in` })} data-testid="button-sign-out">{label}</button>;
}

function RoleGate({ children, roles }: { children: ReactNode; roles: string[] }) {
  const { isSignedIn, isLoaded } = useAuth();
  const current = useGetCurrentSchoolUser({ query: { enabled: !!isSignedIn, queryKey: getGetCurrentSchoolUserQueryKey() } });
  if (!isLoaded || (isSignedIn && current.isLoading)) return <main className="page-wrap"><div className="loading-row">Đang xác thực quyền truy cập…</div></main>;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (current.isError) return <main className="page-wrap"><div className="error-banner">Không thể xác minh quyền truy cập. <button className="text-link" onClick={() => void current.refetch()}>Thử lại</button><div style={{ marginTop: 14 }}><LogoutButton /></div></div></main>;
  if (!current.data || current.data.role === 'pending') return <Redirect to="/waiting" />;
  if (!current.data.active) return <main className="page-wrap" style={{ maxWidth: 680 }}><section className="card section-card" style={{ padding: 'clamp(24px,5vw,42px)', textAlign: 'center' }}><div className="empty-icon"><ShieldCheck /></div><h1>Tài khoản đã bị vô hiệu hóa.</h1><p className="page-subtitle" style={{ lineHeight: 1.7 }}>Liên hệ phòng đào tạo hoặc quản trị viên trường để được mở lại quyền truy cập.</p><div style={{ marginTop: 18 }}><LogoutButton /></div></section></main>;
  if (!roles.includes(current.data.role)) return <Redirect to={current.data.role === 'admin' ? '/admin/users' : current.data.role === 'student' ? '/student' : '/timetable'} />;
  return <AppShell>{children}</AppShell>;
}

function StaffPage({ children }: { children: ReactNode }) { return <RoleGate roles={['admin', 'teacher']}>{children}</RoleGate>; }
function AdminPage() { return <RoleGate roles={['admin']}><AdminUsersPage /></RoleGate>; }
function TeacherPage({ children }: { children: ReactNode }) { return <RoleGate roles={['teacher', 'admin']}>{children}</RoleGate>; }
function RootRouter() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Chào mừng trở lại', subtitle: 'Đăng nhập vào tài khoản trường học' } }, signUp: { start: { title: 'Tạo tài khoản trường học', subtitle: 'Bắt đầu sử dụng sổ lớp thông minh' } } }}
    routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <ClerkQueryClientCacheInvalidator />
    <RoutedErrorBoundary><Switch>
      <Route path="/" component={HomePage} />
      <Route path="/sign-in/*?" component={() => <AuthPages />} />
      <Route path="/sign-up/*?" component={() => <AuthPages signUp />} />
      <Route path="/check-in" component={CheckInPage} />
      <Route path="/waiting" component={WaitingPage} />
      <Route path="/student" component={() => <RoleGate roles={['student']}><StudentDashboardPage /></RoleGate>} />
      <Route path="/profile" component={() => <RoleGate roles={['admin', 'teacher', 'student']}><ProfilePage /></RoleGate>} />
      <Route path="/timetable" component={() => <RoleGate roles={['admin', 'teacher', 'student']}><TimetablePage /></RoleGate>} />
      <Route path="/academic" component={() => <RoleGate roles={['admin']}><AcademicCatalogPage /></RoleGate>} />
      <Route path="/academic/students" component={() => <RoleGate roles={['admin']}><AcademicStudentsPage /></RoleGate>} />
      <Route path="/academic/sections" component={() => <RoleGate roles={['admin']}><AcademicSectionsPage /></RoleGate>} />
      <Route path="/admin/users" component={AdminPage} />
      <Route path="/classes" component={() => <TeacherPage><ClassesPage /></TeacherPage>} />
      <Route path="/sessions/:sessionId" component={() => <StaffPage><SessionPage /></StaffPage>} />
      <Route path="/reports" component={() => <StaffPage><ReportsPage /></StaffPage>} />
      <Route component={NotFound} />
    </Switch></RoutedErrorBoundary>
  </ClerkProvider>;
}

function NotFound() { return <main className="page-wrap"><h1>Không tìm thấy trang</h1><p className="page-subtitle">Địa chỉ này không tồn tại trong không gian trường học.</p><Link href="/" className="btn" style={{ marginTop: 16 }}>Về trang chủ</Link></main>; }

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><RootRouter /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;
