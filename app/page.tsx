"use client";
import { useEffect, useRef, useState } from "react";
import {
  requestJSON as api,
  uploadAsset,
  fileDetails,
} from "@/lib/client-upload";
import { DURATIONS, timingError } from "@/lib/policy";
import type { Asset, Duration, Job, Quote, VideoKind } from "@/lib/types";
import { creationIssues, type CreateIssue, type StudioConfig as Config } from "@/lib/create-flow";
import { CreateReview } from "@/components/create-review";
type Tab = "create" | "history" | "settings";
const money = (usd: number, fx = 26000) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(usd * fx);
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const p: Record<string, React.ReactNode> = {
    play: <path d="m9 5 11 7-11 7Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    history: (
      <>
        <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="16" cy="17" r="3" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z" />
        <path d="M20 2v4M18 4h4" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="9" cy="9" r="2" />
        <path d="m3 17 5-5 4 4 4-5 5 6" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4" />
      </>
    ),
    audio: (
      <>
        <path d="M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {p[name] || p.play}
    </svg>
  );
}
export default function Studio() {
  const [tab, setTab] = useState<Tab>("create"),
    [config, setConfig] = useState<Config | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const [password, setPassword] = useState(""),
    [image, setImage] = useState<Asset | null>(null),
    [audio, setAudio] = useState<Asset | null>(null),
    [preview, setPreview] = useState(""),
    [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [mode, setMode] = useState<"auto" | "existing">("auto"),
    [source, setSource] = useState<"text" | "audio">("text"),
    [topic, setTopic] = useState(""),
    [text, setText] = useState(""),
    [duration, setDuration] = useState<Duration>(30),
    [kind, setKind] = useState<VideoKind>("motion"),
    [voice, setVoice] = useState("vi-VN-Standard-A");
  const [quote, setQuote] = useState<Quote | null>(null),
    [jobs, setJobs] = useState<Job[]>([]),
    [current, setCurrent] = useState<Job | null>(null),
    [consent, setConsent] = useState(false),
    [hydrated, setHydrated] = useState(false),
    [scriptReceipt, setScriptReceipt] = useState(""),
    [reviewOpen, setReviewOpen] = useState(false),
    [focusTarget, setFocusTarget] = useState("");
  const imageInput = useRef<HTMLInputElement>(null),
    audioInput = useRef<HTMLInputElement>(null),
    idempotency = useRef(""),
    actionInFlight = useRef(false);
  const allow = config?.authenticated && config.storage;
  useEffect(() => {
    if (!focusTarget) return;
    const element = document.getElementById(focusTarget);
    if (element) {
      element.scrollIntoView({ block: "center" });
      element.focus({ preventScroll: true });
      setFocusTarget("");
    }
  }, [tab, focusTarget]);
  useEffect(() => {
    api<Config>("config")
      .then(setConfig)
      .catch((e) => setError(e.message));
    try {
      const d = JSON.parse(localStorage.getItem("phosor-draft-v1") || "null");
      if (d) {
        setMode(d.mode === "existing" ? "existing" : "auto");
        setTopic(d.topic || "");
        setText(d.text || "");
        setScriptReceipt(d.scriptReceipt || "");
        if (DURATIONS.includes(d.duration)) setDuration(d.duration);
        setKind(d.kind === "talking" ? "talking" : "motion");
        setSource(d.source === "audio" ? "audio" : "text");
        if (d.image) setImage(d.image);
        if (d.audio) setAudio(d.audio);
      }
    } catch {
      /* Ignore invalid local draft. */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated)
      localStorage.setItem(
        "phosor-draft-v1",
        JSON.stringify({
          mode,
          topic,
          text,
          duration,
          kind,
          source,
          image,
          audio,
          scriptReceipt,
        }),
      );
  }, [
    mode,
    topic,
    text,
    duration,
    kind,
    source,
    image,
    audio,
    scriptReceipt,
    hydrated,
  ]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    if (!config?.authenticated || !config.storage) return;
    const controller = new AbortController();
    fetch("/api/jobs", { signal: controller.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.jobs) {
          setJobs(d.jobs);
          setCurrent(
            d.jobs.find(
              (j: Job) => !["completed", "failed", "unknown"].includes(j.stage),
            ) ||
              d.jobs[0] ||
              null,
          );
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [config?.authenticated, config?.storage]);
  useEffect(() => {
    if (!current || ["completed", "failed", "unknown"].includes(current.stage))
      return;
    const id = setInterval(() => {
      api<Job>("jobs/" + current.id)
        .then((j) => {
          setCurrent(j);
          setJobs((old) => [j, ...old.filter((x) => x.id !== j.id)]);
        })
        .catch((e) => setError(e.message));
    }, 5000);
    return () => clearInterval(id);
  }, [current?.id, current?.stage]);
  async function act(name: string, fn: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác chưa hoàn tất.");
    } finally {
      actionInFlight.current = false;
      setBusy("");
    }
  }
  function invalidate() {
    setQuote(null);
    setConsent(false);
    idempotency.current = "";
    if (current?.stage === "completed") setCurrent(null);
  }
  function changeText(v: string) {
    setText(v);
    if (source === "text") setAudio(null);
    invalidate();
  }
  async function saveImage(file: File) {
    const latest = await api<Config>("config");
    setConfig(latest);
    if (!latest.authenticated) {
      setNotice(
        "Ảnh đã được chọn để xem trước. Đăng nhập để lưu ảnh và tạo video.",
      );
      return;
    }
    if (!latest.storage) {
      setNotice(
        "Ảnh đang xem trên thiết bị, chưa lưu. Hãy mở Thiết lập để hoàn tất kết nối lưu ảnh.",
      );
      return;
    }
    setImage(await uploadAsset(file, "image"));
    setNotice("Đã tải và kiểm tra ảnh thành công.");
  }
  async function selectImage(file?: File) {
    if (!file) return;
    await act("image", async () => {
      fileDetails(file, "image");
      setSelectedImage(file);
      setImage(null);
      setPreview(URL.createObjectURL(file));
      invalidate();
      await saveImage(file);
    });
  }
  async function selectAudio(file?: File) {
    if (!file) return;
    await act("audio", async () => {
      setAudio(await uploadAsset(file, "audio"));
      invalidate();
    });
  }
  async function login() {
    await act("login", async () => {
      await api("login", { password });
      setPassword("");
      setConfig(await api<Config>("config"));
      setNotice("Đã mở không gian cá nhân.");
    });
  }
  async function generateScript() {
    if (!config?.authenticated || !config.ready || !config.script) {
      setError("Để viết lời thoại, cần đăng nhập, hoàn tất kết nối và đặt hạn mức. Xem mục DeepSeek trong thiết lập bên dưới.");
      setTab("settings");
      return;
    }
    if (topic.trim().length < 5) {
      setError("Nhập chủ đề hoặc ý chính từ 5 ký tự để viết lời thoại.");
      setFocusTarget("topic");
      return;
    }
    await act("script", async () => {
      const r = await api<{ text: string; receiptId: string }>("script", {
        topic,
        duration,
        requestKey: crypto.randomUUID(),
      });
      changeText(r.text);
      setScriptReceipt(r.receiptId);
      setNotice("Lời thoại đã sẵn sàng. Hãy đọc và sửa trước khi tạo giọng.");
    });
  }
  async function generateVoice() {
    if (!config?.authenticated || !config.ready || !config.voice) {
      setError("Để tạo giọng, cần đăng nhập, kết nối Google TTS và đặt hạn mức. Bạn có thể dùng tệp giọng đọc có sẵn thay thế.");
      setTab("settings");
      return;
    }
    if (!text.trim()) {
      setError("Nhập hoặc viết lời thoại trước khi tạo giọng.");
      setFocusTarget("script");
      return;
    }
    await act("voice", async () => {
      setAudio(
        await api<Asset>("voice", {
          text,
          voice,
          requestKey: crypto.randomUUID(),
        }),
      );
      invalidate();
    });
  }
  async function reviewVideo() {
    setReviewOpen(true);
    setConsent(false);
    await act("quote", async () => {
      const latest = await api<Config>("config");
      setConfig(latest);
      if (creationIssues(latest, draft).length || activeJob) return;
      if (quote && quote.expiresAt > Date.now() && idempotency.current) return;
      const q = await api<Quote>("quote", {
        imageId: image?.id,
        audioId: audio?.id,
        duration,
        kind,
        script: text,
        scriptReceipt,
      });
      setQuote(q);
      setConsent(false);
      idempotency.current = crypto.randomUUID();
    });
  }
  async function render() {
    if (!quote || !consent || issues.length || activeJob) return;
    if (quote.expiresAt <= Date.now()) {
      await reviewVideo();
      return;
    }
    await act("render", async () => {
      const j = await api<Job>("jobs", {
        quoteId: quote.id,
        idempotencyKey: idempotency.current,
        consent,
      });
      setCurrent(j);
      setJobs((old) => [j, ...old.filter((x) => x.id !== j.id)]);
      setReviewOpen(false);
      setFocusTarget("job-progress");
      setNotice(
        "Đã lưu tác vụ. Bạn có thể tải lại trang và theo dõi trong lịch sử.",
      );
    });
  }
  function resolveIssue(action: CreateIssue["action"]) {
    if (action === "refresh") {
      void reviewVideo();
      return;
    }
    setReviewOpen(false);
    if (action === "settings") {
      setTab("settings");
      setFocusTarget("setup-title");
    } else {
      setTab("create");
      setFocusTarget({ login: "password", image: "image-picker", topic: "topic", script: "script", voice: "create-voice", audio: "audio-picker", duration: "duration-choice" }[action]);
    }
  }
  const draft = { image, audio, hasLocalImage: !!selectedImage, mode, source, text, duration };
  const issues = creationIssues(config, draft);
  const activeJob = jobs.find((job) => !["completed", "failed"].includes(job.stage));
  function openProgress() {
    if (activeJob) setCurrent(activeJob);
    setReviewOpen(false);
    setTab("create");
    setFocusTarget("job-progress");
  }
  const voiceTiming = audio?.duration
    ? timingError(audio.duration, duration)
    : null;
  const fx = config?.fx || 26000,
    videoEstimate = duration * 0.0045,
    voiceEstimate =
      mode === "existing" && source === "audio"
        ? 0
        : [...text].length * 0.000004,
    scriptEstimate = mode === "auto" ? 0.003 : 0;
  const totalEstimate =
    quote?.estimateUsd ??
    videoEstimate + (config?.infraUsd ?? 0.01) + voiceEstimate + scriptEstimate;
  const steps = [
    "Tải ảnh",
    "Lời thoại",
    "Thời lượng",
    "Xem trước",
    "Tạo video",
  ];
  const activeStep =
    current && !["failed", "unknown"].includes(current.stage)
      ? 4
      : quote
        ? 3
        : audio
          ? 2
          : image
            ? 1
            : 0;
  return (
    <div className="studio-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Phosor Studio">
          <span className="brand-mark">
            <Icon name="play" size={19} />
          </span>
          <span>
            phosor<span className="brand-light">studio</span>
          </span>
        </a>
        <div className="workspace-label">KHÔNG GIAN CÁ NHÂN</div>
        <nav aria-label="Điều hướng chính">
          {(
            [
              { id: "create", icon: "plus", label: "Tạo video" },
              { id: "history", icon: "history", label: "Lịch sử video" },
              { id: "settings", icon: "settings", label: "Thiết lập" },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "nav-item selected" : "nav-item"}
              onClick={() => setTab(n.id)}
            >
              <Icon name={n.icon} />
              {n.label}
              {n.id === "history" && jobs.length > 0 && (
                <span className="count">{jobs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="small-mark">
            <Icon name="spark" />
          </span>
          <strong>Từ ý tưởng đến chuyển động</strong>
          <p>Một nơi cho ảnh, lời thoại và những câu chuyện của bạn.</p>
          <span className="private-label">
            <Icon name="lock" size={13} /> Chỉ dành cho bạn
          </span>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">N</span>
          <div>
            <strong>Studio của Nhung</strong>
            <small>Không gian riêng tư</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            {tab === "create"
              ? "Studio / Tạo video"
              : tab === "history"
                ? "Studio / Lịch sử"
                : "Studio / Thiết lập"}
          </span>
          <div className="topbar-right">
            <span className={"status-dot " + (config?.ready ? "online" : "")} />
            {config?.ready ? "Sẵn sàng" : "Chưa mở tạo video"}
            <span className="top-avatar">N</span>
          </div>
        </header>
        <main className={tab === "create" ? "has-create-dock" : undefined}>
          {error && (
            <div className="feedback error" role="alert">
              {error}
              <button aria-label="Đóng thông báo" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="feedback success" role="status">
              {notice}
              <button aria-label="Đóng thông báo" onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}
          {config && !config.authenticated && (
            <div className="access-banner">
              <div>
                <Icon name="lock" />
                <span>
                  <strong>
                    {config.access
                      ? "Mở không gian cá nhân"
                        : "Chưa thể tạo video: cần hoàn tất kết nối"}
                  </strong>
                  <small>
                    {config.access
                      ? "Đăng nhập để tải tệp và tạo video."
                      : "Studio còn thiếu cấu hình. Mở Thiết lập để xem chính xác các mục cần thêm."}
                  </small>
                </span>
              </div>
              {config.access ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    login();
                  }}
                >
                  <label className="sr-only" htmlFor="password">
                    Mật khẩu cá nhân
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mật khẩu cá nhân"
                  />
                  <button className="dark-button" disabled={!!busy}>
                    Mở Studio
                  </button>
                </form>
              ) : (
                <button
                  className="text-button"
                  onClick={() => setTab("settings")}
                >
                  Xem thiết lập <Icon name="arrow" size={16} />
                </button>
              )}
            </div>
          )}
          {tab === "create" && (
            <>
              <div className="page-intro">
                <div>
                  <div className="eyebrow">
                    <span /> TẠO NÊN CÂU CHUYỆN CỦA BẠN
                  </div>
                  <h1>
                    Một tấm ảnh.
                    <br />
                    <span>Một video của riêng bạn.</span>
                  </h1>
                  <p>
                    Thêm ảnh, chọn lời thoại. Để ý tưởng bắt đầu chuyển động.
                  </p>
                </div>
                <div className="intro-pill">
                  <Icon name="spark" size={16} /> Phosor AI
                </div>
              </div>
              <ol className="stepper" aria-label="Các bước tạo video">
                {steps.map((s, i) => (
                  <li key={s} className={i <= activeStep ? "reached" : ""}>
                    <span>
                      {i < activeStep ? (
                        <Icon name="check" size={14} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
              <div className="editor-grid">
                <div className="editor-controls">
                  <section className="panel">
                    <div className="section-heading">
                      <span className="section-number">01</span>
                      <div>
                        <h2>Bắt đầu với một tấm ảnh</h2>
                        <p>
                          Nhân vật, sản phẩm hay một khoảnh khắc bạn muốn kể.
                        </p>
                      </div>
                    </div>
                    <input
                      ref={imageInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      aria-label="Chọn ảnh"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        void selectImage(file);
                      }}
                    />
                    <button
                      id="image-picker"
                      className={
                        "dropzone " + (image || preview ? "has-image" : "")
                      }
                      disabled={!!busy}
                      onClick={() => imageInput.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!busy) void selectImage(e.dataTransfer.files[0]);
                      }}
                    >
                      {image || preview ? (
                        <>
                          <img
                            src={preview || "/api/assets/" + image!.id}
                            alt="Ảnh nguồn đã chọn"
                          />
                          <div>
                            <strong>
                              {busy === "image"
                                ? "Đang lưu và kiểm tra ảnh…"
                                : image
                                  ? "Ảnh đã được lưu"
                                  : "Ảnh xem trước · chưa lưu"}
                            </strong>
                            <span>
                              {image
                                ? `${image.width} × ${image.height} px · ${(image.bytes / 1024 / 1024).toFixed(1)} MB`
                                : selectedImage?.name}
                            </span>
                            <small>Chạm để thay ảnh</small>
                          </div>
                          <Icon name={image ? "check" : "image"} />
                        </>
                      ) : (
                        <>
                          <span className="upload-icon">
                            <Icon name="upload" size={25} />
                          </span>
                          <strong>
                            {busy === "image"
                              ? "Đang tải và kiểm tra…"
                              : "Chạm để tải ảnh lên"}
                          </strong>
                          <span>hoặc kéo ảnh vào đây trên máy tính</span>
                          <small>
                            JPG, PNG, WebP · Tối đa 20 MB · Cạnh ngắn từ 320 px
                          </small>
                        </>
                      )}
                    </button>
                    {selectedImage && !image && (
                      <div className="pending-upload" role="status">
                        <p className="field-help">
                          Ảnh đang được xem trên thiết bị. Cần lưu thành công
                          trước khi tạo video.
                        </p>
                        {allow ? (
                          <button
                            className="secondary-button"
                            disabled={!!busy}
                            onClick={() =>
                              act("image", () => saveImage(selectedImage))
                            }
                          >
                            Lưu ảnh để tạo video
                          </button>
                        ) : (
                          <button
                            className="text-button"
                            onClick={() => setTab("settings")}
                          >
                            {config?.authenticated
                              ? "Hoàn tất kết nối lưu ảnh"
                              : "Xem thiết lập và đăng nhập"}{" "}
                            <Icon name="arrow" size={14} />
                          </button>
                        )}
                      </div>
                    )}
                    <label className="field-label" htmlFor="kind">
                      Bạn muốn tạo kiểu video nào?
                    </label>
                    <select
                      id="kind"
                      value={kind}
                      onChange={(e) => {
                        setKind(e.target.value as VideoKind);
                        invalidate();
                      }}
                      disabled={!!busy}
                    >
                      <option value="motion">
                        Ảnh chuyển động + giọng thuyết minh
                      </option>
                      <option value="talking">
                        Chân dung nói · có nhép miệng
                      </option>
                    </select>
                    <p className="field-help">
                      {kind === "motion"
                        ? "Phù hợp sản phẩm, phong cảnh và ảnh người. Giọng đọc nằm trên nền hình chuyển động."
                        : "Dùng ảnh một người trưởng thành chính diện. Âm thanh cần có khoảng nghỉ giữa các câu."}
                    </p>
                  </section>
                  <section className="panel">
                    <div className="section-heading">
                      <span className="section-number">02</span>
                      <div>
                        <h2>Video sẽ kể điều gì?</h2>
                        <p>
                          Tự viết ý tưởng hoặc dùng lời thoại bạn đã chuẩn bị.
                        </p>
                      </div>
                    </div>
                    <div
                      className="mode-choice"
                      role="group"
                      aria-label="Hai lựa chọn lời thoại"
                    >
                      <button
                        className={mode === "auto" ? "active" : ""}
                        onClick={() => {
                          setMode("auto");
                          setSource("text");
                          setAudio(null);
                          invalidate();
                        }}
                        disabled={!!busy}
                      >
                        <Icon name="spark" />
                        <span>
                          <strong>Hệ thống tự tạo</strong>
                          <small>Từ chủ đề hoặc ý chính</small>
                        </span>
                        <span className="radio-dot" />
                      </button>
                      <button
                        className={mode === "existing" ? "active" : ""}
                        onClick={() => {
                          setMode("existing");
                          setAudio(null);
                          invalidate();
                        }}
                        disabled={!!busy}
                      >
                        <Icon name="audio" />
                        <span>
                          <strong>Dùng lời thoại có sẵn</strong>
                          <small>Văn bản hoặc tệp giọng đọc</small>
                        </span>
                        <span className="radio-dot" />
                      </button>
                    </div>
                    {mode === "auto" ? (
                      <div className="topic-area">
                        <label className="field-label" htmlFor="topic">
                          Chủ đề hoặc ý chính
                        </label>
                        <textarea
                          id="topic"
                          rows={3}
                          maxLength={1500}
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                          placeholder="Ví dụ: Giới thiệu vườn cây giống của tôi, giọng gần gũi, mời khách nhắn tin để được tư vấn…"
                        />
                        <button
                          className="secondary-button"
                          onClick={generateScript}
                          disabled={!!busy}
                        >
                          <Icon name="spark" size={16} />
                          {busy === "script"
                            ? "Đang viết lời thoại…"
                            : "Viết lời thoại"}
                          <small>Ước tính tối đa {money(0.003, fx)}</small>
                        </button>
                      </div>
                    ) : (
                      <div
                        className="sub-tabs"
                        role="group"
                        aria-label="Nguồn lời thoại có sẵn"
                      >
                        <button
                          className={source === "text" ? "active" : ""}
                          onClick={() => {
                            setSource("text");
                            setAudio(null);
                            invalidate();
                          }}
                        >
                          Nhập văn bản
                        </button>
                        <button
                          className={source === "audio" ? "active" : ""}
                          onClick={() => {
                            setSource("audio");
                            setAudio(null);
                            invalidate();
                          }}
                        >
                          Tải giọng đọc
                        </button>
                      </div>
                    )}
                    {mode === "auto" || source === "text" ? (
                      <>
                        <label className="field-label" htmlFor="script">
                          Lời thoại <span>Bạn có thể chỉnh sửa</span>
                        </label>
                        <textarea
                          id="script"
                          className="script-input"
                          rows={5}
                          value={text}
                          maxLength={2500}
                          onChange={(e) => changeText(e.target.value)}
                          placeholder="Lời thoại của bạn xuất hiện ở đây. Đọc lại và chỉnh sửa trước khi tạo giọng…"
                        />
                        <div className="script-counter">
                          {[...text].length} ký tự · thời gian nói sẽ được đo
                          sau khi tạo giọng
                        </div>
                        <div className="voice-row">
                          <div>
                            <label className="field-label" htmlFor="voice">
                              Giọng tiếng Việt
                            </label>
                            <select
                              id="voice"
                              value={voice}
                              onChange={(e) => {
                                setVoice(e.target.value);
                                setAudio(null);
                                invalidate();
                              }}
                            >
                              <option value="vi-VN-Standard-A">
                                Nữ · Google Standard
                              </option>
                              <option value="vi-VN-Standard-B">
                                Nam · Google Standard
                              </option>
                            </select>
                          </div>
                          <button
                            id="create-voice"
                            className="secondary-button"
                            disabled={!!busy}
                            onClick={generateVoice}
                          >
                            <Icon name="audio" size={16} />
                            {busy === "voice"
                              ? "Đang tạo giọng…"
                              : "Tạo giọng & nghe thử"}
                          </button>
                        </div>
                        <p className="field-help">
                          Ước tính {money(voiceEstimate, fx)} / lần tạo giọng.
                          Sửa nội dung sẽ cần tạo lại giọng.
                        </p>
                      </>
                    ) : (
                      <>
                        <input
                          ref={audioInput}
                          type="file"
                          accept=".mp3,.wav,.m4a,.aac,.ogg,.flac"
                          className="sr-only"
                          aria-label="Chọn tệp giọng đọc"
                          onChange={(e) => {
                            const file = e.currentTarget.files?.[0];
                            e.currentTarget.value = "";
                            void selectAudio(file);
                          }}
                        />
                        <button
                          id="audio-picker"
                          className="audio-drop"
                          disabled={!!busy}
                          onClick={() => {
                            if (allow) audioInput.current?.click();
                            else {
                              setError("Cần đăng nhập và kết nối nơi lưu tệp trước khi tải giọng đọc.");
                              setTab("settings");
                            }
                          }}
                        >
                          <Icon name="upload" size={22} />
                          <strong>
                            {busy === "audio"
                              ? "Đang đo thời lượng…"
                              : audio
                                ? "Thay tệp giọng đọc"
                                : "Chọn tệp giọng đọc"}
                          </strong>
                          <small>
                            MP3, WAV, M4A, AAC, OGG, FLAC · Tối đa 20 MB
                          </small>
                        </button>
                        <p className="field-help">
                          Giữ giọng trong tệp của bạn, không chuyển sang giọng
                          tổng hợp.
                        </p>
                      </>
                    )}
                    {audio && (
                      <div className="audio-preview">
                        <div>
                          <Icon name="audio" size={17} />
                          <strong>Giọng đọc đã chuẩn bị</strong>
                          <span>{audio.duration?.toFixed(1)} giây</span>
                        </div>
                        <audio
                          controls
                          preload="metadata"
                          src={"/api/assets/" + audio.id}
                        />
                        {voiceTiming && (
                          <p className="timing-warning">{voiceTiming}</p>
                        )}
                      </div>
                    )}
                  </section>
                  <section className="panel">
                    <div className="section-heading">
                      <span className="section-number">03</span>
                      <div>
                        <h2>Chọn độ dài câu chuyện</h2>
                        <p>
                          Mặc định khung dọc 9:16, phù hợp xem trên điện thoại.
                        </p>
                      </div>
                    </div>
                    <div
                      id="duration-choice"
                      tabIndex={-1}
                      className="durations"
                      role="group"
                      aria-label="Thời lượng video"
                    >
                      {DURATIONS.map((d) => (
                        <button
                          key={d}
                          aria-pressed={duration === d}
                          className={duration === d ? "active" : ""}
                          onClick={() => {
                            setDuration(d);
                            invalidate();
                          }}
                        >
                          <strong>
                            {d}
                            <small>giây</small>
                          </strong>
                          <span>
                            {d === 30
                              ? "Gọn và tập trung"
                              : d === 40
                                ? "Thêm một chút chi tiết"
                                : "Kể trọn câu chuyện"}
                          </span>
                          {duration === d && (
                            <span className="duration-check">
                              <Icon name="check" size={12} />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
                <aside className="preview-column">
                  <div className="preview-panel">
                    <div className="preview-heading">
                      <strong>Xem trước</strong>
                      <span>9:16 · DỌC</span>
                    </div>
                    <div className="phone-preview">
                      {current?.stage === "completed" ? (
                        <video
                          key={current.id}
                          controls
                          playsInline
                          preload="metadata"
                          src={`/api/jobs/${current.id}/video`}
                        />
                      ) : image || preview ? (
                        <>
                          <img
                            src={preview || "/api/assets/" + image!.id}
                            alt="Bố cục ảnh tham chiếu cho video"
                          />
                          <div className="preview-shade" />
                          <span className="preview-duration">
                            {duration} GIÂY
                          </span>
                          <span className="preview-caption">
                            Ảnh tham chiếu
                            <br />
                            <small>Video xuất hiện sau khi tạo</small>
                          </span>
                        </>
                      ) : (
                        <div className="empty-preview">
                          <div className="frame-lines">
                            <Icon name="image" size={40} />
                          </div>
                          <strong>
                            Câu chuyện bắt đầu
                            <br />
                            từ ảnh của bạn
                          </strong>
                          <span>Tải lên một tấm ảnh để xem trước</span>
                        </div>
                      )}
                    </div>
                    <div className="preview-foot">
                      <Icon name="image" size={15} />
                      {kind === "talking"
                        ? "Chân dung nói · nhép miệng"
                        : "Ảnh chuyển động · có giọng đọc"}
                      <span>MP4</span>
                    </div>
                  </div>
                  <div className="cost-panel">
                    <div className="cost-title">
                      <h2>
                        {quote ? "Dự toán đã kiểm tra" : "Chi phí dự kiến"}
                      </h2>
                      <span className="cost-tag">
                        {quote ? "GIÁ API TRỰC TIẾP" : "THAM KHẢO"}
                      </span>
                    </div>
                    <div className="total-price">
                      {kind === "talking" && !quote ? (
                        <>
                          <span className="from-label">Từ </span>
                          {money(duration * 16 * 0.0009375 + 0.01, fx)}
                        </>
                      ) : (
                        money(totalEstimate, fx)
                      )}
                      <span>/ video</span>
                    </div>
                    <div className="cost-rows">
                      <div>
                        <span>
                          {kind === "motion"
                            ? "H3 · ảnh chuyển động 480p"
                            : "Wan 2.2 · nhép miệng 480p"}
                        </span>
                        <strong>
                          {quote
                            ? money(quote.videoUsd, fx)
                            : kind === "motion"
                              ? money(videoEstimate, fx)
                              : "Tùy chia đoạn"}
                        </strong>
                      </div>
                      <div>
                        <span>Ghép, lưu và điều phối</span>
                        <strong>~{money(config?.infraUsd ?? 0.01, fx)}</strong>
                      </div>
                      {
                        <div>
                          <span>Lời thoại & giọng đọc</span>
                          <strong>
                            ~
                            {money(
                              quote?.preparedCostsUsd ??
                                voiceEstimate + scriptEstimate,
                              fx,
                            )}
                          </strong>
                        </div>
                      }
                    </div>
                    <p className="cost-note">
                      {quote
                        ? "Tổng gồm dự toán lời thoại và giọng đã chuẩn bị. Số tiền còn giữ cho tạo video hiển thị bên dưới. Không tự tạo lại đoạn có phí."
                        : "Giá Phosor tham khảo ngày 15/10/2026. Chi phí hạ tầng và tỷ giá là giả định; chưa gồm phí nền, thuế và phí thẻ."}
                    </p>
                    <button
                      className="primary-button create-entry"
                      onClick={reviewVideo}
                      disabled={!!busy}
                    >
                      <Icon name="play" size={20} />
                      {busy === "quote"
                        ? "Đang kiểm tra…"
                        : "Tạo video"}
                    </button>
                    <p className="create-hint">
                      Bấm để kiểm tra nội dung và chi phí trước khi xác nhận.
                    </p>
                    {config && issues.length > 0 && (
                      <div className="create-blocker" role="status">
                        <strong>Chưa đủ điều kiện tạo video</strong>
                        <p>{issues[0].message}</p>
                        <button className="text-button" onClick={reviewVideo} disabled={!!busy}>
                          Xem {issues.length} mục cần hoàn tất <Icon name="arrow" size={15} />
                        </button>
                      </div>
                    )}
                    {quote && (
                      <div className="quote-details">
                        <p>
                          <strong>
                            {quote.segments.length} đoạn · {quote.duration} giây
                          </strong>
                          <br />
                          Nguồn 480p · MP4 576 × 1024 có điều chỉnh kích thước.
                          <br />
                          Dự toán có hiệu lực 10 phút.
                        </p>
                      </div>
                    )}
                  </div>
                  {current && (
                    <section id="job-progress" tabIndex={-1} className="job-panel" aria-live="polite">
                      <div className="cost-title">
                        <strong>Tiến trình video</strong>
                        <span>{current.progress}%</span>
                      </div>
                      <progress value={current.progress} max={100} />
                      <p>{current.message}</p>
                      {current.error && (
                        <p className="timing-warning">{current.error}</p>
                      )}
                      {current.stage === "completed" && (
                        <a
                          className="primary-button"
                          href={`/api/jobs/${current.id}/video?download=1`}
                        >
                          <Icon name="download" size={17} />
                          Tải MP4
                        </a>
                      )}
                      {current.stage === "failed" && (
                        <button
                          className="secondary-button"
                          disabled={!!busy}
                          onClick={() =>
                            act("resume", async () => {
                              setCurrent(
                                await api<Job>(`jobs/${current.id}/resume`, {}),
                              );
                            })
                          }
                        >
                          Tiếp tục từ đoạn đã lưu
                        </button>
                      )}
                      <button
                        className="text-button"
                        onClick={() => setTab("history")}
                      >
                        Mở lịch sử <Icon name="arrow" size={14} />
                      </button>
                    </section>
                  )}
                </aside>
              </div>
              <div className="page-foot">
                <span>
                  <Icon name="lock" size={14} /> Tệp và kết quả được bảo vệ bằng
                  phiên đăng nhập
                </span>
                <span>Được tạo với Phosor AI</span>
              </div>
              <div className="create-dock" aria-label="Thao tác tạo video">
                <div className="create-dock-content">
                  <div>
                    <strong>{activeJob ? "Video đang được xử lý" : `Video ${duration} giây · khung dọc`}</strong>
                    <span>{activeJob ? activeJob.message : issues.length ? "Bấm Tạo video để xem các bước còn thiếu" : "Kiểm tra chi phí rồi xác nhận tạo"}</span>
                  </div>
                  <button className="primary-button create-entry" disabled={!!busy} onClick={activeJob ? openProgress : reviewVideo}>
                    <Icon name="play" size={20} />
                    {busy ? "Đang xử lý…" : activeJob ? "Xem tiến trình" : "Tạo video"}
                  </button>
                </div>
              </div>
            </>
          )}
          {tab === "history" && (
            <>
              <div className="page-intro">
                <div>
                  <div className="eyebrow">KHÔNG GIAN SÁNG TẠO</div>
                  <h1>Lịch sử video</h1>
                  <p>Kết quả và tiến trình được lưu ở máy chủ để mở lại sau.</p>
                </div>
                <button
                  className="dark-button"
                  onClick={() => setTab("create")}
                >
                  <Icon name="plus" size={17} /> Tạo video mới
                </button>
              </div>
              {jobs.length === 0 ? (
                <div className="empty-history">
                  <Icon name="history" size={40} />
                  <h2>Những câu chuyện đang chờ bạn</h2>
                  <p>
                    {config?.authenticated
                      ? "Video đầu tiên sẽ xuất hiện ở đây sau khi gửi tạo."
                      : "Đăng nhập để xem lịch sử video cá nhân."}
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() => setTab("create")}
                  >
                    Bắt đầu từ một tấm ảnh
                  </button>
                </div>
              ) : (
                <div className="history-grid">
                  {jobs.map((j) => (
                    <article className="history-card" key={j.id}>
                      {j.stage === "completed" ? (
                        <video
                          controls
                          playsInline
                          preload="metadata"
                          src={`/api/jobs/${j.id}/video`}
                        />
                      ) : (
                        <div className="history-progress">
                          <Icon name="play" size={30} />
                          <strong>{j.progress}%</strong>
                          <p>{j.message}</p>
                        </div>
                      )}
                      <div className="history-info">
                        <span className="cost-tag">
                          {j.quote.duration} GIÂY ·{" "}
                          {j.quote.kind === "talking"
                            ? "NHÉP MIỆNG"
                            : "CHUYỂN ĐỘNG"}
                        </span>
                        <p>
                          {new Date(j.createdAt).toLocaleString("vi-VN", {
                            timeZone: "Asia/Ho_Chi_Minh",
                          })}
                        </p>
                        <small>
                          Dự toán {money(j.quote.estimateUsd, j.quote.fx)} ·{" "}
                          {j.actualUsd === null
                            ? "Chưa có phí thực tế"
                            : money(j.actualUsd, j.quote.fx)}
                        </small>
                        {j.error && <p className="timing-warning">{j.error}</p>}
                        {j.stage === "completed" ? (
                          <a
                            className="secondary-button"
                            href={`/api/jobs/${j.id}/video?download=1`}
                          >
                            <Icon name="download" size={16} />
                            Tải MP4
                          </a>
                        ) : (
                          <button
                            className="secondary-button"
                            onClick={() => {
                              setCurrent(j);
                              setTab("create");
                            }}
                          >
                            Xem tiến trình
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === "settings" && (
            <>
              <div className="page-intro">
                <div>
                  <div className="eyebrow">STUDIO CỦA BẠN</div>
                  <h1 id="setup-title" tabIndex={-1}>Thiết lập kết nối</h1>
                  <p>
                    Trạng thái thực tế của các thành phần để tạo và lưu video.
                  </p>
                </div>
                <button className="secondary-button" onClick={() => setTab("create")}>Quay lại tạo video</button>
              </div>
              <div className="settings-grid">
                <section className="panel">
                  <h2>Sẵn sàng để tạo video</h2>
                  <div className="connection-list">
                    {[
                      {
                        title: "Bảo vệ không gian cá nhân",
                        desc: "Mật khẩu và phiên đăng nhập an toàn",
                        ok: config?.access,
                      },
                      {
                        title: "Phosor AI",
                        desc: "Khóa máy chủ để tạo chuyển động và nhép miệng",
                        ok: config?.phosor,
                      },
                      {
                        title: "Lưu tệp và tiến trình",
                        desc: "Vercel Blob riêng tư + Upstash Redis",
                        ok: config?.storage,
                      },
                      {
                        title: "Viết lời thoại tiếng Việt",
                        desc: "DeepSeek Flash · cần cho chế độ tự tạo",
                        ok: config?.script,
                      },
                      {
                        title: "Giọng đọc tiếng Việt",
                        desc: "Google Standard · có thể dùng tệp âm thanh thay thế",
                        ok: config?.voice,
                      },
                      {
                        title: "Hạn mức chi phí",
                        desc: "Chỉ mở tạo sau khi chủ tài khoản cho phép ngân sách",
                        ok: config?.spend,
                      },
                    ].map((c) => (
                      <div className="connection" key={c.title}>
                        <span
                          className={
                            c.ok
                              ? "connection-icon connected"
                              : "connection-icon"
                          }
                        >
                          <Icon name={c.ok ? "check" : "lock"} size={18} />
                        </span>
                        <div>
                          <strong>{c.title}</strong>
                          <small>{c.desc}</small>
                        </div>
                        <span
                          className={
                            c.ok ? "connection-state ready" : "connection-state"
                          }
                        >
                          {c.ok ? "Đã cấu hình" : "Cần thiết lập"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="field-help">
                    “Đã cấu hình” nghĩa là biến môi trường đã có; chưa xác nhận
                    khóa hợp lệ hoặc đủ số dư cho đến khi gọi API.
                  </p>
                  {!!config?.storageMissing?.length && (
                    <p className="timing-warning">
                      Chưa lưu được ảnh vì thiếu:{" "}
                      {config.storageMissing.join(", ")}. Thêm các biến vào
                      Vercel rồi Redeploy.
                    </p>
                  )}
                </section>
                <section className="panel setup-guide">
                  <Icon name="settings" size={26} />
                  <h2>Hoàn tất ở Vercel</h2>
                  <p>
                    Thêm các mục còn thiếu ở Vercel → Settings → Environment Variables, chọn Production, lưu rồi Redeploy. Khóa đã có không cần nhập lại.
                  </p>
                  <ol className="setup-steps">
                    <li><strong>Bảo vệ Studio:</strong> <code>APP_PASSWORD</code> (mật khẩu của bạn) và <code>SESSION_SECRET</code> (chuỗi ngẫu nhiên ít nhất 32 ký tự).</li>
                    <li><strong>Lưu ảnh và kết quả:</strong> kết nối Blob ở chế độ Private để có <code>BLOB_READ_WRITE_TOKEN</code>.</li>
                    <li><strong>Lưu tiến trình:</strong> kết nối Upstash Redis, lấy cặp <code>UPSTASH_REDIS_REST_URL</code> và <code>UPSTASH_REDIS_REST_TOKEN</code>. Cặp <code>KV_REST_API_URL</code> và <code>KV_REST_API_TOKEN</code> cũng được hỗ trợ.</li>
                    <li><strong>Tạo video:</strong> <code>PHOSOR_API_KEY</code>{config?.phosor ? " đã có." : "."}</li>
                    <li><strong>Tự viết lời thoại:</strong> <code>DEEPSEEK_API_KEY</code>. <strong>Văn bản thành giọng đọc:</strong> <code>GOOGLE_TTS_API_KEY</code> có quyền Cloud Text-to-Speech. Tải giọng đọc có sẵn thì không cần hai khóa này.</li>
                    <li><strong>Cho phép chi phí:</strong> tự đặt trần USD cho <code>MAX_JOB_USD</code> (mỗi video) và <code>DAILY_BUDGET_USD</code> (mỗi ngày), rồi đặt <code>GENERATION_ENABLED</code> thành <code>true</code>. Chỉ nhập hạn mức bạn đồng ý chi.</li>
                  </ol>
                  <a className="secondary-button" href="https://vercel.com/dai-tai/phosor/settings/environment-variables" target="_blank" rel="noreferrer">
                    Mở cấu hình trên Vercel <Icon name="arrow" size={16} />
                  </a>
                  <a
                    className="text-button"
                    href="https://github.com/nhungtran68/Phosor#triển-khai"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Xem hướng dẫn cấu hình <Icon name="arrow" size={16} />
                  </a>
                  <button className="secondary-button" disabled={!!busy} onClick={() => act("config", async () => {
                    setConfig(await api<Config>("config"));
                    setNotice("Đã cập nhật trạng thái kết nối. Các mục còn thiếu được ghi ở bảng bên cạnh.");
                  })}>Kiểm tra lại kết nối</button>
                  <p>
                    Giới hạn hiện tại: {money(config?.maxJobUsd || 0, fx)}
                    /video, {money(config?.dailyBudgetUsd || 0, fx)}/ngày.
                  </p>
                  {config?.authenticated && (
                    <button
                      className="text-button"
                      onClick={() =>
                        act("logout", async () => {
                          await api("logout", {});
                          setConfig(await api<Config>("config"));
                          setJobs([]);
                          setCurrent(null);
                        })
                      }
                    >
                      Đăng xuất Studio
                    </button>
                  )}
                </section>
              </div>
            </>
          )}
          <CreateReview
            open={reviewOpen}
            busy={busy}
            issues={issues}
            quote={quote}
            duration={duration}
            consent={consent}
            error={error}
            hasActiveJob={!!activeJob}
            onClose={() => setReviewOpen(false)}
            onResolve={resolveIssue}
            onReview={reviewVideo}
            onConsent={setConsent}
            onCreate={render}
            onProgress={openProgress}
          />
        </main>
      </div>
    </div>
  );
}
