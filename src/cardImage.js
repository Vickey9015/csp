const CARD_WIDTH_MM = 85.6;
const CARD_HEIGHT_MM = 53.98;
const PRINT_DPI = 300;
const BRIGHTNESS = 1.12;
const MAX_BYTES = 20 * 1024 * 1024;
const ANALYSIS_MAX = 480;

export const CARD_PX = {
  width: Math.round((CARD_WIDTH_MM / 25.4) * PRINT_DPI),
  height: Math.round((CARD_HEIGHT_MM / 25.4) * PRINT_DPI),
};

export async function readCardFile(file, rotation = 0) {
  if (!file) {
    throw new Error("Choose a photo to upload.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Upload a JPG or PNG photo of the card.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("That photo is larger than 20 MB.");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bitmap = await createImageBitmap(file);
  }
  try {
    return fitCard(bitmap, rotation);
  } finally {
    bitmap.close();
  }
}

function fitCard(bitmap, rotation) {
  const upright = rotateToCanvas(bitmap, rotation);
  const found = detectCard(upright);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_PX.width;
  canvas.height = CARD_PX.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (found.kind === "quad") {
    warpOntoCard(upright, found.corners, canvas);
  } else if (found.kind === "rect") {
    ctx.filter = `brightness(${BRIGHTNESS})`;
    ctx.drawImage(
      upright,
      found.x,
      found.y,
      found.width,
      found.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
  } else {
    ctx.filter = `brightness(${BRIGHTNESS})`;
    ctx.drawImage(upright, 0, 0, canvas.width, canvas.height);
  }

  return canvas.toDataURL("image/jpeg", 0.95);
}

function rotateToCanvas(bitmap, rotation) {
  const turns = ((rotation % 360) + 360) % 360;
  const swap = turns === 90 || turns === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return canvas;
}

function detectCard(source) {
  const scale = Math.min(1, ANALYSIS_MAX / Math.max(source.width, source.height));
  const w = Math.max(2, Math.round(source.width * scale));
  const h = Math.max(2, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const mask = cardMask(image.data, w, h);
  const filled = mask ? fillCard(mask, w, h) : null;
  if (!filled) return { kind: "full" };

  const quad = cornersFromMask(filled, w, h);
  const inv = 1 / scale;

  if (quad) {
    const corners = insetCorners(
      quad.map(([x, y]) => ({ x: x * inv, y: y * inv })),
      0.008
    );
    if (isUsableQuad(corners, source.width, source.height)) {
      return { kind: "quad", corners };
    }
  }

  const box = boundsOf(filled, w, h);
  if (!box) return { kind: "full" };
  const area = box.width * box.height;
  if (area < w * h * 0.12 || area > w * h * 0.94) return { kind: "full" };
  return {
    kind: "rect",
    x: box.x * inv,
    y: box.y * inv,
    width: box.width * inv,
    height: box.height * inv,
  };
}

function cardMask(data, w, h) {
  const bg = borderColor(data, w, h);
  const dist = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const value = Math.min(
      255,
      Math.hypot(data[o] - bg[0], data[o + 1] - bg[1], data[o + 2] - bg[2])
    );
    dist[i] = value;
    hist[value] += 1;
  }

  const threshold = Math.max(20, otsu(hist, w * h));
  const mask = new Uint8Array(w * h);
  let count = 0;
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] > threshold) {
      mask[i] = 1;
      count += 1;
    }
  }
  const ratio = count / (w * h);
  if (ratio < 0.08 || ratio > 0.92) return null;
  return mask;
}

