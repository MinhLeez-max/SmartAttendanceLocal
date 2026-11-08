import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetAcademicCatalogQueryKey, getListAcademicSectionsQueryKey, getListAcademicStudentsQueryKey, useCreateAcademicCatalogItem, useGetAcademicCatalog, useUpdateAcademicCatalogItem } from '@workspace/api-client-react';
import type { CatalogInput, CatalogItem } from '@workspace/api-client-react';
import { Archive, ArchiveRestore, BookMarked, CalendarRange, DoorOpen, LoaderCircle, MapPin, Pencil, Plus, RefreshCw, Search, UsersRound } from 'lucide-react';
import { EmptyState, ErrorState, Field, LoadingState, Modal, PageHeading } from '@/components/portal-ui';
import { errorText } from '@/lib/portal';

type Kind = 'cohorts' | 'semesters' | 'subjects' | 'rooms';
const KINDS: { key: Kind; label: string; singular: string; hint: string; icon: typeof BookMarked }[] = [
  { key: 'cohorts', label: 'Lớp hành chính', singular: 'lớp hành chính', hint: 'Nơi sinh viên thuộc về theo khoa, ngành và khóa.', icon: UsersRound },
  { key: 'semesters', label: 'Học kỳ', singular: 'học kỳ', hint: 'Khoảng ngày giới hạn lịch học của lớp học phần.', icon: CalendarRange },
  { key: 'subjects', label: 'Môn học', singular: 'môn học', hint: 'Danh mục môn dùng chung cho mọi lớp học phần.', icon: BookMarked },
  { key: 'rooms', label: 'Phòng học', singular: 'phòng học', hint: 'Mốc vị trí cố định dùng để kiểm tra bán kính QR.', icon: DoorOpen },
];
const blank = { code: '', name: '', active: true, startDate: '', endDate: '', faculty: '', major: '', latitude: '', longitude: '', checkInRadiusMeters: '50' };
type FormState = typeof blank;

