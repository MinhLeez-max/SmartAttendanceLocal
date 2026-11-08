import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListAttendanceHistoryQueryKey, useListAttendanceHistory, useUpdateAttendanceRecord } from '@workspace/api-client-react';
import type { AttendanceRecord } from '@workspace/api-client-react';
import { History, LoaderCircle, PencilLine, Save } from 'lucide-react';
import { errorText, statusText, vnDateTime } from '@/lib/portal';

type Status = 'present' | 'late' | 'absent';

export function AttendanceRecordRow({ record, onSaved }: { record: AttendanceRecord; onSaved: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(record.status);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const update = useUpdateAttendanceRecord();
  const history = useListAttendanceHistory(record.id, { query: { enabled: open, queryKey: getListAttendanceHistoryQueryKey(record.id) } });
  const submit = (e: FormEvent) => {
    e.preventDefault(); setError(''); setSaved(false);
    if (status === record.status) { setError('Hãy chọn trạng thái khác với hiện tại.'); return; }
    if (note.trim().length < 3) { setError('Lý do điều chỉnh cần ít nhất 3 ký tự.'); return; }
    update.mutate({ recordId: record.id, data: { status, note: note.trim() } }, {
      onSuccess: () => { setNote(''); setSaved(true); onSaved(); void qc.invalidateQueries({ queryKey: getListAttendanceHistoryQueryKey(record.id) }); },
      onError: (err) => setError(errorText(err)),
    });
  };
  return <>
    <tr data-testid={`row-checkin-${record.id}`}>
      <td><div className="student-name">{record.studentName}</div><div className="student-code">{record.studentCode}</div></td>
      <td>{record.checkedInAt ? vnDateTime(record.checkedInAt) : '—'}</td>
      <td><span className={`pill ${record.status === 'absent' ? 'review' : record.status === 'late' ? 'closed' : ''}`} data-testid={`status-record-${record.id}`}>{statusText[record.status]}</span></td>
      <td><button className={`btn ${open ? '' : 'ghost'}`} onClick={() => { setOpen(!open); setStatus(record.status); setError(''); setSaved(false); }} data-testid={`button-correct-record-${record.id}`}><PencilLine /> {open ? 'Đóng' : 'Điều chỉnh'}</button></td>
    </tr>
    {open && <tr className="correction-row"><td colSpan={4}>
      <form className="correction-form" onSubmit={submit} data-testid={`form-correct-record-${record.id}`}>
        <select className="select-field" value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Trạng thái mới" data-testid={`select-record-status-${record.id}`}><option value="present">Có mặt</option><option value="late">Đi muộn</option><option value="absent">Vắng</option></select>
        <input className="field" required minLength={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do bắt buộc, ví dụ: điện thoại hết pin, đã xác nhận trực tiếp" aria-label="Lý do điều chỉnh" data-testid={`input-record-note-${record.id}`} />
        <button className="btn" type="submit" disabled={update.isPending} data-testid={`button-save-record-${record.id}`}>{update.isPending ? <LoaderCircle /> : <Save />} Lưu</button>
      </form>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {saved && <div className="success-banner" role="status">Đã lưu điều chỉnh và ghi vào lịch sử.</div>}
      <div className="audit-list"><div className="form-label"><History size={12} style={{ verticalAlign: 'middle' }} /> Lịch sử điều chỉnh</div>
        {history.isLoading ? <div className="loading-row">Đang tải lịch sử…</div> : history.isError ? <div className="error-banner">{errorText(history.error)}</div> : !history.data?.length ? <p className="form-help">Chưa có điều chỉnh thủ công.</p> :
          history.data.map((h) => <div key={h.id} className="audit-item" data-testid={`audit-${h.id}`}><strong>{h.actorName}</strong> đổi {statusText[h.beforeStatus] ?? h.beforeStatus} → {statusText[h.afterStatus] ?? h.afterStatus}<span>{vnDateTime(h.createdAt)}</span><em>{h.reason}</em></div>)}
      </div>
    </td></tr>}
  </>;
}
