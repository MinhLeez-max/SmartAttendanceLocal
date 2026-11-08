import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetAttendanceOverviewQueryKey, getListAcademicLessonsQueryKey, useCreateAcademicLessons, useUpdateAcademicLesson } from '@workspace/api-client-react';
import type { AcademicLesson, AcademicSection, CatalogItem, SchoolUser } from '@workspace/api-client-react';
import { Ban, CalendarPlus, LoaderCircle, Save } from 'lucide-react';
import { Field, Modal } from '@/components/portal-ui';
import { WEEKDAYS, errorText, vnDate, vnTime, weekdayOf } from '@/lib/portal';

type Common = { sections: AcademicSection[]; teachers: SchoolUser[]; rooms: CatalogItem[]; semesters: CatalogItem[]; onClose: () => void };

export function LessonSeriesDialog({ sections, teachers, rooms, semesters, onClose, defaultClassId }: Common & { defaultClassId?: number }) {
  const qc = useQueryClient();
  const create = useCreateAcademicLessons();
  const first = sections.find((s) => s.id === defaultClassId) ?? sections[0];
  const semFor = (s?: AcademicSection) => semesters.find((x) => x.id === s?.semesterId);
  const [form, setForm] = useState(() => ({
    classId: first ? String(first.id) : '', teacherId: first?.teacherIds[0] ? String(first.teacherIds[0]) : '', roomId: first?.roomId ? String(first.roomId) : '',
    mode: 'weekly' as 'weekly' | 'single', weekday: '1', startDate: semFor(first)?.startDate ?? '', endDate: semFor(first)?.endDate ?? '', date: '', startsAt: '07:00', endsAt: '09:30',
  }));
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const pickSection = (id: string) => {
    const s = sections.find((x) => String(x.id) === id); const sem = semFor(s);
    setForm((f) => ({ ...f, classId: id, teacherId: s?.teacherIds[0] ? String(s.teacherIds[0]) : '', roomId: s?.roomId ? String(s.roomId) : f.roomId, startDate: sem?.startDate ?? f.startDate, endDate: sem?.endDate ?? f.endDate }));
  };
  const section = sections.find((s) => String(s.id) === form.classId);
  const sectionTeachers = teachers.filter((t) => section?.teacherIds.includes(t.id));
  const submit = (e: FormEvent) => {
    e.preventDefault(); setError(''); setDone('');
    if (form.endsAt <= form.startsAt) { setError('Giờ kết thúc phải sau giờ bắt đầu.'); return; }
    const single = form.mode === 'single';
    if (!single && form.endDate < form.startDate) { setError('Ngày kết thúc phải sau ngày bắt đầu.'); return; }
    create.mutate({ data: {
      classId: Number(form.classId), teacherId: Number(form.teacherId), roomId: Number(form.roomId),
      startDate: single ? form.date : form.startDate, endDate: single ? form.date : form.endDate, weekday: single ? null : Number(form.weekday), startsAt: form.startsAt, endsAt: form.endsAt,
    } }, {
      onSuccess: (lessons) => {
        void qc.invalidateQueries({ queryKey: getListAcademicLessonsQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
        setDone(`Đã tạo ${Array.isArray(lessons) ? lessons.length : ''} buổi học.`);
      },
      onError: (err) => setError(errorText(err)),
    });
  };
  return <Modal eyebrow="Xếp lịch" title="Thêm lịch học" subtitle="Lịch lặp được tách thành từng buổi cụ thể theo giờ Việt Nam. Máy chủ chặn trùng giảng viên, phòng và lớp." onClose={onClose}>
    <form className="field-grid" onSubmit={submit} data-testid="form-lesson-series">
      <Field label="Lớp học phần" span><select className="select-field" required value={form.classId} onChange={(e) => pickSection(e.target.value)} data-testid="select-series-section"><option value="">Chọn lớp</option>{sections.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.code ?? '—'} · {s.name}</option>)}</select></Field>
      {section && section.needsSetup.length > 0 && <div className="notice span-all">Lớp này còn thiếu: {section.needsSetup.join('; ')}.</div>}
      <Field label="Giảng viên"><select className="select-field" required value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} data-testid="select-series-teacher"><option value="">Chọn giảng viên</option>{(sectionTeachers.length ? sectionTeachers : teachers).map((t) => <option key={t.id} value={t.id}>{t.displayName || t.email}</option>)}</select></Field>
      <Field label="Phòng"><select className="select-field" required value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })} data-testid="select-series-room"><option value="">Chọn phòng</option>{rooms.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}</select></Field>
      <div className="span-all segmented small">
        <button type="button" className={form.mode === 'weekly' ? 'active' : ''} onClick={() => setForm({ ...form, mode: 'weekly' })} data-testid="button-mode-weekly">Lặp hằng tuần</button>
        <button type="button" className={form.mode === 'single' ? 'active' : ''} onClick={() => setForm({ ...form, mode: 'single' })} data-testid="button-mode-single">Một buổi</button>
      </div>
      {form.mode === 'weekly' ? <>
        <Field label="Thứ trong tuần" span><select className="select-field" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: e.target.value })} data-testid="select-series-weekday">{[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}</select></Field>
        <Field label="Áp dụng từ ngày"><input className="field" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} data-testid="input-series-start" /></Field>
        <Field label="Đến ngày"><input className="field" type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} data-testid="input-series-end" /></Field>
      </> : <Field label="Ngày học" span help={form.date ? WEEKDAYS[weekdayOf(form.date)] : undefined}><input className="field" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="input-series-date" /></Field>}
      <Field label="Bắt đầu"><input className="field" type="time" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} data-testid="input-series-starts" /></Field>
      <Field label="Kết thúc"><input className="field" type="time" required value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} data-testid="input-series-ends" /></Field>
      {error && <div className="error-banner span-all" role="alert" data-testid="status-series-error">{error}</div>}
      {done && <div className="success-banner span-all" role="status">{done} Bạn có thể thêm khung giờ khác hoặc đóng hộp thoại.</div>}
      <div className="modal-actions span-all"><button type="button" className="btn secondary" onClick={onClose}>Đóng</button>
        <button className="btn" type="submit" disabled={create.isPending || !form.classId} data-testid="button-save-series">{create.isPending ? <LoaderCircle /> : <CalendarPlus />} Tạo buổi học</button></div>
    </form>
  </Modal>;
}

