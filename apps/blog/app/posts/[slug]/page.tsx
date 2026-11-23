import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { findSpikePostByParam, loadSpikePosts } from '../../../src/lib/spike-posts'

export const dynamic = 'force-static'
export const dynamicParams = false

interface PostPageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return loadSpikePosts().map((post) => ({
    slug: post.stem,
  }))
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug } = await params
  const post = findSpikePostByParam(slug)
  if (!post) {
    return { title: 'Not Found' }
  }
  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical: post.identity.canonicalUrl,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      url: post.identity.canonicalUrl,
    },
    twitter: {
      card: 'summary',
      title: post.title,
      description: post.description,
    },
  }
}

export default async function PostDetailPage({ params }: PostPageProps) {
  const { slug } = await params
  const post = findSpikePostByParam(slug)
  if (!post) {
    notFound()
  }

  return (
    <article
      data-canonical-url={post.identity.canonicalUrl}
      data-discussion-title={post.identity.discussionTitle}
      data-optin-path={post.identity.optInRelativePath}
      data-spike-stem={post.stem}
    >
      <h1>{post.title}</h1>
      <p>{post.description}</p>
      <dl className="spike-card spike-meta">
        <dt>Raw param</dt>
        <dd>{slug}</dd>
        <dt>Normalized stem</dt>
        <dd>{post.stem}</dd>
        <dt>Canonical URL</dt>
        <dd>{post.identity.canonicalUrl}</dd>
        <dt>Discussion title / decodedPath</dt>
        <dd>{post.identity.discussionTitle}</dd>
        <dt>Opt-in JSON path</dt>
        <dd>{post.identity.optInRelativePath}</dd>
      </dl>
    </article>
  )
}
