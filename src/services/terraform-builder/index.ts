import {Container} from 'typescript-ioc';
import {TerraformBuilderApi} from './terraform-builder.api';
import {TerraformBuilderNew} from './terraform-builder.new';

export * from './terraform-builder.api';
export * from './terraform-builder.new';

Container.bind(TerraformBuilderApi).to(TerraformBuilderNew);
