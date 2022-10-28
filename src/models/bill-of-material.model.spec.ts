import {BillOfMaterial} from '../model-impls';

describe('bill-of-material model', () => {
  test('canary verifies test infrastructure', () => {
    expect(true).toBe(true);
  });

  describe('given getModules()', () => {
    describe('when models are defined with id string', () => {
      const modules = ['module1', 'module2'];

      let classUnderTest: BillOfMaterial;
      beforeEach(() => {
        classUnderTest = new BillOfMaterial({spec: {modules}})
      });

      test('then should resolve modules with id', async () => {
        const actual = BillOfMaterial.getModules(classUnderTest);

        expect(actual).toEqual(modules.map(id => ({id})));
      });
    });

    describe('when models are defined as object with name string', () => {
      const modules = [{name: 'module1'}, {name: 'module2'}];

      let classUnderTest: BillOfMaterial;
      beforeEach(() => {
        classUnderTest = new BillOfMaterial({spec: {modules}})
      });

      test('then should resolve modules with id', async () => {
        const actual = BillOfMaterial.getModules(classUnderTest);

        expect(actual).toEqual(modules);
      });
    });

    describe('when models are defined as object with id string', () => {
      const modules = [{id: 'module1'}, {id: 'module2'}];

      let classUnderTest: BillOfMaterial;
      beforeEach(() => {
        classUnderTest = new BillOfMaterial({spec: {modules}})
      });

      test('then should resolve modules with id', async () => {
        const actual = BillOfMaterial.getModules(classUnderTest);

        expect(actual).toEqual(modules);
      });
    });
  });
});
