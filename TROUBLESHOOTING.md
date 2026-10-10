# Troubleshooting FMSuperScout 24

FMSuperScout 24 reads FM24 memory directly. It does not install a plugin or modify the
Football Manager folder. It can run beside the original FMSuperScout: this edition uses
its own program folder, data folder, shortcut, installer identity, and local web port.

## No players loaded

1. Start **FM24** and load a save. The reader cannot scan the main menu.
2. Open **FMSuperScout 24** and click **New data**. The reader normally finishes in about
   10 seconds.
3. If the scan fails, open `%LOCALAPPDATA%\FMSuperScout24\status.json` and check the
   `error` field. Attach `diagnostics.txt` from the same folder when reporting the issue.
4. If `dump.json` exists but the app is empty, click Reload. The app reads only this
   edition's data folder; dumps from the original FMSuperScout are kept separate.

## App will not open

The shortcut starts the app on `http://localhost:8766`. The original FMSuperScout uses a
different local port, so both can stay open. If you start this edition manually, run
`Start FMSuperScout24.cmd` or open `http://localhost:8766` after starting `app/server.js`.

The install folder is `%LOCALAPPDATA%\Programs\fmscuperscout24`. Reinstalling or
uninstalling FMSuperScout 24 leaves the original FMSuperScout installation and data alone.

## Reporting a problem

Use **Report a problem** in the app settings and attach `%LOCALAPPDATA%\FMSuperScout24\status.json`
and `diagnostics.txt` if available. Include your FM24 version and whether it is the Steam,
Epic, or Xbox version.
