import {
  BillOfMaterial,
  BillOfMaterialModel,
  BillOfMaterialModule,
  CatalogModel,
  GlobalRefVariable,
  isModuleRefVariable, ModuleRef,
  ModuleRefVariable,
  SingleModuleVersion,
  TerraformComponent
} from '../../models';
import {Container} from 'typescript-ioc';
import {LoggerApi} from '../../util/logger';
import {NoopLoggerImpl} from '../../util/logger/noop-logger.impl';
import {ModuleSelectorApi} from '../module-selector';
import {CatalogLoaderApi} from '../catalog-loader';
import {TerraformBuilderApi} from './terraform-builder.api';
import {TerraformBuilderNew} from './terraform-builder.new';
import {of as arrayOf} from '../../util/array-util';

describe('terraform-builder', () => {
  test('canary verifies test infrastructure', () => {
    expect(true).toBe(true);
  });

  let classUnderTest: TerraformBuilderApi;

  let catalog: CatalogModel;
  let moduleSelector: ModuleSelectorApi;
  beforeEach(async () => {
    Container.bind(LoggerApi).to(NoopLoggerImpl);

    const catalogLoader: CatalogLoaderApi = Container.get(CatalogLoaderApi);
    catalog = await catalogLoader.loadCatalog(`file:/${process.cwd()}/test/catalog.yaml`)

    moduleSelector = Container.get(ModuleSelectorApi);

    classUnderTest = Container.get(TerraformBuilderNew);
  })

  describe('given buildTerraformComponent()', () => {
    describe('when BOM module references a dependent module alias', () => {
      const modules: BillOfMaterialModule[] = [
        {name: 'ibm-container-platform'},
        {name: 'ibm-container-platform', alias: 'mycluster'},
        {name: 'namespace', alias: 'tools-namespace', dependencies: [{name: 'cluster', ref: 'mycluster'}]},
        {name: 'namespace', alias: 'namespace', dependencies: [{name: 'cluster', ref: 'cluster'}]},
      ];

      let bom: BillOfMaterialModel;
      let selectedModules: SingleModuleVersion[];
      beforeEach(async () => {
        bom = new BillOfMaterial({spec: {modules}});

        selectedModules = await moduleSelector.resolveBillOfMaterial(catalog, bom);
      });

      test('then use the module defined by the alias', async () => {
        const result: TerraformComponent = await classUnderTest.buildTerraformComponent(selectedModules);

        expect(Object.keys(result.stages).length).toEqual(4);

        const variableRefs = result.stages['tools-namespace'].variables
          .filter(v => isModuleRefVariable(v))
          .map(v => ((v as ModuleRefVariable).moduleRef as any).stageName);

        expect(variableRefs.reduce((refs: string[], val: string) => {
          if (!refs.includes(val)) {
            refs.push(val);
          }

          return refs;
        }, [])).toEqual(['mycluster']);
      });
    });

    describe('when BOM module references variables', () => {
      const modules: BillOfMaterialModule[] = [
        {name: 'ibm-container-platform'},
        {name: 'namespace', alias: 'tools-namespace', variables: [{name: 'name', value: 'tools'}]},
      ];

      let bom: BillOfMaterialModel;
      let selectedModules: SingleModuleVersion[];
      beforeEach(async () => {
        bom = new BillOfMaterial({spec: {modules}});

        selectedModules = await moduleSelector.resolveBillOfMaterial(catalog, bom);
      });

      test('then apply the variables to the resulting terraform module', async () => {
        const result = await classUnderTest.buildTerraformComponent(selectedModules);

        const variableName = result.stages['tools-namespace'].variables.filter(v => v.name === 'name').map(v => (v as GlobalRefVariable).variableName)[0];
        const variables = result.baseVariables.filter(v => v.name === variableName).map(v => v.defaultValue);
        expect(variables).toEqual(['tools']);
      });
    });

    describe('when BOM module references multiple dependent modules', () => {
      const modules: BillOfMaterialModule[] = [
        {name: 'ibm-vpc'},
        {name: 'ibm-vpc'},
        {name: 'ibm-transit-gateway'},
      ];

      let bom: BillOfMaterialModel;
      let selectedModules: SingleModuleVersion[];
      beforeEach(async () => {
        bom = new BillOfMaterial({spec: {modules}});

        selectedModules = await moduleSelector.resolveBillOfMaterial(catalog, bom);
      });

      test('then return all matching dependent modules', async () => {
        const result: TerraformComponent = await classUnderTest.buildTerraformComponent(selectedModules);

        expect(Object.keys(result.stages).length).toEqual(4);

        const variableRefs: ModuleRef[] = arrayOf(result.stages['ibm-transit-gateway'].variables)
          .filter(v => isModuleRefVariable(v))
          .filter(v => v.name === 'connections')
          .map(v => ((v as ModuleRefVariable).moduleRef as any))
          .mergeMap<ModuleRef>()
          .asArray();

        expect(variableRefs.length).toEqual(2)
      });
    });
  });
});
