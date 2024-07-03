export const makeNavigationTracker = (navUrl, history) => {
    const currentUrl = navUrl;
    const historySet = new Set(history);
    const historyStringSet = new Set(history.map(x => x.toString()));
    const isCurrentUrl = (aURL) => {
        return aURL.toString() === currentUrl.toString();
    };
    const isInHistory = (aUrl) => {
        return historyStringSet.has(aUrl.toString());
    };
    const toHistory = () => {
        const historyArray = Array.from(historySet);
        historyArray.push(currentUrl);
        return historyArray;
    };
    return { isCurrentUrl, isInHistory, toHistory };
};
