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
