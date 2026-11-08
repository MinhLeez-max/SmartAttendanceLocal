import { useState, type FormEvent } from 'react';
import { useCreateSessionCheckIn } from '@workspace/api-client-react';
import type { Student } from '@workspace/api-client-react';
import { LoaderCircle, UserCheck } from 'lucide-react';
import { errorText } from '@/lib/portal';

/** Roster member without a record in this session (e.g. legacy session or enrolled later). */
export function ManualCheckInRow({ sessionId, qrToken, active, student, onSaved }: { sessionId: number; qrToken: string; active: boolean; student: Student; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const create = useCreateSessionCheckIn();
  const submit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (note.trim().length < 3) { setError('Lý do cần ít nhất 3 ký tự.'); return; }
    create.mutate({ sessionId, data: { studentCode: student.studentCode, qrToken, note: note.trim() } }, {
      onSuccess: () => { setOpen(false); setNote(''); onSaved(); },
      onError: (err) => setError(errorText(err)),
    });
  };
  return <>
    <tr className="row-muted" data-testid={`row-roster-missing-${student.id}`}>
      <td><div className="student-name">{student.fullName}</div><div className="student-code">{student.studentCode}</div></td>
      <td>—</td>
      <td><span className="pill review">Vắng · chưa có bản ghi</span></td>
      <td>{active ? <button className={`btn ${open ? '' : 'ghost'}`} onClick={() => setOpen(!open)} data-testid={`button-manual-checkin-${student.id}`}><UserCheck /> {open ? 'Đóng' : 'Ghi có mặt'}</button> : <span className="form-help">Phiên đã đóng</span>}</td>
    </tr>
    {open && <tr className="correction-row"><td colSpan={4}>
      <form className="correction-form" onSubmit={submit}>
        <input className="field" required minLength={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do ghi thủ công, ví dụ: đã xác nhận trực tiếp tại lớp" aria-label="Lý do" data-testid={`input-manual-note-${student.id}`} />
        <button className="btn" type="submit" disabled={create.isPending} data-testid={`button-save-manual-${student.id}`}>{create.isPending ? <LoaderCircle /> : <UserCheck />} Lưu</button>
      </form>
      {error && <div className="error-banner" role="alert">{error}</div>}
    </td></tr>}
  </>;
}
