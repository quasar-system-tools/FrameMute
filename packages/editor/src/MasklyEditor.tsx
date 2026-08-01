import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clamp,
  createDetectedRegions,
  createManualRegion,
  MAX_IMAGE_SIZE,
  MIN_REGION,
  type MaskRegion,
  type Point,
} from "@maskly/domain";
import { detectFaces } from "@maskly/vision-web";
import "./editor.css";

type DragState =
  | { type: "add"; start: Point; current: Point }
  | { type: "move"; id: string; start: Point; initial: MaskRegion }
  | { type: "resize"; id: string; start: Point; initial: MaskRegion };

function mosaic(ctx: CanvasRenderingContext2D, image: HTMLImageElement, region: MaskRegion) {
  const x = Math.round(region.x * image.naturalWidth);
  const y = Math.round(region.y * image.naturalHeight);
  const width = Math.round(region.width * image.naturalWidth);
  const height = Math.round(region.height * image.naturalHeight);
  const cell = Math.max(1, Math.round(region.mosaicSize));
  const smallWidth = Math.max(1, Math.floor(width / cell));
  const smallHeight = Math.max(1, Math.floor(height / cell));
  const buffer = document.createElement("canvas");
  buffer.width = smallWidth;
  buffer.height = smallHeight;
  const bufferContext = buffer.getContext("2d");

  if (!bufferContext) return;

  bufferContext.drawImage(image, x, y, width, height, 0, 0, smallWidth, smallHeight);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buffer, 0, 0, smallWidth, smallHeight, x, y, width, height);
  ctx.restore();
}

