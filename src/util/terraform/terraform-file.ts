import es from 'event-stream';
import {createReadStream} from 'fs';

export interface TerraformVariableModel {
  name: string
  type?: string | MultiLineValue
  description?: string
  default?: any
  sensitive?: boolean
}

export interface TerraformOutputModel {
  name: string
  description?: string
}

export interface TerraformModel {
  variables: TerraformVariableModel[]
  outputs: TerraformOutputModel[]
}

export class MultiLineValue {
  private lines: string[] = []

  constructor(line: string) {
    this.add(line)
  }

  add(line: string): MultiLineValue {
    const cleanedLine = line.replace(/ +#.*/g, '')

    this.lines.push(cleanedLine)

    return this
  }

  isComplete(): boolean {
    const nestedCount: number = this.lines.reduce(
      (count: number, line: string) => {
        if (/[\[{]/g.test(line)) {
          count += 1
        }
        if (/[\]}]/g.test(line)) {
          count -= 1
        }

        return count
      },
      0
    )

    return nestedCount === 0
  }

  toString(): string {
    return this.lines.join('\n')
  }
}

export function isMultiLineValue(value: any): value is MultiLineValue {
  return (
    !!value &&
    typeof value.add === 'function' &&
    typeof value.isComplete === 'function'
  )
}

export class TerraformFile {
  static async load(file: string): Promise<TerraformModel> {
    return new Promise<TerraformModel>((resolve, reject) => {
      const terraform: TerraformModel = {
        variables: [],
        outputs: []
      }

      let current: any
      let multiLineValue: MultiLineValue | undefined

      const s = createReadStream(file)
        .pipe(es.split())
        .pipe(
          es.mapSync((line: string) => {
            s.pause()

            if (multiLineValue) {
              multiLineValue.add(line)

              if (multiLineValue.isComplete()) {
                multiLineValue = undefined
              }
            } else if (/^variable.* *{/g.test(line)) {
              const name: string = line
                .replace(/variable "(.*)" *{/g, '$1')
                .trim()

              current = {
                name
              }
              terraform.variables.push(current)
            } else if (/^output.* {/g.test(line)) {
              const name: string = line.replace(/output "(.*)" {/g, '$1')

              current = {
                name
              }
              terraform.outputs.push(current)
            } else if (/^ *type *= *(.*)/g.test(line)) {
              const type: string = line
                .replace(/^ *type *= *(.*)/g, '$1')
                .trim()

              current.type = multiLineValue = new MultiLineValue(type)

              if (multiLineValue.isComplete()) {
                multiLineValue = undefined
              }
            } else if (/^ *description *= *"(.*)"/g.test(line)) {
              current.description = line.replace(
                /^ *description *= *"(.*)"/g,
                '$1'
              )
            } else if (/^ *default *= *(.*)/g.test(line)) {
              const defaultValue: string = line.replace(
                /^ *default *= *(.*)/g,
                '$1'
              )

              current.default = multiLineValue = new MultiLineValue(
                defaultValue
              )

              if (multiLineValue.isComplete()) {
                multiLineValue = undefined
              }
            } else if (/^ *sensitive *= *(.*)/g.test(line)) {
              const sensitive: string = line.replace(
                /^ *sensitive *= *(.*)/g,
                '$1'
              )

              current.sensitive = sensitive === 'true'
            } else if (/^}/g.test(line)) {
              current = null
            }

            s.resume()
          })
        )

      s.on('error', (err: Error) => {
        reject(err)
      })
      s.on('end', () => {
        resolve(terraform)
      })
    }).then(result => {
      return {
        variables: cleanDefaultValues(result.variables),
        outputs: result.outputs
      }
    })
  }
}

const cleanDefaultValues = (
  variables: TerraformVariableModel[]
): TerraformVariableModel[] => {
  return variables.map(v => {
    if (v.type) {
      v.type = isMultiLineValue(v.type) ? v.type.toString() : v.type
    }

    if (v.default) {
      const defaultValue = isMultiLineValue(v.default)
        ? v.default.toString()
        : v.default

      if (v.type === 'string') {
        v.default = defaultValue.replace(/^"(.*)"$/g, '$1')
      } else if (v.type === 'bool') {
        v.default = defaultValue === 'true'
      } else if (v.type === 'list(string)') {
        v.default = JSON.parse(defaultValue)
      } else {
        v.default = defaultValue
      }
    }

    return v
  })
}
