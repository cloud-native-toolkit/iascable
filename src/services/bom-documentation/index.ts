import {Container} from 'typescript-ioc';
import {BomDocumentationApi} from './bom-documentation.api';
import {BomDocumentationImpl} from './bom-documentation.impl';

export * from './bom-documentation.api';

Container.bind(BomDocumentationApi).to(BomDocumentationImpl)