function MasklyEditor() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const analysisTokenRef = useRef(0);
  const isNewFileRef = useRef(false);
  const undoStackRef = useRef<MaskRegion[][]>([]);
  const redoStackRef = useRef<MaskRegion[][]>([]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<Point | null>(null);
  const [regions, setRegions] = useState<MaskRegion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<"select" | "add">("select");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "analyzing" | "ready" | "error">("idle");
  const [message, setMessage] = useState("Photos are edited only on this device.");
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  const selectedRegion = regions.find((region) => region.id === selectedId) ?? null;

  const updateHistoryState = () => {
    setHistoryState({ canUndo: undoStackRef.current.length > 0, canRedo: redoStackRef.current.length > 0 });
  };

  const rememberRegions = () => {
    undoStackRef.current = [...undoStackRef.current.slice(-29), regions.map((region) => ({ ...region }))];
    redoStackRef.current = [];
    updateHistoryState();
  };

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current = [...redoStackRef.current, regions.map((region) => ({ ...region }))];
    setRegions(previous);
    setSelectedId(previous[0]?.id ?? null);
    setMessage("Reverted to the previous edit.");
    updateHistoryState();
  }, [regions]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current = [...undoStackRef.current, regions.map((region) => ({ ...region }))];
    setRegions(next);
    setSelectedId(next[0]?.id ?? null);
    setMessage("Reapplied the reverted edit.");
    updateHistoryState();
  }, [regions]);

  const analyseImage = async (image: HTMLImageElement) => {
    const token = ++analysisTokenRef.current;
    setAnalysisStatus("analyzing");
    setMessage("Analyzing face candidates on this device…");

    try {
      const faces = await detectFaces(image);
      if (token !== analysisTokenRef.current) return;

      const detectedRegions = createDetectedRegions(faces);

      if (isNewFileRef.current) {
        isNewFileRef.current = false;
      } else {
        rememberRegions();
      }
      setRegions(detectedRegions);
      setSelectedId(detectedRegions[0]?.id ?? null);
      setAnalysisStatus("ready");
      setTool(detectedRegions.length ? "select" : "add");
      setMessage(detectedRegions.length
        ? `Found ${detectedRegions.length} face candidate(s). Please review all results.`
        : "No face candidates were found. Please add a region manually.");
    } catch (error) {
      if (token !== analysisTokenRef.current) return;
      setAnalysisStatus("error");
      setTool("add");
      setMessage("Could not start automatic analysis. Add a region manually or try again.");
      console.error("Face detection failed", error);
    }
  };

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(image, 0, 0);
    regions.forEach((region) => mosaic(context, image, region));
  }, [regions]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const loadFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setMessage("Only JPG, PNG, and WebP image files are currently supported.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setMessage("Images must be 50 MB or smaller.");
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      objectUrlRef.current = url;
      setFileName(file.name);
      setImageSize({ x: image.naturalWidth, y: image.naturalHeight });
      setRegions([]);
      setSelectedId(null);
      isNewFileRef.current = true;
      undoStackRef.current = [];
      redoStackRef.current = [];
      updateHistoryState();
      setTool("add");
      void analyseImage(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setMessage("Could not read the image. Please choose another file.");
    };
    image.src = url;
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    if (file) loadFile(file);
    event.target.value = "";
  };

  const onDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const [file] = Array.from(event.dataTransfer.files);
    if (file) loadFile(file);
  };

  const normalizePoint = (event: ReactPointerEvent<HTMLElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  };

  const updateRegion = (id: string, next: Partial<MaskRegion>) => {
    setRegions((current) => current.map((region) => (region.id === id ? { ...region, ...next } : region)));
  };

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!imageRef.current || drag) return;
    const point = normalizePoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "add") {
      setSelectedId(null);
      setDrag({ type: "add", start: point, current: point });
    }
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const point = normalizePoint(event);
    if (!point) return;

    if (drag.type === "add") {
      setDrag({ ...drag, current: point });
      return;
    }

    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (drag.type === "move") {
      updateRegion(drag.id, {
        x: clamp(drag.initial.x + dx, 0, 1 - drag.initial.width),
        y: clamp(drag.initial.y + dy, 0, 1 - drag.initial.height),
      });
      return;
    }

    updateRegion(drag.id, {
      width: clamp(Math.max(MIN_REGION, drag.initial.width + dx), MIN_REGION, 1 - drag.initial.x),
      height: clamp(Math.max(MIN_REGION, drag.initial.height + dy), MIN_REGION, 1 - drag.initial.y),
    });
  };

  const onStagePointerUp = () => {
    if (!drag) return;
    if (drag.type === "add") {
      const region = createManualRegion(drag.start, drag.current);
      if (region) {
        rememberRegions();
        setRegions((current) => [...current, region]);
        setSelectedId(region.id);
        setTool("select");
        setMessage("Region selected. Drag it or use the lower-right handle to resize it.");
      }
    }
    setDrag(null);
  };

  const startMove = (event: ReactPointerEvent<HTMLButtonElement>, region: MaskRegion) => {
    event.stopPropagation();
    const point = normalizePoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    rememberRegions();
    setSelectedId(region.id);
    setTool("select");
    setDrag({ type: "move", id: region.id, start: point, initial: region });
  };

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>, region: MaskRegion) => {
    event.stopPropagation();
    const point = normalizePoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    rememberRegions();
    setSelectedId(region.id);
    setDrag({ type: "resize", id: region.id, start: point, initial: region });
  };

  const exportImage = (format: "png" | "jpeg") => {
    const canvas = canvasRef.current;
    if (!canvas || !fileName) return;
    const link = document.createElement("a");
    const extension = format === "jpeg" ? "jpg" : "png";
    link.download = `${fileName.replace(/\.[^.]+$/, "")}-masked.${extension}`;
    link.href = canvas.toDataURL(`image/${format}`, format === "jpeg" ? 0.92 : undefined);
    link.click();
    setMessage(`${extension.toUpperCase()} file is ready. Its location follows your browser or app settings.`);
  };

  const draftRect = drag?.type === "add"
    ? {
        x: Math.min(drag.start.x, drag.current.x),
        y: Math.min(drag.start.y, drag.current.y),
        width: Math.abs(drag.current.x - drag.start.x),
        height: Math.abs(drag.current.y - drag.start.y),
      }
    : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="wordmark" aria-label="Maskly">
          <span className="wordmark-mark" />
          <span>maskly</span>
        </div>
        <div className="privacy-status"><span className="status-dot" />Processed on this device</div>
        <button className="quiet-button" type="button" onClick={() => fileInputRef.current?.click()}>New photo</button>
      </header>

      <div className="workspace">
        <aside className="left-panel">
          <div className="panel-heading">
            <span>File</span>
            <span className="counter">{fileName ? "01" : "00"}</span>
          </div>
          <button className="file-row" type="button" onClick={() => fileInputRef.current?.click()}>
            <span className="file-glyph">⌁</span>
              <span className="file-copy">
              <strong>{fileName ?? "Choose a photo"}</strong>
              <small>{imageSize ? `${imageSize.x} × ${imageSize.y}` : "JPG · PNG · WebP"}</small>
            </span>
          </button>
          <div className="left-footnote">Photo MVP<br />Video processing coming soon</div>
        </aside>

        <section className="editor" aria-label="Photo masking editor" onDragOver={onDragOver} onDrop={onDrop}>
          {!imageRef.current ? (
            <button className="drop-zone" type="button" onClick={() => fileInputRef.current?.click()}>
              <span className="drop-mark">+</span>
              <strong>Drop a photo here</strong>
              <span>or choose a file</span>
              <small>JPG, PNG, WebP · up to 50 MB</small>
            </button>
          ) : (
            <div className={`canvas-stage ${tool === "add" ? "is-adding" : ""}`} onPointerDown={onStagePointerDown} onPointerMove={onStagePointerMove} onPointerUp={onStagePointerUp} onPointerCancel={onStagePointerUp}>
              <canvas ref={canvasRef} aria-label="Mosaic preview" />
              {regions.map((region, index) => (
                <div
                  className={`region ${region.id === selectedId ? "is-selected" : ""}`}
                  key={region.id}
                  style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}
                >
                  <button className="region-body" type="button" aria-label={`Select mask ${index + 1}`} onPointerDown={(event) => startMove(event, region)} />
                  <span className="region-label">MASK {String(index + 1).padStart(2, "0")}</span>
                  {region.id === selectedId && <button className="resize-handle" type="button" aria-label="Resize mask" onPointerDown={(event) => startResize(event, region)} />}
                </div>
              ))}
              {draftRect && <div className="region draft" style={{ left: `${draftRect.x * 100}%`, top: `${draftRect.y * 100}%`, width: `${draftRect.width * 100}%`, height: `${draftRect.height * 100}%` }} />}
            </div>
          )}
          <div className="canvas-caption"><span>{analysisStatus === "analyzing" ? "Analyzing automatically" : tool === "add" ? "Add-region mode" : "Select mode"}</span><span>{regions.length} mask(s)</span></div>
        </section>

        <aside className="inspector">
          <div className="panel-heading"><span>Masks</span><span className="counter">{String(regions.length).padStart(2, "0")}</span></div>
          <div className="tool-switcher" role="group" aria-label="Editing tools">
            <button className={tool === "select" ? "active" : ""} type="button" onClick={() => setTool("select")}>Select</button>
            <button className={tool === "add" ? "active" : ""} type="button" onClick={() => setTool("add")}>Add region</button>
          </div>

          <div className="history-actions" role="group" aria-label="Edit history">
            <button type="button" disabled={!historyState.canUndo} onClick={undo}>Undo</button>
            <button type="button" disabled={!historyState.canRedo} onClick={redo}>Redo</button>
          </div>

          <button className="analyse-button" type="button" disabled={!imageRef.current || analysisStatus === "analyzing"} onClick={() => imageRef.current && void analyseImage(imageRef.current)}>
            {analysisStatus === "analyzing" ? "Analyzing faces…" : "Analyze faces again"}
          </button>

          <div className="inspector-body">
            {selectedRegion ? (
              <>
                <div className="selected-mask"><span>{selectedRegion.source === "detected" ? `Automatic candidate · ${(selectedRegion.confidence ?? 0).toFixed(2)}` : "Manual region"}</span><strong>MASK {String(regions.findIndex((region) => region.id === selectedRegion.id) + 1).padStart(2, "0")}</strong></div>
                <label className="range-label" htmlFor="mosaic-size">Mosaic intensity <output>{selectedRegion.mosaicSize}</output></label>
                <input id="mosaic-size" type="range" min="5" max="40" value={selectedRegion.mosaicSize} onPointerDown={rememberRegions} onChange={(event) => updateRegion(selectedRegion.id, { mosaicSize: Number(event.target.value) })} />
                <button className="delete-button" type="button" onClick={() => { rememberRegions(); setRegions((current) => current.filter((region) => region.id !== selectedRegion.id)); setSelectedId(null); }}>Delete region</button>
              </>
            ) : (
              <p className="empty-inspector">Select a region or<br />draw a new one.</p>
            )}
          </div>

          <div className="export-block">
            <p>Export</p>
            <div className="export-actions">
              <button className="export-button" type="button" disabled={!fileName} onClick={() => exportImage("png")}>PNG <span>↗</span></button>
              <button className="export-button export-button-secondary" type="button" disabled={!fileName} onClick={() => exportImage("jpeg")}>JPG <span>↗</span></button>
            </div>
          </div>
        </aside>
      </div>

      <footer className="statusbar"><span>{message}</span><span>{fileName ? "Ready" : "Waiting"}</span></footer>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} />
    </main>
  );
}

export default MasklyEditor;
