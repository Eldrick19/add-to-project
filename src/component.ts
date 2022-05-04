import * as core from '@actions/core'
import * as github from '@actions/github'

// Define a class for an a general component.
class Component {
  name: string;
  values: string[] = [];
  constructor(name: string) {
    this.name = name;
  }
  
}

// Define a class for a Issue or Pull Request component. This could be an assignee, label, etc.
export class IssueOrPRComponent extends Component {
  metadata = github.context.payload.issue ?? github.context.payload.pull_request;
  constructor(name: string) {
    super(name);
  }
  
}

// Define a class for a workflow components. This could be an assignee, label, etc.
export class WorkflowComponent extends Component {
    operator: string | undefined;
    constructor(name: string) {
      super(name);
      this.values = this.getValues(name);
    }

    // Get the workflow input values.
    getValues(name: string) {
      return core
        .getInput(name)
        .split(',')
        .map(n => n.trim())
        .filter(n => n.length > 0) ?? []
    }

    // Check workflow input against issue/PR input.
    // If the workflow input is not set, then it's a match.
    matches(issueComponent: IssueOrPRComponent): boolean {
      if (this.operator === 'and') {
        if(!this.values.every(value => issueComponent.values.includes(value))) {
          core.info(`Skipping issue ${issueComponent.metadata?.number} because it doesn't match all the fields from "${this.name}": ${this.values.join(', ')}`);
          return false
        }
      } else {
        if (this.values.length > 0 && !issueComponent.values.some(value => this.values.includes(value))) {
          core.info(`Skipping issue ${issueComponent.metadata?.number} because it doesn't match one of the fields from "${this.name}": ${this.values.join(', ')}`);
        return false
        } 
    }

    return true
  }


}