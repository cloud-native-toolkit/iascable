import {Container} from 'typescript-ioc';
import {TerraformBuilderApi} from './terraform-builder.api';
import {TerraformBuilder} from './terraform-builder.impl';
import {TerraformBuilderNew} from './terraform-builder.new';

export * from './terraform-builder.api';
export * from './terraform-builder.impl';

Container.bind(TerraformBuilderApi).to(TerraformBuilderNew);
