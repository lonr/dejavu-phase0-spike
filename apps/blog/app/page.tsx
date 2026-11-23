import { getSpikeBasePath, getSpikeBaseUrl, loadSpikePosts } from '../src/lib/spike-posts'

export default function HomePage() {
  const basePath = getSpikeBasePath()
  const baseUrl = getSpikeBaseUrl()
  const posts = loadSpikePosts()

  return (
    <section>
      <h1>Dejavu Phase 0 Vertical Spike</h1>
      <p>
        Base URL: <code>{baseUrl}</code> · Base Path: <code>{basePath || '(root)'}</code>
      </p>
      <h2>Article Routes ({posts.length})</h2>
      <ul className="spike-list">
        {posts.map((post) => (
          <li className="spike-card" key={post.stem}>
            <div>
              <a href={post.identity.encodedPath}>{post.title}</a>
            </div>
            <div className="spike-meta">encodedPath: {post.identity.encodedPath}</div>
            <div className="spike-meta">decodedPath: {post.identity.decodedPath}</div>
            <div className="spike-meta">optIn: {post.identity.optInRelativePath}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}
