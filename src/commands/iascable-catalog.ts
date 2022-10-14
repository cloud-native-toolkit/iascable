import {Arguments, Argv} from 'yargs';
import {Container} from 'typescript-ioc';
import {createWriteStream, promises, WriteStream} from 'fs';
import {join} from 'path';
import {dump} from 'js-yaml';
import {Observable} from 'rxjs';

import {CommandLineInput} from './inputs/command-line.input';
import {IascableCatalogInput} from './inputs/iascable.input';
import {
  BillOfMaterialEntry,
  catalogKind,
  catalogSummaryKind,
  Module,
  ModuleIdAlias,
  ModuleProvider,
  ModuleSummary
} from '../models';
import {CatalogBuilderApi, CatalogBuilderResult} from '../services/catalog-builder';

export const command = 'catalog';
export const desc = 'Generates the metadata catalog for an individual module or a collection of modules';
export const builder = (yargs: Argv<any>) => {
  return yargs
    .option('moduleMetadataUrl', {
      alias: ['m'],
      type: 'string',
      description: 'The url of an individual module metadata file. Can be an http:// or file:// url',
      demandOption: false,
      conflicts: 'catalogInput'
    })
    .option('catalogInput', {
      alias: ['i'],
      type: 'string',
      description: 'The path to the file listing a number of modules that will be added to the catalog',
      demandOption: false,
      conflicts: 'moduleMetadataUrl'
    })
    .option('existingCatalogUrl', {
      alias: ['c'],
      type: 'string',
      description: 'The url of the existing catalog to which the module(s) will be added. Can be an http:// or file:// url',
      demandOption: false,
    })
    .option('category', {
      description: 'The category to which the module should be added. Only applies to an individual module',
      demandOption: false,
      default: 'other',
    })
    .option('outDir', {
      alias: 'o',
      description: 'The base directory where the command output will be written',
      demandOption: false,
      default: './output/catalog'
    })
    .option('debug', {
      type: 'boolean',
      describe: 'Flag to turn on more detailed output message',
    })
    .check(argv => {
      if (!argv.moduleMetadataUrl && !argv.catalogInput) {
        throw new Error('moduleMetadataUrl or catalogInput must be provided')
      }

      return true
    })
};

export const handler = async (argv: Arguments<IascableCatalogInput & CommandLineInput>) => {
  process.env.LOG_LEVEL = argv.debug ? 'debug' : 'info';

  const service: CatalogBuilderApi = Container.get(CatalogBuilderApi)

  const result = service.build(argv)

  await outputResult(argv.outDir, result)
}

const outputResult = async (outDir: string, result: CatalogBuilderResult): Promise<void> => {

  await promises.mkdir(outDir, {recursive: true})

  const catalogStream: WriteStream = createWriteStream(join(outDir, 'index.yaml'))
  const summaryStream: WriteStream = createWriteStream(join(outDir, 'summary.yaml'))

  try {
    writeLine([catalogStream, summaryStream], `apiVersion: ${result.apiVersion}`)
    writeLine(catalogStream, `kind: ${catalogKind}`)
    writeLine(summaryStream, `kind: ${catalogSummaryKind}`)

    const providers: Promise<ModuleProvider[]> = joinObservable(result.providers)
    const aliases: Promise<ModuleIdAlias[]> = joinObservable(result.aliases)
    const boms: Promise<BillOfMaterialEntry[]> = joinObservable(result.boms)

    await writeModules(catalogStream, summaryStream, result.modules)

    const partialResult = {
      providers: await providers,
      aliases: await aliases,
      boms: await boms,
    }

    writeLine([catalogStream, summaryStream], dump(partialResult))

  } finally {
    catalogStream.close()
    summaryStream.close()
  }
}

const writeModules = async (catalogStream: WriteStream, summaryStream: WriteStream, obs: Observable<Module>): Promise<void> => {
  write([catalogStream, summaryStream], 'modules:')

  return new Promise((resolve, reject) => {
    let count: number = 0
    obs.subscribe({
      next: (module: Module) => {
        if (count === 0) {
          writeLine([catalogStream, summaryStream], '')
        }
        count++

        writeModule(catalogStream, summaryStream, module)
      },
      error: (err: Error) => {
        if (count === 0) {
          writeLine([catalogStream, summaryStream], ' []')
        }

        reject(err)
      },
      complete: () => {
        if (count === 0) {
          writeLine([catalogStream, summaryStream], ' []')
        }
        resolve()
      }
    })
  })
}

const writeModule = (catalogStream: WriteStream, summaryStream: WriteStream, module: Module): void => {
  const moduleSummary: ModuleSummary = Object.assign(
    {},
    module,
    {versions: module.versions.map(value => ({version: value.version}))}
  )

  write(catalogStream, dump([module]))
  write(summaryStream, dump([moduleSummary]))
}

const joinObservable = <T>(obs: Observable<T>): Promise<T[]> => {
  return new Promise<T[]>((resolve, reject) => {
    const providers: T[] = []

    obs.subscribe({
      next: (value: T) => {
        providers.push(value)
      },
      error: (err: Error) => {
        reject(err)
      },
      complete: () => {
        resolve(providers)
      }
    })
  })
}

const writeLine = (streamInput: WriteStream | WriteStream[], line: string, indent: number = 0): void => {
  const streams: WriteStream[] = Array.isArray(streamInput) ? streamInput : [streamInput]

  streams.forEach(stream => {
    for (let i = 0; i < indent; i++) {
      stream.write('  ')
    }

    stream.write(line)
    stream.write('\n')
  })
}

const write = (streamInput: WriteStream | WriteStream[], line: string, indent: number = 0): void => {
  const streams: WriteStream[] = Array.isArray(streamInput) ? streamInput : [streamInput]

  streams.forEach(stream => {
    for (let i = 0; i < indent; i++) {
      stream.write('  ')
    }

    stream.write(line)
  })
}
