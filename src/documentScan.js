const CARD_ASPECT = 85.6 / 53.98;

let cvPromise;

export function loadOpenCv() {
  if (!cvPromise) {
    cvPromise = import("@techstark/opencv-js").then(async (mod) => {
      const cvModule = mod.default;
      if (cvModule instanceof Promise) return cvModule;
      if (cvModule.Mat) return cvModule;
      await new Promise((resolve) => {
        cvModule.onRuntimeInitialized = () => resolve();
      });
      return cvModule;
    });
  }
  return cvPromise;
}

export async function scanDocument(source) {
  let cv;
  try {
    cv = await loadOpenCv();
  } catch {
    return null;
  }

  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const view = scale < 1 ? resizeCanvas(source, scale) : source;
  const src = matFromCanvas(cv, view);
  const held = [src];
  const track = (mat) => {
    held.push(mat);
    return mat;
  };

  try {
    const quad = findBestQuad(cv, src, track);
    if (!quad) return null;
    const points = insetPoints(
      quad.map((point) => ({ x: point.x / scale, y: point.y / scale })),
      0.012
    );
    return warpCard(cv, source, points);
  } catch {
    return null;
  } finally {
    for (const mat of held) {
      try {
        mat?.delete();
      } catch {
        /* already released */
      }
    }
  }
}

function findBestQuad(cv, src, track) {
  const gray = track(new cv.Mat());
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  const blur = track(new cv.Mat());
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);

  const found = [];
  for (const [low, high] of [
    [25, 90],
    [40, 140],
    [70, 200],
  ]) {
    const edges = track(new cv.Mat());
    cv.Canny(blur, edges, low, high);
    const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    cv.dilate(edges, edges, kernel);
    found.push(...quadsFromBinary(cv, edges, src.cols, src.rows, track));
  }

  const otsu = track(new cv.Mat());
  cv.threshold(blur, otsu, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  found.push(...quadsFromBinary(cv, otsu, src.cols, src.rows, track));

  const adaptive = track(new cv.Mat());
  cv.adaptiveThreshold(blur, adaptive, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 8);
  found.push(...quadsFromBinary(cv, adaptive, src.cols, src.rows, track));

  if (!found.length) return null;
  found.sort((a, b) => b.score - a.score);
  return found[0].points;
}

function quadsFromBinary(cv, binary, width, height, track) {
  const contours = track(new cv.MatVector());
  const hierarchy = track(new cv.Mat());
  cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  const imageArea = width * height;
  const found = [];
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    if (area < imageArea * 0.08 || area > imageArea * 0.9) {
      contour.delete();
      continue;
    }
    const points = rectPoints(cv, cv.minAreaRect(contour));
    contour.delete();
    if (!points) continue;
    const ordered = orderLongEdge(points);
    const aspect = longOverShort(ordered);
    const error = Math.abs(Math.log(aspect / CARD_ASPECT));
    if (!Number.isFinite(error) || error > 0.38) continue;
    const boxArea = edgeLength(ordered[0], ordered[1]) * edgeLength(ordered[1], ordered[2]);
    if (boxArea < imageArea * 0.08 || boxArea > imageArea * 0.94) continue;
    found.push({ points: ordered, score: boxArea / (0.06 + error) });
  }
  return found;
}

function rectPoints(cv, rect) {
  if (cv.RotatedRect?.points) {
    const points = cv.RotatedRect.points(rect);
    return points.map((point) => ({ x: point.x, y: point.y }));
  }
  if (!cv.boxPoints) return null;
  const out = new cv.Mat();
  try {
    cv.boxPoints(rect, out);
    const data = out.data32F;
    return [0, 1, 2, 3].map((index) => ({ x: data[index * 2], y: data[index * 2 + 1] }));
  } finally {
    out.delete();
  }
}

function orderLongEdge(points) {
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const ring = points
    .slice()
    .sort(
      (a, b) => Math.atan2(a.y - centerY, a.x - centerX) - Math.atan2(b.y - centerY, b.x - centerX)
    );
  let start = 0;
  let longest = 0;
  for (let index = 0; index < 4; index++) {
    const length = edgeLength(ring[index], ring[(index + 1) % 4]);
    if (length > longest) {
      longest = length;
      start = index;
    }
  }
  let ordered = [0, 1, 2, 3].map((offset) => ring[(start + offset) % 4]);
  if (ordered[0].x > ordered[1].x || (Math.abs(ordered[0].x - ordered[1].x) < 2 && ordered[0].y > ordered[1].y)) {
    ordered = [ordered[2], ordered[3], ordered[0], ordered[1]];
  }
  return winding(ordered);
}

function winding(points) {
  const cross =
    (points[1].x - points[0].x) * (points[3].y - points[0].y) -
    (points[1].y - points[0].y) * (points[3].x - points[0].x);
  if (cross >= 0) return points;
  return [points[0], points[3], points[2], points[1]];
}

function insetPoints(points, amount) {
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  return points.map((point) => ({
    x: point.x + (centerX - point.x) * amount,
    y: point.y + (centerY - point.y) * amount,
  }));
}

function longOverShort(points) {
  const long = edgeLength(points[0], points[1]);
  const short = (edgeLength(points[1], points[2]) + edgeLength(points[0], points[3])) / 2;
  return long / Math.max(1, short);
}

function edgeLength(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function warpCard(cv, source, points) {
  const src = matFromCanvas(cv, source);
  const width = Math.max(edgeLength(points[0], points[1]), edgeLength(points[3], points[2]));
  const destWidth = Math.max(640, Math.round(width));
  const destHeight = Math.max(1, Math.round(destWidth / CARD_ASPECT));
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, points.flatMap((point) => [point.x, point.y]));
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    destWidth - 1,
    0,
    destWidth - 1,
    destHeight - 1,
    0,
    destHeight - 1,
  ]);
  const transform = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  const canvas = document.createElement("canvas");
  try {
    cv.warpPerspective(
      src,
      dst,
      transform,
      new cv.Size(destWidth, destHeight),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE
    );
    canvas.width = destWidth;
    canvas.height = destHeight;
    cv.imshow(canvas, dst);
    return canvas;
  } finally {
    src.delete();
    dst.delete();
    transform.delete();
    srcTri.delete();
    dstTri.delete();
  }
}

function matFromCanvas(cv, canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return cv.matFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

function resizeCanvas(source, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(source.width * scale));
  canvas.height = Math.max(2, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
