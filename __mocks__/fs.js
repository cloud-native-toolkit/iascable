'use strict';

const fs = jest.requireActual('fs');

fs.chmodSync = jest.fn();

module.exports = fs;
