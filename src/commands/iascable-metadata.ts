import {Arguments, Argv} from 'yargs';
import {Container} from 'typescript-ioc';
import {promises} from 'fs';
import {join} from 'path';
import {RemoteWithRefs, simpleGit} from 'simple-git';
import {dump} from 'js-yaml';
import {get} from 'superagent';

import {CommandLineInput} from './inputs/command-line.input';
import {IascableGenerateInput} from './inputs/iascable.input';
import {Module} from '../models';
import {ModuleMetadataApi, ModuleServiceCreateResult} from '../services/module-metadata-service';

export const command = 'metadata';
export const desc = 'Generates the metadata for a given module';
export const builder = (yargs: Argv<any>) => {
  return yargs
    .option('moduleUrl', {
      description: 'The git url of the module',
      demandOption: false,
    })
    .option('moduleVersion', {
      description: 'The version number of the metadata release',
      demandOption: false,
    })
    .option('repoSlug', {
      alias: 'r',
      description: 'The repo slug of the module in the form {git org}/{repo name}',
      demandOption: false,
    })
    .option('metadataFile', {
      alias: 'm',
      description: 'The file containing the input metadata',
      demandOption: false,
      default: 'module.yaml'
    })
    .option('publishBranch', {
      alias: 'b',
      description: 'The branch where the module metadata has been published',
      demandOption: false,
      default: 'gh-pages'
    })
    .option('outDir', {
      alias: 'o',
      description: 'The base directory where the command output will be written',
      demandOption: false,
      default: './output'
    })
    .option('flattenOutput', {
      alias: 'f',
      description: 'Flag indicating the output path should be flattened. If false the documentation will be placed in {outDir}/{module}/README.md.',
      demandOption: false,
      default: false,
      type: 'boolean'
    })
    .option('debug', {
      type: 'boolean',
      describe: 'Flag to turn on more detailed output message',
    })
    .middleware(async argv => {
      const repoSlug: string = await getRepoSlug(argv.moduleUrl)
      const moduleVersion: string = await getModuleVersion(repoSlug, argv.moduleVersion)

      return {
        repoSlug,
        moduleVersion
      }
    })
    .middleware(argv => {
      const moduleVersion: string = argv.moduleVersion

      if (!moduleVersion) {
        return {}
      }

      return {
        moduleVersion: 'v' + moduleVersion.replace(new RegExp('^v'), '')
      }
    })
    .check(argv => {
      if (!argv.repoSlug) {
        throw new Error('Unable to retrieve the repoSlug for provided git repo')
      }

      return true
    })
    .check(argv => {
      if (!argv.moduleVersion) {
        throw new Error('Unable to determine the version for the module')
      }

      return true
    });
};

export const handler = async (argv: Arguments<IascableGenerateInput & CommandLineInput>) => {
  process.env.LOG_LEVEL = argv.debug ? 'debug' : 'info';

  const cmd: ModuleMetadataApi = Container.get(ModuleMetadataApi);

  const version: string = argv.moduleVersion
  const repoSlug: string = argv.repoSlug
  const metadataFile: string = argv.metadataFile
  const publishBranch: string = argv.publishBranch

  console.log(`Generating metadata for module: ${repoSlug}#${version}`)
  try {
    const result: ModuleServiceCreateResult = await cmd.create({version, repoSlug, metadataFile, publishBranch})

    await outputResult(argv.outDir, result.metadata, argv)
  } catch (err) {
    console.log('')
    console.error(`Error: ${err.message}`)
  }
};

const outputResult = async (outputDir: string, module: Module, options: {flattenOutput: boolean}) => {

  const moduleName: string = module.name
  const basePath = options.flattenOutput ? outputDir : join(outputDir, moduleName)

  await promises.mkdir(basePath, {recursive: true})

  const filename = join(basePath, 'index.yaml')

  console.log(`  Writing module metadata for ${moduleName}: ${filename}`)

  await promises.writeFile(filename, dump(module))
}

const getModuleVersion =  async (repoSlug: string, providedVersion: string): Promise<string> => {
  if (providedVersion) {
    return providedVersion
  }

  if (!repoSlug) {
    return ''
  }

  const location = await getLatestReleaseUrl(`https://github.com/${repoSlug}/releases/latest`)

  const versionRegExp = new RegExp('https?://.*/v?([0-9]+)[.]([0-9]+)[.]([0-9]+)')
  const match = versionRegExp.exec(location)
  if (match) {
    const major = match[1]
    const minor = match[2]
    const patch = match[3]

    return `${major}.${minor}.${parseInt(patch, 10) + 1}`
  }

  return '0.0.1'
}

const getLatestReleaseUrl = async (url: string): Promise<string> => {
  const location: string = await get(url)
    .redirects(0)
    .then(resp => {
      return resp.headers['location']
    })
    .catch(err => {
      return err.response.headers['location']
    })

  if (location && location.endsWith('latest')) {
    return getLatestReleaseUrl(location)
  }

  return location || ''
}

const getRepoSlug = async (moduleUrl: string): Promise<string> => {
  const gitHttpPattern = new RegExp('https?://(.*).github.io/(.*)/?')
  const gitSshPattern = new RegExp('git@[^:]+:(.*)/(.*)')

  if (gitHttpPattern.test(moduleUrl)) {
    const match = gitHttpPattern.exec(moduleUrl)
    if (match) {
      const gitOrg = match[1]
      const repoName = match[2]

      return `${gitOrg}/${repoName}`
    }
  } else {
    // get information from current directory
    const baseDir = moduleUrl || '.'

    const remotes: RemoteWithRefs[] = await simpleGit({baseDir})
      .getRemotes(true)
      .catch(() => [])

    if (!remotes || remotes.length === 0) {
      return ''
    }

    const gitUrl = remotes[0].refs.fetch
    const pattern = gitHttpPattern.test(gitUrl) ? gitHttpPattern : gitSshPattern
    const match = pattern.exec(gitUrl)
    if (match) {
      const gitOrg = match[1]
      const repoName = match[2].replace(new RegExp('[.]git$', ''), '')

      return `${gitOrg}/${repoName}`
    }
  }

  return ''
}
