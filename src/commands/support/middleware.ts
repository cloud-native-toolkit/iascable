
export const DEFAULT_CATALOG_URL = 'https://modules.cloudnativetoolkit.dev/index.yaml'

export const setupCatalogUrls = (defaultCatalogUrl: string = DEFAULT_CATALOG_URL) => {
  return (yargs: any) => {
    const result: {catalogUrls?: string[]} = {}

    const catalogUrls: string[] | undefined = yargs.catalogUrls

    if (catalogUrls && !catalogUrls.includes(defaultCatalogUrl)) {
      const newCatalogUrls: string[] = [defaultCatalogUrl]

      newCatalogUrls.push(...catalogUrls)

      result.catalogUrls = newCatalogUrls
    }

    return result
  }
}
