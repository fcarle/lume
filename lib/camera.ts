export interface CameraFeatures { torch: boolean; zoom: { min: number; max: number; step: number } | null }
type ExtendedCapabilities = MediaTrackCapabilities & { torch?: boolean; zoom?: { min: number; max: number; step: number }; focusMode?: string[] };
export async function openCamera(): Promise<{ stream: MediaStream; features: CameraFeatures }> {
  if (!window.isSecureContext) throw new Error('Camera access needs HTTPS. Open your secure Lume URL in Safari.');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot access a camera. Try Safari or explore the demo.');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 }, frameRate: { ideal: 24, max: 30 } } });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError') throw new Error('Camera access is turned off. Allow camera access in Safari’s website settings, then try again.');
    if (name === 'NotFoundError') throw new Error('No camera was found. Connect a camera or try the reading demo.');
    if (name === 'NotReadableError') throw new Error('The camera is busy. Close other apps using it, then try again.');
    throw new Error('The camera could not start. Check access in your browser settings and try again.');
  }
  const track = stream.getVideoTracks()[0];
  const capabilities: ExtendedCapabilities = track.getCapabilities?.() ?? {};
  if (capabilities.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
  return { stream, features: { torch: !!capabilities.torch, zoom: capabilities.zoom ?? null } };
}
export async function setCameraFeature(stream: MediaStream, feature: 'torch' | 'zoom', value: boolean | number) {
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') throw new Error('Camera disconnected. Start the camera again.');
  await track.applyConstraints({ advanced: [{ [feature]: value } as MediaTrackConstraintSet] });
}

// Crop in displayed-video coordinates, accounting for object-fit: cover.
export function cropVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement, zone: { width: number; height: number }): boolean {
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2 || !video.clientWidth || !video.clientHeight) return false;
  const scale = Math.max(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight);
  const sourceWidth = video.clientWidth / scale * zone.width;
  const sourceHeight = video.clientHeight / scale * zone.height;
  const x = (video.videoWidth - sourceWidth) / 2, y = (video.videoHeight - sourceHeight) / 2;
  const outputScale = Math.min(1.8, 1400 / sourceWidth);
  canvas.width = Math.round(sourceWidth * outputScale); canvas.height = Math.round(sourceHeight * outputScale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(video, x, y, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return true;
}

// The preview uses object-fit: contain, so capture every pixel of the visible camera frame.
export function capturePageFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, maxEdge = 2400): boolean {
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return false;
  const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) return false;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return true;
}