export function AcademicCatalogPage() {
  const catalog = useGetAcademicCatalog();
  const [kind, setKind] = useState<Kind>('cohorts');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null);
  const qc = useQueryClient();
  const update = useUpdateAcademicCatalogItem();
  const meta = KINDS.find((k) => k.key === kind)!;
  const items = useMemo(() => (catalog.data?.[kind] ?? [])
    .filter((i) => showArchived || i.active)
    .filter((i) => `${i.code} ${i.name} ${i.faculty ?? ''} ${i.major ?? ''}`.toLowerCase().includes(search.toLowerCase())), [catalog.data, kind, search, showArchived]);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: getGetAcademicCatalogQueryKey() });
    void qc.invalidateQueries({ queryKey: getListAcademicSectionsQueryKey() });
    void qc.invalidateQueries({ queryKey: getListAcademicStudentsQueryKey() });
  };
  const toggleActive = (item: CatalogItem) => {
    if (item.active && !window.confirm(`Ngừng sử dụng "${item.name}"? Dữ liệu lịch sử vẫn được giữ, mục này sẽ không còn được chọn cho lịch hoặc lớp mới.`)) return;
    update.mutate({ kind, id: item.id, data: toInput({ ...item, active: !item.active }) }, { onSuccess: invalidate });
  };
  return <main className="page-wrap">
    <PageHeading eyebrow="Tổ chức đào tạo" title="Danh mục học vụ" subtitle="Lớp hành chính, học kỳ, môn học và phòng học là nền cho mọi lớp học phần và lịch học."
      action={<div className="toolbar"><Link href="/academic/students" className="btn secondary" data-testid="link-student-directory"><UsersRound /> Danh bạ sinh viên</Link><Link href="/academic/sections" className="btn" data-testid="link-sections"><BookMarked /> Lớp học phần</Link></div>} />
    <div className="segmented" role="tablist">
      {KINDS.map(({ key, label, icon: Icon }) => <button key={key} role="tab" aria-selected={kind === key} className={kind === key ? 'active' : ''} onClick={() => setKind(key)} data-testid={`tab-catalog-${key}`}>
        <Icon /><span>{label}</span><em>{catalog.data?.[key]?.filter((i) => i.active).length ?? '–'}</em></button>)}
    </div>
    <section className="card section-card">
      <div className="section-head"><div><h2>{meta.label}</h2><div className="section-kicker">{meta.hint}</div></div>
        <button className="btn" onClick={() => setEditing('new')} data-testid="button-create-catalog-item"><Plus /> Thêm {meta.singular}</button></div>
      <div className="filter-bar">
        <div className="toolbar">
          <label className="search-field"><Search /><input className="field" placeholder="Tìm mã hoặc tên…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-catalog" /></label>
          <label className="check-inline"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} data-testid="checkbox-show-archived" /> Hiện mục đã ngừng</label>
        </div>
        <button className="icon-button" onClick={() => void catalog.refetch()} aria-label="Làm mới" data-testid="button-refresh-catalog"><RefreshCw /></button>
      </div>
      {update.isError && <div className="error-banner" role="alert">{errorText(update.error)}</div>}
      {catalog.isLoading ? <LoadingState rows={3} label="Đang tải danh mục…" /> : catalog.isError ? <ErrorState error={catalog.error} retry={() => void catalog.refetch()} /> : !items.length ?
        <EmptyState title={search ? 'Không có mục phù hợp' : `Chưa có ${meta.singular}`} detail={search ? 'Thử từ khóa khác hoặc hiện cả mục đã ngừng.' : 'Thêm mục đầu tiên để dùng khi tạo lớp học phần.'} /> :
        <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Tên</th><th>{kind === 'semesters' ? 'Thời gian' : kind === 'rooms' ? 'Mốc vị trí' : 'Khoa / ngành'}</th><th>Trạng thái</th><th></th></tr></thead><tbody>
          {items.map((item) => <tr key={item.id} className={item.active ? '' : 'row-muted'} data-testid={`row-catalog-${kind}-${item.id}`}>
            <td><span className="code-tag">{item.code}</span></td>
            <td className="student-name">{item.name}</td>
            <td className="cell-detail">{kind === 'semesters' ? `${item.startDate ?? '?'} → ${item.endDate ?? '?'}` : kind === 'rooms' ? (item.latitude == null || item.longitude == null ? <span className="setup-flag">Chưa có tọa độ</span> : `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)} · ${item.checkInRadiusMeters} m`) : [item.faculty, item.major].filter(Boolean).join(' · ') || '—'}</td>
            <td><span className={`pill ${item.active ? '' : 'closed'}`}>{item.active ? 'Đang dùng' : 'Đã ngừng'}</span></td>
            <td><div className="row-actions"><button className="icon-button" onClick={() => setEditing(item)} aria-label={`Sửa ${item.name}`} data-testid={`button-edit-catalog-${item.id}`}><Pencil /></button>
              <button className="icon-button" onClick={() => toggleActive(item)} disabled={update.isPending} aria-label={item.active ? 'Ngừng sử dụng' : 'Dùng lại'} title={item.active ? 'Ngừng sử dụng' : 'Dùng lại'} data-testid={`button-toggle-catalog-${item.id}`}>{item.active ? <Archive /> : <ArchiveRestore />}</button></div></td>
          </tr>)}
        </tbody></table></div>}
    </section>
    {editing && <CatalogDialog kind={kind} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { invalidate(); setEditing(null); }} />}
  </main>;
}

function toInput(item: CatalogItem): CatalogInput {
  return { code: item.code, name: item.name, active: item.active, startDate: item.startDate, endDate: item.endDate, faculty: item.faculty, major: item.major, latitude: item.latitude, longitude: item.longitude, checkInRadiusMeters: item.checkInRadiusMeters };
}

