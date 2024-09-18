Version 1.1.0
---

Also pass `--disable-first-run-ui`, to suppress some additional, unneeded and
unwanted browser UI, and disable the Chrome `IPH_SidePanelGenericMenuFeature`
for the same reason.

Remove some no longer needed dependencies.

Version 1.0.2
---

Fix issue with some landing pages not loading.

Version 1.0.1
---

Add this `changelog.md` file, and start tagging releases.

Add additional flags for disabling chromium and Brave features, including
moving `--disable-features=BraveSync` to `--disable-sync` bc Brave will
be removing the former.
