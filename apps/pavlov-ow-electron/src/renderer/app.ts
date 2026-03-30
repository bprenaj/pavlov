export {}

interface AlertMode {
  audio: boolean;
  visual: boolean;
}

interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AppSettings {
  timeoutSeconds: number;
  volume: number;
  gazeTolerance: number;
  alertMode: AlertMode;
  minimapRect: MinimapRect;
  regionName: string;
  customSoundPath: string;
  disableAnonymousAnalytics: boolean;
  firstRun: boolean;
}

interface SessionRecord {
  timestamp: number;
  duration_s: number;
  glance_count: number;
  glances_per_min: number;
  avg_glance_duration_ms: number;
  avg_gap_s: number;
  longest_gap_s: number;
  alerts_triggered: number;
  alert_free_streak_s: number;
  time_on_map_pct: number;
  mas_score: number;
  region_name: string;
  mode: "free" | "paid";
}

interface CoachingState {
  mode: "free" | "paid";
  entitlement: "free" | "trial" | "paid";
  beamStatus: string;
  isTraining: boolean;
  alertActive: boolean;
  statusLine: string;
  remainingToAlertMs: number;
}

interface PavlovApi {
  getBootstrap: () => Promise<{
    settings: AppSettings;
    sessions: SessionRecord[];
    entitlement: "free" | "trial" | "paid";
    isOverwolfRuntime: boolean;
    overwolfInfo: { appId: string } | null;
    cmpRequired: boolean;
  }>;
  patchSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  startTraining: (
    mode: "free" | "paid"
  ) => Promise<{ ok: boolean; reason?: string }>;
  stopTraining: () => Promise<SessionRecord | null>;
  manualGlance: () => Promise<void>;
  setEntitlement: (tier: "free" | "trial" | "paid") => Promise<string>;
  pickCustomSound: () => Promise<string>;
  checkCmpRequired: () => Promise<boolean>;
  openCmpWindow: () => Promise<boolean>;
  onState: (callback: (state: CoachingState) => void) => () => void;
  onBeamStatus: (callback: (status: string) => void) => () => void;
  onSessionComplete: (callback: (record: SessionRecord) => void) => () => void;
}

declare const Chart: any;

const elements = {
  beamStatusBadge: byId("beamStatusBadge"),
  modeStatusBadge: byId("modeStatusBadge"),
  entitlementBadge: byId("entitlementBadge"),
  timeoutInput: byId("timeoutInput") as HTMLInputElement,
  volumeInput: byId("volumeInput") as HTMLInputElement,
  toleranceInput: byId("toleranceInput") as HTMLInputElement,
  regionNameInput: byId("regionNameInput") as HTMLInputElement,
  regionX: byId("regionX") as HTMLInputElement,
  regionY: byId("regionY") as HTMLInputElement,
  regionW: byId("regionW") as HTMLInputElement,
  regionH: byId("regionH") as HTMLInputElement,
  audioToggle: byId("audioToggle") as HTMLInputElement,
  visualToggle: byId("visualToggle") as HTMLInputElement,
  freeModeBtn: byId("freeModeBtn"),
  paidModeBtn: byId("paidModeBtn"),
  startBtn: byId("startBtn"),
  stopBtn: byId("stopBtn"),
  manualGlanceBtn: byId("manualGlanceBtn"),
  customSoundBtn: byId("customSoundBtn"),
  cmpBtn: byId("cmpBtn"),
  entitlementSelect: byId("entitlementSelect") as HTMLSelectElement,
  statusLine: byId("statusLine"),
  countdown: byId("countdown"),
  freeAdPanel: byId("freeAdPanel"),
  alarmAudio: byId("alarmAudio") as HTMLAudioElement,
  masScore: byId("masScore"),
  rateScore: byId("rateScore"),
  gapScore: byId("gapScore"),
  alertScore: byId("alertScore"),
  historyChart: byId("historyChart") as HTMLCanvasElement
};

let selectedMode: "free" | "paid" = "free";
let entitlement: "free" | "trial" | "paid" = "free";
let chart: any;
let sessions: SessionRecord[] = [];
const pavlovApi: PavlovApi = (window as unknown as { pavlovApi: PavlovApi })
  .pavlovApi;

