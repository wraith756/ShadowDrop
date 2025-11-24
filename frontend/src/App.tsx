import React, {
  useEffect,
  useRef,
  useState,
  ChangeEvent,
  FormEvent,
  MouseEvent,
} from "react";
import "./index.css";

// Uploaded placeholder image (will be served from your environment)
const PLACEHOLDER_IMG = "/mnt/data/fbc2eec3-62d4-4b45-9e9a-047eb55943d9.png";

const API_BASE =
  import.meta.env.MODE === "production" ? "" : "http://localhost:8000";

type Nullable<T> = T | null;

function bytesToNiceSize(bytes?: number) {
  if (!bytes && bytes !== 0) return "—";
  if ((bytes ?? 0) < 1024) return `${bytes} B`;
  if ((bytes ?? 0) < 1024 * 1024)
    return `${((bytes ?? 0) / 1024).toFixed(1)} KB`;
  return `${((bytes ?? 0) / 1024 / 1024).toFixed(2)} MB`;
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
  return { score, label, entropy: Math.round(entropy) } as any;
}

type Mode = "embed" | "preview" | "extract";

export default function App(): JSX.Element {
  // state
  const [mode, setMode] = useState<Mode>("embed");
  const [focusMode, setFocusMode] = useState(false);

  const [imageFile, setImageFile] = useState<Nullable<File>>(null); // embed
  const [extractFile, setExtractFile] = useState<Nullable<File>>(null); // extract
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
  const [cardTilt, setCardTilt] = useState({ rx: 0, ry: 0, scale: 1 });
  const [cardFlipped, setCardFlipped] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const idleTimeout = useRef<number | null>(null);

  // particle canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // abort controller
  const abortRef = useRef<Nullable<AbortController>>(null);

  const pw = passwordStrength(password);

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "h" || e.key === "H") setMode("embed");
      if (e.key === "p" || e.key === "P") setMode("preview");
      if (e.key === "e" || e.key === "E") setMode("extract");
      if (e.key === "f" || e.key === "F") setFocusMode((s) => !s);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // previews & capacities
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
    calcImageCapacityBits(imageFile)
      .then((c) => setCapacityBits(c))
      .catch(() => setCapacityBits(null));
    return () => URL.revokeObjectURL(url);
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

  // particles (small) - reuse previous lightweight system
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const DPR = window.devicePixelRatio || 1;

    function resize() {
      canvas.width = canvas.clientWidth * DPR;
      canvas.height = canvas.clientHeight * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();

    const particles: any[] = [];
    const N = Math.max(
      30,
      Math.round((canvas.clientWidth * canvas.clientHeight) / 20000)
    );
    for (let i = 0; i < N; i++) {
      particles.push({
        x: Math.random() * canvas.clientWidth,
        y: Math.random() * canvas.clientHeight,
        r: 0.6 + Math.random() * 1.8,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        hue: 200 + Math.random() * 40,
        alpha: 0.04 + Math.random() * 0.12,
      });
    }

    function step() {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = canvas.clientWidth + 10;
        if (p.x > canvas.clientWidth + 10) p.x = -10;
        if (p.y < -10) p.y = canvas.clientHeight + 10;
        if (p.y > canvas.clientHeight + 10) p.y = -10;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.alpha})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      animationRef.current = requestAnimationFrame(step);
    }
    animationRef.current = requestAnimationFrame(step);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

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
    };
  }, []);

  function handleFileInput(setter: (f: File | null) => void) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      setter(file);
      setError(null);
    };
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file) setImageFile(file);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(true);
  }
  function onDragLeave() {
    setDragActive(false);
  }

  function validateHide(): string | null {
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
  }

  async function handleHide(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setExtractedMessage(null);

    const validation = validateHide();
    if (validation) {
      setError(validation);
      // smart suggestion: if capacity too small, switch to preview with suggestion
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
      // subtle visual success: briefly pulse card
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
  }

  async function handleExtract(e?: FormEvent) {
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
      // switch to preview to show result
      setMode("preview");
    } catch (err: any) {
      if (err?.name === "AbortError") setError("Extraction cancelled");
      else setError("Extract failed: " + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function cancelOperation() {
    if (abortRef.current) abortRef.current.abort();
  }
  function clearAll() {
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
  }

  // 3D handlers
  function handlePointerMove(e: MouseEvent<HTMLDivElement>) {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const rx = Math.max(Math.min(-dy / 18, 12), -12);
    const ry = Math.max(Math.min(dx / 18, 12), -12);
    setCardTilt({ rx, ry, scale: 1.05 });
    if (idleTimeout.current) window.clearTimeout(idleTimeout.current);
  }
  function handlePointerLeave() {
    setCardTilt({ rx: 0, ry: 0, scale: 1 });
    idleTimeout.current = window.setTimeout(() => {
      setCardTilt({ rx: 2.5, ry: -4, scale: 1 });
    }, 2000);
  }
  function toggleFlip() {
    setCardFlipped((s) => !s);
  }

  const composedTransform = `rotateY(${cardFlipped ? 180 : 0}deg) rotateX(${
    cardTilt.rx
  }deg) rotateY(${cardTilt.ry}deg) scale(${cardTilt.scale})`;

  // Smart suggestion helper
  const suggestion = (() => {
    if (!capacityBits) return "Select an image to see capacity suggestion.";
    const estimatedEncryptedBytes =
      new TextEncoder().encode(message).length + 128;
    const neededBits = estimatedEncryptedBytes * 8 + 8;
    if (neededBits <= capacityBits)
      return "Fits ✅ — image can hold your encrypted message.";
    const deficit = Math.ceil((neededBits - capacityBits) / 8);
    return `Too small — message ~${deficit} bytes too large. Recommendation: shorten message or use a larger image.`;
  })();

  return (
    <div className={`dark-page ${focusMode ? "focus-mode" : ""}`}>
      {/* particle canvas hidden when focus mode is on */}
      <canvas
        ref={canvasRef}
        className={`particles ${focusMode ? "hidden" : ""}`}
      />

      <div className="app-shell">
        <div className="topbar">
          <div className="brand">
            <div className="logo">
              <img src="Logo.png" alt="AS" />
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
                Embed (H)
              </button>
              <button
                className={`seg-btn ${mode === "preview" ? "active" : ""}`}
                onClick={() => setMode("preview")}
              >
                Preview (P)
              </button>
              <button
                className={`seg-btn ${mode === "extract" ? "active" : ""}`}
                onClick={() => setMode("extract")}
              >
                Extract (E)
              </button>
            </div>

            <button
              className="ghost small"
              onClick={() => setFocusMode((s) => !s)}
              title="Toggle Focus Mode (F)"
            >
              {focusMode ? "Exit Focus" : "Focus"}
            </button>
          </div>
        </div>

        <div className="main-grid single-feature">
          {/* Only render the active panel; each panel has an animated enter/exit via CSS */}
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

          <section
            className={`panel glass panel-anim ${
              mode === "preview" ? "visible" : "hidden"
            }`}
          >
            <h3 className="panel-title">Preview — inspect & quick actions</h3>
            <div className="muted">
              Only the active feature is shown. Use keyboard: H / P / E / F
            </div>

            <div
              ref={cardRef}
              className="perspective"
              onMouseMove={handlePointerMove}
              onMouseLeave={handlePointerLeave}
              onClick={toggleFlip}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") toggleFlip();
              }}
            >
              <div className="card-3d" style={{ transform: composedTransform }}>
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
                        onClick={() => {
                          if (imageFile) handleHide();
                        }}
                      >
                        Embed
                      </button>
                      <button
                        className="ghost"
                        onClick={() => {
                          if (extractFile) handleExtract();
                        }}
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
                  concentration (F).
                </li>
                <li>
                  Keyboard shortcuts speed up workflows: H/P/E toggles features.
                </li>
              </ul>
            </div>
          </section>

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
          Built with ❤️ — SecureHide · Keyboard: H/P/E, Focus: F
        </footer>
      </div>
    </div>
  );
}
