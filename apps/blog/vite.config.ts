import vinext from 'vinext'
import { defineConfig } from 'vite'

const concurrency = process.env.DEJAVU_PRERENDER_CONCURRENCY
  ? Number(process.env.DEJAVU_PRERENDER_CONCURRENCY)
  : 1

export default defineConfig({
  plugins: [vinext({ prerender: { routes: '*', concurrency } })],
})
