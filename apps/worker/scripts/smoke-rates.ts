import { loadConfig } from '../src/config.js'
import { fetchRatePoints } from '../src/data/rates.js'

const env = loadConfig()
const pts = await fetchRatePoints(env)
console.log(JSON.stringify(pts, null, 2))
