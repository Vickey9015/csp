let readerPromise;

export function loadTextReader() {
  if (!readerPromise) {
    readerPromise = import("tesseract.js")
      .then((mod) => {
        const api = mod.createWorker ? mod : mod.default;
        return api.createWorker("eng", api.OEM.TESSERACT_LSTM_COMBINED, {
          legacyCore: true,
          legacyLang: true,
        });
      })
      .catch((error) => {
        readerPromise = null;
        throw error;
      });
  }
  return readerPromise;
}

export async function textUprightTurn(canvas) {
  try {
    const worker = await loadTextReader();
    const sample = scaleCanvas(canvas, 1100);
    const detected = await worker.detect(sample);
    const degrees = Number(detected?.data?.orientation_degrees);
    const confidence = Number(detected?.data?.orientation_confidence);
    if (confidence >= 1.5 && (degrees === 0 || degrees === 180)) return degrees;
    const upright = await readScore(worker, sample);
    const flipped = await readScore(worker, rotate180(sample));
    return flipped > upright + 5 ? 180 : 0;
  } catch {
    return 0;
  }
}

async function readScore(worker, canvas) {
  const { data } = await worker.recognize(canvas);
  const words = (data.text.match(/[A-Za-z]{3,}/g) || []).length;
  return (Number(data.confidence) || 0) + words * 2;
}

function scaleCanvas(source, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  if (scale === 1) return source;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(source.width * scale));
  canvas.height = Math.max(2, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function rotate180(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}
