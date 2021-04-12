import {ModuleSelectorApi} from './module-selector.api';
import {Container} from 'typescript-ioc';
import {
  BillOfMaterial,
  BillOfMaterialModel,
  BillOfMaterialModule, BillOfMaterialModuleDependency,
  CatalogModel, ModuleDependency,
  SingleModuleVersion
} from '../../models';
import {CatalogLoaderApi} from '../catalog-loader';
import {ModuleSelector} from './module-selector.impl';
import {LoggerApi} from '../../util/logger';
import {NoopLoggerImpl} from '../../util/logger/noop-logger.impl';
import {isDefinedAndNotNull} from '../../util/object-util';

describe('module-selector', () => {
  test('canary verifies test infrastructure', () => {
    expect(true).toBe(true);
  });

  let catalog: CatalogModel;

  let classUnderTest: ModuleSelectorApi;
  beforeEach(async () => {
    Container.bind(LoggerApi).to(NoopLoggerImpl);

    const catalogLoader: CatalogLoaderApi = Container.get(CatalogLoaderApi);
    catalog = await catalogLoader.loadCatalog(`file:/${process.cwd()}/test/catalog.yaml`)

    classUnderTest = Container.get(ModuleSelector);
  });

  describe('given resolveBillOfMaterial()', () => {
    describe('when BOM defines IDs of valid modules', () => {
      const modules = [
        'github.com/cloud-native-toolkit/terraform-ibm-container-platform',
        'github.com/cloud-native-toolkit/terraform-tools-argocd',
      ];

      let bom: BillOfMaterialModel;
      beforeEach(() => {
        bom = new BillOfMaterial({spec: {modules}});
      });

      test('then should resolve modules', async () => {
        const actualResult: SingleModuleVersion[] = await classUnderTest.resolveBillOfMaterial(
          catalog,
          bom,
        );

        const actualIds = actualResult.map(m => m.id).filter(id => modules.includes(id));
        expect(actualIds).toEqual(modules);

        expect(actualResult.map(m => m.bomModule).filter(m => !!m).length).toEqual(modules.length);
        expect(actualResult.map(m => m.bomModule).filter(m => !m).length).toEqual(actualResult.length - modules.length);
      });
    });
    describe('when BOM defines names of valid modules', () => {
      const modules = [
        {name: 'ibm-container-platform'},
        {name: 'argocd'},
      ];

      let bom: BillOfMaterialModel;
      beforeEach(() => {
        bom = new BillOfMaterial({spec: {modules}});
      });

      test('then should resolve modules', async () => {
        const actualResult: SingleModuleVersion[] = await classUnderTest.resolveBillOfMaterial(
          catalog,
          bom,
        );

        expect(actualResult.length).toBeGreaterThan(0);
        const mapNames = actualResult.map(m => ({name: m.name})).filter(m => modules.some(v => v.name === m.name));
        expect(mapNames).toEqual(modules);
      });
    });
    describe('when BOM defines the same module multiple times', () => {
      const modules = [
        {name: 'ibm-container-platform'},
        {name: 'namespace'},
        {name: 'namespace'},
      ];

      let bom: BillOfMaterialModel;
      beforeEach(() => {
        bom = new BillOfMaterial({spec: {modules}});
      });

      test('then should resolve modules', async () => {
        const actualResult: SingleModuleVersion[] = await classUnderTest.resolveBillOfMaterial(
          catalog,
          bom,
        );

        expect(actualResult.length).toEqual(modules.length);
        const mapNames = actualResult.map(m => ({name: m.name})).filter(m => modules.some(v => v.name === m.name));
        expect(mapNames).toEqual(modules);
        const aliases = actualResult.map(m => m.alias);
        expect(aliases).toEqual(['cluster', 'namespace', 'namespace1']);
      });
    });
    describe('when BOM defines modules with aliases', () => {
      const modules = [
        {name: 'ibm-container-platform', alias: 'cluster'},
        {name: 'namespace', alias: 'tools-namespace'},
        {name: 'namespace', alias: 'observability-namespace'},
      ];

      let bom: BillOfMaterialModel;
      beforeEach(() => {
        bom = new BillOfMaterial({spec: {modules}});
      });

      test('then should resolve modules with alias names from BOM', async () => {
        const actualResult: SingleModuleVersion[] = await classUnderTest.resolveBillOfMaterial(
          catalog,
          bom,
        );

        expect(actualResult.length).toEqual(modules.length);
        const mapNames = actualResult.map(m => ({name: m.name})).filter(m => modules.some(v => v.name === m.name));
        expect(mapNames).toEqual(modules.map(m => ({name: m.name})));
        const aliases = actualResult.map(m => m.alias);
        expect(aliases).toEqual(modules.map(m => m.alias));

        expect(actualResult.map(m => m.bomModule).filter(m => !!m).length).toEqual(modules.length);
        expect(actualResult.map(m => m.bomModule).filter(m => !m).length).toEqual(actualResult.length - modules.length);
      });
    });
    describe('when BOM module has a dependency that refers to a particular module alias that does not already exist', () => {
      const modules: BillOfMaterialModule[] = [
        {name: 'ibm-container-platform'},
        {name: 'namespace', alias: 'tools-namespace', dependencies: [{name: 'cluster', ref: 'mycluster'}]},
      ];

      let bom: BillOfMaterialModel;
      beforeEach(() => {
        bom = new BillOfMaterial({spec: {modules}});
      });

      test('then it should add a new module with that name', async () => {
        const actualResult: SingleModuleVersion[] = await classUnderTest.resolveBillOfMaterial(
          catalog,
          bom,
        );

        expect(actualResult.length).toEqual(3);
        expect(actualResult.map(m => m.alias)).toEqual(['cluster', 'tools-namespace', 'mycluster']);

        const dependencies: Array<Array<BillOfMaterialModuleDependency> | undefined> = actualResult.map(m => m.bomModule?.dependencies).filter(isDefinedAndNotNull);
        const discriminators: string[] = dependencies.reduce((result: string[], d: Array<BillOfMaterialModuleDependency> | undefined) => {

          if (!d) {
            return result;
          }

          result.push(...d.map(dep => dep.ref as any).filter(isDefinedAndNotNull));

          return result;
        }, [] as string[])
        console.log('Discriminators: ', discriminators);
        expect(dependencies.every(d => d?.every(x => !!x.ref))).toBe(true);
      });
    });
    describe('when BOM module has a dependency that refers to a particular module alias that already exists', () => {
      const modules: BillOfMaterialModule[] = [
        {name: 'ibm-container-platform'},
        {name: 'namespace', alias: 'tools-namespace', dependencies: [{name: 'cluster', ref: 'mycluster'}]},
        {name: 'namespace', alias: 'namespace', dependencies: [{name: 'cluster', ref: 'cluster'}]},
      ];

      let bom: BillOfMaterialModel;
      beforeEach(() => {
        bom = new BillOfMaterial({spec: {modules}});
      });

      test('then it should add a new module with that name', async () => {
        const actualResult: SingleModuleVersion[] = await classUnderTest.resolveBillOfMaterial(
          catalog,
          bom,
        );

        expect(actualResult.length).toEqual(4);
        expect(actualResult.map(m => m.alias)).toEqual(['cluster', 'tools-namespace', 'mycluster', 'namespace']);

        const dependencies: Array<Array<BillOfMaterialModuleDependency> | undefined> = actualResult.map(m => m.bomModule?.dependencies).filter(isDefinedAndNotNull);
        const discriminators: string[] = dependencies.reduce((result: string[], d: Array<BillOfMaterialModuleDependency> | undefined) => {

          if (!d) {
            return result;
          }

          result.push(...d.map(dep => dep.ref as any).filter(isDefinedAndNotNull));

          return result;
        }, [] as string[])
        console.log('Discriminators: ', discriminators);
        expect(dependencies.every(d => d?.every(x => !!x.ref))).toBe(true);
      });
    });
  });
});
