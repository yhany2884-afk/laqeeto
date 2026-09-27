// Face comparison pipeline: YuNet (detection + 5 landmarks, MIT) → similarity alignment to 112×112 → SFace (128-d, Apache-2.0).
// Models: OpenCV Zoo face_detection_yunet_2023mar.onnx and face_recognition_sface_2021dec_int8.onnx.
// Pure TypeScript; the ONNX runtime is injected (native one on Supabase Edge, onnxruntime-node/web in tests).
import { decode as decodeJpeg } from 'npm:jpeg-js@0.4.4';

export type Ort = {
  InferenceSession: { create(model: Uint8Array, opts?: unknown): Promise<Session> };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
};
type Session = { inputNames: string[]; outputNames: string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: number[] }>> };
export type Rgba = { width: number; height: number; data: Uint8Array };
export type Face = { x: number; y: number; w: number; h: number; score: number; kps: [number, number][] };

export const MODEL_VERSION = 'yunet-2023mar+sface-2021dec-int8';
export const SAME_PERSON = 0.363; // OpenCV's published cosine threshold for SFace
const DET = 640;
const MAX_DECODE_PIXELS = 4096 * 4096;

export function decodeImage(bytes: Uint8Array): Rgba {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const img = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_DECODE_PIXELS / 1e6, maxMemoryUsageInMB: 160 });
    return { width: img.width, height: img.height, data: img.data as Uint8Array };
  }
  throw new Error('unsupported image type'); // the app always uploads JPEG (re-encoded on the device)
}

function bilinear(img: Rgba, x: number, y: number, ch: number): number {
  const { width: w, height: h, data } = img;
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0, fy = y - y0;
  const a = data[(y0 * w + x0) * 4 + ch], b = data[(y0 * w + x1) * 4 + ch], c = data[(y1 * w + x0) * 4 + ch], d = data[(y1 * w + x1) * 4 + ch];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** Detect faces. Returns faces in original image coordinates, best first. */
export async function detect(ort: Ort, det: Session, img: Rgba, minScore = 0.6): Promise<Face[]> {
  const scale = DET / Math.max(img.width, img.height);
  const plane = DET * DET, input = new Float32Array(3 * plane);
  const inv = 1 / scale, sw = Math.round(img.width * scale), sh = Math.round(img.height * scale);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const sx = Math.min((x + 0.5) * inv - 0.5, img.width - 1), sy = Math.min((y + 0.5) * inv - 0.5, img.height - 1);
      const i = y * DET + x;
      input[i] = bilinear(img, Math.max(sx, 0), Math.max(sy, 0), 2);          // B
      input[plane + i] = bilinear(img, Math.max(sx, 0), Math.max(sy, 0), 1);  // G
      input[2 * plane + i] = bilinear(img, Math.max(sx, 0), Math.max(sy, 0), 0); // R
    }
  }
  const out = await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, DET, DET]) });
  const faces: Face[] = [];
  for (const s of [8, 16, 32]) {
    const cols = DET / s, rows = DET / s;
    const cls = out[`cls_${s}`].data, obj = out[`obj_${s}`].data, bbox = out[`bbox_${s}`].data, kps = out[`kps_${s}`].data;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const score = Math.sqrt(Math.min(Math.max(cls[i], 0), 1) * Math.min(Math.max(obj[i], 0), 1));
        if (score < minScore) continue;
        const cx = (c + bbox[i * 4]) * s, cy = (r + bbox[i * 4 + 1]) * s, w = Math.exp(bbox[i * 4 + 2]) * s, h = Math.exp(bbox[i * 4 + 3]) * s;
        const pts: [number, number][] = [];
        for (let n = 0; n < 5; n++) pts.push([((kps[i * 10 + 2 * n] + c) * s) * inv, ((kps[i * 10 + 2 * n + 1] + r) * s) * inv]);
        faces.push({ x: (cx - w / 2) * inv, y: (cy - h / 2) * inv, w: w * inv, h: h * inv, score, kps: pts });
      }
    }
  }
  faces.sort((a, b) => b.score - a.score);
  const keep: Face[] = [];
  const iou = (a: Face, b: Face) => {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return inter / (a.w * a.h + b.w * b.h - inter);
  };
  for (const f of faces) if (keep.every((k) => iou(k, f) < 0.3)) keep.push(f);
  return keep;
}

// ArcFace 112×112 reference landmarks (right eye, left eye, nose, right mouth, left mouth — image left to right)
const REF: [number, number][] = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

