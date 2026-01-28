Changelog
===

1.2.8
---

Quick version to fix a dumb version naming / numbering issue in the previously
tagged version.

Remove no longer needed dev dep `@types/node-gzip`, add missing needed
dev dep `@types/node`, and bump `mocha` version.

1.2.7
---

Remove strict check where an exception was thrown if we see two requests
with the same request ID during a crawl. Request ids are unique within a
page (which is what the check was trying to enforce), but `pagegraph-crawl`
can see repeat request ids if there is a redirect during the crawl,
or if requests are made by a worker that lives beyond a single page (shared
worker, service work). I'll add a check back in a future version to
enforce / assert that we don't see unexpected reused request ids, but
removing the check for the time being to unbreak these cases.

1.2.6
---

Improve and standardize the naming for JavaScript files used in the tests,
and add these scripts to lint checks.

1.2.5
---

Fix handling of requests made from workers (these are not yet recorded
in the graphs, but now they don't cause issues with the new request
tracking system).

Remove dependency on `node-gzip`.

Remove (some) places where we were buffering the entire graphML file in
memory. Sadly there are probably still some cases, but there is now one less.

Other misc code cleanup.

1.2.4
---

Add support for request headers by logging them, and then stitching them
into the resulting XML.  Uses `xml-stream` for this right now, which for now
requires using version node@20 for the time being.

1.2.2
---

For tests, use the callback for the `kill` call from `tree-kill` and increase
the timeout to 10sec, to try and reduce occasional false-negative test results.

1.2.1
---

Rename several arguments (e.g., `--persist-profile`, `--existing-profile`,
etc.) to make it clearer that these arguments should point to the parent
`--user-data-dir` directory, and not a particular profile within that directory.

1.2.0
---

Removed some additional, unused dependencies, including the no longer needed
type packages for previously removed dependencies.

Move from `standard` to `neostandard` for linting testing code.

Small bugfixes in handling unexpected request responses in the HAR parsing.

Remove `express` and use `http-server` instead (to further reduce dependencies).

1.1.3
---

Add ability to record a HAR of the crawled page
(PR [#180](https://github.com/brave/pagegraph-crawl/pull/180)).

Removed `fs-extras` and `chai` dependencies, in favor for standard library
approaches.

Specify and enforce a minimum node version, v20.0.0.

Clean up and reworking of test runner, including removing the hardcoded
config file for the tests.

Added [standardjs](https://standardjs.com/) linting for test code.

Fixed race in tests that cause random-seeming failures.

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
