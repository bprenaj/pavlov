/* Renderer script - NOT a module (no import/export, loaded via <script> tag) */

interface MinimapRect { x: number; y: number; width: number; height: number; }
interface SavedRegion { name: string; rect: MinimapRect; }
interface SessionMetrics {
  glanceCount: number; glancesPerMin: number; avgGlanceDurationMs: number;
  avgGapS: number; longestGapS: number; alertsTriggered: number;
  alertFreeStreakS: number; timeOnMapPct: number; durationS: number;
}
interface SessionRecord {
  timestamp: number; durationS: number; glanceCount: number; glancesPerMin: number;
  avgGlanceDurationMs: number; avgGapS: number; longestGapS: number;
  alertsTriggered: number; alertFreeStreakS: number; timeOnMapPct: number;
  masScore: number; regionName: string;
}
interface TrainingState {
  running: boolean; mode: string; elapsedS: number; timeSinceLastGlanceS: number;
  alertActive: boolean; metrics: SessionMetrics; masScore: number;
}
interface PavlovSettings {
  timeoutSeconds: number; volume: number; tolerancePx: number;
  alertModes: string[]; customSoundPath: string; minimapRect: MinimapRect | null;
  regionName: string; savedRegions: SavedRegion[]; hotkey: string;
  irlEnabled: boolean; irlPort: number; irlWebhookUrl: string;
  firstRun: boolean; trainingMode: string;
}
interface BootstrapPayload {
  settings: PavlovSettings; entitlement: string; beamStatus: string; history: SessionRecord[];
}
interface PavlovApi {
  getBootstrap(): Promise<BootstrapPayload>;
  patchSettings(patch: Partial<PavlovSettings>): Promise<PavlovSettings>;
  startTraining(): Promise<void>;
  stopTraining(): Promise<void>;
  markManualGlance(): Promise<void>;
  setEntitlement(tier: string): Promise<string>;
  pickCustomSound(): Promise<string>;
  openRegionOverlay(): Promise<MinimapRect | null>;
  clearHistory(): Promise<void>;
  minimizeWindow(): void;
  closeWindow(): void;
  checkCmpRequired(): Promise<boolean>;
  openCmpWindow(): Promise<void>;
  onState(cb: (state: TrainingState) => void): void;
  onBeamStatus(cb: (status: string) => void): void;
  onSessionComplete(cb: (record: SessionRecord) => void): void;
}

const api = (window as any).pavlovApi as PavlovApi;

let currentSettings: PavlovSettings;
let currentEntitlement = 'free';
let historyRecords: SessionRecord[] = [];
let chartInstance: { destroy: () => void } | null = null;

const DISCORD_URL = 'https://discord.gg/khk2dq8Bj3';
const REDDIT_SHARE_BASE = 'https://www.reddit.com/r/leagueoflegends/submit';
const IRL_AI_PROMPT = `I am using Pavlov (https://beameyetracker.com), a desktop app that trains minimap awareness for gamers using the Beam Eye Tracker. When I forget to check my minimap, Pavlov sends HTTP POST webhooks from localhost:9876 with JSON body {"event": "alert_start"} or {"event": "alert_stop"}. It also exposes GET http://localhost:9876/status for polling.

I want to build a creative, safe, desk-friendly physical alert gadget that lights up or makes noise when I get a webhook. Give me concise, exact, copy-paste-ready instructions for:
1. Hardware shopping list (Raspberry Pi, Arduino, or ESP32 based)
2. Wiring diagram for an LED strip, desk light, small buzzer, or mini flag
3. Complete Python or Arduino code that listens for the Pavlov webhooks and activates the hardware
4. How to connect the device to Pavlov on my local network

Keep it practical, safe, and implementable in one sitting. No theory, just step-by-step build instructions.`;

const METRIC_RANGES: Record<string, { goodLo: number; goodHi: number; warnLo: number; warnHi: number; higherIsBetter: boolean | null }> = {
  rate:       { goodLo: 6.0, goodHi: 999, warnLo: 3.0, warnHi: 6.0, higherIsBetter: true },
  avgGap:     { goodLo: 0, goodHi: 8.0, warnLo: 8.0, warnHi: 15.0, higherIsBetter: false },
  mapTime:    { goodLo: 8.0, goodHi: 15.0, warnLo: 4.0, warnHi: 20.0, higherIsBetter: null },
  procSpeed:  { goodLo: 0, goodHi: 500, warnLo: 500, warnHi: 1000, higherIsBetter: false },
  longestGap: { goodLo: 0, goodHi: 10.0, warnLo: 10.0, warnHi: 20.0, higherIsBetter: false },
  alerts:     { goodLo: 0, goodHi: 3, warnLo: 3, warnHi: 8, higherIsBetter: false },
  alertFree:  { goodLo: 30, goodHi: 999, warnLo: 15, warnHi: 30, higherIsBetter: true },
};

