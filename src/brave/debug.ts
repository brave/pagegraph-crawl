export const getLogger = (args: CrawlArgs): LoggerFunc => {
  if (args.verbose) {
    return console.log
  }
  return () => {}
}
