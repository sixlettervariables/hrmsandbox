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
var EventEmitter2 = require('eventemitter2').EventEmitter2;
var hrm = require('hrm-grammar');

var hrm$ProgramError = require('./hrmProgramError.js');
var HrmProgramState = require('./hrmProgramState.js');

var MAX_ITERATIONS = 5000;

var HrmProgram = function (program, options) {
  if (!(this instanceof HrmProgram)) {
    return new HrmProgram(options);
  }

  EventEmitter2.call(this);

  options = options || {};

  this._program = program || { statements: [] };
  this.maxIterations = options.maxIterations || MAX_ITERATIONS;
  this.debug = options.debug;

  this.debugEmit = function () {};
  if (options.debug) {
    this.debugEmit = this.emit;
  }

  // assign labels to their instruction offsets
  this._instructionCount = 0;
  this._labels = {};
  for (var ix = 0; ix < this._program.statements.length; ++ix) {
    var stmt = this._program.statements[ix];
    if (stmt.type == 'label') {
      this._labels[stmt.label] = ix;
    }
    else {
      this._instructionCount++;
    }
  }
};
util.inherits(HrmProgram, EventEmitter2);

function isJump(stmt) {
  return stmt.type === 'jump' ||
         stmt.type === 'jumpz' ||
         stmt.type === 'jumpn';
}

HrmProgram.prototype.execute = function (options) {
  var state = new HrmProgramState(options);

  this.debugEmit('preExecute', state);

  var statements = this._program.statements;
  while (state.ip >= 0 &&
      state.ip < statements.length &&
      state.iterations++ < this.maxIterations) {

    var currentStatement = statements[state.ip];

    this.debugEmit('preTick', state);

    currentStatement._execute(this, state);
    if (state.ip >= 0 && !isJump(currentStatement)) {
      state.ip++;
    }

    this.debugEmit('tick', state);
  }

  this.debugEmit('postExecute', state);

  return {
    iterations: state.iterations - state.labelsHit,
    instructions: this._instructionCount,
    inbox: state.inbox,
    outbox: state.outbox,
    variables: state.variables
  };
};

//
// Extend the commands from hrm-grammar
//
hrm.commands.Inbox.prototype._execute = function (program, state) {
  if (state.inbox.length === 0) {
    program.debugEmit('inbox');
    state.ip = -1;
    state.hand = undefined;
  }
  else {
    var value = state.inbox.shift();
    program.debugEmit('inbox', value);
    state.hand = value;
  }
};

hrm.commands.Outbox.prototype._execute = function (program, state) {
  if (state.hand !== undefined) {
    program.debugEmit('outbox', state.hand);
    state.outbox.unshift(state.hand);
    state.hand = undefined;
  }
  else {
    throw new hrm$ProgramError('Nothing in your hand to outbox!', state);
  }
};

hrm.commands.Copyfrom.prototype._execute = function (program, state) {
  state.hand = state.load(this.arg);
};

hrm.commands.Copyto.prototype._execute = function (program, state) {
  if (state.hand !== undefined) {
    state.hand = state.store(this.arg, state.hand);
  }
  else {
    throw new hrm$ProgramError('Nothing to copy, hand is empty', state);
  }
};

function do_jump(program, state) {
  var label = this.label;
  if (!program._labels.hasOwnProperty(label)) {
    throw new hrm$ProgramError('Undefined label: ' + label, state);
  }
  else if (this.type !== 'jump' && state.hand === undefined) {
    throw new hrm$ProgramError('Cannot ' + this.type + ' with an empty hand', state);
  }

  switch (this.type) {
    case 'jump':
      program.debugEmit('jump', { condition: 'unconditional', label: label });
      state.ip = program._labels[label];
      break;

    case 'jumpz':
      if (state.hand === 0) {
        program.debugEmit('jump', { condition: 'zero', label: label });
        state.ip = program._labels[label];
      }
      else {
        state.ip++;
      }
      break;

    case 'jumpn':
      if (state.hand < 0) {
        program.debugEmit('jump', { condition: 'negative', label: label });
        state.ip = program._labels[label];
      }
      else {
        state.ip++;
      }
      break;

    default:
      throw new hrm$ProgramError('Unsupported jump opcode: ' + this.type, state);
  }
}

hrm.commands.Jump.prototype._execute = do_jump;
hrm.commands.Jumpz.prototype._execute = do_jump;
hrm.commands.Jumpn.prototype._execute = do_jump;

function do_math(program, state) {
  if ((this.type === 'add' || this.type === 'sub') && state.hand === undefined) {
    throw new hrm$ProgramError('Cannot ' + this.type + ' with an empty hand.', state);
  }
  else if (!state.isDefined(this.arg.name)) {
    throw new hrm$ProgramError('Cannot ' + this.type + ' with an undefined variable: ' + this.arg.name, state);
  }

  var value = state.load(this.arg);
  switch (this.type) {
    case 'add':
      if (typeof state.hand === 'number') {
        state.hand += value;
      }
      else {
        throw new hrm$ProgramError('Cannot ' + this.type + ' with the given arguments');
      }
      break;
    case 'sub':
      if (typeof state.hand === 'number') {
        state.hand -= value;
      }
      else {
        state.hand = state.hand.charCodeAt(0) - value.charCodeAt(0);
      }
      break;
    case 'bumpup':
      state.hand = state.store(this.arg, ++value);
      break;
    case 'bumpdn':
      state.hand = state.store(this.arg, --value);
      break;
    default:
      throw new hrm$ProgramError('Unsupported math operation: ' + this.type, state);
  }
}

hrm.commands.Add.prototype._execute = do_math;
hrm.commands.Sub.prototype._execute = do_math;
hrm.commands.Bumpup.prototype._execute = do_math;
hrm.commands.Bumpdn.prototype._execute = do_math;

function NOOP(program, state) {
  state.labelsHit++;
}

hrm.commands.Label.prototype._execute = NOOP;
hrm.commands.Comment.prototype._execute = NOOP;
hrm.commands.Define.prototype._execute = NOOP;

module.exports = {
  parse: function (source, options) {
    options = options || {};
    var program = hrm.parser.parse(source);
    return new HrmProgram(program, options);
  }
};
