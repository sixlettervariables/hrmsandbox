/** hrmsandbox Engine
 *
 * Copyright (C) 2015 Christopher A Watford
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
"use strict";

var util = require('util');

var HrmProgramError = require('./hrmProgramError.js');

var HrmProgramState = function (options) {
  if (!(this instanceof HrmProgramState)) {
    return new HrmProgramState(options);
  }

  options = options || {};

  this.inbox = options.inbox || [];
  this.variables = options.variables || {};
  this.outbox = [];
  this.hand = undefined;

  this.ip = 0;

  // iteration tracking
  this.iterations = 0;
  this.labelsHit = 0; // counts non-statement iterations
}

module.exports = HrmProgramState;

HrmProgramState.prototype.isDefined = function (variable) {
  return this.variables.hasOwnProperty(variable) &&
         this.variables[variable] !== undefined;
};

HrmProgramState.prototype.load = function (variable) {
  if (!this.isDefined(variable.name)) {
    throw new HrmProgramError('Undefined variable: ' + variable.name, this);
  }

  switch (variable.type) {
    case "Identifier":
      var value = this.variables[variable.name];
      return value;

    case "IndirectIdentifier":
      var address = this.variables[variable.name];
      if (typeof address !== 'number' || address < 0) {
        throw new HrmProgramError('Invalid address: ' + address);
      }
      else if (this.isDefined(address)) {
        var value = this.variables[address];
        return value;
      }
      else {
        throw new HrmProgramError('Undefined variable: ' + address, this);
      }
      break;

    default:
      throw new HrmProgramError('Unsupported addressing mode: ' + variable.type, this);
  }
};

HrmProgramState.prototype.store = function (variable, value) {
  if (value === undefined) {
    throw new HrmProgramError('Cannot store undefined value');
  }

  switch (variable.type) {
    case "Identifier":
      return this.variables[variable.name] = value;

    case "IndirectIdentifier":
      if (this.isDefined(variable.name)) {
        var address = this.variables[variable.name];
        if (typeof address !== 'number' || address < 0) {
          throw new HrmProgramError('Invalid address: ' + address);
        }
        return this.variables[address] = value;
      }
      throw new HrmProgramError('Undefined variable: ' + variable.name, this);

    default:
      throw new HrmProgramError('Unsupported addressing mode: ' + variable.type, this);
  }
}
