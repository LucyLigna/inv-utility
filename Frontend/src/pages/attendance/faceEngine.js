// Face detection on the device (face-api.js, @vladmandic/face-api). The library and its models (public/face-models,
// about 7 MB) are loaded the first time an attendance screen needs them, not with the rest of the app.
// A face gives a descriptor: 128 numbers; the server compares descriptors (see Backend/src/routes/attendance.js).

const MODEL_URL = `${import.meta.env.BASE_URL}face-models`;
// Detector input size (multiple of 32): smaller is faster, larger finds smaller faces
const INPUT_SIZE = 320;
// Ignore weak detections and faces too far from the camera (box width in pixels of the video)
const MIN_SCORE = 0.6;
export const MIN_FACE_WIDTH = 120;

let loading = null;
export function loadFaceApi() {
  if (!loading) {
    loading = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      await faceapi.tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    })().catch((err) => {
      loading = null; // try again next time
      throw err;
    });
  }
  return loading;
}

// The one face in the video: { descriptor: number[128], box: { x, y, width, height }, score } or null.
// More than one face: { many: true } (only one person at a time may be marked).
export async function readFace(faceapi, video) {
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: INPUT_SIZE, scoreThreshold: MIN_SCORE });
  const found = await faceapi.detectAllFaces(video, options).withFaceLandmarks().withFaceDescriptors();
  if (!found.length) return null;
  if (found.length > 1) return { many: true };
  const { detection, descriptor } = found[0];
  const { x, y, width, height } = detection.box;
  return { descriptor: Array.from(descriptor), box: { x, y, width, height }, score: detection.score };
}

// Eye aspect ratio (Soukupova & Cech): eye height / width from the 6 landmark points of an eye.
// Open eyes are about 0.25-0.35; it falls well below that during a blink.
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const eyeRatio = (p) => (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]));

const mid = (points) => ({ x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length });

// Pixels of the current frame, for the eye-darkness reading (one canvas, reused)
let frameCanvas = null;
function frameContext(input) {
  const w = input.videoWidth || input.width;
  const h = input.videoHeight || input.height;
  if (!frameCanvas) frameCanvas = document.createElement('canvas');
  if (frameCanvas.width !== w || frameCanvas.height !== h) {
    frameCanvas.width = w;
    frameCanvas.height = h;
  }
  const ctx = frameCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(input, 0, 0, w, h);
  return ctx;
}
// Brightness (0-255) of each pixel in a box around (cx, cy)
function brightness(ctx, cx, cy, w, h) {
  const x = Math.max(0, Math.round(cx - w / 2));
  const y = Math.max(0, Math.round(cy - h / 2));
  const { data } = ctx.getImageData(x, y, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const out = [];
  for (let i = 0; i < data.length; i += 4) out.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  return out;
}
const percentile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
// Contrast in the eye area: an open eye has white and dark parts (sclera, iris, pupil, lashes); a closed lid is
// nearly even. (bright - dark) / middle brightness, so the room's light doesn't matter. Tested on the demo photos:
// open eyes 0.75-1.7, the same eyes painted shut fell by 90%, a still photo moved about wobbled by up to 14%.
// (The landmark model's eye shape hardly changes when eyes close: it hardly moved even with the eyes painted shut.)
function eyeContrast(ctx, left, right) {
  const one = (eye) => {
    const w = dist(eye[0], eye[3]);
    const c = mid(eye);
    const px = brightness(ctx, c.x, c.y, w * 0.9, w * 0.45).sort((a, b) => a - b);
    return (percentile(px, 0.9) - percentile(px, 0.1)) / (percentile(px, 0.5) + 10);
  };
  return (one(left) + one(right)) / 2;
}

// Quick reading for the blink check (no descriptor, so it is fast): { ear, contrast, box } for the one face,
// { many: true } for more than one, or null for none.
// ear = eye ratio of both eyes, divided by the face's own height/width (eyes-to-mouth over eye-to-eye distance):
// tilting a photo back squashes the whole face, which then cancels out; a blink only closes the eyes.
// contrast = contrast in the eye areas (see eyeContrast): the main blink signal.
export async function readEyes(faceapi, video) {
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: INPUT_SIZE, scoreThreshold: MIN_SCORE });
  const found = await faceapi.detectAllFaces(video, options).withFaceLandmarks();
  if (!found.length) return null;
  if (found.length > 1) return { many: true };
  const { detection, landmarks } = found[0];
  const { x, y, width, height } = detection.box;
  const left = landmarks.getLeftEye();
  const right = landmarks.getRightEye();
  const eyes = mid([...left, ...right]);
  const shape = dist(eyes, mid(landmarks.getMouth())) / dist(mid(left), mid(right));
  let contrast = null;
  try {
    contrast = eyeContrast(frameContext(video), left, right);
  } catch {
    contrast = null; // pixels not readable: the eye ratio still works
  }
  return { ear: (eyeRatio(left) + eyeRatio(right)) / 2 / shape, contrast, box: { x, y, width, height } };
}

