import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Camera, CameraOff, LoaderCircle, ScanLine } from 'lucide-react';
import { BrowserQRCodeReader } from '@zxing/browser';

function extractToken(raw: string) {
  try {
    const url = new URL(raw, window.location.origin);
    if (url.pathname.endsWith('/check-in')) return url.searchParams.get('token');
  } catch { /* not a url */ }
  return null;
}

export function QrScanner() {
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [state, setState] = useState<'idle' | 'starting' | 'scanning' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const stop = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };
  useEffect(() => stop, []);
  const start = async () => {
    setMessage('');
    if (!supported) { setState('error'); setMessage('Thiết bị không cho phép truy cập camera từ trình duyệt. Hãy dùng HTTPS và cấp quyền camera, hoặc quét bằng ứng dụng Camera của điện thoại.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setState('error'); setMessage('Thiết bị không cho phép truy cập camera từ trình duyệt.'); return; }
    setState('starting');
    try {
      const video = videoRef.current!;
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        video,
        (result) => {
          if (!result) return;
          const token = extractToken(result.getText());
          if (token) { stop(); setState('idle'); setLocation(`/check-in?token=${encodeURIComponent(token)}`); return; }
          setMessage('Đã đọc một mã QR nhưng đây không phải mã điểm danh của trường.');
        },
      );
      controlsRef.current = controls;
      setState('scanning');
    } catch (error) {
      stop(); setState('error');
      const name = error instanceof DOMException ? error.name : '';
      setMessage(name === 'NotAllowedError' ? 'Bạn đã từ chối quyền camera. Hãy cho phép camera trong cài đặt trình duyệt rồi thử lại, hoặc quét bằng ứng dụng Camera của điện thoại.'
        : name === 'NotFoundError' ? 'Không tìm thấy camera trên thiết bị này.' : 'Không mở được camera. Hãy thử lại hoặc quét bằng ứng dụng Camera.');
    }
  };
  return <div className="scanner" data-testid="qr-scanner">
    <div className={`scanner-stage ${state === 'scanning' ? 'on' : ''}`}>
      <video ref={videoRef} playsInline muted aria-label="Camera quét mã QR" data-testid="video-qr-scanner" />
      {state === 'scanning' ? <div className="scanner-reticle"><span /></div> : <div className="scanner-idle">{state === 'error' ? <CameraOff /> : <ScanLine />}<strong>{state === 'error' ? 'Chưa thể quét' : 'Quét mã QR trên màn chiếu'}</strong><small>Khung hình chỉ được đọc trên thiết bị để tìm mã, không gửi đi.</small></div>}
    </div>
    {message && <div className={state === 'error' ? 'error-banner' : 'notice'} role="status" style={{ marginTop: 10 }} data-testid="status-scanner">{message}</div>}
    <div className="toolbar" style={{ marginTop: 12 }}>
      {state === 'scanning' ? <button className="btn secondary" onClick={() => { stop(); setState('idle'); }} data-testid="button-stop-scanner"><CameraOff /> Dừng quét</button>
        : <button className="btn" onClick={() => void start()} disabled={state === 'starting'} data-testid="button-start-scanner">{state === 'starting' ? <LoaderCircle /> : <Camera />} {state === 'error' ? 'Thử lại' : 'Mở camera quét QR'}</button>}
      {!supported && <span className="form-help" style={{ margin: 0 }}>Trình duyệt chưa cho phép truy cập camera.</span>}
    </div>
  </div>;
}
