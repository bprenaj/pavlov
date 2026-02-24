# Mapavlov - Project Instructions

## What Is Mapavlov

Mapavlov is a free Steam app by **Eyeware Tech SA** that uses eye tracking to train gamers' minimap awareness. It monitors whether the player is checking the minimap frequently enough during gameplay and triggers audio/visual alerts when they aren't. Think of it as Pavlovian conditioning for map awareness.

**Based on:** [MOBA-Minimap-Awareness-Trainer](https://github.com/kenneth-ew/MOBA-Minimap-Awareness-Trainer) (MIT-licensed prototype by Kenneth/Eyeware). Credit this in the About screen and README.

## Strategic Context

Mapavlov is a **showcase app that drives Beam Eye Tracker adoption**:

```
User finds Mapavlov (free) on Steam
  -> Needs Beam Eye Tracker (free on Steam, provides tracking)
    -> User installs Beam, discovers eye tracking ecosystem
      -> Eyeware ecosystem grows
```

Mapavlov does NOT do eye tracking itself. It consumes gaze data from the Beam Eye Tracker SDK (`beam-eye-tracker` Python package). Beam must be running for Mapavlov to function.

## Publisher & Branding

- **Publisher:** Eyeware Tech SA (same as Beam Eye Tracker on Steam)
- **Product name:** Mapavlov
- **Price:** Free
- **Steam category:** Software (not Game)
- **Platform:** Windows x64 only

## Supported Games

Primary targets (configure minimap location per game):
- League of Legends
- Dota 2
- Starcraft 2
- Valorant (radar)
- Counter-Strike 2 (radar)
- Overwatch
- Smite
- Any game with a minimap/radar element

## Core Functionality

### How It Works

1. User defines the minimap region on their screen (click-and-drag rectangle)
2. Mapavlov reads gaze data from Beam Eye Tracker SDK
3. A timer starts counting from the last time the user looked at the minimap region
4. If the timer exceeds a configurable threshold → trigger alert
5. When the user looks at the minimap → timer resets, alert stops
6. Repeat

### Feature Set (MVP)

- **Minimap region setup:** Click-and-drag overlay to define where the minimap is on screen
- **Configurable timeout:** How many seconds before the alert fires (default: 5s)
- **Audio alert:** Beep/alarm sound with adjustable volume (include a non-annoying default)
- **Visual alert:** Flashing overlay on/near the minimap region
- **Alert mode toggle:** Audio only / Visual only / Both / Silent (stats-only tracking)
- **Game presets:** Pre-configured minimap positions for popular games (LoL bottom-right, Dota 2 bottom-left, etc.)
- **Beam connection status:** Show whether Beam Eye Tracker is running and connected
- **Auto-start Beam prompt:** If Beam isn't running, offer to launch it (or link to Steam install)
- **Minimize to system tray:** Runs in background during gameplay
- **Start/Stop training button:** Toggle tracking on/off without closing the app
- **Session statistics:** Glance count, glances/min, avg time between glances, time on map %, with "Powered by Beam Eye Tracker" branding
- **Share to Reddit:** One-click sharing of session stats to Reddit with Beam Eye Tracker link

### Feature Set (Post-MVP / Nice-to-Have)

- **Session statistics:** % of time spent looking at minimap, average time between glances, session duration
- **History/progress tracking:** Show improvement over time across sessions
- **Heatmap overlay:** Where on screen the player looks most (post-game review)
- **Custom alert sounds:** Let users pick their own sound file
- **Overlay gaze bubble:** Show real-time gaze point on screen (like the Bjergsen eye-tracker VODs)
- **Streamer mode:** OBS-friendly gaze overlay for content creators
- **Per-game profiles:** Save different minimap regions and settings per game
- **Difficulty progression:** Start with generous timeout, gradually reduce as habit builds

## Tech Stack

### Decision: Python + PySide6

Stick with Python/PySide6 (same as the prototype). Rationale:
- Beam Eye Tracker SDK is Python-native (`beam-eye-tracker` pip package)
- Faster to ship than rewriting in Electron/Tauri
- PySide6 is sufficient for the UI complexity needed
- PyInstaller for packaging to .exe

If UI polish becomes a problem post-MVP, consider migrating the frontend to a web-based UI (Electron/Tauri) while keeping the Python backend for SDK communication.

### Dependencies

```
beam-eye-tracker       # Eyeware Beam SDK, gaze data
PySide6                # Qt6 UI framework
PyInstaller            # .exe packaging
```

Additional as needed:
```
pygame                 # For audio playback (simpler than Qt audio)
pywin32                # Windows API calls (DPI awareness, overlay windows)
```

### Beam Eye Tracker SDK Integration

> **Full Beam SDK reference:** See [CLAUDE-BEAMSDK.md](../CLAUDE-BEAMSDK.md) for the complete SDK guide: data access patterns, head pose, coordinate systems, and gotchas.

```python
from eyeware import beam_eye_tracker
import ctypes

# DPI awareness MUST be set before any UI calls
ctypes.windll.shcore.SetProcessDpiAwareness(2)

# Get actual screen resolution
screen_width = ctypes.windll.user32.GetSystemMetrics(0)
screen_height = ctypes.windll.user32.GetSystemMetrics(1)

# Initialize Beam SDK
viewport_geometry = beam_eye_tracker.ViewportGeometry()
viewport_geometry.point_00 = beam_eye_tracker.Point(0, 0)
viewport_geometry.point_11 = beam_eye_tracker.Point(screen_width, screen_height)
api = beam_eye_tracker.API("Mapavlov", viewport_geometry)
```

Reading gaze data each frame:
```python
tracking_state = api.get_latest_tracking_state_set()
user_state = tracking_state.user_state()

# ALWAYS check validity first
if user_state.timestamp_in_seconds == beam_eye_tracker.NULL_DATA_TIMESTAMP():
    # No valid data, skip this frame
    return

screen_gaze = user_state.unified_screen_gaze
gaze_x = screen_gaze.point_of_regard.x
gaze_y = screen_gaze.point_of_regard.y
confidence = screen_gaze.confidence  # 0=LOST, 1=LOW, 2=MEDIUM, 3=HIGH

# Only use data with sufficient confidence
if confidence >= 2:  # MEDIUM or HIGH
    check_if_gaze_is_in_minimap_region(gaze_x, gaze_y)
```

Checking Beam connection:
```python
status = api.get_tracking_data_reception_status()
# NOT_RECEIVING_TRACKING_DATA = Beam not running
# RECEIVING_TRACKING_DATA = connected and tracking
# ATTEMPTING_TRACKING_AUTO_START = trying to start Beam

# Attempt to auto-start Beam if not running
api.attempt_starting_the_beam_eye_tracker()
```

### Core Logic (Pseudocode)

```python
minimap_rect = (x1, y1, x2, y2)  # User-defined minimap region
timeout_seconds = 5.0              # Configurable
last_minimap_glance = time.time()
alert_active = False

def on_gaze_update(gaze_x, gaze_y, confidence):
    global last_minimap_glance, alert_active

    if confidence < 2:
        return  # Ignore low-confidence data

    # Check if gaze falls within minimap region
    if point_in_rect(gaze_x, gaze_y, minimap_rect):
        last_minimap_glance = time.time()
        if alert_active:
            stop_alert()
            alert_active = False

    # Check if timeout exceeded
    elapsed = time.time() - last_minimap_glance
    if elapsed > timeout_seconds and not alert_active:
        trigger_alert()
        alert_active = True
```

## Project Structure

```
mapavlov/
├── images/
│   └── Mapavlov Favicon.svg    # App favicon (used in title bar + tray)
├── src/
│   ├── main.py                 # Entry point
│   ├── app.py                  # Application class, lifecycle
│   ├── tracker.py              # Beam SDK integration, gaze reading loop
│   ├── minimap_detector.py     # Minimap region definition, gaze-in-region check
│   ├── alert_manager.py        # Audio + visual alert triggering
│   ├── settings.py             # User preferences (timeout, volume, minimap rect, etc.)
│   ├── game_presets.py         # Pre-configured minimap positions per game
│   ├── utils.py                # Audio generation, font loading, path helpers
│   ├── ui/
│   │   ├── main_window.py      # Main application window (frameless, custom title bar)
│   │   ├── setup_overlay.py    # Transparent overlay for minimap region selection
│   │   ├── alert_overlay.py    # Flashing overlay for visual alerts
│   │   ├── beam_status_widget.py # Beam Eye Tracker connection indicator
│   │   ├── tray_icon.py        # System tray icon and menu
│   │   └── styles.py           # QSS theme, brand colours, gradient background
│   └── assets/
│       ├── alert.wav           # Default alert sound (generated on first run)
│       ├── Lato-Regular.ttf    # Bundled font
│       └── Lato-Bold.ttf       # Bundled font
├── tests/
│   ├── test_alert_manager.py   # Alert trigger/stop/cooldown/silent mode
│   ├── test_game_presets.py    # Preset validation
│   ├── test_minimap_detector.py # Region geometry + tolerance
│   ├── test_settings.py        # Settings persistence + RegionStore
│   ├── test_tracker.py         # Beam SDK wrapper (mocked)
│   └── test_ui_visibility.py   # UI element presence, labels, tooltips, state
├── requirements.txt
├── CLAUDE.md                   # This file
├── LICENSE
└── README.md
```

## Steam Integration

### Steamworks Setup

1. Log into [Steamworks](https://partner.steamgames.com/) as Eyeware Tech SA
2. Create new application → Type: Software → Price: Free
3. Note the App ID (needed for build configs)
4. Configure store page:
   - **Title:** Mapavlov
   - **Developer:** Eyeware Tech SA
   - **Publisher:** Eyeware Tech SA
   - **Tags:** Utilities, Education, Training, Eye Tracking
   - **Supported OS:** Windows only
   - **Description:** references Beam Eye Tracker as required
5. Set up one depot for Windows x64

### Build & Upload Pipeline

```bash
# 1. Build the exe
pyinstaller installer/mapavlov.spec --noconfirm

# 2. Output lands in dist/mapavlov/

# 3. Upload to Steam via SteamCMD
steamcmd +login <username> +run_app_build steam/app_build.vdf +quit
```

### app_build.vdf (template)

```
"AppBuild"
{
    "AppID" "<YOUR_APP_ID>"
    "Desc" "Mapavlov build"
    "BuildOutput" "../build_output/"
    "ContentRoot" "../dist/mapavlov/"
    "Depots"
    {
        "<YOUR_DEPOT_ID>"
        {
            "FileMapping"
            {
                "LocalPath" "*"
                "DepotPath" "."
                "recursive" "1"
            }
        }
    }
}
```

### Steam Store Requirements

Required assets for the store page:
- **Header capsule:** 460x215 px
- **Small capsule:** 231x87 px
- **Main capsule:** 616x353 px
- **Hero graphic:** 3840x1240 px
- **Page background:** 1438x810 px
- **Logo:** 640x360 px
- **Screenshots:** minimum 5, 1920x1080 recommended
- **Trailer:** recommended, 1080p MP4

## Key Technical Gotchas

1. **DPI awareness MUST be set before ANY UI or coordinate calls.** Call `SetProcessDpiAwareness(2)` at the very top of `main.py`, before importing PySide6.
2. **Never hardcode screen resolution.** Laptops have wildly varying resolutions and DPI scaling.
3. **Use `point_of_regard` (clipped) for minimap detection** since the minimap is always on-screen, clipped coordinates are fine here. `unbounded_point_of_regard` is only needed if detecting off-screen gaze.
4. **Check `NULL_DATA_TIMESTAMP` before using any tracking data.** Timestamp of -1.0 means no valid data.
5. **Confidence filtering:** Only act on MEDIUM (2) or HIGH (3) confidence. LOST_TRACKING (0) = discard.
6. **Beam must be running.** Mapavlov should gracefully handle Beam not being available with a clear status message and offer to launch it.
7. **Overlay windows** for the visual alert and minimap region selector need to be topmost, transparent, and click-through. Use `Qt.WindowStaysOnTopHint` and `Qt.FramelessWindowHint`.
8. **Minimize to tray, not taskbar.** Gamers don't want an extra taskbar window during gameplay.
9. **Audio alert should not conflict with game audio.** Use a distinct frequency and keep default volume moderate.
10. **Reset the gaze timer on tracking discontinuities** (Beam disconnects, lost tracking for extended period). Don't punish the player for tracker issues.

## Brand Colours

| Role                        | Hex       |
|-----------------------------|-----------|
| Purple (accent)             | `#7B61FF` |
| Background gradient top     | `#15171D` |
| Background gradient bottom  | `#0E0824` |
| Card / row background       | `#23262E` |
| Inactive element            | `#505050` |
| Error / warning             | `#FFFF00` |

These match the Beam Eye Tracker app aesthetic. See `src/ui/styles.py` for the full QSS implementation.

## UI/UX Guidelines

- **Clean, modern, dark theme** (gamers expect dark UI)
- **Minimal clicks to start:** Open app → Select game preset (or set minimap region) → Hit Start
- **First-run experience:** Guide user through minimap region setup on first launch
- **Status always visible:** Beam connected/disconnected, tracking active/paused, time since last minimap glance
- **Non-intrusive during gameplay:** Once started, the app should be invisible except for alerts

## Reference Links

- [Beam SDK Reference (local)](../CLAUDE-BEAMSDK.md) - shared SDK knowledge for all Beam projects
- [Beam Eye Tracker Docs](https://docs.beam.eyeware.tech/)
- [Beam Python API Reference](https://docs.beam.eyeware.tech/api/python/index.html)
- [Beam on Steam](https://store.steampowered.com/app/2012120/Eyeware_Beam/)
- [Original Prototype (GitHub)](https://github.com/kenneth-ew/MOBA-Minimap-Awareness-Trainer)
- [Original Reddit Thread](https://www.reddit.com/r/leagueoflegends/comments/vc2404/we_made_this_tool_that_improves_your_minimap)
- [Steamworks Documentation](https://partner.steamgames.com/doc/home)
- [Steamworks SDK](https://partner.steamgames.com/doc/sdk)
- [SteamCMD](https://developer.valvesoftware.com/wiki/SteamCMD)
- [PyInstaller Docs](https://pyinstaller.org/)
- [PySide6 Docs](https://doc.qt.io/qtforpython-6/)

## Testing

Run all tests:
```bash
python -m pytest tests/ -v
```

### Test structure

| File | What it covers |
|------|----------------|
| `test_alert_manager.py` | Trigger, stop, cooldown, silent mode, volume |
| `test_game_presets.py` | Preset keys, ratios, corner labels |
| `test_minimap_detector.py` | Region contains, tolerance expansion, dict roundtrip |
| `test_settings.py` | Defaults, save/load, corrupt file handling, RegionStore CRUD |
| `test_tracker.py` | GazeData confidence, mocked SDK status/gaze/auto-start |
| `test_ui_visibility.py` | **Every UI element** is present, labelled, and in the correct state |

### UI visibility tests (test_ui_visibility.py)

Every delivery must include a passing `test_ui_visibility.py` that checks:

- **Title bar:** "Mapavlov" text, favicon icon present, frameless window flag
- **Region section:** combo box with "New region" default, "Select on screen" button, name input with placeholder, Save button disabled initially, Edit/Delete/+New action links
- **Settings section:** Alarm timeout slider (range 5-300), Volume slider (0-100), Detection margin slider (0-30), slider value labels showing units (s, %)
- **Alert mode:** Audio, Visual, Silent buttons exist and are checkable, Silent unchecks the others
- **Start button:** objectName "startButton", disabled without a region, enabled with region+name, correct text in each state
- **Statistics:** toggle text contains "Statistics" and "Beam Eye Tracker", panel hidden by default, toggles open/closed, all 5 stat rows exist (duration, glances, rate, avg_gap, map_time), initial values are "-", Share on Reddit button present
- **Beam status:** widget exists, updates text for TRACKING and NOT_RUNNING states
- **Debug mode:** label visible when debug=True, hidden when debug=False
- **Tooltips:** every interactive element (combo, buttons, sliders) has a non-empty tooltip

When adding new UI elements, add corresponding tests to `test_ui_visibility.py` in the same PR.

## Development Workflow

1. **Branch strategy:** `main` = stable/release, `dev` = active development, feature branches off `dev`
2. **Testing:** Test with Beam running + not running. Test on different screen resolutions and DPI scales.
3. **Steam builds:** Push to a `beta` branch on Steam first for internal testing, then promote to `default` for public release.
4. **Versioning:** Semantic versioning (1.0.0 for first Steam release)