function borderColor(data, w, h) {
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.045));
  const rs = [];
  const gs = [];
  const bs = [];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const edge = x < band || y < band || x >= w - band || y >= h - band;
      if (!edge) continue;
      const o = (y * w + x) * 4;
      rs.push(data[o]);
      gs.push(data[o + 1]);
      bs.push(data[o + 2]);
    }
  }
  return [median(rs), median(gs), median(bs)];
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 0;
  for (let i = 0; i < 256; i++) {
    weightB += hist[i];
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += i * hist[i];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

function fillCard(mask, w, h) {
  const grown = dilate(mask, w, h, 2);
  const labels = largestComponent(grown, w, h);
  if (!labels) return null;
  const holes = fillHoles(labels.mask, w, h);
  const shrunk = erode(holes, w, h, 1);
  const area = count(shrunk);
  if (area < w * h * 0.08) return labels.mask;
  return shrunk;
}

function largestComponent(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let bestArea = 0;
  let bestMask = null;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    const cells = [];
    while (sp) {
      const p = stack[--sp];
      cells.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0) visit(p - 1);
      if (x + 1 < w) visit(p + 1);
      if (y > 0) visit(p - w);
      if (y + 1 < h) visit(p + w);
    }
    if (cells.length > bestArea) {
      bestArea = cells.length;
      const next = new Uint8Array(w * h);
      for (const p of cells) next[p] = 1;
      bestMask = next;
    }

    function visit(index) {
      if (mask[index] && !seen[index]) {
        seen[index] = 1;
        stack[sp++] = index;
      }
    }
  }

  if (!bestMask || bestArea < w * h * 0.08) return null;
  return { mask: bestMask, area: bestArea };
}

function fillHoles(mask, w, h) {
  const outside = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (index) => {
    if (mask[index] || outside[index]) return;
    outside[index] = 1;
    stack[sp++] = index;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (sp) {
    const p = stack[--sp];
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x + 1 < w) push(p + 1);
    if (y > 0) push(p - w);
    if (y + 1 < h) push(p + w);
  }
  const filled = mask.slice();
  for (let i = 0; i < filled.length; i++) {
    if (!outside[i]) filled[i] = 1;
  }
  return filled;
}

function dilate(mask, w, h, radius) {
  return morph(mask, w, h, radius, true);
}

function erode(mask, w, h, radius) {
  return morph(mask, w, h, radius, false);
}

function morph(mask, w, h, radius, grow) {
  const next = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = grow ? 0 : 1;
      for (let dy = -radius; dy <= radius && (grow ? !on : on); dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) {
          if (!grow) on = 0;
          continue;
        }
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) {
            if (!grow) on = 0;
            continue;
          }
          const value = mask[yy * w + xx];
          if (grow && value) on = 1;
          if (!grow && !value) on = 0;
        }
      }
      next[y * w + x] = on;
    }
  }
  return next;
}

function count(mask) {
  let total = 0;
  for (let i = 0; i < mask.length; i++) total += mask[i];
  return total;
}

function cornersFromMask(mask, w, h) {
  const points = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === w - 1 ||
        y === h - 1 ||
        !mask[y * w + x - 1] ||
        !mask[y * w + x + 1] ||
        !mask[(y - 1) * w + x] ||
        !mask[(y + 1) * w + x];
      if (edge) points.push({ x, y });
    }
  }
  const hull = convexHull(points);
  if (hull.length < 4) return null;
  const corners = hull.length === 4 ? hull : sharpCorners(hull);
  const tl = corners.reduce((best, point) => (point.x + point.y < best.x + best.y ? point : best));
  const br = corners.reduce((best, point) => (point.x + point.y > best.x + best.y ? point : best));
  const tr = corners.reduce((best, point) => (point.x - point.y > best.x - best.y ? point : best));
  const bl = corners.reduce((best, point) => (point.x - point.y < best.x - best.y ? point : best));
  if (new Set([tl, tr, br, bl]).size < 4) return null;
  return [
    [tl.x, tl.y],
    [tr.x, tr.y],
    [br.x, br.y],
    [bl.x, bl.y],
  ];
}

function convexHull(points) {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 4) return sorted;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function sharpCorners(hull) {
  const scored = hull.map((point, index) => {
    const prev = hull[(index - 1 + hull.length) % hull.length];
    const next = hull[(index + 1) % hull.length];
    const v1x = prev.x - point.x;
    const v1y = prev.y - point.y;
    const v2x = next.x - point.x;
    const v2y = next.y - point.y;
    const dot = v1x * v2x + v1y * v2y;
    const cross = v1x * v2y - v1y * v2x;
    const angle = Math.atan2(Math.abs(cross), dot);
    return { point, score: Math.abs(angle - Math.PI / 2) };
  });
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map((entry) => entry.point);
}

