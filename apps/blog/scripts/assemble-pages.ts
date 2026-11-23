import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { OPT_IN_RECORD_VERSION } from '@dejavu/contract'
import { getSpikeBasePath, loadSpikePosts, type SpikePost } from '../src/lib/spike-posts'

const APP_ROOT = path.resolve(import.meta.dirname, '..')
const CLIENT_DIR = path.join(APP_ROOT, 'dist', 'client')
const SERVER_ENTRY = path.join(APP_ROOT, 'dist', 'server', 'index.js')
const PAGES_DIR = path.join(APP_ROOT, 'dist', 'pages')

async function renderMissingPostFromServer(
  basePath: string,
  post: SpikePost,
): Promise<{ html: string; rsc: Uint8Array | null }> {
  const mod = (await import(pathToFileURL(SERVER_ENTRY).href)) as {
    default: ((req: Request) => Promise<Response>) | { fetch: (req: Request) => Promise<Response> }
  }
  const handler = typeof mod.default === 'function' ? mod.default : mod.default.fetch
  const url = `http://localhost${post.identity.encodedPath}`
  const htmlRes = await handler(new Request(url))
  if (!htmlRes.ok) {
    throw new Error(`Fallback SSR for ${post.identity.encodedPath} failed with status ${htmlRes.status}`)
  }
  const html = await htmlRes.text()

  const rscRes = await handler(
    new Request(url, {
      headers: { Accept: 'text/x-component', RSC: '1' },
    }),
  )
  const rsc = rscRes.ok ? new Uint8Array(await rscRes.arrayBuffer()) : null
  void basePath
  return { html, rsc }
}

async function main() {
  if (!fs.existsSync(CLIENT_DIR)) {
    throw new Error(`Expected Vinext export output at ${CLIENT_DIR}. Run vite build first.`)
  }

  const basePath = getSpikeBasePath()
  const baseSegment = basePath.replace(/^\/+/, '')
  const posts = loadSpikePosts()
  const repoId = Number(process.env.DEJAVU_REPO_ID ?? '1')

  fs.rmSync(PAGES_DIR, { recursive: true, force: true })
  fs.mkdirSync(PAGES_DIR, { recursive: true })

  // 1. Copy basePath-scoped or root client assets & static HTML into PAGES_DIR.
  const sourceRoot = baseSegment ? path.join(CLIENT_DIR, baseSegment) : CLIENT_DIR
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Expected Vinext basePath output directory at ${sourceRoot}`)
  }

  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.name === '.vite' || entry.name === 'vinext-client-entry-manifest.json') continue
    if (entry.name === 'posts' || entry.name === 'posts.html' || entry.name === 'posts.txt') continue
    fs.cpSync(path.join(sourceRoot, entry.name), path.join(PAGES_DIR, entry.name), { recursive: true })
  }

  // 2. Normalize root index.html (Vinext writes `<baseSegment>.html` when basePath is set and trailingSlash is false).
  const rootHtmlSource = baseSegment ? path.join(CLIENT_DIR, `${baseSegment}.html`) : path.join(CLIENT_DIR, 'index.html')
  if (!fs.existsSync(rootHtmlSource)) {
    throw new Error(`Missing exported root HTML at ${rootHtmlSource}`)
  }
  fs.copyFileSync(rootHtmlSource, path.join(PAGES_DIR, 'index.html'))

  // 3. Copy 404.html to site root.
  const notFoundSource = path.join(CLIENT_DIR, '404.html')
  if (fs.existsSync(notFoundSource)) {
    fs.copyFileSync(notFoundSource, path.join(PAGES_DIR, '404.html'))
  }

  // 4. Emit posts/index.html from posts.html so GitHub Pages resolves /posts -> /posts/ cleanly alongside posts/{stem}.html.
  const postsDir = path.join(PAGES_DIR, 'posts')
  fs.mkdirSync(postsDir, { recursive: true })
  const postsIndexSource = path.join(sourceRoot, 'posts.html')
  if (!fs.existsSync(postsIndexSource)) {
    throw new Error(`Missing exported posts index HTML at ${postsIndexSource}`)
  }
  fs.copyFileSync(postsIndexSource, path.join(postsDir, 'index.html'))
  const postsIndexTxt = path.join(sourceRoot, 'posts.txt')
  if (fs.existsSync(postsIndexTxt)) {
    fs.copyFileSync(postsIndexTxt, path.join(postsDir, 'index.txt'))
  }

  // 5. Emit every post to its decoded NFC filename (`posts/${post.stem}.html`) for GitHub Pages single-decode lookup,
  //    falling back to direct Vinext RSC rendering for any post skipped by vinext@1.4.6's prerenderApp bug.
  const sourcePostsDir = path.join(sourceRoot, 'posts')
  const nativePrerendered: string[] = []
  const fallbackRendered: string[] = []

  for (const post of posts) {
    const vinextEncodedFilename = `${encodeURIComponent(post.stem)}.html`
    const vinextHtmlPath = path.join(sourcePostsDir, vinextEncodedFilename)
    const targetHtmlPath = path.join(postsDir, `${post.stem}.html`)
    const targetRscPath = path.join(postsDir, `${post.stem}.txt`)

    if (fs.existsSync(vinextHtmlPath)) {
      fs.copyFileSync(vinextHtmlPath, targetHtmlPath)
      const vinextRscPath = path.join(sourcePostsDir, `${encodeURIComponent(post.stem)}.txt`)
      if (fs.existsSync(vinextRscPath)) {
        fs.copyFileSync(vinextRscPath, targetRscPath)
      }
      nativePrerendered.push(post.stem)
    } else {
      const { html, rsc } = await renderMissingPostFromServer(basePath, post)
      fs.writeFileSync(targetHtmlPath, html, 'utf-8')
      if (rsc) {
        fs.writeFileSync(targetRscPath, rsc)
      }
      fallbackRendered.push(post.stem)
    }

    // 6. Emit hashed per-article v1 opt-in JSON record under assets/_dejavu/comments/{sha256}.json.
    const optInFullPath = path.join(PAGES_DIR, post.identity.optInRelativePath)
    fs.mkdirSync(path.dirname(optInFullPath), { recursive: true })
    const optInPayload = {
      v: OPT_IN_RECORD_VERSION,
      repoId,
      path: post.identity.decodedPath,
      description: post.description,
    }
    fs.writeFileSync(optInFullPath, `${JSON.stringify(optInPayload, null, 2)}\n`, 'utf-8')
  }

  // 7. Write .nojekyll to guarantee underscore-prefixed paths (_next/, _dejavu/) are never filtered.
  fs.writeFileSync(path.join(PAGES_DIR, '.nojekyll'), '')

  console.log(
    JSON.stringify(
      {
        basePath: basePath || '/',
        pagesDir: PAGES_DIR,
        totalPosts: posts.length,
        nativePrerenderedCount: nativePrerendered.length,
        fallbackRenderedCount: fallbackRendered.length,
        fallbackRenderedStems: fallbackRendered,
      },
      null,
      2,
    ),
  )
}

await main()
