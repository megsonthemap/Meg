# Reel Studio on Windows

Reel Studio runs on Windows PCs as well as Macs. This page covers the few things that are different on a PC. Everything else in the guide is the same.

## 1. Check your PC first

You need:

- **Windows 10 (version 1809 or newer) or Windows 11.**
- **A 64-bit Intel or AMD processor.** To check, open Settings, then System, then About. Under "System type" it should say *64-bit operating system, x64-based processor*.
- **About 5 GB of free space** for the install, plus 1 to 3 GB for each reel you make.
- **16 GB of memory** is comfortable. 8 GB works, just slower.

Reel Studio will **not** run on:

- Windows on Arm laptops (Snapdragon, some Surface and Copilot+ models). "System type" will say *ARM-based processor*.
- Chromebooks, iPads or Android tablets.

## 2. Install Node.js

Download the **LTS** installer from [nodejs.org](https://nodejs.org) and run it with the default options. Close any open terminal windows afterwards so the next one you open can find it.

## 3. Put the Reel Studio folder somewhere safe

1. Unzip the download properly: right-click the zip and choose **Extract All**. Double-clicking a zip only lets you peek inside, and the engine cannot run from there.
2. After extracting, open the folder. If there is a single folder inside with the same name, use that inner one.
3. Move the folder to a short path that **OneDrive does not sync**, such as `C:\ReelStudio`.

Why not OneDrive (or Dropbox, or Google Drive)? On many PCs, Desktop and Documents are synced to OneDrive without you ever choosing it. The engine writes thousands of small files and rewrites frame folders on every render. A sync app trying to upload all of that slows everything down, and files it has moved "online only" can vanish mid-render. If you see a little cloud or tick in the Status column in File Explorer, that folder is synced.

## 4. Run setup

Open the `engine` folder and double-click **setup-windows.cmd**.

If Windows shows "Windows protected your PC", click **More info**, then **Run anyway**. The script is plain text; you can open it in Notepad to read it first.

Setup downloads what the engine needs (about 2 GB all up, including the speech model), then renders a short test reel. It is safe to run again any time: anything already done is skipped, and an interrupted download picks up where it stopped.

To check everything without changing anything, run this from a terminal in the Reel Studio folder:

```
node engine\setup.mjs doctor
```

It lists anything missing with the fix in plain English.

The first time you open the review studio on your PC, Windows Firewall asks whether Node.js can use the network. Choose **Private networks** only. That lets your phone on your home Wi-Fi open the review page.

## 5. Getting footage off your iPhone

There is no AirDrop to a PC, so pick one of these:

- **Cable (best quality).** Plug the iPhone into the PC, unlock it and tap **Trust**. In File Explorer open *Apple iPhone*, then *Internal Storage*, then *DCIM*, and copy the clips you want into the Reel Studio `inbox` folder.
- **iCloud for Windows.** Install it from Apple, turn on Photos, and make sure originals are downloaded (not just previews) before you copy them into `inbox`.

For the sharpest result, on the iPhone go to Settings, then Photos, and under *Transfer to Mac or PC* choose **Keep Originals**. Reel Studio handles iPhone HDR and HEVC video itself.

Avoid emailing or messaging clips to yourself. Those routes shrink the video.

## 6. Fonts

Your brand fonts go in the `brand\fonts` folder, exactly as named in `brand\brand.json`. That is all the engine needs to render them.

If you also want those fonts in CapCut, Canva desktop or anything else on your PC, install them **for all users**: right-click the font file and choose **Install for all users** (Windows asks for an admin password). A plain "Install" only adds the font to your own account, and some apps never see it there.

Until your brand fonts are in place, Reel Studio uses fonts every Windows PC already has (Segoe UI Black and Georgia).

## 7. CapCut

If you want an editable CapCut project of each reel:

1. Download CapCut desktop from **[capcut.com](https://www.capcut.com)**. Skip the Microsoft Store version; it keeps its projects in a private app folder where Reel Studio cannot find them.
2. Open CapCut once, create a blank project, then quit. That creates CapCut's project folder.
3. Reel Studio writes drafts to `%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft`. If you changed where CapCut saves projects in its settings, set the `REEL_CAPCUT_DRAFTS` environment variable to that folder.
4. Quit and reopen CapCut to see a new draft.

## 8. Effects that are Mac only for now

A few effects place you *in front of* graphics, which needs the person cutout built into macOS. On Windows they still work, in a version that does not need the cutout:

| Effect | On Windows |
|---|---|
| Hook behind your head | The hook sits on top of the shot |
| Giant word behind your head, Serif numbers | Drawn in front of you |
| Screen behind you | A stacked shot: the screenshot on top, you moved down beneath it |
| Photo fan, Camera snaps, Photo wall, Headline scatter | The photos are drawn in front of you |
| App background | The prompt bar over your shot, same typing |
| Colour title, Paper cut | A full-screen title card for those seconds, with your voice underneath |
| Glass type, Magazine cover, Orbit, Doodle outline | Drawn over the shot (no outline around you) |
| Frame break, Pull-back reveal, Vertigo | The whole shot moves, you included |
| Cut-out photo stickers | The photo is used as it is |

The render log says in one line which of these it changed for each reel.

The **quality check** is a little different too. On a Mac it finds your face in every second it checks. On Windows it checks against the area where a face usually sits in a vertical selfie shot, and anything it catches there is a warning for you to look at rather than a hard stop. Glance over the contact sheet for text over your face before you post.

## 9. What to expect on speed

Turning your speech into captions runs on the processor on a PC, so the first step on new footage takes longer than on a Mac: allow a few minutes per minute of footage. Rendering speed is similar.

## If something goes wrong

Run `node engine\setup.mjs doctor` first. The usual fixes:

- **"node is not recognized"**: Node.js is not installed, or the terminal was open before you installed it. Close it and open a new one.
- **ffmpeg or whisper "will not start"**: install the Microsoft Visual C++ Redistributable (x64) from [aka.ms/vs/17/release/vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe), restart, and run setup again.
- **Errors mentioning a path that is too long**: move the Reel Studio folder closer to the drive, such as `C:\ReelStudio`, and run setup again.
