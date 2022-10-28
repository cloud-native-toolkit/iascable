import {Container} from 'typescript-ioc';

import {
  BillOfMaterialModel,
  BillOfMaterialModule,
  CatalogV2Model,
  Module,
  ModuleRef,
  OutputFile,
  SingleModuleVersion,
  TerraformComponentModel,
} from '../../models';
import {arrayOf, LoggerApi, Optional} from '../../util';
import {NoopLoggerImpl} from '../../util/logger/noop-logger.impl';
import {ModuleSelectorApi} from '../module-selector';
import {CatalogLoaderApi} from '../catalog-loader';
import {TerraformBuilderApi} from './terraform-builder.api';
import {TerraformBuilderNew} from './terraform-builder.new';
import {
  BillOfMaterial,
  GlobalRefVariable,
  isModuleRefVariable,
  ModuleRefVariable,
  TerraformTfvarsFile
} from '../../model-impls';

describe('terraform-builder', () => {
  test('canary verifies test infrastructure', () => {
    expect(true).toBe(true);
  });

  let classUnderTest: TerraformBuilderApi;

  let catalog: CatalogV2Model;
  let moduleSelector: ModuleSelectorApi;
  beforeEach(async () => {
    Container.bind(LoggerApi).to(NoopLoggerImpl);

    const catalogLoader: CatalogLoaderApi = Container.get(CatalogLoaderApi);
    catalog = await catalogLoader.loadCatalog(`file:/${process.cwd()}/test/catalogv1.yaml`)

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
        const result: TerraformComponentModel = await classUnderTest.buildTerraformComponent(selectedModules, catalog);

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
        const result = await classUnderTest.buildTerraformComponent(selectedModules, catalog);

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
        const result: TerraformComponentModel = await classUnderTest.buildTerraformComponent(selectedModules, catalog);

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

    describe('when BOM module references optional dependent modules', () => {
      const modules: BillOfMaterialModule[] = [
        {name: 'ibm-vpc-subnets'},
        {name: 'ibm-vpc-gateways'},
      ];

      let bom: BillOfMaterialModel;
      let selectedModules: SingleModuleVersion[];
      beforeEach(async () => {
        bom = new BillOfMaterial({spec: {modules}});

        selectedModules = await moduleSelector.resolveBillOfMaterial(catalog, bom);
      });

      test('then associate optional dependent module', async () => {
        const result: TerraformComponentModel = await classUnderTest.buildTerraformComponent(selectedModules, catalog);

        expect(Object.keys(result.stages).length).toEqual(4);

        const module: Optional<Module> = arrayOf(result.stages['ibm-vpc-subnets'].module.version.dependencies)
          .filter((d: any) => d.id === 'gateways')
          .map((d: any) => d._module)
          .mergeMap<Module>()
          .first();

        expect(module.isPresent()).toBeTruthy()
      });
    });

    describe('when BOM module does not reference optional dependent modules', () => {
      const modules: BillOfMaterialModule[] = [
        {name: 'ibm-vpc-subnets'},
      ];

      let bom: BillOfMaterialModel;
      let selectedModules: SingleModuleVersion[];
      beforeEach(async () => {
        bom = new BillOfMaterial({spec: {modules}});

        selectedModules = await moduleSelector.resolveBillOfMaterial(catalog, bom);
      });

      test('then do not associate optional dependent module', async () => {
        const result: TerraformComponentModel = await classUnderTest.buildTerraformComponent(selectedModules, catalog);

        expect(Object.keys(result.stages).length).toEqual(3);

        const module: Optional<Module> = arrayOf(result.stages['ibm-vpc-subnets'].module.version.dependencies)
          .filter(d => d.id === 'gateways')
          .map(d => d._module)
          .mergeMap<Module>()
          .first();

        expect(module.isPresent()).toBeFalsy()
      });
    });

    describe('when BOM module includes module with important variable', () => {
      const modules: BillOfMaterialModule[] = [
        {name: 'ibm-vpc-subnets'},
      ];

      let bom: BillOfMaterialModel;
      let selectedModules: SingleModuleVersion[];
      beforeEach(async () => {
        bom = new BillOfMaterial({spec: {modules}});

        selectedModules = await moduleSelector.resolveBillOfMaterial(catalog, bom);
      });

      test('then the variable should appear in terraform.tfvars', async () => {
        const result: TerraformComponentModel = await classUnderTest.buildTerraformComponent(selectedModules, catalog);

        const tfvarsFile: Optional<TerraformTfvarsFile> = arrayOf(result.files)
          .filter((f: OutputFile) => f.name === 'terraform.template.tfvars')
          .first() as any

        expect(tfvarsFile.isPresent()).toBeTruthy()

        expect((await tfvarsFile.get().contents()).toString()).toContain('_count')
      });
    });

    describe('when BOM module references provider', () => {
      const modules: BillOfMaterialModule[] = [
        {name: 'gitops-storageclass'},
      ];

      let bom: BillOfMaterialModel;
      let selectedModules: SingleModuleVersion[];
      beforeEach(async () => {
        bom = new BillOfMaterial({spec: {modules}});

        selectedModules = await moduleSelector.resolveBillOfMaterial(catalog, bom);
      });

      test('then result should include provider modules', async () => {
        const result: TerraformComponentModel = await classUnderTest.buildTerraformComponent(selectedModules, catalog);

        expect(result.stages['clis']).toBeDefined()
        expect(result.providers?.length).toEqual(1)

        const variable = result.providers?.filter(p => p.name === 'gitops')[0].variables.filter(v => v.name === 'bin_dir')[0]
        expect(variable).toBeDefined()
      });
    });
  });
});