void initialize();

async function initialize() {
  const bootstrap = await pavlovApi.getBootstrap();
  sessions = bootstrap.sessions;
  entitlement = bootstrap.entitlement;

  hydrateInputs(bootstrap.settings);
  elements.entitlementSelect.value = entitlement;
  updateEntitlementBadge();
  updateModeButtons();
  updateAdVisibility();
  renderChart();
  updateSummaryCard();

  if (bootstrap.settings.customSoundPath) {
    setAudioSource(bootstrap.settings.customSoundPath);
  }

  if (bootstrap.cmpRequired) {
    elements.statusLine.textContent =
      "CMP consent is required in your region. Open CMP settings before monetized usage.";
  }

  pavlovApi.onState((state: CoachingState) => {
    elements.modeStatusBadge.textContent = `Mode: ${state.mode}`;
    elements.statusLine.textContent = state.statusLine;
    elements.countdown.textContent = formatMs(state.remainingToAlertMs);
    if (state.alertActive) {
      if (elements.visualToggle.checked) {
        document.body.classList.add("alert-active");
      }
      if (elements.audioToggle.checked) {
        playAlarm();
      }
    } else {
      document.body.classList.remove("alert-active");
    }
  });

  pavlovApi.onBeamStatus((status: string) => {
    elements.beamStatusBadge.textContent = `Beam: ${status}`;
    elements.beamStatusBadge.classList.toggle("online", status === "tracking");
  });

  pavlovApi.onSessionComplete((record: SessionRecord) => {
    sessions.push(record);
    renderChart();
    updateSummaryCard();
  });

  bindEvents();
}

function bindEvents() {
  elements.freeModeBtn.addEventListener("click", () => {
    selectedMode = "free";
    updateModeButtons();
    updateAdVisibility();
  });

  elements.paidModeBtn.addEventListener("click", () => {
    selectedMode = "paid";
    updateModeButtons();
    updateAdVisibility();
  });

  elements.startBtn.addEventListener("click", async () => {
    await persistFormSettings();
    const result = await pavlovApi.startTraining(selectedMode);
    if (!result.ok && result.reason === "paid_locked") {
      elements.statusLine.textContent =
        "Beam Pro coaching is locked. Switch entitlement to trial/paid.";
      return;
    }
    elements.statusLine.textContent = "Session started.";
  });

  elements.stopBtn.addEventListener("click", async () => {
    const record = await pavlovApi.stopTraining();
    if (record) {
      sessions.push(record);
      renderChart();
      updateSummaryCard();
    }
  });

  elements.manualGlanceBtn.addEventListener("click", async () => {
    await pavlovApi.manualGlance();
  });

  elements.customSoundBtn.addEventListener("click", async () => {
    const selected = await pavlovApi.pickCustomSound();
    if (selected) {
      setAudioSource(selected);
      elements.statusLine.textContent = "Custom sound selected.";
    }
  });

  elements.cmpBtn.addEventListener("click", async () => {
    const isRequired = await pavlovApi.checkCmpRequired();
    if (!isRequired) {
      elements.statusLine.textContent =
        "CMP is not required in your current runtime/region.";
      return;
    }
    await pavlovApi.openCmpWindow();
    elements.statusLine.textContent = "CMP window opened.";
  });

  elements.entitlementSelect.addEventListener("change", async () => {
    entitlement = elements.entitlementSelect.value as "free" | "trial" | "paid";
    await pavlovApi.setEntitlement(entitlement);
    updateEntitlementBadge();
    updateAdVisibility();
  });

  const changeTargets: HTMLInputElement[] = [
    elements.timeoutInput,
    elements.volumeInput,
    elements.toleranceInput,
    elements.regionNameInput,
    elements.regionX,
    elements.regionY,
    elements.regionW,
    elements.regionH,
    elements.audioToggle,
    elements.visualToggle
  ];
  for (const target of changeTargets) {
    target.addEventListener("change", () => {
      void persistFormSettings();
    });
  }
}

