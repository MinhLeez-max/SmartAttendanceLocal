import type { ReactNode } from 'react';
import { BookOpen, CircleAlert, RefreshCw, X } from 'lucide-react';
import { errorText } from '@/lib/portal';

export function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>;
}

export function LoadingState({ label = 'Đang đồng bộ dữ liệu…', rows = 1 }: { label?: string; rows?: number }) {
  return <div className="skeleton-stack" role="status" data-testid="status-loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="loading-row">{i === 0 ? label : '\u00a0'}</div>)}</div>;
}

export function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="empty-state card" data-testid="status-error"><div className="empty-icon"><CircleAlert /></div><strong>Chưa thể tải dữ liệu</strong><p>{errorText(error)}</p>
    <button className="btn secondary" style={{ marginTop: 15 }} onClick={retry} data-testid="button-retry"><RefreshCw /> Thử lại</button></div>;
}

export function EmptyState({ title, detail, icon, action }: { title: string; detail: string; icon?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state" data-testid="status-empty"><div className="empty-icon">{icon ?? <BookOpen />}</div><strong>{title}</strong><p>{detail}</p>{action && <div style={{ marginTop: 14 }}>{action}</div>}</div>;
}

export function Modal({ eyebrow, title, subtitle, onClose, children, wide }: { eyebrow: string; title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`card modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2>{subtitle && <p className="page-subtitle" style={{ marginTop: 5 }}>{subtitle}</p>}</div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng" data-testid="button-close-dialog"><X /></button></div>
      {children}
    </div>
  </div>;
}

export function Field({ label, help, children, span }: { label: string; help?: string; children: ReactNode; span?: boolean }) {
  return <label className={span ? 'span-all' : undefined}><span className="form-label">{label}</span>{children}{help && <span className="form-help">{help}</span>}</label>;
}
