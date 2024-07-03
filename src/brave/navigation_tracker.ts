interface NavigationTracker {
  isCurrentUrl: (aUrl: URL) => boolean
  isInHistory: (aURL: URL) => boolean
  toHistory: () => URL[]
}

export const makeNavigationTracker = (navUrl: URL,
                                      history: URL[]): NavigationTracker => {
  const currentUrl = navUrl
  const historySet = new Set(history)
  const historyStringSet = new Set(history.map(x => x.toString()))

  const isCurrentUrl = (aURL: URL): boolean => {
    return aURL.toString() === currentUrl.toString()
  }

  const isInHistory = (aUrl: URL): boolean => {
    return historyStringSet.has(aUrl.toString())
  }

  const toHistory = (): URL[] => {
    const historyArray = Array.from(historySet)
    historyArray.push(currentUrl)
    return historyArray
  }

  return { isCurrentUrl, isInHistory, toHistory }
}
