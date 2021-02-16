import {Container} from 'typescript-ioc';
import {TerraformBuilderApi} from './terraform-builder.api';
import {TerraformBuilder} from './terraform-builder.impl';

export * from './terraform-builder.api';
export * from './terraform-builder.impl';

Container.bind(TerraformBuilderApi).to(TerraformBuilder);