function boundsOf(mask, w, h) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function insetCorners(corners, amount) {
  const cx = corners.reduce((sum, point) => sum + point.x, 0) / corners.length;
  const cy = corners.reduce((sum, point) => sum + point.y, 0) / corners.length;
  return corners.map((point) => ({
    x: point.x + (cx - point.x) * amount,
    y: point.y + (cy - point.y) * amount,
  }));
}

function isUsableQuad(corners, width, height) {
  if (corners.length !== 4) return false;
  const margin = Math.min(width, height) * 0.08;
  if (corners.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
  if (
    corners.some(
      (point) => point.x < -margin || point.y < -margin || point.x > width + margin || point.y > height + margin
    )
  ) {
    return false;
  }
  if (!isConvex(corners)) return false;
  const area = polygonArea(corners);
  if (area < width * height * 0.12 || area > width * height * 0.96) return false;
  const edge = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const top = edge(corners[0], corners[1]);
  const bottom = edge(corners[3], corners[2]);
  const left = edge(corners[0], corners[3]);
  const right = edge(corners[1], corners[2]);
  const aspect = (top + bottom) / (left + right);
  return aspect > 0.45 && aspect < 2.4 && Math.min(top, bottom, left, right) > Math.min(width, height) * 0.12;
}

function isConvex(points) {
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const c = points[(i + 2) % points.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1) continue;
    const next = Math.sign(cross);
    if (sign && next !== sign) return false;
    sign = next;
  }
  return true;
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function warpOntoCard(source, corners, dest) {
  const sw = source.width;
  const sh = source.height;
  const src = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const dw = dest.width;
  const dh = dest.height;
  const homography = solveHomography(
    [
      [0, 0],
      [dw - 1, 0],
      [dw - 1, dh - 1],
      [0, dh - 1],
    ],
    corners.map((point) => [point.x, point.y])
  );
  if (!homography) {
    const ctx = dest.getContext("2d");
    ctx.filter = `brightness(${BRIGHTNESS})`;
    ctx.drawImage(source, 0, 0, dw, dh);
    return;
  }

  const out = dest.getContext("2d").createImageData(dw, dh);
  const pixels = out.data;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const denom = homography[6] * x + homography[7] * y + 1;
      const sx = (homography[0] * x + homography[1] * y + homography[2]) / denom;
      const sy = (homography[3] * x + homography[4] * y + homography[5]) / denom;
      const color = sample(src, sw, sh, sx, sy);
      const i = (y * dw + x) * 4;
      pixels[i] = clamp(color[0] * BRIGHTNESS);
      pixels[i + 1] = clamp(color[1] * BRIGHTNESS);
      pixels[i + 2] = clamp(color[2] * BRIGHTNESS);
      pixels[i + 3] = 255;
    }
  }
  dest.getContext("2d").putImageData(out, 0, 0);
}

function solveHomography(from, to) {
  const matrix = [];
  const result = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    result.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    result.push(v);
  }
  return gaussian(matrix, result);
}

function gaussian(matrix, result) {
  const n = result.length;
  const a = matrix.map((row, index) => row.concat(result[index]));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-8) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const div = a[col][col];
    for (let k = col; k <= n; k++) a[col][k] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map((row) => row[n]);
}

function sample(data, width, height, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const dx = x - x0;
  const dy = y - y0;
  const p00 = pixelAt(data, width, height, x0, y0);
  const p10 = pixelAt(data, width, height, x1, y0);
  const p01 = pixelAt(data, width, height, x0, y1);
  const p11 = pixelAt(data, width, height, x1, y1);
  return [0, 1, 2].map(
    (channel) =>
      p00[channel] * (1 - dx) * (1 - dy) +
      p10[channel] * dx * (1 - dy) +
      p01[channel] * (1 - dx) * dy +
      p11[channel] * dx * dy
  );
}

function pixelAt(data, width, height, x, y) {
  const xx = Math.max(0, Math.min(width - 1, x));
  const yy = Math.max(0, Math.min(height - 1, y));
  const o = (yy * width + xx) * 4;
  return [data[o], data[o + 1], data[o + 2]];
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