export function LessonEditDialog({ lesson, teachers, rooms, onClose }: { lesson: AcademicLesson; teachers: SchoolUser[]; rooms: CatalogItem[]; onClose: () => void }) {
  const qc = useQueryClient();
  const update = useUpdateAcademicLesson();
  const locked = lesson.sessionId != null;
  const [form, setForm] = useState({ date: vnDate(lesson.startsAt), startsAt: vnTime(lesson.startsAt), endsAt: vnTime(lesson.endsAt), teacherId: String(lesson.teacherId), roomId: String(lesson.roomId), status: lesson.status as 'scheduled' | 'cancelled', reason: '' });
  const [error, setError] = useState('');
  const submit = (e: FormEvent, status = form.status) => {
    e.preventDefault(); setError('');
    if (form.reason.trim().length < 3) { setError('Hãy ghi lý do thay đổi (ít nhất 3 ký tự).'); return; }
    if (form.endsAt <= form.startsAt) { setError('Giờ kết thúc phải sau giờ bắt đầu.'); return; }
    update.mutate({ id: lesson.id, data: { date: form.date, startsAt: form.startsAt, endsAt: form.endsAt, teacherId: Number(form.teacherId), roomId: Number(form.roomId), status, reason: form.reason.trim() } }, {
      onSuccess: () => { void qc.invalidateQueries({ queryKey: getListAcademicLessonsQueryKey() }); onClose(); },
      onError: (err) => setError(errorText(err)),
    });
  };
  return <Modal eyebrow={`Buổi học · ${lesson.className}`} title={locked ? 'Buổi học đã có phiên điểm danh' : 'Sửa riêng buổi học này'} subtitle={`${lesson.subject} · ${vnDate(lesson.startsAt)} ${vnTime(lesson.startsAt)}–${vnTime(lesson.endsAt)}`} onClose={onClose}>
    {locked ? <div className="notice">Buổi này đã mở điểm danh nên không thể đổi giờ, phòng hoặc hủy, để không viết lại lịch sử. Nếu cần, hãy tạo một buổi bù riêng.</div> :
      <form className="field-grid" onSubmit={(e) => submit(e)} data-testid="form-lesson-edit">
        {lesson.status === 'cancelled' && <div className="notice span-all">Buổi này đang bị hủy{lesson.reason ? `: ${lesson.reason}` : ''}. Chọn trạng thái "Diễn ra" để khôi phục.</div>}
        <Field label="Ngày"><input className="field" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="input-lesson-date" /></Field>
        <Field label="Trạng thái"><select className="select-field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'scheduled' | 'cancelled' })} data-testid="select-lesson-status"><option value="scheduled">Diễn ra</option><option value="cancelled">Hủy buổi</option></select></Field>
        <Field label="Bắt đầu"><input className="field" type="time" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} data-testid="input-lesson-starts" /></Field>
        <Field label="Kết thúc"><input className="field" type="time" required value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} data-testid="input-lesson-ends" /></Field>
        <Field label="Giảng viên"><select className="select-field" value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} data-testid="select-lesson-teacher">{!teachers.some((t) => t.id === lesson.teacherId) && <option value={lesson.teacherId}>{lesson.teacherName}</option>}{teachers.map((t) => <option key={t.id} value={t.id}>{t.displayName || t.email}</option>)}</select></Field>
        <Field label="Phòng"><select className="select-field" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })} data-testid="select-lesson-room">{!rooms.some((r) => r.id === lesson.roomId) && <option value={lesson.roomId}>{lesson.roomName}</option>}{rooms.filter((r) => r.active || r.id === lesson.roomId).map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}</select></Field>
        <Field label="Lý do thay đổi" span help="Bắt buộc, được lưu cùng buổi học để giảng viên và sinh viên hiểu thay đổi."><textarea className="field textarea" required minLength={3} maxLength={1000} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ví dụ: Giảng viên đi công tác, chuyển sang phòng G2-305" data-testid="input-lesson-reason" /></Field>
        {error && <div className="error-banner span-all" role="alert">{error}</div>}
        <div className="modal-actions span-all">
          {form.status === 'scheduled' && lesson.status === 'scheduled' && <button type="button" className="btn danger" disabled={update.isPending} onClick={(e) => submit(e as unknown as FormEvent, 'cancelled')} data-testid="button-cancel-lesson"><Ban /> Hủy buổi này</button>}
          <button className="btn" type="submit" disabled={update.isPending} data-testid="button-save-lesson">{update.isPending ? <LoaderCircle /> : <Save />} Lưu thay đổi</button>
        </div>
      </form>}
  </Modal>;
}