// Blink check (liveness): a printed photo or a still picture on a screen can't blink.
// A dip: a reading falls below `closed` of its open level, then comes back above `reopened`. The open level is the
// second-highest reading so far (one odd high reading doesn't count), so it works for any eyes, glasses, and eyes
// not wide open at the start.
const BASELINE_READINGS = 3;
function makeDip(closed, reopened) {
  const seen = [];
  let shut = false;
  let done = false;
  let lowest = Infinity; // lowest reading against the open level (for the "Blink not seen" note)
  return {
    push(value) {
      if (done || value == null) return done;
      seen.push(value);
      if (seen.length < BASELINE_READINGS) return false;
      const sorted = [...seen].sort((a, b) => b - a);
      const open = sorted[1];
      if (!(open > 0)) return false;
      lowest = Math.min(lowest, value / open);
      if (!shut && value < open * closed) shut = true;
      else if (shut && value > open * reopened) done = true;
      return done;
    },
    closedBy: () => (Number.isFinite(lowest) ? Math.round((1 - lowest) * 100) : 0),
    readings: () => seen.length,
  };
}
// Two signals, either may see the blink:
//  eye contrast (main): a 35% drop counts as shut; a still photo wobbles by up to about 15%
//  eye ratio: the landmark model barely sees closed eyes, so a 15% drop counts (a still photo jitters 3-5%)
const EAR_CLOSED = 0.85;
const EAR_REOPENED = 0.93;
const CONTRAST_CLOSED = 0.65;
const CONTRAST_REOPENED = 0.85;
export function makeBlinkTracker() {
  const ear = makeDip(EAR_CLOSED, EAR_REOPENED);
  const contrast = makeDip(CONTRAST_CLOSED, CONTRAST_REOPENED);
  return {
    // reading: { ear, contrast } from readEyes (a bare number is taken as the eye ratio)
    push(reading) {
      const r = typeof reading === 'number' ? { ear: reading, contrast: null } : reading;
      const a = ear.push(r.ear);
      const b = contrast.push(r.contrast);
      return a || b ? 'blinked' : 'waiting';
    },
    // What was seen: readings, and how far each signal dropped at most against what a blink needs (percent)
    stats: () => ({
      readings: ear.readings(),
      closedBy: ear.closedBy(),
      needed: Math.round((1 - EAR_CLOSED) * 100),
      contrastBy: contrast.readings() ? contrast.closedBy() : null,
      contrastNeeded: Math.round((1 - CONTRAST_CLOSED) * 100),
    }),
  };
}

// Starts the camera in the video element; facingMode 'user' = front camera. Returns a stop() function.
// Phone browsers allow the camera only on https pages (or localhost); the Android app is fine.
export async function startCamera(video, facingMode = 'user') {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('The camera works only when this page is opened over https (or on this computer at localhost).');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  await video.play();
  return () => stream.getTracks().forEach((t) => t.stop());
}

export const cameraErrorText = (err) => (err?.name === 'NotAllowedError'
  ? 'Camera permission was refused. Allow the camera for this site and try again.'
  : err?.message || 'The camera could not be started.');
