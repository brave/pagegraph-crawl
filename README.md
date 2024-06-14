pagegraph-crawl
===

Command line tool for crawling web pages with PageGraph.

Install
---
For building/installing the tool, you need to have `tsc` (TypeScript Compiler) package installed.

```bash
npm install
npm run build
```

Test
---
```bash
npm run test
```
The tests are defined in `test/test.js`. Test parameters are defined in `test/config.js` and can be overriden via environment variables. You need to specify a PageGraph binary path.

Usage
---
Since [PageGraph](https://github.com/brave/brave-browser/wiki/PageGraph) is built as part of Brave Nightly, you can simply point the binary path to be your local installation.

```bash
npm run crawl -- -b /Applications/Brave\ Browser\ Nightly.app/Contents/MacOS/Brave\ Browser\ Nightly -u https://brave.com -t 5 -o output/ --debug debug
```

The `-t` specifies how many seconds to crawl the URL provided in `-u` using the PageGraph binary in `-b`. 

You can see all supported options:
```bash
npm run crawl -- -h
```

**NOTE:** PageGraph currently does not track puppeteer / automation scripts, and so modifying or interacting with the document through [devtools/puppeteer](https://pptr.dev/) while recording a PageGraph file will fail.antani
