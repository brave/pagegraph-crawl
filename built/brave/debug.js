const nullLogFunc = () => { };
const actualLogFunc = console.log;
const nullLogger = Object.freeze({
    debug: nullLogFunc,
    verbose: nullLogFunc
});
const debugLogger = Object.freeze({
    debug: actualLogFunc,
    verbose: nullLogFunc
});
const verboseLogger = Object.freeze({
    debug: actualLogFunc,
    verbose: actualLogFunc
});
const logLevelToLoggerMap = {
    none: nullLogger,
    debug: debugLogger,
    verbose: verboseLogger
};
export const getLoggerForLevel = (level) => {
    return logLevelToLoggerMap[level];
};
export const getLogger = (args) => {
    return getLoggerForLevel(args.debugLevel);
};
