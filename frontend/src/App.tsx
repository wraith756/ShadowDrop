import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, MouseEvent, DragEvent } from "react";
import "./index.css";

// Local placeholder image
const PLACEHOLDER_IMG = "/mnt/data/fbc2eec3-62d4-4b45-9e9a-047eb55943d9.png";

const API_BASE =
  import.meta.env.MODE === "production" ? "" : "https://shadowdrop.onrender.com/:8000"||"0.0.0.0:8000";

type Nullable<T> = T | null;
type Mode = "embed" | "preview" | "extract";

/**
 * PERFORMANCE NOTES:
 * - Type-only imports for TS + verbatimModuleSyntax.
 * - Canvas particles use a stable loop and refs (no re-init on focus toggle).
 * - 3D card tilt uses refs + direct style updates (no rerender per mouse move).
 * - Image previews use object URLs with proper cleanup.
 * - Minimal state: derived values are computed with useMemo.
 */

function bytesToNiceSize(bytes?: number | null) {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function calcImageCapacityBits(file: File): Promise<number> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const capacity = img.width * img.height * 3;
      URL.revokeObjectURL(url);
      res(capacity);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("Unable to read image dimensions"));
    };
    img.src = url;
  });
}

function passwordStrength(password: string) {
  if (!password) return { score: 0, label: "Empty", entropy: 0 };
  let charset = 0;
  if (/[a-z]/.test(password)) charset += 26;
  if (/[A-Z]/.test(password)) charset += 26;
  if (/[0-9]/.test(password)) charset += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charset += 32;
  const entropy = password.length * Math.log2(Math.max(1, charset));
  const score = Math.min(4, Math.floor(entropy / 20));
  const label =
    entropy < 28
      ? "Very weak"
      : entropy < 36
      ? "Weak"
      : entropy < 60
      ? "Good"
      : "Strong";
  return { score, label, entropy: Math.round(entropy) } as const;
}

