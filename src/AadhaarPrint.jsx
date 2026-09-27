import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { readCardFile, renderCard } from "./cardImage.js";
import { loadOpenCv } from "./documentScan.js";
import { loadTextReader } from "./textOrientation.js";

const SIDES = [
  { id: "front", label: "Aadhaar front" },
  { id: "back", label: "Aadhaar back" },
];

export default function AadhaarPrint() {
  const [sides, setSides] = useState({ front: null, back: null });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const inputs = {
    front: useRef(null),
    back: useRef(null),
  };
  const sources = useRef({});
  const warps = useRef({});
  const stageRef = useRef(null);

  useEffect(() => {
    loadOpenCv();
    loadTextReader();
  }, []);

  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const apply = () => {
      const sheetPx = (210 / 25.4) * 96;
      node.style.setProperty("--a4-scale", String(node.clientWidth / sheetPx));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const ready = Boolean(sides.front && sides.back);

  async function storeSide(id, file, rotation) {
    const card = await readCardFile(file, rotation);
    sources.current[id] = card.source;
    setSides((current) => ({
      ...current,
      [id]: { file, rotation, url: card.url, points: card.points, name: file.name },
    }));
  }

  function updatePoints(id, points) {
    setSides((current) => ({
      ...current,
      [id]: current[id] ? { ...current[id], points } : current[id],
    }));
    const warp = warps.current[id] || { pending: null, running: false };
    warps.current[id] = warp;
    warp.pending = points;
    pumpWarp(id);
  }

  async function pumpWarp(id) {
    const warp = warps.current[id];
    if (!warp || warp.running) return;
    warp.running = true;
    try {
      while (warp.pending) {
        const points = warp.pending;
        warp.pending = null;
        const url = await renderCard(sources.current[id], points);
        setSides((current) => (current[id] ? { ...current, [id]: { ...current[id], url } } : current));
      }
    } catch (err) {
      setError(err.message || "Could not update that crop.");
    } finally {
      warp.running = false;
      if (warp.pending) pumpWarp(id);
    }
  }

  async function onFile(id, file) {
    if (!file) return;
    setError("");
    setBusy(id);
    try {
      await storeSide(id, file, 0);
    } catch (err) {
      setError(err.message || "Could not read that photo.");
    } finally {
      setBusy(null);
    }
  }

  async function rotate(id, delta) {
    const current = sides[id];
    if (!current || busy) return;
    setError("");
    setBusy(id);
    try {
      await storeSide(id, current.file, current.rotation + delta);
    } catch (err) {
      setError(err.message || "Could not rotate that photo.");
    } finally {
      setBusy(null);
    }
  }

  function clearSide(id) {
    delete sources.current[id];
    delete warps.current[id];
    setSides((current) => ({ ...current, [id]: null }));
    if (inputs[id].current) inputs[id].current.value = "";
  }

  function printSheet() {
    if (!ready) return;
    window.print();
  }

  return (
    <div className="aadhaar-page">
      <header className="page-head no-print">
        <div>
          <p className="eyebrow">Printouts</p>
          <h1>Aadhaar</h1>
          <p>
            Upload the front and back. The card is found automatically. Drag a
            corner to fix the crop, or drag inside the card to rotate it. Front
            is on the left and back is on the right, both at the top of the A4
            sheet.
          </p>
        </div>
        <button type="button" className="submit print-action" disabled={!ready || Boolean(busy)} onClick={printSheet}>
          Print front and back
        </button>
      </header>

      {error ? (
        <p className="banner no-print" role="alert">
          {error}
        </p>
      ) : null}

      <div className="aadhaar-layout">
        <div className="upload-column no-print">
          {SIDES.map((side) => {
            const photo = sides[side.id];
            return (
              <section key={side.id} className="upload-card">
                <div className="label-row">
                  <h2>{side.label}</h2>
                  {photo ? (
                    <button type="button" className="text-button" onClick={() => clearSide(side.id)}>
                      Remove
                    </button>
                  ) : null}
                </div>
                {photo ? (
                  <CardAdjust source={sources.current[side.id]} points={photo.points} onChange={(points) => updatePoints(side.id, points)} />
                ) : (
                  <label
                    className="drop"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      onFile(side.id, event.dataTransfer.files?.[0]);
                    }}
                  >
                    <input
                      ref={inputs[side.id]}
                      type="file"
                      accept="image/*"
                      onChange={(event) => onFile(side.id, event.target.files?.[0])}
                    />
                    <span>{busy === side.id ? "Finding the card…" : "Drop a photo or click to upload"}</span>
                  </label>
                )}
                {photo ? <p className="adjust-hint">Drag a corner to set the crop. Drag inside the card to rotate it.</p> : null}
                <div className="side-actions">
                  <button type="button" disabled={!photo || Boolean(busy)} onClick={() => rotate(side.id, -90)}>
                    Rotate left
                  </button>
                  <button type="button" disabled={!photo || Boolean(busy)} onClick={() => rotate(side.id, 90)}>
                    Rotate right
                  </button>
                  <span>{photo ? photo.name : "JPG or PNG"}</span>
                </div>
              </section>
            );
          })}
          <p className="footnote">
            In the print dialog, choose your printer, set paper to A4, margins to None, and scale to 100%.
          </p>
        </div>

        <section className="preview-column" aria-label="A4 preview">
          <p className="eyebrow no-print">A4 preview</p>
          <div className="a4-stage" ref={stageRef}>
            <article className="a4-sheet" aria-label="A4 sheet with Aadhaar front and back">
              <CardSlot side="front" photo={sides.front} />
              <CardSlot side="back" photo={sides.back} />
            </article>
          </div>
          <p className="footnote no-print">
            {ready
              ? "One A4 sheet. Front is on the left, back is on the right, both at the top."
              : "The sheet fills in as you upload each side."}
          </p>
        </section>
      </div>
    </div>
  );
}

