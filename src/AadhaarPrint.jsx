import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { readCardFile } from "./cardImage.js";
import { loadOpenCv } from "./documentScan.js";

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
  const stageRef = useRef(null);

  useEffect(() => {
    loadOpenCv();
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
    const url = await readCardFile(file, rotation);
    setSides((current) => ({
      ...current,
      [id]: { file, rotation, url, name: file.name },
    }));
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
            Upload the front and back. Each photo is cropped to the card and
            rotated upright, then both sides sit in one row at the top of the
            A4 sheet: front on the left, back on the right.
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
                <label
                  className={photo ? "drop filled" : "drop"}
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
                  {photo ? (
                    <img src={photo.url} alt="" />
                  ) : (
                    <span>{busy === side.id ? "Finding the card…" : "Drop a photo or click to upload"}</span>
                  )}
                </label>
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
