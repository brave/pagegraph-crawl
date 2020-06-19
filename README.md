# pagegraph-crawl

Command line tool for crawling with PageGraph.  It does not include a
PageGraph enabled build though; you'll need to bring your own or
wait a few days until we start providing our own.

If you're editing / developing please make sure things `npm run lint` cleanly,
and `num run build` before pushing, to make sure `./built` stays in sync
with `./src`.

Usage
##
```
usage: run.js [-h] [-v] -b BINARY -o OUTPUT -u URL [URL ...]
              [-e EXISTING_PROFILE] [-p PERSIST_PROFILE] [-s {up,down}]
              [-t SECS] [--debug {none,debug,verbose}]


CLI tool for crawling and recording websites with PageGraph

Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  -b BINARY, --binary BINARY
                        Path to the PageGraph enabled build of Brave.
  -o OUTPUT, --output OUTPUT
                        Path to write graphs to.
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
```
