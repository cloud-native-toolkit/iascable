export interface InterfaceErrorParams {
  id: string
  missingVariables?: string[]
  missingOutputs?: string[]
}

const buildMessage = ({
  id,
  missingVariables,
  missingOutputs
}: InterfaceErrorParams): string => {
  const messages: string[] = []

  messages.push(`Interface error: ${id}`)

  if (missingVariables && missingVariables.length > 0) {
    messages.push(
      `Missing interface variables: ${JSON.stringify(missingVariables)}`
    )
  }

  if (missingOutputs && missingOutputs.length > 0) {
    messages.push(
      `Missing interface outputs: ${JSON.stringify(missingOutputs)}`
    )
  }

  return messages.join('; ')
}

export class InterfaceError extends Error {
  missingVariables: string[]
  missingOutputs: string[]

  constructor({id, missingVariables, missingOutputs}: InterfaceErrorParams) {
    super(buildMessage({id, missingVariables, missingOutputs}))

    this.missingVariables = missingVariables || []
    this.missingOutputs = missingOutputs || []
  }
}

export class InterfaceErrors extends Error {
  errors: InterfaceError[]

  constructor(errors: InterfaceError[]) {
    super(errors.map(e => e.message).join('\n'))

    this.errors = errors
  }
}
