import {TileBuilderApi} from './tile-builder.api';
import {TerraformVariable, Tile, TileConfig, TileVariable} from '../../models';
import {isUndefinedOrNull} from '../../util/object-util/object-util';

const defaultDescription = 'Installs a common set of DevOps tools used by developers into a cluster';

export class TileBuilder implements TileBuilderApi {
  buildTileMetadata(variables: TerraformVariable[], tileConfig: TileConfig): Tile {
    const label = tileConfig.label;
    const name = tileConfig.name;
    const shortDescription = tileConfig.shortDescription || defaultDescription;

    const configuration: TileVariable[] = variables.map(v => ({
      key: v.name,
      type: 'string',
      default_value: v.defaultValue,
      description: v.description,
      options: v.options,
      required: isUndefinedOrNull(v.defaultValue),
      hidden: false,
    }));

    return new Tile({
      label,
      name,
      offering_icon_url: "https://globalcatalog.cloud.ibm.com/api/v1/1082e7d2-5e2f-0a11-a3bc-f88a8e1931fc/artifacts/terraform.svg",
      tags: [
        "terraform",
        "dev_ops"
      ],
      rating: {},
      short_description: shortDescription,
      kinds: [
        {
          format_kind: "terraform",
          install_kind: "terraform",
          target_kind: "terraform",
          versions: [
            {
              "version": "#VERSION",
              "catalog_id": "#CATALOG_ID",
              "repo_url": "https://github.com/#REPO_URL/",
              "tgz_url": `https://github.com/#REPO_URL/releases/download/#VERSION/${name}.tar.gz`,
              configuration,
              entitlement: {
                provider_name: "free",
                provider_id: "free"
              },
              install: {
                instructions: "N/A"
              },
              licenses: [
                {
                  name: "LICENSE",
                  url: "https://www.apache.org/licenses/LICENSE-2.0.txt"
                }
              ],
              deprecated: false,
              long_description: "#LONG_DESCRIPTION"
            }
          ]
        }
      ],
      catalog_id: "#CATALOG_ID",
      hidden: false,
      provider: "IBM",
      repo_info: {
        type: "public_git"
      }
    });
  }
}
