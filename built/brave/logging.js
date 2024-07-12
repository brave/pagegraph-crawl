const nullLogFunc = () => { };
const baseLogFunction = (prefix, isError, ...msg) => {
    const messageParts = [prefix];
    for (const aMsgPart of msg) {
        if (Array.isArray(aMsgPart)) {
            for (const aMsg of aMsgPart) {
                messageParts.push(String(aMsg));
            }
        }
        else if (typeof aMsgPart === 'string') {
            messageParts.push(aMsgPart);
        }
        else {
            messageParts.push(String(aMsgPart));
        }
    }
    const finalMessage = messageParts.join('');
    if (isError === true) {
        console.error(finalMessage);
    }
    else {
        console.log(finalMessage);
    }
};
const verboseFunc = baseLogFunction.bind(undefined, 'VERBOSE:', false);
const infoFunc = baseLogFunction.bind(undefined, 'DEBUG:', false);
const errorFunc = baseLogFunction.bind(undefined, 'ERROR:', true);
const nullLogger = Object.freeze({
    info: nullLogFunc,
    verbose: nullLogFunc,
    error: errorFunc,
});
const infoLogger = Object.freeze({
    info: infoFunc,
    verbose: nullLogFunc,
    error: errorFunc,
});
const verboseLogger = Object.freeze({
    info: infoFunc,
    verbose: verboseFunc,
    error: errorFunc,
});
const logLevelToLoggerMap = {
    none: nullLogger,
    info: infoLogger,
    verbose: verboseLogger,
};
export const getLoggerForLevel = (level) => {
    return logLevelToLoggerMap[level];
};
export const getLogger = (args) => {
    return getLoggerForLevel(args.loggingLevel);
};