function CardAdjust({ source, points, onChange }) {
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const [sheetUrl, setSheetUrl] = useState("");

  useEffect(() => {
    if (!source) return;
    setSheetUrl(source.toDataURL("image/jpeg", 0.82));
  }, [source]);

  function imagePoint(event) {
    const frame = frameRef.current.getBoundingClientRect();
    const scale = Math.min(frame.width / source.width, frame.height / source.height);
    const offsetX = (frame.width - source.width * scale) / 2;
    const offsetY = (frame.height - source.height * scale) / 2;
    return {
      x: (event.clientX - frame.left - offsetX) / scale,
      y: (event.clientY - frame.top - offsetY) / scale,
    };
  }

  function onPointerDown(event) {
    if (!source) return;
    const point = imagePoint(event);
    const current = pointsRef.current;
    const radius = Math.max(source.width, source.height) * 0.045;
    const index = current.findIndex((corner) => Math.hypot(corner.x - point.x, corner.y - point.y) < radius);
    if (index >= 0) {
      dragRef.current = { mode: "corner", index };
    } else if (insideQuad(point, current)) {
      const cx = current.reduce((sum, corner) => sum + corner.x, 0) / current.length;
      const cy = current.reduce((sum, corner) => sum + corner.y, 0) / current.length;
      dragRef.current = {
        mode: "rotate",
        cx,
        cy,
        angle: Math.atan2(point.y - cy, point.x - cx),
        points: current.map((corner) => ({ ...corner })),
      };
    } else {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag || !source) return;
    const point = imagePoint(event);
    if (drag.mode === "corner") {
      onChange(pointsRef.current.map((corner, index) => (index === drag.index ? clampPoint(point, source) : corner)));
      return;
    }
    const angle = Math.atan2(point.y - drag.cy, point.x - drag.cx);
    const delta = angle - drag.angle;
    const cosine = Math.cos(delta);
    const sine = Math.sin(delta);
    onChange(
      drag.points.map((corner) =>
        clampPoint(
          {
            x: drag.cx + (corner.x - drag.cx) * cosine - (corner.y - drag.cy) * sine,
            y: drag.cy + (corner.x - drag.cx) * sine + (corner.y - drag.cy) * cosine,
          },
          source
        )
      )
    );
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  const handle = Math.max(source?.width || 1, source?.height || 1) * 0.018;
  const polygon = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div
      className="adjust"
      ref={frameRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {sheetUrl ? <img src={sheetUrl} alt="" draggable="false" /> : null}
      {source ? (
        <svg viewBox={`0 0 ${source.width} ${source.height}`} preserveAspectRatio="xMidYMid meet">
          <polygon points={polygon} />
          {points.map((point, index) => (
            <circle key={index} cx={point.x} cy={point.y} r={handle} />
          ))}
        </svg>
      ) : null}
    </div>
  );
}

function clampPoint(point, source) {
  return {
    x: Math.min(source.width, Math.max(0, point.x)),
    y: Math.min(source.height, Math.max(0, point.y)),
  };
}

function insideQuad(point, corners) {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i];
    const b = corners[j];
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 0.00001) + a.x) inside = !inside;
  }
  return inside;
}

function CardSlot({ side, photo }) {
  return (
    <div className={photo ? `card-slot ${side}` : `card-slot ${side} is-empty`}>
      {photo ? (
        <img src={photo.url} alt={side === "front" ? "Aadhaar front" : "Aadhaar back"} />
      ) : (
        <span className="slot-label">{side === "front" ? "Front" : "Back"}</span>
      )}
    </div>
  );
}
