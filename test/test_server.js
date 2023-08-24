import express from 'express'
import path from 'path'

const app = express()
app.use(express.static(path.join(new URL('.', import.meta.url).pathname, 'pages')))
export default app
