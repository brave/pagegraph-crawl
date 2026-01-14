'use strict'
const spanElm = document.getElementById('target')
const worker = new Worker('/resources/worker-request.js')
worker.addEventListener('message', (event) => {
  spanElm.innerText = `response: "${event.data}"`
})
