import { loadSpikePosts } from '../../src/lib/spike-posts'

export default function PostsIndexPage() {
  const posts = loadSpikePosts()

  return (
    <section data-spike-route="posts-index">
      <h1>Posts</h1>
      <p>Static directory-backed index verifying /posts and /posts/ alongside posts/{'{stem}'}.html.</p>
      <ul className="spike-list">
        {posts.map((post) => (
          <li className="spike-card" key={post.stem}>
            <a href={post.identity.encodedPath}>{post.title}</a>
            <div className="spike-meta">canonical: {post.identity.canonicalUrl}</div>
            <div className="spike-meta">discussionTitle: {post.identity.discussionTitle}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}
