import * as core from '@actions/core'
import * as github from '@actions/github'
import { Interface } from 'readline'
import { DefaultDeserializer } from 'v8'
import { IssueOrPRComponent, WorkflowComponent } from './component'

// TODO: Ensure this (and the Octokit client) works for non-github.com URLs, as well.
// https://github.com/orgs|users/<ownerName>/projects/<projectNumber>
const urlParse =
  /^(?:https:\/\/)?github\.com\/(?<ownerType>orgs|users)\/(?<ownerName>[^/]+)\/projects\/(?<projectNumber>\d+)/

interface ProjectNodeIDResponse {
  organization?: {
    projectNext: {
      id: string
    }
  }

  user?: {
    projectNext: {
      id: string
    }
  }
}

interface ProjectAddItemResponse {
  addProjectNextItem: {
    projectNextItem: {
      id: string
    }
  }
}

export async function addToProject(): Promise<void> {
  const projectUrl = core.getInput('project-url', {required: true})
  const ghToken = core.getInput('github-token', {required: true})

  const octokit = github.getOctokit(ghToken)
  const urlMatch = projectUrl.match(urlParse)
  const issue = github.context.payload.issue ?? github.context.payload.pull_request

  // Set up workflow component objects.
  const workflowAssignee = new WorkflowComponent('assignee')
  const workflowLabels = new WorkflowComponent('labeled')
  workflowAssignee.operator = core.getInput('assignee-operator').trim().toLocaleLowerCase()
  workflowLabels.operator = core.getInput('label-operator').trim().toLocaleLowerCase()

  // Set up issue/PR component objects.
  const assignee = new IssueOrPRComponent('assignee')
  const labels = new IssueOrPRComponent('labels')
  assignee.values = (issue?.assignees ?? []).map((a: {login: string}) => a.login)
  labels.values = (issue?.labels ?? []).map((l: {name: string}) => l.name)

  // Only proceed if the workflow assignee and labels match the issue/PR assignee and labels.
  if(!workflowAssignee.matches(assignee) || !workflowLabels.matches(labels)) { return }
  
  core.debug(`Project URL: ${projectUrl}`)

  if (!urlMatch) {
    throw new Error(
      `Invalid project URL: ${projectUrl}. Project URL should match the format https://github.com/<orgs-or-users>/<ownerName>/projects/<projectNumber>`
    )
  }

  const ownerName = urlMatch.groups?.ownerName
  const projectNumber = parseInt(urlMatch.groups?.projectNumber ?? '', 10)
  const ownerType = urlMatch.groups?.ownerType
  const ownerTypeQuery = mustGetOwnerTypeQuery(ownerType)

  core.debug(`Org name: ${ownerName}`)
  core.debug(`Project number: ${projectNumber}`)
  core.debug(`Owner type: ${ownerType}`)

  // First, use the GraphQL API to request the project's node ID.
  const idResp = await octokit.graphql<ProjectNodeIDResponse>(
    `query getProject($ownerName: String!, $projectNumber: Int!) { 
      ${ownerTypeQuery}(login: $ownerName) {
        projectNext(number: $projectNumber) {
          id
        }
      }
    }`,
    {
      ownerName,
      projectNumber
    }
  )

  const projectId = idResp[ownerTypeQuery]?.projectNext.id
  const contentId = issue?.node_id

  core.debug(`Project node ID: ${projectId}`)
  core.debug(`Content ID: ${contentId}`)

  // Next, use the GraphQL API to add the issue to the project.
  const addResp = await octokit.graphql<ProjectAddItemResponse>(
    `mutation addIssueToProject($input: AddProjectNextItemInput!) {
      addProjectNextItem(input: $input) {
        projectNextItem {
          id
        }
      }
    }`,
    {
      input: {
        contentId,
        projectId
      }
    }
  )

  core.setOutput('itemId', addResp.addProjectNextItem.projectNextItem.id)
}

export function mustGetOwnerTypeQuery(ownerType?: string): 'organization' | 'user' {
  const ownerTypeQuery = ownerType === 'orgs' ? 'organization' : ownerType === 'users' ? 'user' : null

  if (!ownerTypeQuery) {
    throw new Error(`Unsupported ownerType: ${ownerType}. Must be one of 'orgs' or 'users'`)
  }

  return ownerTypeQuery
}