async function persistFormSettings() {
  const patch: Partial<AppSettings> = {
    timeoutSeconds: Number(elements.timeoutInput.value),
    volume: Number(elements.volumeInput.value),
    gazeTolerance: Number(elements.toleranceInput.value),
    regionName: elements.regionNameInput.value.trim(),
    alertMode: {
      audio: elements.audioToggle.checked,
      visual: elements.visualToggle.checked
    },
    minimapRect: {
      x: Number(elements.regionX.value),
      y: Number(elements.regionY.value),
      width: Number(elements.regionW.value),
      height: Number(elements.regionH.value)
    }
  };
  await pavlovApi.patchSettings(patch);
  elements.alarmAudio.volume = Number(elements.volumeInput.value) / 100;
}

function hydrateInputs(settings: AppSettings) {
  elements.timeoutInput.value = String(settings.timeoutSeconds);
  elements.volumeInput.value = String(settings.volume);
  elements.toleranceInput.value = String(settings.gazeTolerance);
  elements.regionNameInput.value = settings.regionName;
  elements.regionX.value = String(settings.minimapRect.x);
  elements.regionY.value = String(settings.minimapRect.y);
  elements.regionW.value = String(settings.minimapRect.width);
  elements.regionH.value = String(settings.minimapRect.height);
  elements.audioToggle.checked = settings.alertMode.audio;
  elements.visualToggle.checked = settings.alertMode.visual;
  elements.alarmAudio.volume = settings.volume / 100;
}

function updateModeButtons() {
  elements.freeModeBtn.classList.toggle("mode-btn-active", selectedMode === "free");
  elements.paidModeBtn.classList.toggle("mode-btn-active", selectedMode === "paid");
}

function updateEntitlementBadge() {
  elements.entitlementBadge.textContent = `Tier: ${entitlement}`;
}

function updateAdVisibility() {
  const shouldShow = selectedMode === "free" || entitlement === "free";
  elements.freeAdPanel.style.display = shouldShow ? "block" : "none";
}

function setAudioSource(filePath: string) {
  elements.alarmAudio.src = `file:///${filePath.replaceAll("\\", "/")}`;
}

function playAlarm() {
  elements.alarmAudio.currentTime = 0;
  void elements.alarmAudio.play().catch(() => {
    // Browsers may prevent autoplay before user interaction.
  });
}

function renderChart() {
  const labels = sessions.map((session) =>
    new Date(session.timestamp * 1000).toLocaleDateString()
  );
  const mas = sessions.map((session) => session.mas_score);
  const rate = sessions.map((session) => session.glances_per_min);
  const alerts = sessions.map((session) => session.alerts_triggered);

  const context = elements.historyChart.getContext("2d");
  if (!context) {
    return;
  }

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(context, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "MAS",
          data: mas,
          borderColor: "#67d4ff",
          tension: 0.22
        },
        {
          label: "Glances/min",
          data: rate,
          borderColor: "#60d394",
          tension: 0.22
        },
        {
          label: "Alerts",
          data: alerts,
          borderColor: "#ff6f91",
          tension: 0.22
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#c8def7"
          }
        }
      },
      scales: {
        y: {
          ticks: {
            color: "#9bb5d3"
          },
          grid: {
            color: "rgba(80, 125, 170, 0.25)"
          }
        },
        x: {
          ticks: {
            color: "#9bb5d3"
          },
          grid: {
            color: "rgba(80, 125, 170, 0.1)"
          }
        }
      }
    }
  });
}

function updateSummaryCard() {
  const last = sessions.at(-1);
  if (!last) {
    elements.masScore.textContent = "MAS 0.0";
    elements.rateScore.textContent = "0.0 / min";
    elements.gapScore.textContent = "0.0 s";
    elements.alertScore.textContent = "0";
    return;
  }
  elements.masScore.textContent = `MAS ${last.mas_score.toFixed(1)}`;
  elements.rateScore.textContent = `${last.glances_per_min.toFixed(1)} / min`;
  elements.gapScore.textContent = `${last.avg_gap_s.toFixed(1)} s`;
  elements.alertScore.textContent = `${last.alerts_triggered}`;
}

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element;
}

function formatMs(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