function CatalogDialog({ kind, item, onClose, onSaved }: { kind: Kind; item: CatalogItem | null; onClose: () => void; onSaved: () => void }) {
  const meta = KINDS.find((k) => k.key === kind)!;
  const [form, setForm] = useState<FormState>(() => item ? {
    code: item.code, name: item.name, active: item.active, startDate: item.startDate ?? '', endDate: item.endDate ?? '', faculty: item.faculty ?? '', major: item.major ?? '',
    latitude: item.latitude == null ? '' : String(item.latitude), longitude: item.longitude == null ? '' : String(item.longitude), checkInRadiusMeters: String(item.checkInRadiusMeters ?? 50),
  } : blank);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const create = useCreateAcademicCatalogItem();
  const update = useUpdateAcademicCatalogItem();
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const capture = () => {
    if (!navigator.geolocation) { setError('Trình duyệt không hỗ trợ lấy vị trí.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(({ coords }) => { set({ latitude: coords.latitude.toFixed(6), longitude: coords.longitude.toFixed(6) }); setLocating(false); },
      (e) => { setLocating(false); setError(e.code === e.PERMISSION_DENIED ? 'Bạn chưa cấp quyền vị trí cho trình duyệt.' : 'Không lấy được vị trí. Hãy thử lại.'); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (kind === 'semesters' && form.startDate && form.endDate && form.endDate < form.startDate) { setError('Ngày kết thúc phải sau ngày bắt đầu.'); return; }
    const data: CatalogInput = {
      code: form.code.trim(), name: form.name.trim(), active: form.active,
      startDate: kind === 'semesters' ? form.startDate || null : null, endDate: kind === 'semesters' ? form.endDate || null : null,
      faculty: kind === 'cohorts' || kind === 'subjects' ? form.faculty.trim() || null : null, major: kind === 'cohorts' ? form.major.trim() || null : null,
      latitude: kind === 'rooms' && form.latitude !== '' ? Number(form.latitude) : null, longitude: kind === 'rooms' && form.longitude !== '' ? Number(form.longitude) : null,
      checkInRadiusMeters: kind === 'rooms' ? Number(form.checkInRadiusMeters) : 50,
    };
    const opts = { onSuccess: onSaved, onError: (err: unknown) => setError(errorText(err)) };
    if (item) update.mutate({ kind, id: item.id, data }, opts); else create.mutate({ kind, data }, opts);
  };
  const pending = create.isPending || update.isPending;
  return <Modal eyebrow={meta.label} title={item ? `Sửa ${meta.singular}` : `Thêm ${meta.singular}`} subtitle={meta.hint} onClose={onClose}>
    <form className="field-grid" onSubmit={submit} data-testid="form-catalog-item">
      <Field label="Mã"><input className="field" required maxLength={60} value={form.code} onChange={(e) => set({ code: e.target.value })} placeholder={kind === 'cohorts' ? 'K67-CNTT1' : kind === 'semesters' ? 'HK1-2025' : kind === 'subjects' ? 'INT2204' : 'G2-301'} data-testid="input-catalog-code" /></Field>
      <Field label="Tên"><input className="field" required maxLength={200} value={form.name} onChange={(e) => set({ name: e.target.value })} data-testid="input-catalog-name" /></Field>
      {kind === 'semesters' && <><Field label="Ngày bắt đầu"><input className="field" type="date" required value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} data-testid="input-catalog-start" /></Field>
        <Field label="Ngày kết thúc"><input className="field" type="date" required value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} data-testid="input-catalog-end" /></Field></>}
      {(kind === 'cohorts' || kind === 'subjects') && <Field label="Khoa (tùy chọn)"><input className="field" maxLength={200} value={form.faculty} onChange={(e) => set({ faculty: e.target.value })} data-testid="input-catalog-faculty" /></Field>}
      {kind === 'cohorts' && <Field label="Ngành (tùy chọn)"><input className="field" maxLength={200} value={form.major} onChange={(e) => set({ major: e.target.value })} data-testid="input-catalog-major" /></Field>}
      {kind === 'rooms' && <>
        <div className="span-all notice">Đứng trong phòng khi lấy tọa độ. Phiên điểm danh giữ mốc của buổi học, nên thay đổi phòng sau này không làm sai lịch sử.</div>
        <button type="button" className="btn secondary span-all" onClick={capture} disabled={locating} data-testid="button-capture-room-location">{locating ? <LoaderCircle /> : <MapPin />} Lấy vị trí hiện tại</button>
        <Field label="Vĩ độ"><input className="field" type="number" step="any" min="-90" max="90" value={form.latitude} onChange={(e) => set({ latitude: e.target.value })} data-testid="input-room-latitude" /></Field>
        <Field label="Kinh độ"><input className="field" type="number" step="any" min="-180" max="180" value={form.longitude} onChange={(e) => set({ longitude: e.target.value })} data-testid="input-room-longitude" /></Field>
        <Field label="Bán kính QR (m)" help="Mặc định 50 m, từ 10 đến 500 m."><input className="field" type="number" min="10" max="500" step="5" required value={form.checkInRadiusMeters} onChange={(e) => set({ checkInRadiusMeters: e.target.value })} data-testid="input-room-radius" /></Field>
      </>}
      <label className="check-inline span-all"><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} data-testid="checkbox-catalog-active" /> Đang sử dụng</label>
      {error && <div className="error-banner span-all" role="alert">{error}</div>}
      <div className="modal-actions span-all"><button type="button" className="btn secondary" onClick={onClose}>Hủy</button>
        <button className="btn" type="submit" disabled={pending} data-testid="button-save-catalog-item">{pending ? <LoaderCircle /> : <Plus />} {item ? 'Lưu thay đổi' : 'Tạo mới'}</button></div>
    </form>
  </Modal>;
}
