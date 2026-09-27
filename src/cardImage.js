const CARD_WIDTH_MM = 85.6;
const CARD_HEIGHT_MM = 53.98;
const PRINT_DPI = 300;

export const CARD_PX = {
  width: Math.round((CARD_WIDTH_MM / 25.4) * PRINT_DPI),
  height: Math.round((CARD_HEIGHT_MM / 25.4) * PRINT_DPI),
};

const MAX_BYTES = 20 * 1024 * 1024;

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
  const canvas = document.createElement("canvas");
  canvas.width = CARD_PX.width;
  canvas.height = CARD_PX.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const scale = Math.min(canvas.width / upright.width, canvas.height / upright.height);
  const width = upright.width * scale;
  const height = upright.height * scale;
  ctx.drawImage(
    upright,
    (canvas.width - width) / 2,
    (canvas.height - height) / 2,
    width,
    height
  );

  return canvas.toDataURL("image/jpeg", 0.95);
}

function rotateToCanvas(bitmap, rotation) {
  const turns = ((rotation % 360) + 360) % 360;
  const swap = turns === 90 || turns === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return canvas;
}
