const nullLogFunc = (): undefined => {}

const baseLogFunction = (prefix: string, isError: boolean,
                         ...msg: any[]): undefined => {
  const messageParts = [prefix]
  for (const aMsgPart of msg) {
    if (Array.isArray(aMsgPart)) {
      for (const aMsg of aMsgPart) {
        messageParts.push(String(aMsg))
      }
    }
    else if (typeof aMsgPart === 'string') {
      messageParts.push(aMsgPart)
    }
    else {
      messageParts.push(String(aMsgPart))
    }
  }

  const finalMessage = messageParts.join('')

  if (isError === true) {
    console.error(finalMessage)
  }
  else {
    console.log(finalMessage)
  }
}

const verboseFunc = baseLogFunction.bind(undefined, 'VERBOSE:', false)
const debugFunc = baseLogFunction.bind(undefined, 'DEBUG:', false)
const errorFunc = baseLogFunction.bind(undefined, 'ERROR:', true)

const nullLogger = Object.freeze({
  debug: nullLogFunc,
  verbose: nullLogFunc,
  error: errorFunc,
})

const debugLogger = Object.freeze({
  debug: debugFunc,
  verbose: nullLogFunc,
  error: errorFunc,
})

const verboseLogger = Object.freeze({
  debug: debugFunc,
  verbose: verboseFunc,
  error: errorFunc,
})

const logLevelToLoggerMap = {
  none: nullLogger,
  debug: debugLogger,
  verbose: verboseLogger,
}

export const getLoggerForLevel = (level: DebugLevel): Logger => {
  return logLevelToLoggerMap[level]
}

export const getLogger = (args: CrawlArgs): Logger => {
  return getLoggerForLevel(args.debugLevel)
}
