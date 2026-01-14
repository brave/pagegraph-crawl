(async () => {
  const CS = window.cookieStore
  const D = window.document

  const randInt = Math.floor(Math.random() * 100000)
  const cookieName = 'test-cookie'
  const cookieValue = `value-${randInt}`

  const appendImage = (url) => {
    const imgElm = D.createElement('img')
    imgElm.src = url
    D.body.appendChild(imgElm)
  }

  await CS.delete(cookieName)

  setTimeout(async () => {
    appendImage(`/resources/document.svg?cookie=no&value=${cookieValue}`)
    setTimeout(async () => {
      await CS.set(cookieName, cookieValue)
      setTimeout(async () => {
        appendImage(`/resources/document.svg?cookie=yes&value=${cookieValue}`)
      }, 500)
    }, 500)
  }, 500)
})()
