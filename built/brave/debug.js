export const getLogger = (args) => {
    if (args.verbose) {
        return console.log;
    }
    return () => { };
};
