import {TerraformBuilderApi} from './terraform-builder.api';
import {TerraformBuilderNew} from './terraform-builder.new';

export default [
  {bind: TerraformBuilderApi, to: TerraformBuilderNew}
]
