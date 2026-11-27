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

// Quick reading for the blink check (no descriptor, so it is fast): { ear, box } for the one face,
// { many: true } for more than one, or null for none.
// ear = eye ratio of both eyes, divided by the face's own height/width (eyes-to-mouth over eye-to-eye distance):
// tilting a photo back squashes the whole face, which then cancels out; a blink only closes the eyes.
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
  return { ear: (eyeRatio(left) + eyeRatio(right)) / 2 / shape, box: { x, y, width, height } };
}

// Blink check (liveness): a printed photo or a still picture on a screen can't blink. Feed it each reading's eye
// ratio; push() returns 'waiting' until the eyes have been seen open, then shut (below CLOSED of the open level),
// then open again (above REOPENED), and 'blinked' from then on. The open level is the median of the first readings,
// so it works for any eye shape.
const BASELINE_READINGS = 3;
const MIN_OPEN = 0.15; // eyes must be clearly open at the start (open eyes read about 0.25-0.4)
// The landmark model under-reads closed eyes, so "shut" is a 22% drop; a still photo's jitter is about 3-5%
const CLOSED = 0.78;
const REOPENED = 0.88;
export function makeBlinkTracker() {
  const first = [];
  let open = null;
  let shut = false;
  let done = false;
  return {
    push(ear) {
      if (done) return 'blinked';
      if (open === null) {
        first.push(ear);
        if (first.length < BASELINE_READINGS) return 'waiting';
        const level = [...first].sort((a, b) => a - b)[Math.floor(first.length / 2)];
        if (level < MIN_OPEN) { first.shift(); return 'waiting'; } // not open yet: keep looking
        open = level;
        return 'waiting';
      }
      if (!shut && ear < open * CLOSED) shut = true;
      else if (shut && ear > open * REOPENED) done = true;
      return done ? 'blinked' : 'waiting';
    },
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
