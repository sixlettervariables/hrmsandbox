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

var hrm = require('hrm-grammar');
var HrmProgramError = require('./hrmProgramError.js');
var HrmProgramState = require('./hrmProgramState.js');

var MAX_ITERATIONS = 5000;
var MIN_VALUE = -999;
var MAX_VALUE = 999;

function checkValue(value) {
  if (typeof value === 'number') {
    return value >= MIN_VALUE && value <= MAX_VALUE;
  }

  // TODO: improve value checks for chars
  return true;
}

var HrmProgram = function (program, options) {
  if (!(this instanceof HrmProgram)) {
    return new HrmProgram(options);
  }

  options = options || {};

  this._program = program || { statements: [] };
  this.maxIterations = options.maxIterations || MAX_ITERATIONS;
  this.debug = options.debug;

  this._breakpoints = [];

  // assign labels to their instruction offsets
  this._instructionCount = 0;
  this._labels = {};
  for (var ix = 0; ix < this._program.statements.length; ++ix) {
    var stmt = this._program.statements[ix];
    if (stmt.type === 'label') {
      this._labels[stmt.label] = ix;
    }
    else if (stmt.type !== 'define' && stmt.type !== 'comment') {
      this._instructionCount++;
    }
  }
};

function findIndex(list, predicate) {
  var length = list.length;
  for (var i = 0; i < length; i++) {
    if (predicate(list[i], i, list)) {
      return i;
    }
  }
  return -1;
}

HrmProgram.prototype.setBreakpoints = function (breakpoints) {
  var self = this;
  this._breakpoints = breakpoints.map(function (bp) {
      return findIndex(self._program.statements, function (stmt) {
        return stmt._location.start.line === bp;
      });
    }).filter(function (bp) {
      return bp >= 0;
    });
  console.dir(this._breakpoints);
}

HrmProgram.prototype.createState = function (options) {
  options = options || {};
  var state = new HrmProgramState(options);
  return state;
}

HrmProgram.prototype.step = function (state) {
  if (state.ip >= 0 &&
      state.ip < this._program.statements.length &&
      state.iterations++ < MAX_ITERATIONS) {
    var statements = this._program.statements;
    if (!state.isAtBreakpoint && this._breakpoints.indexOf(state.ip) >= 0) {
      state.isAtBreakpoint = true;
      state.labelsHit++;
      return "break";
    }
    else if (state.isAtBreakpoint) {
      state.isAtBreakpoint = false;
    }

    var stmt = statements[state.ip++];
    switch (stmt.type) {
      case 'define':
        state.labelsHit++;
        break;
      case 'comment':
        state.labelsHit++;
        break;
      case 'label':
        state.labelsHit++;
        break;

      case 'inbox':
        state.hand = this.do_inbox(state);
        break;

      case 'outbox':
        state.hand = this.do_outbox(state);
        break;

      case 'copyfrom':
        state.hand = this.do_copyfrom(state, stmt.arg);
        break;

      case 'copyto':
        state.hand = this.do_copyto(state, stmt.arg);
        break;

      case 'add':
      case 'sub':
      case 'bumpup':
      case 'bumpdn':
        state.hand = this.do_math(state, stmt.type, stmt.arg);
        if (!checkValue(state.hand)) {
          throw new HrmProgramError('Value out of bounds', state);
        }
        break;

      case 'jump':
        state.ip = this.do_jump(state, stmt.label);
        break;

      case 'jumpz':
        state.ip = this.do_jumpz(state, stmt.label);
        break;

      case 'jumpn':
        state.ip = this.do_jumpneg(state, stmt.label);
        break;

      default:
        throw new HrmProgramError('Unknown instruction: ' + stmt.type, state);
    }

    return true;
  }
  else {
    return false;
  }
}

HrmProgram.prototype.resume = function (state) {
  while (state.ip >= 0 &&
         state.ip < this._program.statements.length &&
         state.iterations < this.maxIterations) {
    // CAW: see about improving this
    if (this.step(state) === 'break') return 'break';
  }
}

