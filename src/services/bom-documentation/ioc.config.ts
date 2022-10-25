import {BomDocumentationApi} from './bom-documentation.api';
import {BomDocumentationImpl} from './bom-documentation.impl';

export default [
  { bind: BomDocumentationApi, to: BomDocumentationImpl },
];
