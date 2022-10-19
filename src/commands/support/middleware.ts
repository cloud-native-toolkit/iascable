import uniq from 'lodash.uniq';

export const DEFAULT_CATALOG_URLS = [
  'https://modules.cloudnativetoolkit.dev/index.yaml',
  'https://cloud-native-toolkit.github.io/automation-solutions/index.yaml'
]

export const setupCatalogUrls = (defaultCatalogUrls: string[] = DEFAULT_CATALOG_URLS) => {
  return (yargs: any) => {
    const result: {catalogUrls?: string[]} = {}

    const catalogUrls: string[] | undefined = yargs.catalogUrls

    if (catalogUrls) {
      const newCatalogUrls: string[] = defaultCatalogUrls.concat(catalogUrls)

      result.catalogUrls = uniq(newCatalogUrls)
    }

    return result
  }
}
