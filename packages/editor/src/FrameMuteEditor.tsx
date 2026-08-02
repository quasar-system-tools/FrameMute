import {
  ChangeEvent,
  type CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  applyMosaicSize,
  clamp,
  createDetectedRegions,
  createManualRegion,
  duplicateRegion,
  intersectsRect,
  MAX_IMAGE_SIZE,
  MIN_REGION,
  scaleRect,
  type MaskRegion,
  type Point,
  type Rect,
  type Size,
} from "@framemute/domain";
import { detectFaces } from "@framemute/vision-web";
import "./editor.css";
import { shouldProtectInitialPreview, type AnalysisStatus } from "./previewState";

type DragState =
  | { type: "add"; start: Point; current: Point }
  | { type: "select"; start: Point; current: Point; initialSelection: string[] }
  | { type: "move"; start: Point; initial: MaskRegion[] }
  | { type: "resize"; id: string; start: Point; initial: MaskRegion };

type ContextMenuState = { id: string; x: number; y: number } | null;

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function rectFromPoints(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function mosaic(ctx: CanvasRenderingContext2D, image: HTMLImageElement, region: MaskRegion) {
  const pixelRegion = scaleRect(region, { width: image.naturalWidth, height: image.naturalHeight });
  const x = Math.round(pixelRegion.x);
  const y = Math.round(pixelRegion.y);
  const width = Math.round(pixelRegion.width);
  const height = Math.round(pixelRegion.height);
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

function overlayStyle(rect: Rect, canvasSize: Size | null): CSSProperties {
  if (!canvasSize) return { visibility: "hidden" };
  const pixels = scaleRect(rect, canvasSize);
  return { left: pixels.x, top: pixels.y, width: pixels.width, height: pixels.height };
}

function FrameMuteEditor() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const analysisTokenRef = useRef(0);
  const isNewFileRef = useRef(false);
  const undoStackRef = useRef<MaskRegion[][]>([]);
  const redoStackRef = useRef<MaskRegion[][]>([]);
  const copiedRegionsRef = useRef<MaskRegion[]>([]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<Point | null>(null);
  const [canvasDisplaySize, setCanvasDisplaySize] = useState<Size | null>(null);
  const [regions, setRegions] = useState<MaskRegion[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [isAddingMask, setIsAddingMask] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [message, setMessage] = useState("Photos are edited only on this device.");
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  const selectedRegions = regions.filter((region) => selectedIds.includes(region.id));
  const selectedRegion = regions.find((region) => region.id === selectedIds[selectedIds.length - 1]) ?? null;
  const isProtectingPreview = shouldProtectInitialPreview(analysisStatus, regions.length);

  const updateHistoryState = () => {
    setHistoryState({ canUndo: undoStackRef.current.length > 0, canRedo: redoStackRef.current.length > 0 });
  };

  const rememberRegions = useCallback(() => {
    undoStackRef.current = [...undoStackRef.current.slice(-29), regions.map((region) => ({ ...region }))];
    redoStackRef.current = [];
    updateHistoryState();
  }, [regions]);

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current = [...redoStackRef.current, regions.map((region) => ({ ...region }))];
    setRegions(previous);
    setSelectedIds(previous[0] ? [previous[0].id] : []);
    setMessage("Reverted to the previous edit.");
    updateHistoryState();
  }, [regions]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current = [...undoStackRef.current, regions.map((region) => ({ ...region }))];
    setRegions(next);
    setSelectedIds(next[0] ? [next[0].id] : []);
    setMessage("Reapplied the reverted edit.");
    updateHistoryState();
  }, [regions]);

  const copyRegions = useCallback((items: MaskRegion[]) => {
    copiedRegionsRef.current = items.map((region) => ({ ...region }));
    setMessage(`${items.length === 1 ? "Mask" : `${items.length} masks`} copied. Press Cmd/Ctrl+V to paste.`);
    setContextMenu(null);
  }, []);

  const pasteCopiedRegions = useCallback(() => {
    const copied = copiedRegionsRef.current;
    if (!copied.length || !imageRef.current) return;

    rememberRegions();
    const pasted = copied.map((region) => duplicateRegion(region));
    copiedRegionsRef.current = pasted.map((region) => ({ ...region }));
    setRegions((current) => [...current, ...pasted]);
    setSelectedIds(pasted.map((region) => region.id));
    setContextMenu(null);
    setMessage(`Pasted ${pasted.length === 1 ? "a mask" : `${pasted.length} masks`}. Drag the selection to reposition it.`);
  }, [rememberRegions]);

  const duplicateMasks = useCallback((items: MaskRegion[]) => {
    rememberRegions();
    const duplicates = items.map((region) => duplicateRegion(region));
    setRegions((current) => [...current, ...duplicates]);
    setSelectedIds(duplicates.map((region) => region.id));
    setContextMenu(null);
    setMessage(`${duplicates.length === 1 ? "Mask" : `${duplicates.length} masks`} duplicated. Drag the selection to place it precisely.`);
  }, [rememberRegions]);

  const deleteRegions = useCallback((ids: string[]) => {
    if (!ids.length || !regions.some((region) => ids.includes(region.id))) return;
    rememberRegions();
    setRegions((current) => current.filter((region) => !ids.includes(region.id)));
    setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    setContextMenu(null);
    setMessage(`${ids.length === 1 ? "Mask" : `${ids.length} masks`} deleted. Undo is available if you need it back.`);
  }, [regions, rememberRegions]);

  const analyseImage = async (image: HTMLImageElement) => {
    const token = ++analysisTokenRef.current;
    setIsAddingMask(false);
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
      setSelectedIds(detectedRegions[0] ? [detectedRegions[0].id] : []);
      setAnalysisStatus("ready");
      setMessage(detectedRegions.length
        ? `Found ${detectedRegions.length} face candidate(s). Please review all results.`
        : "No face candidates were found. Please add a region manually.");
    } catch (error) {
      if (token !== analysisTokenRef.current) return;
      setAnalysisStatus("error");
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

  useLayoutEffect(() => {
    drawPreview();
  }, [drawPreview]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSize) {
      setCanvasDisplaySize(null);
      return;
    }

    const syncCanvasDisplaySize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      setCanvasDisplaySize((current) => current?.width === width && current.height === height
        ? current
        : { width, height });
    };

    syncCanvasDisplaySize();
    const observer = new ResizeObserver(syncCanvasDisplaySize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [imageSize]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditingText = target?.matches("input, textarea, select, [contenteditable='true']") ?? false;
      if (isEditingText) return;

      const key = event.key.toLowerCase();
      const hasCommandModifier = event.metaKey || event.ctrlKey;

      if (hasCommandModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (hasCommandModifier && key === "c" && selectedRegions.length) {
        event.preventDefault();
        copyRegions(selectedRegions);
        return;
      }

      if (hasCommandModifier && key === "v" && copiedRegionsRef.current.length) {
        event.preventDefault();
        pasteCopiedRegions();
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedRegions.length) {
        event.preventDefault();
        deleteRegions(selectedRegions.map((region) => region.id));
        return;
      }

      if (!hasCommandModifier && key === "a" && imageRef.current) {
        event.preventDefault();
        setIsAddingMask(true);
        setContextMenu(null);
        setMessage("Add mask is ready. Drag the area that should be protected.");
        return;
      }

      if (event.key === "Escape") {
        setContextMenu(null);
        setIsAddingMask(false);
        setMessage("Selection mode restored.");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copyRegions, deleteRegions, pasteCopiedRegions, redo, selectedRegions, undo]);

  const loadFile = (file: File) => {
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
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
      setSelectedIds([]);
      setIsAddingMask(false);
      setContextMenu(null);
      copiedRegionsRef.current = [];
      isNewFileRef.current = true;
      undoStackRef.current = [];
      redoStackRef.current = [];
      updateHistoryState();
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

  const onStagePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!imageRef.current || drag || event.button !== 0 || isProtectingPreview) return;
    if ((event.target as HTMLElement).closest(".canvas-caption")) return;
    const point = normalizePoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setContextMenu(null);
    if (isAddingMask) {
      setSelectedIds([]);
      setDrag({ type: "add", start: point, current: point });
    } else {
      const initialSelection = event.shiftKey ? selectedIds : [];
      setSelectedIds(initialSelection);
      setDrag({ type: "select", start: point, current: point, initialSelection });
    }
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    const point = normalizePoint(event);
    if (!point) return;

    if (drag.type === "add" || drag.type === "select") {
      setDrag({ ...drag, current: point });
      return;
    }

    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (drag.type === "move") {
      const boundedDx = clamp(
        dx,
        Math.max(...drag.initial.map((region) => -region.x)),
        Math.min(...drag.initial.map((region) => 1 - region.x - region.width)),
      );
      const boundedDy = clamp(
        dy,
        Math.max(...drag.initial.map((region) => -region.y)),
        Math.min(...drag.initial.map((region) => 1 - region.y - region.height)),
      );
      const initialById = new Map(drag.initial.map((region) => [region.id, region]));
      setRegions((current) => current.map((region) => {
        const initial = initialById.get(region.id);
        return initial ? { ...region, x: initial.x + boundedDx, y: initial.y + boundedDy } : region;
      }));
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
        setSelectedIds([region.id]);
        setIsAddingMask(false);
        setMessage("Mask added. Drag it to move or use the corner handle to resize.");
      } else {
        setMessage("Drag a larger area to add a mask, or press Esc to cancel.");
      }
    } else if (drag.type === "select") {
      const selection = rectFromPoints(drag.start, drag.current);
      const matchedIds = regions.filter((region) => intersectsRect(region, selection)).map((region) => region.id);
      const nextSelection = Array.from(new Set([...drag.initialSelection, ...matchedIds]));
      setSelectedIds(nextSelection);
      setMessage(nextSelection.length
        ? `${nextSelection.length} ${nextSelection.length === 1 ? "mask" : "masks"} selected. Adjust strength or drag them together.`
        : "No masks intersected the selection area.");
    }
    setDrag(null);
  };

  const startMove = (event: ReactPointerEvent<HTMLButtonElement>, region: MaskRegion) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (event.shiftKey) {
      setSelectedIds((current) => current.includes(region.id)
        ? current.filter((id) => id !== region.id)
        : [...current, region.id]);
      setContextMenu(null);
      setMessage("Selection updated. Shift-click another mask or adjust the group.");
      return;
    }
    const point = normalizePoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ids = selectedIds.includes(region.id) ? selectedIds : [region.id];
    rememberRegions();
    setSelectedIds(ids);
    setContextMenu(null);
    setDrag({
      type: "move",
      start: point,
      initial: regions.filter((item) => ids.includes(item.id)).map((item) => ({ ...item })),
    });
  };

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>, region: MaskRegion) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const point = normalizePoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    rememberRegions();
    setSelectedIds([region.id]);
    setDrag({ type: "resize", id: region.id, start: point, initial: region });
  };

  const openRegionMenu = (event: ReactMouseEvent<HTMLButtonElement>, region: MaskRegion) => {
    event.preventDefault();
    event.stopPropagation();
    const stage = event.currentTarget.closest(".canvas-stage") as HTMLElement | null;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    if (!selectedIds.includes(region.id)) setSelectedIds([region.id]);
    setContextMenu({
      id: region.id,
      x: Math.max(8, Math.min(event.clientX - bounds.left, bounds.width - 184)),
      y: Math.max(8, Math.min(event.clientY - bounds.top, bounds.height - 148)),
    });
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

  const draftRect = drag?.type === "add" ? rectFromPoints(drag.start, drag.current) : null;
  const selectionRect = drag?.type === "select" ? rectFromPoints(drag.start, drag.current) : null;
  const contextRegion = contextMenu
    ? regions.find((region) => region.id === contextMenu.id) ?? null
    : null;
  const contextActionRegions = contextRegion
    ? selectedIds.includes(contextRegion.id) ? selectedRegions : [contextRegion]
    : [];
  const selectedMosaicSizes = new Set(selectedRegions.map((region) => region.mosaicSize));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="wordmark" aria-label="FrameMute">
          <span className="wordmark-mark" />
          <span>framemute</span>
        </div>
        <div className="editor-progress" aria-label="Masking workflow">
          <span className={fileName ? "complete" : "active"}><i>1</i> Photo</span>
          <b />
          <span className={fileName ? "active" : ""}><i>2</i> Review</span>
          <b />
          <span><i>3</i> Save</span>
        </div>
        <div className="topbar-actions">
          <div className="privacy-status"><span className="status-dot" />Processed on this device</div>
          <button className="new-photo-button" type="button" onClick={() => fileInputRef.current?.click()}>New photo</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="left-panel">
          <div className="panel-heading">
            <span>Photo</span>
            <span className="counter">{fileName ? "01" : "00"}</span>
          </div>
          <button className="file-row" type="button" onClick={() => fileInputRef.current?.click()}>
            <span className="file-glyph">+</span>
            <span className="file-copy">
              <strong>{fileName ?? "Choose a photo"}</strong>
              <small>{imageSize ? `${imageSize.x} × ${imageSize.y}` : "JPG · PNG · WebP"}</small>
            </span>
          </button>
          <div className="gesture-guide">
            <span className="section-label">Canvas controls</span>
            <strong>Drag to select.</strong>
            <p>Start a drag anywhere in the workspace to select masks. Shift-drag adds to the current selection.</p>
          </div>
          <div className="shortcut-list" aria-label="Keyboard shortcuts">
            <span className="section-label">Shortcuts</span>
            <div><span>Copy mask</span><kbd>⌘ C</kbd></div>
            <div><span>Paste mask</span><kbd>⌘ V</kbd></div>
            <div><span>Add mask</span><kbd>A</kbd></div>
            <div><span>Delete mask</span><kbd>⌫</kbd></div>
            <div><span>Undo</span><kbd>⌘ Z</kbd></div>
          </div>
        </aside>

        <section className={`editor ${fileName ? "has-image" : ""}`} aria-label="Photo masking editor" onDragOver={onDragOver} onDrop={onDrop} onPointerDown={onStagePointerDown} onPointerMove={onStagePointerMove} onPointerUp={onStagePointerUp} onPointerCancel={onStagePointerUp}>
          {!imageRef.current ? (
            <button className="drop-zone" type="button" onClick={() => fileInputRef.current?.click()}>
              <span className="drop-mark">+</span>
              <strong>Choose a photo to protect</strong>
              <span>Drop it here or browse this device</span>
              <small>JPG, PNG, WebP · up to 50 MB</small>
              <em><span className="status-dot" />Your photo is never uploaded</em>
            </button>
          ) : (
            <div className={`canvas-stage ${isAddingMask ? "is-adding-mask" : ""} ${isProtectingPreview ? "is-protecting-preview" : ""}`} aria-busy={isProtectingPreview}>
              <canvas ref={canvasRef} aria-label="Mosaic preview" />
              {isProtectingPreview && (
                <div className="analysis-shield" role="status" aria-live="polite">
                  <span className="analysis-spinner" aria-hidden="true" />
                  <strong>Preparing a protected preview</strong>
                  <p>Detecting mask candidates locally before showing your photo.</p>
                </div>
              )}
              {regions.map((region, index) => (
                <div
                  className={`region ${selectedIds.includes(region.id) ? "is-selected" : ""}`}
                  key={region.id}
                  style={overlayStyle(region, canvasDisplaySize)}
                >
                  <button className="region-body" type="button" aria-label={`Select mask ${index + 1}`} onPointerDown={(event) => startMove(event, region)} onContextMenu={(event) => openRegionMenu(event, region)} />
                  <span className="region-badge">{index + 1}</span>
                  {selectedRegions.length === 1 && region.id === selectedRegion?.id && <button className="resize-handle" type="button" aria-label="Resize mask" onPointerDown={(event) => startResize(event, region)} />}
                </div>
              ))}
              {draftRect && <div className="region draft" style={overlayStyle(draftRect, canvasDisplaySize)} />}
              {selectionRect && <div className="selection-marquee" style={overlayStyle(selectionRect, canvasDisplaySize)} />}
              {contextMenu && contextRegion && (
                <div className="region-context-menu" role="menu" aria-label="Mask options" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
                  <span>{contextActionRegions.length > 1 ? `${contextActionRegions.length} masks selected` : "Mask options"}</span>
                  <button type="button" role="menuitem" onClick={() => copyRegions(contextActionRegions)}>Copy <kbd>⌘ C</kbd></button>
                  <button type="button" role="menuitem" onClick={() => duplicateMasks(contextActionRegions)}>Duplicate</button>
                  <button className="danger" type="button" role="menuitem" onClick={() => deleteRegions(contextActionRegions.map((region) => region.id))}>Delete <kbd>⌫</kbd></button>
                </div>
              )}
            </div>
          )}
          <div className="canvas-caption">
            <span>{analysisStatus === "analyzing" ? "Finding face candidates locally…" : isAddingMask ? "Draw a new mask · Esc to cancel" : fileName ? "Drag anywhere to select · Shift-drag to add" : "Ready for a photo"}</span>
            <span>{regions.length} {regions.length === 1 ? "mask" : "masks"}</span>
          </div>
        </section>

        <aside className="inspector">
          <div className="panel-heading"><span>Review masks</span><span className="counter">{String(regions.length).padStart(2, "0")}</span></div>
          <div className="review-summary">
            <strong>{regions.length ? `${regions.length} masks to review` : "No masks yet"}</strong>
            <p>{fileName ? "Check every face before saving your copy." : "Choose a photo to begin local analysis."}</p>
          </div>

          <div className="utility-actions" role="group" aria-label="Editor utilities">
            <button type="button" disabled={!historyState.canUndo} onClick={undo}>↶ <span>Undo</span></button>
            <button type="button" disabled={!historyState.canRedo} onClick={redo}>↷ <span>Redo</span></button>
            <button type="button" disabled={!imageRef.current || analysisStatus === "analyzing"} onClick={() => imageRef.current && void analyseImage(imageRef.current)}>◎ <span>{analysisStatus === "analyzing" ? "Analyzing" : "Reanalyze"}</span></button>
            <button className={isAddingMask ? "active" : ""} type="button" aria-pressed={isAddingMask} disabled={!imageRef.current || isProtectingPreview} onClick={() => {
              setIsAddingMask((current) => !current);
              setContextMenu(null);
              setMessage(isAddingMask ? "Selection mode restored." : "Add mask is ready. Drag the area that should be protected.");
            }}>＋ <span>Add mask</span></button>
          </div>

          <div className="inspector-body">
            {selectedRegion ? (
              <>
                <div className="selected-mask">
                  <span>{selectedRegions.length > 1 ? "Group selection" : selectedRegion.source === "detected" ? `Automatic candidate · ${Math.round((selectedRegion.confidence ?? 0) * 100)}%` : "Manual mask"}</span>
                  <strong>{selectedRegions.length > 1 ? `${selectedRegions.length} masks selected` : `Mask ${String(regions.findIndex((region) => region.id === selectedRegion.id) + 1).padStart(2, "0")}`}</strong>
                  <small>{selectedRegions.length > 1 ? "Drag any selected mask to move the group together." : "Shift-click another mask to build a group."}</small>
                </div>
                <label className="range-label" htmlFor="mosaic-size">Mosaic strength <output>{selectedMosaicSizes.size > 1 ? "Mixed" : selectedRegion.mosaicSize}</output></label>
                <input id="mosaic-size" type="range" min="5" max="40" value={selectedRegion.mosaicSize} onPointerDown={rememberRegions} onChange={(event) => {
                  const mosaicSize = Number(event.target.value);
                  setRegions((current) => applyMosaicSize(current, selectedIds, mosaicSize));
                }} />
                <div className="mask-actions">
                  <button type="button" onClick={() => copyRegions(selectedRegions)}>Copy</button>
                  <button type="button" onClick={() => duplicateMasks(selectedRegions)}>Duplicate</button>
                  <button className="delete-button" type="button" onClick={() => deleteRegions(selectedIds)}>Delete</button>
                </div>
              </>
            ) : (
              <div className="empty-inspector"><strong>Select masks to edit</strong><p>Drag across the canvas for a group selection, or choose Add mask to draw a new one.</p></div>
            )}
          </div>

          <div className="export-block">
            <span className="section-label">Save masked copy</span>
            <p>The original photo stays untouched. Review every mask before sharing.</p>
            <div className="export-actions">
              <button className="export-button" type="button" disabled={!fileName || analysisStatus === "analyzing"} onClick={() => exportImage("png")}>Export PNG <span>↓</span></button>
              <button className="export-button export-button-secondary" type="button" disabled={!fileName || analysisStatus === "analyzing"} onClick={() => exportImage("jpeg")}>JPG <span>↓</span></button>
            </div>
          </div>
        </aside>
      </div>

      <footer className="statusbar"><span>{message}</span><span><i className="status-dot" />{fileName ? "Local session ready" : "Waiting for photo"}</span></footer>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} />
    </main>
  );
}

export default FrameMuteEditor;