export default function App() {
  const [mode, setMode] = useState<Mode>("embed");
  const [focusMode, setFocusMode] = useState(false);

  const [imageFile, setImageFile] = useState<Nullable<File>>(null);
  const [extractFile, setExtractFile] = useState<Nullable<File>>(null);
  const [hidePreview, setHidePreview] = useState<Nullable<string>>(null);
  const [extractPreview, setExtractPreview] = useState<Nullable<string>>(null);

  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [extractedMessage, setExtractedMessage] =
    useState<Nullable<string>>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Nullable<string>>(null);

  const [capacityBits, setCapacityBits] = useState<Nullable<number>>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<Nullable<number>>(null);
  const [dragActive, setDragActive] = useState(false);

  // 3D card
  const [cardFlipped, setCardFlipped] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const idleTimeout = useRef<number | null>(null);
  const tiltRef = useRef({ rx: 0, ry: 0, scale: 1 });

  // particles (canvas)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<any[]>([]);

  // abort controller
  const abortRef = useRef<Nullable<AbortController>>(null);

  // focus mode ref for particles (so we don't rerun effect)
  const focusModeRef = useRef(focusMode);
  useEffect(() => {
    focusModeRef.current = focusMode;
  }, [focusMode]);

  const pw = useMemo(() => passwordStrength(password), [password]);

  /* ------------------------
     Previews & capacity
     ------------------------ */
  useEffect(() => {
    if (!imageFile) {
      setHidePreview(null);
      setCapacityBits(null);
      setFileSizeBytes(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setHidePreview(url);
    setFileSizeBytes(imageFile.size);

    let mounted = true;
    calcImageCapacityBits(imageFile)
      .then((c) => {
        if (mounted) setCapacityBits(c);
      })
      .catch(() => {
        if (mounted) setCapacityBits(null);
      });
    return () => {
      mounted = false;
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  useEffect(() => {
    if (!extractFile) {
      setExtractPreview(null);
      return;
    }
    const url = URL.createObjectURL(extractFile);
    setExtractPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [extractFile]);

  /* ------------------------
     Lightweight particle system
     - Stable effect (no dependency on focusMode)
     - Uses refs for focus state
     ------------------------ */
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const ctxEl = canvasEl.getContext("2d");
    if (!ctxEl) return;

    // ✅ Freeze non-null references
    const canvas = canvasEl;
    const ctx = ctxEl;

    let running = true;
    const DPR = window.devicePixelRatio || 1;
    let width = 0;
    let height = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(300, rect.width);
      height = Math.max(200, rect.height);
      canvas.width = width * DPR;
      canvas.height = height * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    resize();

    const area = width * height;
    const N = Math.max(18, Math.round(area / 30000));
    const particles = particlesRef.current.length ? particlesRef.current : [];
    if (!particles.length) {
      for (let i = 0; i < N; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: 0.6 + Math.random() * 1.6,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          hue: 200 + Math.random() * 60,
          alpha: 0.04 + Math.random() * 0.12,
        });
      }
    }
    particlesRef.current = particles;

    function step() {
      if (!running) return;

      ctx.clearRect(0, 0, width, height);

      if (!focusModeRef.current) {
        for (let i = 0, L = particles.length; i < L; i++) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;

          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          if (p.y > height + 10) p.y = -10;

          ctx.beginPath();
          ctx.fillStyle = `hsla(${p.hue}, 75%, 60%, ${p.alpha})`;
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationRef.current = requestAnimationFrame(step);
    }

    animationRef.current = requestAnimationFrame(step);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  /* ------------------------
     Cleanup on unmount
     ------------------------ */
  useEffect(() => {
    return () => {
      if (idleTimeout.current) {
        window.clearTimeout(idleTimeout.current);
        idleTimeout.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  /* ------------------------
     Stable callbacks
     ------------------------ */
  const handleFileInput = useCallback(
    (setter: (f: File | null) => void) =>
      (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        setter(file);
        setError(null);
      },
    []
  );

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0] ?? null;
    if (file) setImageFile(file);
  }, []);

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback(() => setDragActive(false), []);

  const validateHide = useCallback((): string | null => {
    if (!imageFile) return "Please choose an image to hide the message in.";
    if (!message.trim()) return "Message can't be empty.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (capacityBits && message) {
      const estimatedEncryptedBytes =
        new TextEncoder().encode(message).length + 128;
      const neededBits = estimatedEncryptedBytes * 8 + 8;
      if (neededBits > capacityBits)
        return `Image too small. Capacity ${capacityBits} bits, needed ~ ${neededBits} bits.`;
    }
    return null;
  }, [imageFile, message, password, capacityBits]);

  /* ------------------------
     Network actions (hide/extract)
     ------------------------ */
  const handleHide = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      setError(null);
      setExtractedMessage(null);

      const validation = validateHide();
      if (validation) {
        setError(validation);
        if (validation.startsWith("Image too small")) setMode("preview");
        return;
      }

      const form = new FormData();
      form.append("image", imageFile as File);
      form.append("message", message);
      form.append("password", password);

      try {
        setLoading(true);
        const controller = new AbortController();
        abortRef.current = controller;
        const res = await fetch(`${API_BASE}/api/hide`, {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => null);
          throw new Error(text || `Server responded ${res.status}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "stego-hidden.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        // pulse feedback
        if (cardRef.current) {
          cardRef.current.classList.add("pulse");
          setTimeout(
            () => cardRef.current && cardRef.current.classList.remove("pulse"),
            700
          );
        }
        setMessage("");
      } catch (err: any) {
        if (err?.name === "AbortError") setError("Upload cancelled");
        else setError("Hide failed: " + (err?.message ?? String(err)));
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [imageFile, message, password, validateHide]
  );

  const handleExtract = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      setError(null);
      setExtractedMessage(null);

      if (!extractFile) {
        setError("Please choose a stego image to extract from.");
        return;
      }
      if (!password) {
        setError("Enter the password used to hide the message.");
        return;
      }

      const form = new FormData();
      form.append("image", extractFile);
      form.append("password", password);

      try {
        setLoading(true);
        const controller = new AbortController();
        abortRef.current = controller;
        const res = await fetch(`${API_BASE}/api/extract`, {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.detail || `Server ${res.status}`);
        }
        const data = await res.json();
        setExtractedMessage(data.message);
        setMode("preview");
      } catch (err: any) {
        if (err?.name === "AbortError") setError("Extraction cancelled");
        else setError("Extract failed: " + (err?.message ?? String(err)));
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [extractFile, password]
  );

  const clearAll = useCallback(() => {
    setImageFile(null);
    setExtractFile(null);
    setHidePreview(null);
    setExtractPreview(null);
    setMessage("");
    setPassword("");
    setExtractedMessage(null);
    setError(null);
    setCapacityBits(null);
    setFileSizeBytes(null);
  }, []);

  /* ------------------------
     3D card transforms (optimized)
     ------------------------ */
  const applyCardTransform = useCallback(() => {
    if (!cardRef.current) return;
    const { rx, ry, scale } = tiltRef.current;
    const flip = cardFlipped ? 180 : 0;
    cardRef.current.style.transform = `rotateY(${flip}deg) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`;
  }, [cardFlipped]);

  useEffect(() => {
    // apply flip change
    applyCardTransform();
  }, [applyCardTransform]);

  const handlePointerMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const rx = Math.max(Math.min(-dy / 18, 12), -12);
      const ry = Math.max(Math.min(dx / 18, 12), -12);
      tiltRef.current = { rx, ry, scale: 1.05 };
      if (idleTimeout.current) window.clearTimeout(idleTimeout.current);
      applyCardTransform();
    },
    [applyCardTransform]
  );

  const handlePointerLeave = useCallback(() => {
    tiltRef.current = { rx: 0, ry: 0, scale: 1 };
    applyCardTransform();
    if (idleTimeout.current) window.clearTimeout(idleTimeout.current);
    idleTimeout.current = window.setTimeout(() => {
      tiltRef.current = { rx: 2.5, ry: -4, scale: 1 };
      applyCardTransform();
    }, 1500);
  }, [applyCardTransform]);

  const toggleFlip = useCallback(() => setCardFlipped((s) => !s), []);

  // Smart suggestion
  const suggestion = useMemo(() => {
    if (!capacityBits) return "Select an image to see capacity suggestion.";
    const estimatedEncryptedBytes =
      new TextEncoder().encode(message).length + 128;
    const neededBits = estimatedEncryptedBytes * 8 + 8;
    if (neededBits <= capacityBits)
      return "Fits ✅ — image can hold your encrypted message.";
    const deficit = Math.ceil((neededBits - capacityBits) / 8);
    return `Too small — message ~${deficit} bytes too large. Recommendation: shorten message or use a larger image.`;
  }, [capacityBits, message]);

  return (
    <div className={`dark-page ${focusMode ? "focus-mode" : ""}`}>
      <canvas
        ref={canvasRef}
        className={`particles ${focusMode ? "hidden" : ""}`}
      />

      <div className="app-shell">
        <div className="topbar">
          <div className="brand">
            <div className="logo">
              <img
                src="Logo.png"
                alt="Logo"
                style={{
                  width: 50,
                  height: 50,
                  objectFit: "cover",
                  borderRadius: 8,
                }}
              />
            </div>
            <div>
              <div className="brand-title">
                Shadow<span className="sd">Drop</span>
              </div>
              <div className="brand-sub">Hide encrypted messages in images</div>
            </div>
          </div>

          <div className="top-actions">
            <div className="segmented">
              <button
                className={`seg-btn ${mode === "embed" ? "active" : ""}`}
                onClick={() => setMode("embed")}
              >
                Embed
              </button>
              <button
                className={`seg-btn ${mode === "preview" ? "active" : ""}`}
                onClick={() => setMode("preview")}
              >
                Preview
              </button>
              <button
                className={`seg-btn ${mode === "extract" ? "active" : ""}`}
                onClick={() => setMode("extract")}
              >
                Extract
              </button>
            </div>

            <button
              className="ghost small"
              onClick={() => setFocusMode((s) => !s)}
              title="Toggle Focus Mode"
            >
              {focusMode ? "Exit Focus" : "Focus"}
            </button>
          </div>
        </div>

        <div className="main-grid single-feature">
          {/* EMBED */}
          <section
            className={`panel glass panel-anim ${
              mode === "embed" ? "visible" : "hidden"
            }`}
          >
            <h3 className="panel-title">Embed — hide a secret</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleHide();
              }}
            >
              <label className="label">Image to embed</label>

              <div
                className={`drop ${dragActive ? "drop-active" : ""}`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
              >
                <input
                  id="file-hide"
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput(setImageFile)}
                  className="hidden"
                />
                <label htmlFor="file-hide" className="btn">
                  Choose file
                </label>

                <div className="drop-content">
                  {imageFile ? (
                    <div className="file-info">
                      <img
                        src={hidePreview ?? PLACEHOLDER_IMG}
                        className="thumb"
                        alt="preview"
                      />
                      <div>
                        <div className="file-name">{imageFile.name}</div>
                        <div className="muted">
                          {bytesToNiceSize(fileSizeBytes)} •{" "}
                          {capacityBits
                            ? `${capacityBits} bits`
                            : "calculating..."}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="muted">
                      Drop an image here or click choose — PNG recommended.
                    </div>
                  )}
                </div>
              </div>

              <label className="label">Message</label>
              <textarea
                className="input dark"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Secret message to embed..."
              />

              <label className="label">Password</label>
              <input
                className="input dark"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Strong password (min 6 chars)"
              />

              <div className="row actions-row">
                <div style={{ flex: 1 }}>
                  <div className="meter">
                    <div
                      className={`meter-fill s${pw.score}`}
                      style={{ width: `${(pw.score / 4) * 100}%` }}
                    />
                  </div>
                  <div className="muted">
                    Strength: <strong>{pw.label}</strong> • {pw.entropy} bits
                  </div>
                  <div className="muted" style={{ marginTop: 8 }}>
                    {suggestion}
                  </div>
                </div>

                <div className="btns">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => handleHide()}
                    disabled={loading}
                  >
                    {loading ? "Working..." : "Hide & Download"}
                  </button>
                  <button className="ghost" type="button" onClick={clearAll}>
                    Clear
                  </button>
                </div>
              </div>

              {error && <div className="error">{error}</div>}
            </form>
          </section>

          {/* PREVIEW */}
          <section
            className={`panel glass panel-anim ${
              mode === "preview" ? "visible" : "hidden"
            }`}
          >
            <h3 className="panel-title">Preview — inspect & quick actions</h3>
            <div className="muted">
              Only the active feature is shown to keep the UI focused.
            </div>

            <div
              ref={cardRef}
              className="perspective"
              onMouseMove={handlePointerMove}
              onMouseLeave={handlePointerLeave}
              onClick={toggleFlip}
              role="button"
              tabIndex={0}
            >
              <div className="card-3d">
                <div className="card-face card-front">
                  <img
                    src={hidePreview ?? extractPreview ?? PLACEHOLDER_IMG}
                    alt="preview"
                  />
                </div>
                <div className="card-face card-back">
                  <div className="back-inner">
                    <div className="muted">File</div>
                    <div className="file-name">
                      {imageFile?.name ?? extractFile?.name ?? "—"}
                    </div>
                    <div className="muted" style={{ marginTop: 8 }}>
                      {bytesToNiceSize(fileSizeBytes)}{" "}
                      {capacityBits ? `• ${capacityBits} bits` : ""}
                    </div>
                    <div className="card-actions">
                      <button
                        className="btn"
                        onClick={() => imageFile && handleHide()}
                      >
                        Embed
                      </button>
                      <button
                        className="ghost"
                        onClick={() => extractFile && handleExtract()}
                      >
                        Extract
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="muted">Quick tips</div>
              <ul className="muted" style={{ marginTop: 8 }}>
                <li>
                  Focus Mode hides particles and dims chrome to help
                  concentration.
                </li>
                <li>Use the segmented control to switch tasks quickly.</li>
              </ul>
            </div>
          </section>

          {/* EXTRACT */}
          <section
            className={`panel glass panel-anim ${
              mode === "extract" ? "visible" : "hidden"
            }`}
          >
            <h3 className="panel-title">Extract — retrieve message</h3>

            <label className="label">Stego image</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileInput(setExtractFile)}
            />

            <label className="label" style={{ marginTop: 8 }}>
              Password used
            </label>
            <input
              className="input dark"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <div style={{ marginTop: 10 }}>
              <button
                className="btn"
                onClick={() => handleExtract()}
                disabled={loading}
              >
                {loading ? "Working..." : "Extract"}
              </button>
              <button
                className="ghost"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  setExtractFile(null);
                  setExtractedMessage(null);
                  setError(null);
                }}
              >
                Reset
              </button>
            </div>

            {extractedMessage && (
              <div className="extracted" style={{ marginTop: 12 }}>
                <div className="file-name">Extracted</div>
                <pre className="extracted-text">{extractedMessage}</pre>
                <div style={{ marginTop: 8 }}>
                  <button
                    className="ghost"
                    onClick={() =>
                      navigator.clipboard.writeText(extractedMessage)
                    }
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="error" style={{ marginTop: 10 }}>
                {error}
              </div>
            )}
          </section>
        </div>

        <footer className="footer">
          Built with ❤️ — ShadowDrop · Focus mode available
        </footer>
      </div>
    </div>
  );
}
