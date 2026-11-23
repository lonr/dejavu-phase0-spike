import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PrimerShell } from '../src/components/PrimerShell'
import { getSpikeBasePath, loadSpikePosts } from '../src/lib/spike-posts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Dejavu Phase 0 Spike',
  description: 'Phase 0 vertical spike verifying Vinext static export, Primer React 19, and GitHub Pages paths.',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const basePath = getSpikeBasePath()
  const posts = loadSpikePosts()

  return (
    <html lang="en">
      <body className="spike-body">
        <PrimerShell basePath={basePath} postCount={posts.length}>
          {children}
        </PrimerShell>
      </body>
    </html>
  )
}
