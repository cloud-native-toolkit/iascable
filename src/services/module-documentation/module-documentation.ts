import {ModuleDocumentationApi} from './module-documentation.api';
import {
  Module,
  ModuleDependency,
  ModuleDoc, ModuleOutput, ModuleOutputRef, ModuleProvider,
  ModuleRef,
  ModuleVariable,
  ModuleVersion
} from '../../models';
import {ModuleVersionNotFound} from '../../util/version-resolver';
import {isUndefined} from '../../util/object-util';

export class ModuleDocumentation implements ModuleDocumentationApi {

  async generateDocumentation(module: Module): Promise<ModuleDoc> {

    const currentVersion: ModuleVersion = this.latestModuleVersion(module)

    const contents = `
# ${module.displayName || module.name} module

${module.description}

${module.documentation || ''}

## Software dependencies

The module depends on the following software components:

### Terraform version

${this.terraformVersion(currentVersion)}

### Terraform providers

${this.terraformProviders(currentVersion)}

### Module dependencies

${this.moduleDependencies(currentVersion)}

## Module details

### Inputs

${this.moduleVariables(currentVersion)}

### Outputs

${this.moduleOutputs(currentVersion)}
`

    return new ModuleDoc({contents, moduleName: module.name})
  }

  latestModuleVersion(module: Module): ModuleVersion {
    if (!module.versions || module.versions.length === 0) {
      throw new ModuleVersionNotFound(module, 'latest')
    }

    return module.versions[0]
  }

  terraformVersion(moduleVersion: ModuleVersion): string {
    const versionString = (moduleVersion.terraformVersion || '>= v0.15').replace('>', '\\>')

    return `- ${versionString}`
  }

  terraformProviders(moduleVersion: ModuleVersion): string {
    if (!moduleVersion.providers || moduleVersion.providers.length === 0) {
      return 'None'
    }

    const moduleProvider = (provider: ModuleProvider): string => {
      return `- ${provider.name} (${provider.source})`
    }

    return moduleVersion.providers.map(moduleProvider).join('\n')
  }

  moduleDependencies(moduleVersion: ModuleVersion): string {
    if (!moduleVersion.dependencies || moduleVersion.dependencies.length === 0) {
      return 'None'
    }

    const moduleDependency = (dep: ModuleDependency): string => {
      const refString = (ref: ModuleRef) => `${ref.source} (${ref.version})`

      if (dep.interface) {
        return `- ${dep.id} - interface ${dep.interface}`
      } else if (dep.refs && dep.refs?.length === 1) {
        return `- ${dep.id} - ${refString(dep.refs[0])}`
      } else if (dep.refs && dep.refs?.length > 0) {
        const modules: string = dep.refs.map(ref => `    - ${refString(ref)}`).join('\n')

        return `- ${dep.id} - one of:
${modules}
`
      } else {
        return `- ${dep.id}`
      }
    }

    return moduleVersion.dependencies.map(moduleDependency).join('\n')
  }

  moduleVariables(moduleVersion: ModuleVersion): string {
    if (!moduleVersion.variables || moduleVersion.variables.length === 0) {
      return 'None'
    }

    const variableHeader = (): string => {
      return `| Name | Description | Required | Default | Source |
|------|-------------|---------|----------|--------|`
    }

    const moduleSource = (ref?: ModuleOutputRef): string => {
      if (!ref) {
        return ''
      }

      return `${ref.id}.${ref.output}`
    }

    const moduleVariable = (variable: ModuleVariable): string => {
      return `| ${variable.name} | ${variable.description} | ${isUndefined(variable.default || variable.defaultValue) ? 'true' : ''} | ${variable.default || variable.defaultValue || ''} | ${moduleSource(variable.moduleRef)} |`
    }

    return `${variableHeader()}
${moduleVersion.variables.map(moduleVariable).join('\n')}
`
  }

  moduleOutputs(moduleVersion: ModuleVersion): string {
    if (!moduleVersion.outputs || moduleVersion.outputs.length === 0) {
      return 'None'
    }

    const outputHeader = (): string => {
      return `| Name | Description |
|------|-------------|`
    }

    const moduleOutput = (output: ModuleOutput): string => {
      return `| ${output.name} | ${output.description} |`
    }

    return `${outputHeader()}
${moduleVersion.outputs.map(moduleOutput).join('\n')}
`
  }

  moduleVersions(module: Module): string {
    if (!module.versions || module.versions.length === 0) {
      return 'None'
    }

    return module.versions.map(v => `- [${v.version}](https://${module.id}/releases/tag/${v.version})`).join('\n')
  }
}
