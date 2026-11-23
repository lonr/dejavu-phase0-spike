import { loadSpikeReadmeSummary } from '../../src/lib/spike-posts'

export default function ReadmePage() {
  const summary = loadSpikeReadmeSummary()

  return (
    <section data-spike-route="readme">
      <h1>README</h1>
      <p>Exists in content dir: {summary.exists ? 'yes' : 'no'}</p>
      <pre className="spike-card">{summary.preview}</pre>
    </section>
  )
}
