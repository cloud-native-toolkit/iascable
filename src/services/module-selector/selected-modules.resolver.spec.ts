import {
  BillOfMaterialModule,
  catalogApiV1Version,
  catalogKind,
  Module,
  ModuleDependency
} from '../../models';
import {
  getModuleKey,
  matchInterface,
  matchRefs,
  SelectedModuleResolverImpl,
  updateAliasForDuplicateModules
} from './selected-modules.resolver';
import {Container} from 'typescript-ioc';
import {LoggerApi} from '../../util/logger';
import {NoopLoggerImpl} from '../../util/logger/noop-logger.impl';
import {CatalogLoaderApi} from '../catalog-loader';
import {Catalog} from '../../model-impls/catalog.impl';

describe('selected-modules.resolver', () => {
  test('canary verifies test infrastructure', () => {
    expect(true).toBe(true)
  })

  let catalog: Catalog;
  beforeAll(async () => {
    Container.bind(LoggerApi).to(NoopLoggerImpl);

    const catalogLoader: CatalogLoaderApi = Container.get(CatalogLoaderApi);
    catalog = await catalogLoader.loadCatalog(`file:/${process.cwd()}/test/catalogv1.yaml`)
  });

  describe('given updateAliasForDuplicateModules()', () => {
    describe('when the same module appears twice', () => {
      test('then the aliases should include index suffix', async () => {
        const modules: Module[] = [
          {
            name: 'test'
          },
          {
            name: 'another'
          },
          {
            name: 'test'
          },
          {
            name: 'yet-another'
          },
          {
            name: 'test'
          },
          {
            name: 'another'
          },
          {
            name: 'yet-another',
            alias: 'my-alias'
          }
        ] as any

        const result = modules.map(updateAliasForDuplicateModules)

        expect(result).toEqual([
          {
            name: 'test',
            alias: 'test'
          },
          {
            name: 'another',
            alias: 'another'
          },
          {
            name: 'test',
            alias: 'test1'
          },
          {
            name: 'yet-another',
            alias: 'yet-another'
          },
          {
            name: 'test',
            alias: 'test2'
          },
          {
            name: 'another',
            alias: 'another1'
          },
          {
            name: 'yet-another',
            alias: 'my-alias'
          }
        ])
      });
    });
  })

  describe('given getModuleKey()', () => {
    describe('when module has an alias', () => {
      const alias = 'module-alias'

      let module: Module;
      beforeEach(() => {
        module = {
          alias,
          name: 'bogus'
        } as any
      })

      test('then return the alias', async () => {
        expect(getModuleKey(module)).toEqual(alias)
      })
    })

    describe('when module has a name and no alias', () => {
      const name = 'module-name'

      let module: Module;
      beforeEach(() => {
        module = {
          name
        } as any
      })

      test('then return the name', async () => {
        expect(getModuleKey(module)).toEqual(name)
      })
    })
  })

  describe('given matchRefs()', () => {
    describe('when module id matches refs.source', () => {
      let dep: ModuleDependency;
      let module: Module;

      beforeEach(() => {
        dep = {
          id: 'test',
          refs: [{
            source: 'source1'
          }, {
            source: 'source2'
          }]
        };
        module = {
          id: 'source1'
        } as any
      })

      test('then return true', async () => {
        expect(matchRefs(dep, module, catalog)).toBe(true);
      });
    });

    describe('when module id does not match refs.source', () => {
      let dep: ModuleDependency;
      let module: Module;

      beforeEach(() => {
        dep = {
          id: 'test',
          refs: [{
            source: 'source1'
          }, {
            source: 'source2'
          }]
        };
        module = {
          id: 'source3'
        } as any
      })

      test('then return false', async () => {
        expect(matchRefs(dep, module, catalog)).toBe(false);
      })
    })
  })

  describe('given matchInterface()', () => {
    describe('when module interface matches dep.interface', () => {
      let dep: ModuleDependency;
      let module: Module;

      beforeEach(() => {
        dep = {
          id: 'test',
          interface: 'test-interface'
        };
        module = {
          id: 'source3',
          interfaces: [
            'one-interface',
            'test-interface'
          ]
        } as any
      })

      test('then return true', async () => {
        expect(matchInterface(dep, module)).toBe(true)
      })
    })

    describe('when module interface does not match dep.interface', () => {
      let dep: ModuleDependency;
      let module: Module;

      beforeEach(() => {
        dep = {
          id: 'test',
          interface: 'test-interface'
        };
        module = {
          id: 'source3',
          interfaces: [
            'one-interface',
            'another-interface'
          ]
        } as any
      })

      test('then return false', async () => {
        expect(matchInterface(dep, module)).toBe(false)
      })
    })
  })

  describe('given SelectedModuleResolver', () => {
    let classUnderTest: SelectedModuleResolverImpl
    let baseModules: Module[]
    let catalog: Catalog
    beforeEach(() => {
      // Container.bind(LoggerApi).factory(consoleLoggerFactory(LogLevel.DEBUG))
      baseModules = [{
        id: 'test',
        name: 'test',
        interfaces: ['interface1', `interface2`],
        versions: [{
          dependencies: [{
            id: 'at',
            refs: [{
              source: 'another-test'
            }]
          }, {
            id: 'om',
            refs: [{source: 'one-more', version: '< 2.0.0'}]
          }]
        }]
      }, {
        id: 'another-test',
        category: 'ignore',
        name: 'another-test',
        interfaces: ['interface3'],
        versions: [{
          dependencies: [{
            id: 'om',
            refs: [{source: 'one-more', version: '>= 1.0.0'}]
          }]
        }]
      }, {
        id: 'one-more',
        name: 'one-more',
        versions: [{
          version: '2.0.0'
        }, {
          version: '1.0.0'
        }]
      }, {
        id: 'and-another',
        name: 'and-another',
        interfaces: ['interface2']
      }, {
        id: 'github.com/cloud-native-toolkit/terraform-util-clis',
        name: 'clis',
        versions: [{
          version: 'v1.0.0',
          outputs: [{
            name: 'bin_dir'
          }]
        }]
      }, {
        id: 'provider-test',
        name: 'provider-test',
        versions: [{
          version: 'v1.0.0',
          providers: [{
            name: 'gitops',
            source: 'cloud-native-toolkit/gitops'
          }],
        }]
      }] as any

      catalog = new Catalog({
        apiVersion: catalogApiV1Version,
        kind: catalogKind,
        providers: [{
          name: 'gitops',
          source: 'cloud-native-toolkit/gitops',
          dependencies: [{
            id: 'clis',
            refs: [{source: 'github.com/cloud-native-toolkit/terraform-util-clis'}]
          }],
          variables: [{
            name: 'bin_dir',
            type: 'string',
            moduleRef: {
              id: 'clis',
              output: 'bin_dir'
            }
          }]
        }],
        categories: [{
          category: 'ignore',
          selection: 'single',
          modules: baseModules
        }]
      })

      classUnderTest = new SelectedModuleResolverImpl(catalog)
    })

    describe('given findDependencyInModules()', () => {
      let modules: Module[]
      beforeEach(() => {
        modules = [
          {
            id: 'test',
            name: 'test',
            alias: 'test1',
            interfaces: ['interface1', 'interface2']
          },
          {
            id: 'another-test',
            name: 'another-test',
            alias: 'test2',
          },
          {
            id: 'my-test',
            name: 'my-test',
            alias: 'my-test',
            interfaces: ['interface2']
          }
        ] as any
      })

      describe('when alias matches module and type', () => {
        test('then return the module', async () => {
          expect(classUnderTest.findDependencyInModules(modules, {id: 'test', interface: 'interface2', discriminator: 'my-test'}, {name: 'parent'} as any))
            .toEqual(modules[2])
        })
      })

      describe('when alias matches module and but not type', () => {
        test('then return undefined', async () => {
          expect(classUnderTest.findDependencyInModules(modules, {id: 'test', interface: 'interface3', discriminator: 'my-test'}, {name: 'parent'} as any))
            .toBeUndefined()
        })
      })

      describe('when single module interface matches deps', () => {
        test('then return module', async () => {
          expect(classUnderTest.findDependencyInModules(modules, {id: 'test', interface: 'interface1'}, {name: 'parent'} as any))
            .toEqual(modules[0])
        })
      })

      describe('when multiple modules match with no default alias and strict flag set', () => {
        test('then should throw error', async () => {
          expect(() => {
            classUnderTest.findDependencyInModules(modules, {id: 'test', interface: 'interface2'}, {name: 'parent'} as any)
          }).toThrowError(/More than one module resolves dependency for module/g)
        })

        describe('and when default flag is set on one module', () => {
          beforeEach(() => {
            modules[2].default = true
          })

          test('then resolve using the default module', async () => {
            expect(classUnderTest.findDependencyInModules(modules, {id: 'test', interface: 'interface2'}, {name: 'parent'} as any))
              .toEqual(modules[2])
          });
        });
      })

      describe('when multiple modules match but a default alias is used', () => {
        beforeEach(() => {
          modules[2].originalAlias = 'my-test'
        })
        test('then resolve using the default alias', async () => {
          expect(classUnderTest.findDependencyInModules(modules, {id: 'test', interface: 'interface2'}, {name: 'parent'} as any))
            .toEqual(modules[2])
        });
      })

      describe('when multiple modules match and strict flag not set', () => {
        test('then should return first match', async () => {
          classUnderTest.strict = false

          expect(classUnderTest.findDependencyInModules(modules, {id: 'test', interface: 'interface2'}, {name: 'parent'} as any))
            .toEqual(modules[0])
        });
      });
    })

    describe('given lookupModulesFromDependency()', () => {
      describe('when interface provided', () => {
        test('then match catalog modules with same interface', async () => {
          expect(classUnderTest.lookupModulesFromDependency({id: 'test', interface: 'interface2'}).map(m => m.id))
            .toEqual(['test', 'and-another'])
        });
      })

      describe('when refs provided', () => {
        test('then match catalog modules with dep source', async () => {
          expect(classUnderTest.lookupModulesFromDependency({id: 'test', refs: [{source: 'another-test'}]}))
            .toEqual([baseModules[1]])
        });
      });
    })

    describe('given resolveDependencies()', () => {
      describe('when single module is selected', () => {
        test('then populate dependency tree from catalog', async () => {
          const actual: Module[] = classUnderTest.resolveDependencies(baseModules.filter(m => m.id === 'test'))

          expect(actual.length).toEqual(3)
          // @ts-ignore
          expect(actual[0].versions[0].dependencies[0]._module.name).toEqual(baseModules[1].name)
          expect(actual[2].versions[0].version).toEqual('1.0.0')
        })
      })

      describe('when multiple modules are selected', () => {
        test('then populate dependency tree from selected modules', async () => {
          const actual: Module[] = classUnderTest.resolveDependencies([baseModules[0], baseModules[1]])

          expect(actual.length).toEqual(3)
          // @ts-ignore
          expect(actual[0].versions[0].dependencies[0]._module).toEqual(baseModules[1])
        })
      })

      describe('when the same module appears twice with different aliases', () => {
        test('then resolve the correct module', async () => {
          const modules: Module[] = [
            updateDependencyDiscriminator(baseModules[0], 'am1'),
            updateModuleAlias(baseModules[1], 'am1'),
            updateModuleAlias(baseModules[1], 'am2'),
          ]

          const result: Module[] = classUnderTest.resolveDependencies(modules)

          expect(result.length).toEqual(4)
          // @ts-ignore
          expect(result[0].versions[0].dependencies[0]._module).toEqual(modules[1])
        })
      })

      describe('when the discriminator does not match existing module', () => {
        test('then load a new module from the catalog', async () => {
          const discriminator = 'am3'
          const modules: Module[] = [
            updateDependencyDiscriminator(baseModules[0], discriminator),
            updateModuleAlias(baseModules[1], 'am1'),
            updateModuleAlias(baseModules[1], 'am2'),
          ]

          const result: Module[] = classUnderTest.resolveDependencies(modules)

          expect(result.length).toEqual(5)
          // @ts-ignore
          expect(result[0].versions[0].dependencies[0]._module.alias).toEqual(discriminator)
        })
      })

      describe('when single module is selected and bomModule is defined', () => {
        test('then resolve the correct module', async () => {
          const bomModule: BillOfMaterialModule = {
            dependencies: [{
              id: 'at',
              ref: 'am2'
            }]
          } as any

          const module: Module = Object.assign({}, baseModules[0], {bomModule})

          const modules: Module[] = [
            module,
            updateModuleAlias(baseModules[1], 'am1'),
            updateModuleAlias(baseModules[1], 'am2'),
          ]

          const result: Module[] = classUnderTest.resolveDependencies(modules)

          expect(result.length).toEqual(4)
          // @ts-ignore
          expect(result[0].versions[0].dependencies[0]._module).toEqual(modules[2])
        })
      })

      describe('when module depends in a provider that has dependencies', () => {
        test('then include the provider dependency', async () => {
          const actual: Module[] = classUnderTest.resolveDependencies(baseModules.filter(m => m.id === 'provider-test'))

          expect(actual.length).toEqual(2)
          // @ts-ignore
          expect(actual.map(m => m.name)).toContain('clis')
        })
      })
    })
  })
})

const updateDependencyDiscriminator = (module: Module, discriminator: string) => {
  if (!module.versions[0].dependencies) {
    return module
  }
  const dependency: ModuleDependency = Object.assign({}, module.versions[0].dependencies[0], {discriminator})

  return Object.assign({}, module, {versions: [{dependencies: [dependency]}]})
}

const updateModuleAlias = (module: Module, alias: string): Module => {
  return Object.assign({}, module, {alias})
}