const CHART_METRICS = [
  { key: 'masScore', label: 'MAS Score', color: '#7B61FF', width: 2.5, visible: true },
  { key: 'glancesPerMin', label: 'Check rate', color: '#FF617C', width: 1.2, visible: false },
  { key: 'avgGapS', label: 'Response time', color: '#FF61BD', width: 1.2, visible: false },
  { key: 'timeOnMapPct', label: 'Map attention', color: '#61CBFF', width: 1.2, visible: false },
  { key: 'avgGlanceDurationMs', label: 'Glance speed', color: '#BD61FF', width: 1.2, visible: false },
  { key: 'durationS', label: 'Session duration', color: '#6189FF', width: 1.0, visible: false },
  { key: 'glanceCount', label: 'Map glances', color: '#61FFF1', width: 1.0, visible: false },
  { key: 'longestGapS', label: 'Longest blind', color: '#FF61FF', width: 1.0, visible: false },
  { key: 'alertsTriggered', label: 'Tunnel alerts', color: '#61FFB0', width: 1.0, visible: false },
  { key: 'alertFreeStreakS', label: 'Best streak', color: '#E5FF61', width: 1.0, visible: false },
];

function $(id: string) { return document.getElementById(id)!; }

function navigateTo(page: string): void {
  document.querySelectorAll('.page').forEach((el) => el.classList.remove('page--active'));
  document.querySelectorAll('.nav-item[data-page]').forEach((el) => el.classList.remove('nav-active'));
  $(`page${page.charAt(0).toUpperCase() + page.slice(1)}`).classList.add('page--active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('nav-active');
}

function updateBeamStatus(status: string): void {
  const dot = $('beamStatusDot');
  const label = $('beamStatusLabel');
  dot.className = 'beam-dot';
  switch (status) {
    case 'tracking':
      dot.classList.add('beam-dot--tracking'); label.textContent = 'Tracking'; break;
    case 'connecting':
      dot.classList.add('beam-dot--connecting'); label.textContent = 'Connecting...'; break;
    case 'not_running':
      dot.classList.add('beam-dot--off'); label.textContent = 'Not Running'; break;
    default:
      dot.classList.add('beam-dot--off'); label.textContent = 'Not Installed';
  }
}

function syncSettingsToUI(s: PavlovSettings): void {
  ($('settingMode') as HTMLSelectElement).value = s.trainingMode;
  ($('settingTimeout') as HTMLInputElement).value = String(s.timeoutSeconds);
  $('settingTimeoutValue').textContent = `${s.timeoutSeconds}s`;
  ($('settingTolerance') as HTMLInputElement).value = String(s.tolerancePx);
  $('settingToleranceValue').textContent = `${s.tolerancePx}px`;
  ($('settingVolume') as HTMLInputElement).value = String(s.volume);
  $('settingVolumeValue').textContent = `${s.volume}%`;
  syncTogglePills(s.alertModes);
  $('customSoundLabel').textContent = s.customSoundPath ? s.customSoundPath.split(/[\\/]/).pop()! : 'Default';
  ($('settingIrlEnabled') as HTMLInputElement).checked = s.irlEnabled;
  ($('settingIrlPort') as HTMLInputElement).value = String(s.irlPort);
  ($('settingIrlUrl') as HTMLInputElement).value = s.irlWebhookUrl;
  updateRegionUI(s);
  $('modeLabel').textContent = s.trainingMode === 'paid' ? 'Pro Mode' : 'Free Mode';
  $('trackingHint').textContent = s.trainingMode === 'free' ? 'Timer mode — Beam not used' : '';
}

function syncTogglePills(modes: string[]): void {
  document.querySelectorAll('.toggle-pill').forEach((btn) => {
    const mode = (btn as HTMLElement).dataset.mode!;
    btn.classList.toggle('active', modes.includes(mode));
  });
}

function updateRegionUI(s: PavlovSettings): void {
  const hasRegion = !!s.minimapRect;
  $('regionGate').style.display = hasRegion ? 'none' : 'flex';
  $('coachContent').style.display = hasRegion ? 'block' : 'none';
  $('regionLabel').textContent = s.regionName || (hasRegion ? 'Custom Region' : 'No region');
  if (s.savedRegions.length > 0) {
    $('savedRegionsSection').style.display = 'block';
    const sel = $('settingSavedRegion') as HTMLSelectElement;
    sel.innerHTML = s.savedRegions.map((r) => `<option value="${r.name}">${r.name}</option>`).join('');
    sel.value = s.regionName;
  }
}

function updateAdBanner(): void {
  $('adBanner').style.display = currentEntitlement === 'paid' ? 'none' : '';
}

function collectAlertModes(): string[] {
  const modes: string[] = [];
  document.querySelectorAll('.toggle-pill.active').forEach((btn) => {
    modes.push((btn as HTMLElement).dataset.mode!);
  });
  if (modes.length === 0 || (modes.length === 1 && modes[0] === 'silent')) return ['silent'];
  return modes.filter((m) => m !== 'silent');
}

function handleTogglePill(clicked: HTMLElement): void {
  const mode = clicked.dataset.mode!;
  if (mode === 'silent') {
    document.querySelectorAll('.toggle-pill').forEach((b) => b.classList.remove('active'));
    clicked.classList.add('active');
  } else {
    document.querySelector('.toggle-pill[data-mode="silent"]')?.classList.remove('active');
    clicked.classList.toggle('active');
    const anyActive = document.querySelectorAll('.toggle-pill.active').length > 0;
    if (!anyActive) document.querySelector('.toggle-pill[data-mode="silent"]')?.classList.add('active');
  }
  patchSetting({ alertModes: collectAlertModes() });
}

async function patchSetting(patch: Partial<PavlovSettings>): Promise<void> {
  currentSettings = await api.patchSettings(patch);
  syncSettingsToUI(currentSettings);
}

function updateTrainingState(state: TrainingState): void {
  const isRunning = state.running;
  $('btnStartTraining').style.display = isRunning ? 'none' : '';
  $('btnStopTraining').style.display = isRunning ? '' : 'none';
  $('timerDisplay').style.display = isRunning ? '' : 'none';
  $('btnManualGlance').style.display = isRunning && currentSettings.trainingMode === 'free' ? '' : 'none';

  if (isRunning) {
    $('timerValue').textContent = state.timeSinceLastGlanceS.toFixed(1);
    $('timerDisplay').classList.toggle('alert-active', state.alertActive);
    $('masValue').textContent = String(state.masScore);
    $('masBarFill').style.width = `${state.masScore}%`;

    const m = state.metrics;
    setMetric('metricRate', m.glancesPerMin, 'rate');
    setMetric('metricAvgGap', m.avgGapS, 'avgGap');
    setMetric('metricMapTime', m.timeOnMapPct, 'mapTime');
    setMetric('metricProcSpeed', m.avgGlanceDurationMs, 'procSpeed');
    $('metricDuration').textContent = String(m.durationS);
    $('metricGlances').textContent = String(m.glanceCount);
    setMetric('metricLongestGap', m.longestGapS, 'longestGap');
    setMetric('metricAlerts', m.alertsTriggered, 'alerts');
    setMetric('metricAlertFree', m.alertFreeStreakS, 'alertFree');
  }
}

function setMetric(elementId: string, value: number, metricKey: string): void {
  const el = $(elementId);
  el.textContent = String(value);
  const range = METRIC_RANGES[metricKey];
  if (!range) return;
  el.className = 'metric-value';
  if (range.higherIsBetter === true) {
    if (value >= range.goodLo) el.classList.add('metric-value--good');
    else if (value >= range.warnLo) el.classList.add('metric-value--warn');
    else el.classList.add('metric-value--bad');
  } else if (range.higherIsBetter === false) {
    if (value <= range.goodHi) el.classList.add('metric-value--good');
    else if (value <= range.warnHi) el.classList.add('metric-value--warn');
    else el.classList.add('metric-value--bad');
  } else {
    if (value >= range.goodLo && value <= range.goodHi) el.classList.add('metric-value--good');
    else if (value >= range.warnLo && value <= range.warnHi) el.classList.add('metric-value--warn');
    else el.classList.add('metric-value--bad');
  }
}

function masColor(score: number): string {
  if (score >= 70) return 'history-item__mas--good';
  if (score >= 40) return 'history-item__mas--warn';
  return 'history-item__mas--bad';
}

function renderHistory(): void {
  $('historyEmpty').style.display = historyRecords.length === 0 ? '' : 'none';
  $('chartWrap').style.display = historyRecords.length > 1 ? '' : 'none';
  const listEl = $('historyList');
  listEl.innerHTML = historyRecords.slice().reverse().slice(0, 50).map((r) => {
    const date = new Date(r.timestamp).toLocaleString();
    const dur = `${Math.round(r.durationS / 60)}m`;
    return `<div class="history-item">
      <span class="history-item__mas ${masColor(r.masScore)}">${r.masScore}</span>
      <div class="history-item__body">
        <span class="history-item__date">${date}</span>
        <span class="history-item__stats">${dur} &middot; ${r.glanceCount} glances &middot; ${r.glancesPerMin}/min &middot; ${r.avgGapS}s avg gap</span>
        <span class="history-item__region">${r.regionName || 'Custom'}</span>
      </div>
    </div>`;
  }).join('');
  if (historyRecords.length > 1) renderChart();
}

function renderChart(): void {
  const canvas = $('historyChart') as HTMLCanvasElement;
  if (chartInstance) chartInstance.destroy();
  const sorted = [...historyRecords].sort((a, b) => a.timestamp - b.timestamp);
  const labels = sorted.map((r) => new Date(r.timestamp).toLocaleDateString());
  const useMarkers = sorted.length < 30;

  const datasets = CHART_METRICS.map((m) => ({
    label: m.label,
    data: sorted.map((r) => (r as any)[m.key]),
    borderColor: m.color,
    backgroundColor: m.color + '18',
    borderWidth: m.width,
    tension: 0.3,
    hidden: !m.visible,
    pointRadius: useMarkers ? 4 : 0,
    pointBackgroundColor: m.color,
  }));

  // @ts-expect-error Chart loaded via CDN
  chartInstance = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#8899AA', usePointStyle: true, pointStyle: 'circle', boxWidth: 8 },
        },
      },
      scales: {
        x: { ticks: { color: '#5C6B7A', maxTicksLimit: 12 }, grid: { color: '#1A2332' } },
        y: { ticks: { color: '#5C6B7A' }, grid: { color: '#1A2332' } },
      },
    },
  });
}

