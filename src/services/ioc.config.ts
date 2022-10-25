import {NamespaceConfiguration} from 'typescript-ioc/src/model';
import {ConstantConfiguration, ContainerConfiguration} from 'typescript-ioc';

import iascableConfig from './iascable/ioc.config';
import bomDocumentationConfig from './bom-documentation/ioc.config';
import catalogBuilderConfig from './catalog-builder/ioc.config';
import catalogLoaderConfig from './catalog-loader/ioc.config';
import dependencyGraphConfig from './dependency-graph/ioc.config';
import moduleDocumentationConfig from './module-documentation/ioc.config';
import moduleMetadataServiceConfig from './module-metadata-service/ioc.config';
import moduleSelectorConfig from './module-selector/ioc.config';
import terraformBuilderConfig from './terraform-builder/ioc.config';
import tileBuilderConfig from './tile-builder/ioc.config';

const config: Array<ContainerConfiguration | ConstantConfiguration | NamespaceConfiguration> = []

config.push(...iascableConfig)
config.push(...bomDocumentationConfig)
config.push(...catalogBuilderConfig)
config.push(...catalogLoaderConfig)
config.push(...dependencyGraphConfig)
config.push(...moduleDocumentationConfig)
config.push(...moduleMetadataServiceConfig)
config.push(...moduleSelectorConfig)
config.push(...terraformBuilderConfig)
config.push(...tileBuilderConfig)

export default config
