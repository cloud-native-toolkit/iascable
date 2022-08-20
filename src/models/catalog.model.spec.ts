import {Catalog} from './catalog.model';
import {Container} from 'typescript-ioc';
import {LoggerApi} from '../util/logger';
import {NoopLoggerImpl} from '../util/logger/noop-logger.impl';
import {CatalogLoaderApi} from '../services';

describe('catalog model', () => {
  test('canary verifies test infrastructure', () => {
    expect(true).toBe(true);
  });

  let classUnderTest: Catalog;
  beforeAll(async () => {
    Container.bind(LoggerApi).to(NoopLoggerImpl);

    const catalogLoader: CatalogLoaderApi = Container.get(CatalogLoaderApi);
    classUnderTest = await catalogLoader.loadCatalog(`file:/${process.cwd()}/test/catalog.yaml`)
  });

  describe('given lookupModule()', () => {
    describe('when called with a valid id', () => {
      test('then it should return a module', async () => {
        const id = 'github.com/cloud-native-toolkit/terraform-ibm-container-platform';

        const actualResult = classUnderTest.lookupModule({id});
        expect(actualResult).toBeDefined();
        expect(actualResult?.id).toBe(id);
      });
    });

    describe('when called with an old id', () => {
      test('then it should return a module', async () => {
        const id = 'github.com/cloud-native-toolkit/terraform-ibm-resource-group';
        const expectedId = 'github.com/terraform-ibm-modules/terraform-ibm-resource-group'

        const actualResult = classUnderTest.lookupModule({id});
        expect(actualResult).toBeDefined();
        expect(actualResult?.id).toBe(expectedId);
      });
    });

    describe('when called with a valid name', () => {
      test('then it should return a module', async () => {
        const name = 'ibm-container-platform';

        const actualResult = classUnderTest.lookupModule({name});
        expect(actualResult).toBeDefined();
        expect(actualResult?.name).toBe(name);
      });
    });
  });
});