function showOnboarding(): void { $('onboardingModal').style.display = 'flex'; }
function hideOnboarding(): void { $('onboardingModal').style.display = 'none'; patchSetting({ firstRun: false }); }

function bindEvents(): void {
  document.querySelectorAll('.nav-item[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo((btn as HTMLElement).dataset.page!));
  });
  $('btnMinimize').addEventListener('click', () => api.minimizeWindow());
  $('btnClose').addEventListener('click', () => api.closeWindow());
  $('discordLink').addEventListener('click', (e) => { e.preventDefault(); window.open(DISCORD_URL, '_blank'); });
  $('btnSelectRegionGate').addEventListener('click', selectRegion);
  $('btnChangeRegion').addEventListener('click', selectRegion);
  $('btnStartTraining').addEventListener('click', () => api.startTraining());
  $('btnStopTraining').addEventListener('click', () => api.stopTraining());
  $('btnManualGlance').addEventListener('click', () => api.markManualGlance());
  $('btnClearHistory').addEventListener('click', async () => { await api.clearHistory(); historyRecords = []; renderHistory(); });
  $('btnShareReddit').addEventListener('click', shareReddit);

  $('settingTimeout').addEventListener('input', (e) => { $('settingTimeoutValue').textContent = `${(e.target as HTMLInputElement).value}s`; });
  $('settingTimeout').addEventListener('change', (e) => patchSetting({ timeoutSeconds: Number((e.target as HTMLInputElement).value) }));
  $('settingTolerance').addEventListener('input', (e) => { $('settingToleranceValue').textContent = `${(e.target as HTMLInputElement).value}px`; });
  $('settingTolerance').addEventListener('change', (e) => patchSetting({ tolerancePx: Number((e.target as HTMLInputElement).value) }));
  $('settingVolume').addEventListener('input', (e) => { $('settingVolumeValue').textContent = `${(e.target as HTMLInputElement).value}%`; });
  $('settingVolume').addEventListener('change', (e) => patchSetting({ volume: Number((e.target as HTMLInputElement).value) }));
  $('settingMode').addEventListener('change', (e) => patchSetting({ trainingMode: (e.target as HTMLSelectElement).value }));

  document.querySelectorAll('.toggle-pill').forEach((btn) => {
    btn.addEventListener('click', () => handleTogglePill(btn as HTMLElement));
  });

  $('btnPickSound').addEventListener('click', async () => { const p = await api.pickCustomSound(); if (p) patchSetting({ customSoundPath: p }); });
  $('settingPreset').addEventListener('change', () => selectRegion());
  $('btnSelectRegion').addEventListener('click', selectRegion);
  $('btnDeleteRegion').addEventListener('click', () => {
    const name = ($('settingSavedRegion') as HTMLSelectElement).value;
    if (name) patchSetting({ savedRegions: currentSettings.savedRegions.filter((r) => r.name !== name) });
  });
  $('settingIrlEnabled').addEventListener('change', (e) => patchSetting({ irlEnabled: (e.target as HTMLInputElement).checked }));
  $('settingIrlPort').addEventListener('change', (e) => patchSetting({ irlPort: Number((e.target as HTMLInputElement).value) }));
  $('settingIrlUrl').addEventListener('change', (e) => patchSetting({ irlWebhookUrl: (e.target as HTMLInputElement).value }));
  $('settingHotkey').addEventListener('keydown', (e: Event) => {
    const ke = e as KeyboardEvent; ke.preventDefault();
    const parts: string[] = [];
    if (ke.ctrlKey) parts.push('Ctrl');
    if (ke.shiftKey) parts.push('Shift');
    if (ke.altKey) parts.push('Alt');
    if (ke.key && !['Control', 'Shift', 'Alt', 'Meta'].includes(ke.key)) parts.push(ke.key.length === 1 ? ke.key.toUpperCase() : ke.key);
    if (parts.length > 0) { ($('settingHotkey') as HTMLInputElement).value = parts.join('+'); patchSetting({ hotkey: parts.join('+') }); }
  });
  $('btnCmpSettings').addEventListener('click', () => api.openCmpWindow());
  $('btnUpgradePro').addEventListener('click', () => navigateTo('settings'));
  const btnAskAI = document.getElementById('btnAskAI');
  if (btnAskAI) btnAskAI.addEventListener('click', () => window.open('https://chatgpt.com/?q=' + encodeURIComponent(IRL_AI_PROMPT), '_blank'));

  document.querySelectorAll('[data-onboarding-next]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = (btn as HTMLElement).dataset.onboardingNext!;
      document.querySelectorAll('.onboarding-step').forEach((s) => ((s as HTMLElement).style.display = 'none'));
      $(`onboardingStep${next}`).style.display = '';
    });
  });
  $('btnFinishOnboarding').addEventListener('click', hideOnboarding);
}