/** Least-squares similarity transform (Umeyama) mapping src → dst: returns [a, b, tx, ty] with x' = a x − b y + tx, y' = b x + a y + ty. */
export function similarity(src: [number, number][], dst: [number, number][]): [number, number, number, number] {
  const n = src.length;
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i][0] - sx, y = src[i][1] - sy, u = dst[i][0] - dx, v = dst[i][1] - dy;
    num1 += x * u + y * v; num2 += x * v - y * u; den += x * x + y * y;
  }
  const a = num1 / den, b = num2 / den;
  return [a, b, dx - (a * sx - b * sy), dy - (b * sx + a * sy)];
}

/** 128-d L2-normalised embedding of one detected face. */
export async function embed(ort: Ort, rec: Session, img: Rgba, face: Face): Promise<Float32Array> {
  const [a, b, tx, ty] = similarity(face.kps, REF);
  const d = a * a + b * b; // inverse of the similarity transform
  const ia = a / d, ib = -b / d;
  const plane = 112 * 112, input = new Float32Array(3 * plane);
  for (let y = 0; y < 112; y++) {
    for (let x = 0; x < 112; x++) {
      const u = x - tx, v = y - ty;
      const sx = ia * u - ib * v, sy = ib * u + ia * v;
      const i = y * 112 + x;
      input[i] = bilinear(img, sx, sy, 0);            // R (OpenCV swaps BGR→RGB for SFace)
      input[plane + i] = bilinear(img, sx, sy, 1);    // G
      input[2 * plane + i] = bilinear(img, sx, sy, 2); // B
    }
  }
  const out = await rec.run({ [rec.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 112, 112]) });
  const f = Float32Array.from(out[rec.outputNames[0]].data);
  let norm = 0; for (const v of f) norm += v * v; norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < f.length; i++) f[i] /= norm;
  return f;
}

export const cosine = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

export type MatchResult = {
  status: 'match' | 'no_match' | 'no_face_id' | 'no_face_selfie' | 'multiple_faces_selfie';
  score: number | null; faces: { id: number; selfie: number }; detScore: { id: number | null; selfie: number | null }; faceSize: { id: number | null; selfie: number | null };
};

/** Compare the face on the ID card with the selfie. The ID photo may be small, so a lower detection threshold is used there. */
export async function compareFaces(ort: Ort, det: Session, rec: Session, idBytes: Uint8Array, selfieBytes: Uint8Array): Promise<MatchResult> {
  const idImg = decodeImage(idBytes), selfieImg = decodeImage(selfieBytes);
  const idFaces = await detect(ort, det, idImg, 0.5);
  const selfieFaces = await detect(ort, det, selfieImg, 0.6);
  const biggest = (fs: Face[]) => fs.reduce((m, f) => (f.w * f.h > m.w * m.h ? f : m), fs[0]);
  const res: MatchResult = {
    status: 'no_match', score: null, faces: { id: idFaces.length, selfie: selfieFaces.length },
    detScore: { id: null, selfie: null }, faceSize: { id: null, selfie: null },
  };
  if (!idFaces.length) { res.status = 'no_face_id'; return res; }
  if (!selfieFaces.length) { res.status = 'no_face_selfie'; return res; }
  const idFace = biggest(idFaces);
  // a selfie must show one person: a second clearly visible face (≥ 40% of the main one) is suspicious
  const main = biggest(selfieFaces);
  if (selfieFaces.some((f) => f !== main && f.w * f.h >= 0.4 * main.w * main.h)) res.status = 'multiple_faces_selfie';
  res.detScore = { id: round(idFace.score), selfie: round(main.score) };
  res.faceSize = { id: Math.round(Math.min(idFace.w, idFace.h)), selfie: Math.round(Math.min(main.w, main.h)) };
  const [e1, e2] = [await embed(ort, rec, idImg, idFace), await embed(ort, rec, selfieImg, main)];
  res.score = round(cosine(e1, e2));
  if (res.status !== 'multiple_faces_selfie') res.status = res.score >= SAME_PERSON ? 'match' : 'no_match';
  return res;
}
const round = (v: number) => Math.round(v * 10000) / 10000;

export async function loadSessions(ort: Ort, detModel: Uint8Array, recModel: Uint8Array) {
  const [det, rec] = await Promise.all([ort.InferenceSession.create(detModel), ort.InferenceSession.create(recModel)]);
  return { det, rec };
}
