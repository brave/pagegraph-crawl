1.1.3
---

Add ability to record a HAR of the crawled page
(PR [#180](https://github.com/brave/pagegraph-crawl/pull/180)).

Removed `fs-extras` dependency.

Specify and enforce a minimum node version, v20.0.0.

Clean up and reworking of test runner, including removing the hardcoded
config file for the tests.


1.1.2
---

Update eslint to 8.11.0, which resolves a non-useful warning when linting.

Minor version bumps in other dependencies.


1.1.1
---

Minor version bumps in dependencies.

1.1.0
---

Also pass `--disable-first-run-ui`, to suppress some additional, unneeded and
unwanted browser UI, and disable the Chrome `IPH_SidePanelGenericMenuFeature`
for the same reason.

Remove some no longer needed dependencies.

1.0.2
---

Fix issue with some landing pages not loading.

1.0.1
---

Add this `changelog.md` file, and start tagging releases.

Add additional flags for disabling chromium and Brave features, including
moving `--disable-features=BraveSync` to `--disable-sync` bc Brave will
be removing the former.
