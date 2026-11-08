export const TZ = 'Asia/Ho_Chi_Minh';

export const errorText = (error: unknown) => {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error;
  }
  return error instanceof Error ? error.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.';
};

export const vnDate = (value: Date | string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export const vnTime = (value: Date | string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
export const vnDateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
  : 'Chưa ghi nhận';

const parse = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const addDays = (ymd: string, n: number) => { const t = parse(ymd); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const weekdayOf = (ymd: string) => parse(ymd).getUTCDay();
export const mondayOf = (ymd: string) => addDays(ymd, -((weekdayOf(ymd) + 6) % 7));
export const dayLabel = (ymd: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }).format(parse(ymd));
export const longDate = (ymd: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(parse(ymd));
export const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export const roleText: Record<string, string> = { admin: 'Quản trị viên', teacher: 'Giảng viên', student: 'Sinh viên', pending: 'Chờ phân quyền' };
export const statusText: Record<string, string> = { present: 'Có mặt', late: 'Đi muộn', absent: 'Vắng' };
export const initials = (name?: string | null) => (name || '?').trim().split(/\s+/).slice(-2).map((p) => p[0]?.toUpperCase() ?? '').join('');