HrmProgram.prototype.execute = function (options) {
  var state = new HrmProgramState(options);

  while (state.ip >= 0 &&
         state.ip < this._program.statements.length &&
         state.iterations < this.maxIterations) {
    // CAW: see about improving this
    if (this.step(state) === 'break') return 'break';
  }
};

HrmProgram.prototype.do_inbox = function (state) {
  if (state.inbox.length) {
    var value = state.inbox.shift();
    if (!checkValue(value)) {
      throw new HrmProgramError('Value out of bounds', state);
    }
    return value;
  } else {
    state.ip = -1;
    state.labelsHit++;
    return undefined;
  }
};

HrmProgram.prototype.do_outbox = function (state) {
  if (state.hand !== undefined) {
    state.outbox.unshift(state.hand);
    return undefined;
  }
  else {
    throw new HrmProgramError('Nothing in your hand to outbox!', state);
  }
};


HrmProgram.prototype.do_copyfrom = function (state, variable) {
  return state.load(variable);
};

HrmProgram.prototype.do_copyto = function (state, variable) {
  if (state.hand !== undefined) {
    return state.store(variable, state.hand);
  }
  else {
    throw new HrmProgramError('Cannot copy to variable with an empty hand', state);
  }
};

HrmProgram.prototype.do_jump = function (state, label) {
  if (!this._labels.hasOwnProperty(label)) {
    throw new HrmProgramError('Unknown label: ' + label, state);
  }

  return this._labels[label];
};

HrmProgram.prototype.do_jumpz = function (state, label) {
  if (state.hand === undefined) {
    throw new HrmProgramError('Cannot jumpz with an empty hand', state);
  }
  else if (!this._labels.hasOwnProperty(label)) {
    throw new HrmProgramError('Unknown label: ' + label, state);
  }

  if (state.hand === 0) {
    return this._labels[label];
  }
  else {
    return state.ip;
  }
};

HrmProgram.prototype.do_jumpneg = function (state, label) {
  if (state.hand === undefined) {
    throw new HrmProgramError('Cannot jumpneg with an empty hand', state);
  }
  else if (!this._labels.hasOwnProperty(label)) {
    throw new HrmProgramError('Unknown label: ' + label, state);
  }

  if (state.hand < 0) {
    return this._labels[label];
  }
  else {
    return state.ip;
  }
};

HrmProgram.prototype.do_math = function(state, op, variable) {
  if (state.hand === undefined) {
    throw new HrmProgramError('Cannot ' + op + ' with an empty hand.', state);
  }
  else if (!state.isDefined(variable.name)) {
    throw new HrmProgramError('Cannot ' + op + ' with an undefined variable: ' + variable.name, state);
  }

  var value = state.load(variable);
  switch (op) {
    case 'add':
      if (typeof state.hand !== 'number' || typeof value !== 'number') {
        throw new HrmProgramError('Cannot add non-numeric arguments', state);
      }
      return state.hand + value;
    case 'sub':
      if (typeof state.hand === 'number') {
        if (typeof value !== 'number') {
          throw new HrmProgramError('Cannot subtract arguments of different types', state);
        }
        return state.hand - value;
      }
      else {
        if (typeof value === 'number') {
          throw new HrmProgramError('Cannot subtract arguments of different types', state);
        }
        return state.hand.charCodeAt(0) - value.charCodeAt(0);
      }
    case 'bumpup':
      if (typeof value !== 'number') {
        throw new HrmProgramError('Cannot bumpup non-numeric argument', state);
      }
      else if (!checkValue(++value)) {
        throw new HrmProgramError('Value out of bounds', state);
      }
      return state.store(variable, value);
    case 'bumpdn':
      if (typeof value !== 'number') {
        throw new HrmProgramError('Cannot bumpdn non-numeric argument', state);
      }
      else if (!checkValue(--value)) {
        throw new HrmProgramError('Value out of bounds', state);
      }
      return state.store(variable, value);
    default:
      throw new HrmProgramError('Unsupported math operation: ' + op, state);
  }
};

function Parse(source, options) {
  options = options || {};

  var program = program = hrm.parser.parse(source);

  return new HrmProgram(program, options);
}

module.exports = {
  parse: Parse
};
