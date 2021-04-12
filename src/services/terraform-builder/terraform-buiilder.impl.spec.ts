import {
  BillOfMaterial,
  BillOfMaterialModel,
  BillOfMaterialModule, CatalogModel, GlobalRefVariable, isModuleRefVariable, ModuleRefVariable,
  SingleModuleVersion
} from '../../models';
import {TerraformBuilder} from './terraform-builder.impl';
import {Container} from 'typescript-ioc';
import {LoggerApi} from '../../util/logger';
import {NoopLoggerImpl} from '../../util/logger/noop-logger.impl';
import {ModuleSelectorApi} from '../module-selector';
import {CatalogLoaderApi} from '../catalog-loader';

describe('terraform-builder', () => {
  test('canary verifies test infrastructure', () => {
    expect(true).toBe(true);
  });

  let classUnderTest: TerraformBuilder;

  let catalog: CatalogModel;
  let moduleSelector: ModuleSelectorApi;
  beforeEach(async () => {
    Container.bind(LoggerApi).to(NoopLoggerImpl);

    const catalogLoader: CatalogLoaderApi = Container.get(CatalogLoaderApi);
    catalog = await catalogLoader.loadCatalog(`file:/${process.cwd()}/test/catalog.yaml`)

    moduleSelector = Container.get(ModuleSelectorApi);

    classUnderTest = Container.get(TerraformBuilder);
  })

  describe('given buildTerraformComponent()', () => {
    describe('when BOM module references a dependent module alias', () => {
      const modules: BillOfMaterialModule[] = [
        {name: 'ibm-container-platform'},
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
        const result = await classUnderTest.buildTerraformComponent(selectedModules);

        expect(Object.keys(result.stages).length).toEqual(4);

        const variableRefs = result.stages['tools-namespace'].variables
          .filter(v => isModuleRefVariable(v))
          .map(v => (v as ModuleRefVariable).moduleRef.stageName)

        expect(variableRefs.reduce((result: string[], val: string) => {
          if (!result.includes(val)) {
            result.push(val);
          }

          return result;
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
  });
});
