/** Linear hand-offs: one issue per request, labelled for the agent that should pick it up (team ZAV). */
export interface LinearIssueInput {
  agent: string
  title: string
  description: string
  /** adds the `pm-approved` label so the agent can start without the PM's review */
  pmApproved: boolean
}

export interface Linear {
  createIssue(input: LinearIssueInput): Promise<{ identifier: string; url: string }>
}

const API = 'https://api.linear.app/graphql'

export function linearClient(apiKey: string, teamKey = 'ZAV', fetchFn: typeof fetch = fetch): Linear {
  const gql = async <T>(query: string, variables: Record<string, unknown> = {}): Promise<T> => {
    const res = await fetchFn(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: apiKey },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20_000),
    })
    const json = (await res.json()) as { data?: T; errors?: unknown }
    if (!res.ok || json.errors || !json.data) throw new Error(`Linear API ${res.status}: ${JSON.stringify(json.errors ?? '').slice(0, 200)}`)
    return json.data
  }
  return {
    async createIssue(input) {
      const teams = await gql<{ teams: { nodes: { id: string }[] } }>(
        `query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id } } }`,
        { key: teamKey },
      )
      const team = teams.teams.nodes[0]
      if (!team) throw new Error(`Linear team ${teamKey} not found`)
      const labels = await gql<{ issueLabels: { nodes: { id: string; name: string }[] } }>(`query { issueLabels(first: 100) { nodes { id name } } }`)
      const want = [input.agent, ...(input.pmApproved ? ['pm-approved'] : [])]
      const labelIds = want.map((n) => {
        const l = labels.issueLabels.nodes.find((x) => x.name.toLowerCase() === n.toLowerCase())
        if (!l) throw new Error(`Linear label "${n}" not found`)
        return l.id
      })
      const d = await gql<{ issueCreate: { issue: { identifier: string; url: string } } }>(
        `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { identifier url } } }`,
        { input: { teamId: team.id, title: input.title, description: input.description, labelIds } },
      )
      return d.issueCreate.issue
    },
  }
}