async function selectRegion(): Promise<void> {
  const rect = await api.openRegionOverlay();
  if (rect) {
    const name = currentSettings.regionName || 'Region 1';
    const existing = currentSettings.savedRegions.filter((r) => r.name !== name);
    existing.push({ name, rect });
    await patchSetting({ minimapRect: rect, regionName: name, savedRegions: existing });
  }
}

function shareReddit(): void {
  if (historyRecords.length === 0) return;
  const last = historyRecords[historyRecords.length - 1];
  const title = `[Pavlov] My Map Awareness Score: ${last.masScore} | ${Math.round(last.durationS / 60)}min session`;
  const text = `MAS: ${last.masScore}\nGlances/min: ${last.glancesPerMin}\nAvg response: ${last.avgGapS}s\nLongest blind: ${last.longestGapS}s\n\nTrained with Pavlov - the map awareness coach.`;
  window.open(`${REDDIT_SHARE_BASE}?type=TEXT&title=${encodeURIComponent(title)}&text=${encodeURIComponent(text)}`, '_blank');
}

async function init(): Promise<void> {
  const data: BootstrapPayload = await api.getBootstrap();
  currentSettings = data.settings;
  currentEntitlement = data.entitlement;
  historyRecords = data.history;
  syncSettingsToUI(currentSettings);
  updateBeamStatus(data.beamStatus);
  updateAdBanner();
  renderHistory();
  bindEvents();
  if (currentSettings.firstRun) showOnboarding();
  api.onState(updateTrainingState);
  api.onBeamStatus(updateBeamStatus);
  api.onSessionComplete((record: SessionRecord) => { historyRecords.push(record); renderHistory(); });
}

init();
