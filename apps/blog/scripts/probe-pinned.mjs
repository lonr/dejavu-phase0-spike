import { Octokit } from 'octokit'

const token = process.env.GITHUB_TOKEN
const login = process.env.GITHUB_USER || process.env.GITHUB_REPOSITORY_OWNER

if (!token) {
  console.error('GITHUB_TOKEN is required')
  process.exit(1)
}
if (!login) {
  console.error('GITHUB_USER or GITHUB_REPOSITORY_OWNER is required')
  process.exit(1)
}

const octokit = new Octokit({ auth: token })

const PINNED_QUERY = `
  query ProbePinned($login: String!) {
    user(login: $login) {
      login
      name
      pinnedItems(first: 6, types: [REPOSITORY]) {
        totalCount
        nodes {
          __typename
          ... on Repository {
            id
            name
            url
            isPrivate
            stargazerCount
          }
        }
      }
      repositories(first: 6, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: { field: STARGAZERS, direction: DESC }) {
        totalCount
        nodes {
          id
          name
          url
          stargazerCount
        }
      }
    }
  }
`

const result = {
  login,
  tokenSource: process.env.GITHUB_ACTIONS === 'true' ? 'actions-default-GITHUB_TOKEN' : 'local-env-GITHUB_TOKEN',
  graphqlOk: false,
  graphqlError: null,
  pinnedTotalCount: null,
  pinnedRepos: [],
  popularTotalCount: null,
  popularRepos: [],
  restPublicReposCount: null,
  restError: null,
}

try {
  const data = await octokit.graphql(PINNED_QUERY, { login })
  result.graphqlOk = true
  const user = data.user
  result.pinnedTotalCount = user?.pinnedItems?.totalCount ?? null
  result.pinnedRepos = (user?.pinnedItems?.nodes ?? []).map((n) => ({
    typename: n?.__typename ?? null,
    name: n?.name ?? null,
    isPrivate: n?.isPrivate ?? null,
    stargazerCount: n?.stargazerCount ?? null,
  }))
  result.popularTotalCount = user?.repositories?.totalCount ?? null
  result.popularRepos = (user?.repositories?.nodes ?? []).map((n) => ({
    name: n.name,
    stargazerCount: n.stargazerCount,
  }))
} catch (err) {
  result.graphqlError = {
    name: err?.name ?? 'Error',
    status: err?.status ?? null,
    message: err?.message ?? String(err),
    errors: err?.errors ?? null,
  }
}

try {
  const restRes = await octokit.rest.repos.listForUser({
    username: login,
    type: 'owner',
    sort: 'updated',
    per_page: 10,
  })
  result.restPublicReposCount = restRes.data.length
} catch (err) {
  result.restError = {
    status: err?.status ?? null,
    message: err?.message ?? String(err),
  }
}

console.log(JSON.stringify(result, null, 2))
