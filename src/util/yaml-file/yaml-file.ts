import {promises} from 'fs'
import YAML from 'js-yaml'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class YamlFile<T = any> {
  filename: string
  contents: T

  constructor(filename: string, contents: T) {
    this.filename = filename
    this.contents = contents
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async load<S = any>(file: string): Promise<YamlFile<S>> {
    const contents: Buffer = await promises.readFile(file)
      .catch(err => {
        const newError = /no such file or directory/.test(err.message)
          ? new Error(`File not found: ${file}`)
          : err

        throw newError
      })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: S = YAML.load(contents.toString()) as any

    return new YamlFile(file, result)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async update<S = any>(
    file: string,
    values: Partial<S>
  ): Promise<YamlFile<S>> {
    const yamlFile: YamlFile<S> = await YamlFile.load<S>(file)

    yamlFile.setValues(values)

    await yamlFile.write()

    return yamlFile
  }

  setValues(values: Partial<T>): YamlFile<T> {
    Object.assign(this.contents, values)

    return this
  }

  async write(): Promise<YamlFile<T>> {
    await promises.writeFile(this.filename, YAML.dump(this.contents))

    return this
  }
}
