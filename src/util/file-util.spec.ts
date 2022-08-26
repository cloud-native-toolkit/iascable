import {join} from 'path';
import {chmodRecursive} from './file-util';
import Mock = jest.Mock;

jest.mock('fs');

describe('file-util', () => {
  test('canary verifies test infrastructure', () => {
    expect(true).toBe(true);
  });

  describe('given chmodRecursive()', () => {
    describe('when called', () => {
      const chmodSync = require('fs').chmodSync as Mock

      test('then should be called multiple times', async () => {
        await chmodRecursive(__dirname, 0x777);

        expect(chmodSync).toHaveBeenCalledTimes(4);
        expect(chmodSync.mock.calls.map(x => x[0])).toEqual([
          __dirname,
          join(__dirname, 'logger'),
          join(__dirname, 'question-builder'),
          join(__dirname, 'version-resolver')]
        );
      });
    });
  });
});
