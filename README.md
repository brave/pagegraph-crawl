pagegraph-crawl
===

Command line tool for crawling with PageGraph.  It does not include a
PageGraph enabled build though; you can point it at the latest Nightly
version of Brave.

Install
---
```bash
npm run install
```

Test
---
```bash
npm run test
```
The tests are defined in `test/test.js`. Test parameters are defined in `test/config.js` and can be overriden via environment variables. You need to specify a pagegraph binary path.

Usage
---

```
$ npm run crawl -- -h

> pagegraph-crawl@1.0.0 crawl
> node ./built/run.js

usage: run.js [-h] [-v] -b BINARY [-r RECURSIVE_DEPTH] -o OUTPUT -u URL
              [URL ...] [-e EXISTING_PROFILE] [-p PERSIST_PROFILE]
              [-s {up,down}] [-t SECS] [--debug {none,debug,verbose}] [-i]
              [-a USER_AGENT] [--proxy-server URL] [-x JSON_ARRAY]


CLI tool for crawling and recording websites with PageGraph

Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  -b BINARY, --binary BINARY
                        Path to the PageGraph enabled build of Brave.
  -r RECURSIVE_DEPTH, --recursive-depth RECURSIVE_DEPTH
                        If provided, choose a link at random on page and do
                        another crawl to this depth. Default: 1 (no
                        recursion).
  -o OUTPUT, --output OUTPUT
                        Path (directory) to write graphs to.
  -u URL [URL ...], --url URL [URL ...]
                        The URLs(s) to record, in desired order (currently
                        only crawls the first URL)
  -e EXISTING_PROFILE, --existing-profile EXISTING_PROFILE
                        The chromium profile to use when crawling. Cannot be
                        used with "--persist-profile"
  -p PERSIST_PROFILE, --persist-profile PERSIST_PROFILE
                        If provided, the user profile will be saved at this
                        path. Cannot be used with "--existing-profile"
  -s {up,down}, --shields {up,down}
                        Whether to measure with shields up or down. Ignored
                        when using "--existing-profile". Default: down
  -t SECS, --secs SECS  The dwell time in seconds. Defaults: 30 sec.
  --debug {none,debug,verbose}
                        Print debugging information. Default: none.
  -i, --interactive     Suppress use of Xvfb to allow interaction with
                        spawned browser instance
  -a USER_AGENT, --user-agent USER_AGENT
                        Override the browser's UserAgent string to USER_AGENT
  --proxy-server URL    Use an HTTP/SOCKS proxy at URL for all navigations
  -x JSON_ARRAY, --extra-args JSON_ARRAY
                        Pass JSON_ARRAY as extra CLI argument to the browser
                        instance launched
```
