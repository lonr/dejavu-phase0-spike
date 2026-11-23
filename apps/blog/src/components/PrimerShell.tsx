'use client'

import { BookIcon, FileIcon, HomeIcon, RepoIcon } from '@primer/octicons-react'
import { BaseStyles, CounterLabel, Label, ThemeProvider } from '@primer/react'
import type { ReactNode } from 'react'

interface PrimerShellProps {
  basePath: string
  postCount: number
  children: ReactNode
}

export function PrimerShell({ basePath, postCount, children }: PrimerShellProps) {
  const href = (subpath: string) => `${basePath}${subpath}`

  return (
    <ThemeProvider colorMode="auto" dayScheme="light" nightScheme="dark">
      <BaseStyles>
        <div className="spike-container">
          <header>
            <nav aria-label="Primary" className="spike-nav">
              <a className="spike-nav-link" href={href('/')}>
                <HomeIcon size={16} /> Overview
              </a>
              <a className="spike-nav-link" href={href('/posts/')}>
                <BookIcon size={16} /> Posts <CounterLabel>{postCount}</CounterLabel>
              </a>
              <a className="spike-nav-link" href={href('/repositories')}>
                <RepoIcon size={16} /> Repositories
              </a>
              <a className="spike-nav-link" href={href('/readme')}>
                <FileIcon size={16} /> README
              </a>
              <Label variant="accent">Phase 0 Spike · Primer React 19</Label>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </BaseStyles>
    </ThemeProvider>
  )
}
