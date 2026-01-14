(async () => {
  'use strict'
  const response = await fetch('/resources/document.svg')
  const responseMsg = response.ok ? 'success' : 'fail'
  self.postMessage(responseMsg)
})()
