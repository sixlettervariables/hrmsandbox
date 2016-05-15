(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

window.HrmProgram = require('./hrm-engine.js');
window.HrmProgramState = require('./hrmProgramState.js');
window.HrmProgramError = require('./hrmProgramError.js');
window.HrmLevelData = require('hrm-level-data').filter(function (level) {
  return !level.cutscene;
});
window.HrmLevelData.unshift(
  {
    number: 0,
    name: "HRM Sandbox",
    instructions: "Play around until stuff works, or doesn't.",
    commands: [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    dereferencing: true,
    comments: true,
    labels: true,
    floor: {
      columns: 5,
      rows: 5,
      tiles: { "8": 0, "9": -3 }
    },
    examples: [{
        inbox: [ 1, 2, 3, 4 ],
        outbox: [ ]
    }]
  }
);
window.HrmLevelInboxer = require('hrm-level-inbox-generator');
window.HrmLevelOutboxer = require('hrm-level-outbox-generator');

},{"./hrm-engine.js":2,"./hrmProgramError.js":3,"./hrmProgramState.js":4,"hrm-level-data":10,"hrm-level-inbox-generator":11,"hrm-level-outbox-generator":13}],2:[function(require,module,exports){
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

var MAX_STATEMENTS = 255;
var MAX_COMMENTS = 16;
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
  if (this._program.statements.length > MAX_STATEMENTS) {
    throw new Error('Program exceeded maximum length ('+MAX_STATEMENTS+'): ' + this._program.statements.length);
  }
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
};

HrmProgram.prototype.createState = function (options) {
  options = options || {};
  var state = new HrmProgramState(options);
  return state;
};

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
};

HrmProgram.prototype.resume = function (state) {
  while (state.ip >= 0 &&
         state.ip < this._program.statements.length &&
         state.iterations < this.maxIterations) {
    // CAW: see about improving this
    if (this.step(state) === 'break') return 'break';
  }
};

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
    state.outbox.push(state.hand);
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
  if (op !== 'bumpup' && op !== 'bumpdn' && state.hand === undefined) {
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
      break;//CAW: suppresses jshint false positive
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

  var program = hrm.parser.parse(source);

  return new HrmProgram(program, options);
}

module.exports = {
  parse: Parse
};

},{"./hrmProgramError.js":3,"./hrmProgramState.js":4,"hrm-grammar":6}],3:[function(require,module,exports){
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

function HrmProgramError(message, internalState) {
  this.message  = message;
  this.internalState = internalState;
  this.name = "HrmProgramError";

  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(this, HrmProgramError);
  }

  Error.call(this);
}

util.inherits(HrmProgramError, Error);

module.exports = HrmProgramError;

},{"util":34}],4:[function(require,module,exports){
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
  this.isAtBreakpoint = false;

  // iteration tracking
  this.iterations = 0;
  this.labelsHit = 0; // counts non-statement iterations
};

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
      return this.variables[variable.name];

    case "IndirectIdentifier":
      var address = this.variables[variable.name];
      if (typeof address !== 'number' || address < 0) {
        throw new HrmProgramError('Invalid address: ' + address);
      }
      else if (this.isDefined(address)) {
        return this.variables[address];
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
      this.variables[variable.name] = value;
      return value;

    case "IndirectIdentifier":
      if (this.isDefined(variable.name)) {
        var address = this.variables[variable.name];
        if (typeof address !== 'number' || address < 0) {
          throw new HrmProgramError('Invalid address: ' + address);
        }

        this.variables[address] = value;
        return value;
      }
      throw new HrmProgramError('Undefined variable: ' + variable.name, this);

    default:
      throw new HrmProgramError('Unsupported addressing mode: ' + variable.type, this);
  }
};

},{"./hrmProgramError.js":3,"util":34}],5:[function(require,module,exports){
module.exports = (function() {
  "use strict";

  /*
   * Generated by PEG.js 0.9.0.
   *
   * http://pegjs.org/
   */

  function peg$subclass(child, parent) {
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }

  function peg$SyntaxError(message, expected, found, location) {
    this.message  = message;
    this.expected = expected;
    this.found    = found;
    this.location = location;
    this.name     = "SyntaxError";

    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, peg$SyntaxError);
    }
  }

  peg$subclass(peg$SyntaxError, Error);

  function peg$parse(input) {
    var options = arguments.length > 1 ? arguments[1] : {},
        parser  = this,

        peg$FAILED = {},

        peg$startRuleFunctions = { Start: peg$parseStart },
        peg$startRuleFunction  = peg$parseStart,

        peg$c0 = function(program) { return program; },
        peg$c1 = function(body) {
           var statements = pegutils.optionalList(body);
           return new commands.Program(statements);
         },
        peg$c2 = function(head, tail) {
           return pegutils.buildList(head, tail, 1);
         },
        peg$c3 = function(s) { return s; },
        peg$c4 = function(s) {
           return s;
         },
        peg$c5 = { type: "other", description: "label statement" },
        peg$c6 = ":",
        peg$c7 = { type: "literal", value: ":", description: "\":\"" },
        peg$c8 = function(label) {
           return new commands.Label(location(), label);
         },
        peg$c9 = { type: "other", description: "argument" },
        peg$c10 = function(a) {
           var tile = a.join("");
           if (!validator.isValidTile(tile)) {
             error('Found tile "'+ tile +'", which is not supported by the level');
           }
           return {
             type: "Identifier",
             name: tile
           };
         },
        peg$c11 = { type: "other", description: "indirect argument" },
        peg$c12 = "[",
        peg$c13 = { type: "literal", value: "[", description: "\"[\"" },
        peg$c14 = "]",
        peg$c15 = { type: "literal", value: "]", description: "\"]\"" },
        peg$c16 = function(a) {
           var tile = a.join("");
           if (!validator.canDereference()) {
             error('Found indirect addressing, mode not supported by the level');
           }
           else if (!validator.isValidTile(tile)) {
             error('Found tile "'+ tile +'", which is not supported by the level');
           }
           return {
             type: "IndirectIdentifier",
             name: tile
           };
         },
        peg$c17 = { type: "other", description: "label" },
        peg$c18 = function(head, tail) {
           var name = head + tail.join("");
           if (/(IN|OUT)BOX|COPY(FROM|TO)|ADD|SUB|BUMP(UP|DN)|JUMP(N|Z)?|DEFINE|LABEL|COMMENT/.test(name)) {
             error('Expected label, but keyword ' + name + ' found');
           }
           return name;
         },
        peg$c19 = { type: "other", description: "INBOX" },
        peg$c20 = function() {
           return new commands.Inbox(location());
         },
        peg$c21 = { type: "other", description: "OUTBOX" },
        peg$c22 = function() {
           return new commands.Outbox(location());
         },
        peg$c23 = { type: "other", description: "ADD" },
        peg$c24 = function(i, arg) {
           if (validator.isBlacklisted(i)) {
            error('Found "' + i + '", instruction not allowed by level');
           }
           return new commands.Add(location(), arg);
         },
        peg$c25 = { type: "other", description: "SUB" },
        peg$c26 = function(i, arg) {
           if (validator.isBlacklisted(i)) {
            error('Found "' + i + '", instruction not allowed by level');
           }
           return new commands.Sub(location(), arg);
         },
        peg$c27 = { type: "other", description: "BUMPUP" },
        peg$c28 = function(i, arg) {
           if (validator.isBlacklisted(i)) {
            error('Found "' + i + '", instruction not allowed by level');
           }
           return new commands.Bumpup(location(), arg);
         },
        peg$c29 = { type: "other", description: "BUMPDN" },
        peg$c30 = function(i, arg) {
           if (validator.isBlacklisted(i)) {
            error('Found "' + i + '", instruction not allowed by level');
           }
           return new commands.Bumpdn(location(), arg);
         },
        peg$c31 = { type: "other", description: "COPYTO" },
        peg$c32 = function(i, arg) {
           if (validator.isBlacklisted(i)) {
            error('Found "' + i + '", instruction not allowed by level');
           }
           return new commands.Copyto(location(), arg);
         },
        peg$c33 = { type: "other", description: "COPYFROM" },
        peg$c34 = function(i, arg) {
           if (validator.isBlacklisted(i)) {
            error('Found "' + i + '", instruction not allowed by level');
           }
           return new commands.Copyfrom(location(), arg);
         },
        peg$c35 = { type: "other", description: "JUMP" },
        peg$c36 = function(i, label) {
           if (validator.isBlacklisted(i)) {
            error('Found "' + i + '", instruction not allowed by level');
           }
           return new commands.Jump(location(), label);
         },
        peg$c37 = { type: "other", description: "JUMPZ" },
        peg$c38 = function(i, label) {
           if (validator.isBlacklisted(i)) {
            error('Found "' + i + '", instruction not allowed by level');
           }
           return new commands.Jumpz(location(), label);
         },
        peg$c39 = { type: "other", description: "JUMPN" },
        peg$c40 = function(i, label) {
           if (validator.isBlacklisted(i)) {
            error('Found "' + i + '", instruction not allowed by level');
           }
           return new commands.Jumpn(location(), label);
         },
        peg$c41 = { type: "other", description: "COMMENT Reference" },
        peg$c42 = function(ref) {
           if (!validator.canComment()) {
             error('Found "COMMENT", statement not allowed by level');
           }
           return new commands.Comment(location(), ref.join(""));
         },
        peg$c43 = { type: "other", description: "DEFINE LABEL" },
        peg$c44 = function(ref, data) {
           if (!validator.canLabelTiles()) {
             error('Found "DEFINE LABEL", statement not allowed by level');
           }
           return new commands.Define(location(), "label", ref.name, data);
         },
        peg$c45 = { type: "other", description: "DEFINE COMMENT" },
        peg$c46 = function(ref, data) {
           if (!validator.canComment()) {
             error('Found "DEFINE COMMENT", statement not allowed by level');
           }
           return new commands.Define(location(), "comment", ref.join(""), data);
         },
        peg$c47 = { type: "other", description: "base64" },
        peg$c48 = ";",
        peg$c49 = { type: "literal", value: ";", description: "\";\"" },
        peg$c50 = function(b64) {
          return b64;
         },
        peg$c51 = "INBOX",
        peg$c52 = { type: "literal", value: "INBOX", description: "\"INBOX\"" },
        peg$c53 = "OUTBOX",
        peg$c54 = { type: "literal", value: "OUTBOX", description: "\"OUTBOX\"" },
        peg$c55 = "COPYTO",
        peg$c56 = { type: "literal", value: "COPYTO", description: "\"COPYTO\"" },
        peg$c57 = "COPYFROM",
        peg$c58 = { type: "literal", value: "COPYFROM", description: "\"COPYFROM\"" },
        peg$c59 = "ADD",
        peg$c60 = { type: "literal", value: "ADD", description: "\"ADD\"" },
        peg$c61 = "SUB",
        peg$c62 = { type: "literal", value: "SUB", description: "\"SUB\"" },
        peg$c63 = "BUMPUP",
        peg$c64 = { type: "literal", value: "BUMPUP", description: "\"BUMPUP\"" },
        peg$c65 = "BUMPDN",
        peg$c66 = { type: "literal", value: "BUMPDN", description: "\"BUMPDN\"" },
        peg$c67 = "JUMP",
        peg$c68 = { type: "literal", value: "JUMP", description: "\"JUMP\"" },
        peg$c69 = "JUMPZ",
        peg$c70 = { type: "literal", value: "JUMPZ", description: "\"JUMPZ\"" },
        peg$c71 = "JUMPN",
        peg$c72 = { type: "literal", value: "JUMPN", description: "\"JUMPN\"" },
        peg$c73 = "DEFINE",
        peg$c74 = { type: "literal", value: "DEFINE", description: "\"DEFINE\"" },
        peg$c75 = "COMMENT",
        peg$c76 = { type: "literal", value: "COMMENT", description: "\"COMMENT\"" },
        peg$c77 = "LABEL",
        peg$c78 = { type: "literal", value: "LABEL", description: "\"LABEL\"" },
        peg$c79 = /^[0-9]/,
        peg$c80 = { type: "class", value: "[0-9]", description: "[0-9]" },
        peg$c81 = /^[a-zA-Z]/,
        peg$c82 = { type: "class", value: "[a-zA-Z]", description: "[a-zA-Z]" },
        peg$c83 = /^[A-Za-z0-9+\/=\r\n\t ]/,
        peg$c84 = { type: "class", value: "[A-Za-z0-9+\\/=\\r\\n\\t ]", description: "[A-Za-z0-9+\\/=\\r\\n\\t ]" },
        peg$c85 = function(b64) {
           return b64.join("").replace(/[\r\n\t ]/g, '');
         },
        peg$c86 = { type: "other", description: "comment" },
        peg$c87 = "--",
        peg$c88 = { type: "literal", value: "--", description: "\"--\"" },
        peg$c89 = { type: "any", description: "any character" },
        peg$c90 = { type: "other", description: "whitespace" },
        peg$c91 = " ",
        peg$c92 = { type: "literal", value: " ", description: "\" \"" },
        peg$c93 = "\t",
        peg$c94 = { type: "literal", value: "\t", description: "\"\\t\"" },
        peg$c95 = /^[\r\n]/,
        peg$c96 = { type: "class", value: "[\\r\\n]", description: "[\\r\\n]" },
        peg$c97 = { type: "other", description: "end of line" },
        peg$c98 = "\r\n",
        peg$c99 = { type: "literal", value: "\r\n", description: "\"\\r\\n\"" },
        peg$c100 = "\n",
        peg$c101 = { type: "literal", value: "\n", description: "\"\\n\"" },

        peg$currPos          = 0,
        peg$savedPos         = 0,
        peg$posDetailsCache  = [{ line: 1, column: 1, seenCR: false }],
        peg$maxFailPos       = 0,
        peg$maxFailExpected  = [],
        peg$silentFails      = 0,

        peg$result;

    if ("startRule" in options) {
      if (!(options.startRule in peg$startRuleFunctions)) {
        throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
      }

      peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
    }

    function text() {
      return input.substring(peg$savedPos, peg$currPos);
    }

    function location() {
      return peg$computeLocation(peg$savedPos, peg$currPos);
    }

    function expected(description) {
      throw peg$buildException(
        null,
        [{ type: "other", description: description }],
        input.substring(peg$savedPos, peg$currPos),
        peg$computeLocation(peg$savedPos, peg$currPos)
      );
    }

    function error(message) {
      throw peg$buildException(
        message,
        null,
        input.substring(peg$savedPos, peg$currPos),
        peg$computeLocation(peg$savedPos, peg$currPos)
      );
    }

    function peg$computePosDetails(pos) {
      var details = peg$posDetailsCache[pos],
          p, ch;

      if (details) {
        return details;
      } else {
        p = pos - 1;
        while (!peg$posDetailsCache[p]) {
          p--;
        }

        details = peg$posDetailsCache[p];
        details = {
          line:   details.line,
          column: details.column,
          seenCR: details.seenCR
        };

        while (p < pos) {
          ch = input.charAt(p);
          if (ch === "\n") {
            if (!details.seenCR) { details.line++; }
            details.column = 1;
            details.seenCR = false;
          } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
            details.line++;
            details.column = 1;
            details.seenCR = true;
          } else {
            details.column++;
            details.seenCR = false;
          }

          p++;
        }

        peg$posDetailsCache[pos] = details;
        return details;
      }
    }

    function peg$computeLocation(startPos, endPos) {
      var startPosDetails = peg$computePosDetails(startPos),
          endPosDetails   = peg$computePosDetails(endPos);

      return {
        start: {
          offset: startPos,
          line:   startPosDetails.line,
          column: startPosDetails.column
        },
        end: {
          offset: endPos,
          line:   endPosDetails.line,
          column: endPosDetails.column
        }
      };
    }

    function peg$fail(expected) {
      if (peg$currPos < peg$maxFailPos) { return; }

      if (peg$currPos > peg$maxFailPos) {
        peg$maxFailPos = peg$currPos;
        peg$maxFailExpected = [];
      }

      peg$maxFailExpected.push(expected);
    }

    function peg$buildException(message, expected, found, location) {
      function cleanupExpected(expected) {
        var i = 1;

        expected.sort(function(a, b) {
          if (a.description < b.description) {
            return -1;
          } else if (a.description > b.description) {
            return 1;
          } else {
            return 0;
          }
        });

        while (i < expected.length) {
          if (expected[i - 1] === expected[i]) {
            expected.splice(i, 1);
          } else {
            i++;
          }
        }
      }

      function buildMessage(expected, found) {
        function stringEscape(s) {
          function hex(ch) { return ch.charCodeAt(0).toString(16).toUpperCase(); }

          return s
            .replace(/\\/g,   '\\\\')
            .replace(/"/g,    '\\"')
            .replace(/\x08/g, '\\b')
            .replace(/\t/g,   '\\t')
            .replace(/\n/g,   '\\n')
            .replace(/\f/g,   '\\f')
            .replace(/\r/g,   '\\r')
            .replace(/[\x00-\x07\x0B\x0E\x0F]/g, function(ch) { return '\\x0' + hex(ch); })
            .replace(/[\x10-\x1F\x80-\xFF]/g,    function(ch) { return '\\x'  + hex(ch); })
            .replace(/[\u0100-\u0FFF]/g,         function(ch) { return '\\u0' + hex(ch); })
            .replace(/[\u1000-\uFFFF]/g,         function(ch) { return '\\u'  + hex(ch); });
        }

        var expectedDescs = new Array(expected.length),
            expectedDesc, foundDesc, i;

        for (i = 0; i < expected.length; i++) {
          expectedDescs[i] = expected[i].description;
        }

        expectedDesc = expected.length > 1
          ? expectedDescs.slice(0, -1).join(", ")
              + " or "
              + expectedDescs[expected.length - 1]
          : expectedDescs[0];

        foundDesc = found ? "\"" + stringEscape(found) + "\"" : "end of input";

        return "Expected " + expectedDesc + " but " + foundDesc + " found.";
      }

      if (expected !== null) {
        cleanupExpected(expected);
      }

      return new peg$SyntaxError(
        message !== null ? message : buildMessage(expected, found),
        expected,
        found,
        location
      );
    }

    function peg$parseStart() {
      var s0, s1;

      s0 = peg$currPos;
      s1 = peg$parseProgram();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c0(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseProgram() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parse__();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseLines();
        if (s2 === peg$FAILED) {
          s2 = null;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parse__();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c1(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseLines() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$parse__();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseLine();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          s5 = peg$parse__();
          if (s5 !== peg$FAILED) {
            s6 = peg$parseLine();
            if (s6 !== peg$FAILED) {
              s5 = [s5, s6];
              s4 = s5;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            s5 = peg$parse__();
            if (s5 !== peg$FAILED) {
              s6 = peg$parseLine();
              if (s6 !== peg$FAILED) {
                s5 = [s5, s6];
                s4 = s5;
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c2(s2, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseLine() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parse_();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseStatement();
        if (s2 !== peg$FAILED) {
          s3 = peg$parse_();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c3(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseStatement() {
      var s0, s1, s2, s3, s4;

      s0 = peg$parseUnterminatedStatement();
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseTerminatedStatement();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseComment();
            if (s3 === peg$FAILED) {
              s3 = null;
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseLineTerminatorSequence();
              if (s4 === peg$FAILED) {
                s4 = peg$parseEOF();
              }
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c4(s1);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }

      return s0;
    }

    function peg$parseUnterminatedStatement() {
      var s0;

      s0 = peg$parseLabelStatement();
      if (s0 === peg$FAILED) {
        s0 = peg$parseNoArgStatement();
      }

      return s0;
    }

    function peg$parseTerminatedStatement() {
      var s0;

      s0 = peg$parseLabeledJumpStatement();
      if (s0 === peg$FAILED) {
        s0 = peg$parseOneArgStatement();
        if (s0 === peg$FAILED) {
          s0 = peg$parseDefineStatement();
          if (s0 === peg$FAILED) {
            s0 = peg$parseCommentStatement();
          }
        }
      }

      return s0;
    }

    function peg$parseNoArgStatement() {
      var s0;

      s0 = peg$parseInboxStatement();
      if (s0 === peg$FAILED) {
        s0 = peg$parseOutboxStatement();
      }

      return s0;
    }

    function peg$parseOneArgStatement() {
      var s0;

      s0 = peg$parseAddStatement();
      if (s0 === peg$FAILED) {
        s0 = peg$parseSubStatement();
        if (s0 === peg$FAILED) {
          s0 = peg$parseBumpupStatement();
          if (s0 === peg$FAILED) {
            s0 = peg$parseBumpdnStatement();
            if (s0 === peg$FAILED) {
              s0 = peg$parseCopytoStatement();
              if (s0 === peg$FAILED) {
                s0 = peg$parseCopyfromStatement();
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parseLabeledJumpStatement() {
      var s0;

      s0 = peg$parseJumpzStatement();
      if (s0 === peg$FAILED) {
        s0 = peg$parseJumpnStatement();
        if (s0 === peg$FAILED) {
          s0 = peg$parseJumpStatement();
        }
      }

      return s0;
    }

    function peg$parseDefineStatement() {
      var s0;

      s0 = peg$parseDefineLabelStatement();
      if (s0 === peg$FAILED) {
        s0 = peg$parseDefineCommentStatement();
      }

      return s0;
    }

    function peg$parseLabelStatement() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$currPos;
      peg$silentFails++;
      s2 = peg$parseReservedWord();
      peg$silentFails--;
      if (s2 === peg$FAILED) {
        s1 = void 0;
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseLabel();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 58) {
            s3 = peg$c6;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c7); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c8(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c5); }
      }

      return s0;
    }

    function peg$parseArgument() {
      var s0;

      s0 = peg$parseDirectArgument();
      if (s0 === peg$FAILED) {
        s0 = peg$parseIndirectArgument();
      }

      return s0;
    }

    function peg$parseDirectArgument() {
      var s0, s1, s2;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parseDigit();
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = peg$parseDigit();
        }
      } else {
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c10(s1);
      }
      s0 = s1;
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c9); }
      }

      return s0;
    }

    function peg$parseIndirectArgument() {
      var s0, s1, s2, s3, s4, s5;

      peg$silentFails++;
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 91) {
        s1 = peg$c12;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c13); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseDigit();
          if (s4 !== peg$FAILED) {
            while (s4 !== peg$FAILED) {
              s3.push(s4);
              s4 = peg$parseDigit();
            }
          } else {
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse__();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 93) {
                s5 = peg$c14;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c15); }
              }
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c16(s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c11); }
      }

      return s0;
    }

    function peg$parseLabel() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parseLetter();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseLetter();
        if (s3 === peg$FAILED) {
          s3 = peg$parseDigit();
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseLetter();
          if (s3 === peg$FAILED) {
            s3 = peg$parseDigit();
          }
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c18(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c17); }
      }

      return s0;
    }

    function peg$parseInboxStatement() {
      var s0, s1;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkInbox();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c20();
      }
      s0 = s1;
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c19); }
      }

      return s0;
    }

    function peg$parseOutboxStatement() {
      var s0, s1;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkOutbox();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c22();
      }
      s0 = s1;
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c21); }
      }

      return s0;
    }

    function peg$parseAddStatement() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkAdd();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseArgument();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c24(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c23); }
      }

      return s0;
    }

    function peg$parseSubStatement() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkSub();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseArgument();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c26(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c25); }
      }

      return s0;
    }

    function peg$parseBumpupStatement() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkBumpup();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseArgument();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c28(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c27); }
      }

      return s0;
    }

    function peg$parseBumpdnStatement() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkBumpdn();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseArgument();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c30(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c29); }
      }

      return s0;
    }

    function peg$parseCopytoStatement() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkCopyto();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseArgument();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c32(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c31); }
      }

      return s0;
    }

    function peg$parseCopyfromStatement() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkCopyfrom();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseArgument();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c34(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c33); }
      }

      return s0;
    }

    function peg$parseJumpStatement() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkJump();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseLabel();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c36(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c35); }
      }

      return s0;
    }

    function peg$parseJumpzStatement() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkJumpz();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseLabel();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c38(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c37); }
      }

      return s0;
    }

    function peg$parseJumpnStatement() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkJumpn();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseLabel();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c40(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c39); }
      }

      return s0;
    }

    function peg$parseCommentStatement() {
      var s0, s1, s2, s3, s4;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkComment();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseDigit();
          if (s4 !== peg$FAILED) {
            while (s4 !== peg$FAILED) {
              s3.push(s4);
              s4 = peg$parseDigit();
            }
          } else {
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c42(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c41); }
      }

      return s0;
    }

    function peg$parseDefineLabelStatement() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkDefine();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsetkLabel();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse__();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseDirectArgument();
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseLineTerminatorSequence();
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parse__();
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parseBase64Data();
                      if (s9 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c44(s5, s9);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c43); }
      }

      return s0;
    }

    function peg$parseDefineCommentStatement() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsetkDefine();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsetkComment();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse__();
            if (s4 !== peg$FAILED) {
              s5 = [];
              s6 = peg$parseDigit();
              if (s6 !== peg$FAILED) {
                while (s6 !== peg$FAILED) {
                  s5.push(s6);
                  s6 = peg$parseDigit();
                }
              } else {
                s5 = peg$FAILED;
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseLineTerminatorSequence();
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parse__();
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parseBase64Data();
                      if (s9 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c46(s5, s9);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c45); }
      }

      return s0;
    }

    function peg$parseBase64Data() {
      var s0, s1, s2;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parseBase64();
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 59) {
          s2 = peg$c48;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c49); }
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c50(s1);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c47); }
      }

      return s0;
    }

    function peg$parseReservedWord() {
      var s0;

      s0 = peg$parsetkInbox();
      if (s0 === peg$FAILED) {
        s0 = peg$parsetkOutbox();
        if (s0 === peg$FAILED) {
          s0 = peg$parsetkCopyfrom();
          if (s0 === peg$FAILED) {
            s0 = peg$parsetkCopyto();
            if (s0 === peg$FAILED) {
              s0 = peg$parsetkAdd();
              if (s0 === peg$FAILED) {
                s0 = peg$parsetkSub();
                if (s0 === peg$FAILED) {
                  s0 = peg$parsetkBumpup();
                  if (s0 === peg$FAILED) {
                    s0 = peg$parsetkBumpdn();
                    if (s0 === peg$FAILED) {
                      s0 = peg$parsetkJump();
                      if (s0 === peg$FAILED) {
                        s0 = peg$parsetkJumpz();
                        if (s0 === peg$FAILED) {
                          s0 = peg$parsetkJumpn();
                          if (s0 === peg$FAILED) {
                            s0 = peg$parsetkDefine();
                            if (s0 === peg$FAILED) {
                              s0 = peg$parsetkComment();
                              if (s0 === peg$FAILED) {
                                s0 = peg$parsetkLabel();
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parsetkInbox() {
      var s0;

      if (input.substr(peg$currPos, 5) === peg$c51) {
        s0 = peg$c51;
        peg$currPos += 5;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c52); }
      }

      return s0;
    }

    function peg$parsetkOutbox() {
      var s0;

      if (input.substr(peg$currPos, 6) === peg$c53) {
        s0 = peg$c53;
        peg$currPos += 6;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c54); }
      }

      return s0;
    }

    function peg$parsetkCopyto() {
      var s0;

      if (input.substr(peg$currPos, 6) === peg$c55) {
        s0 = peg$c55;
        peg$currPos += 6;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c56); }
      }

      return s0;
    }

    function peg$parsetkCopyfrom() {
      var s0;

      if (input.substr(peg$currPos, 8) === peg$c57) {
        s0 = peg$c57;
        peg$currPos += 8;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c58); }
      }

      return s0;
    }

    function peg$parsetkAdd() {
      var s0;

      if (input.substr(peg$currPos, 3) === peg$c59) {
        s0 = peg$c59;
        peg$currPos += 3;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c60); }
      }

      return s0;
    }

    function peg$parsetkSub() {
      var s0;

      if (input.substr(peg$currPos, 3) === peg$c61) {
        s0 = peg$c61;
        peg$currPos += 3;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c62); }
      }

      return s0;
    }

    function peg$parsetkBumpup() {
      var s0;

      if (input.substr(peg$currPos, 6) === peg$c63) {
        s0 = peg$c63;
        peg$currPos += 6;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c64); }
      }

      return s0;
    }

    function peg$parsetkBumpdn() {
      var s0;

      if (input.substr(peg$currPos, 6) === peg$c65) {
        s0 = peg$c65;
        peg$currPos += 6;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c66); }
      }

      return s0;
    }

    function peg$parsetkJump() {
      var s0;

      if (input.substr(peg$currPos, 4) === peg$c67) {
        s0 = peg$c67;
        peg$currPos += 4;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c68); }
      }

      return s0;
    }

    function peg$parsetkJumpz() {
      var s0;

      if (input.substr(peg$currPos, 5) === peg$c69) {
        s0 = peg$c69;
        peg$currPos += 5;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c70); }
      }

      return s0;
    }

    function peg$parsetkJumpn() {
      var s0;

      if (input.substr(peg$currPos, 5) === peg$c71) {
        s0 = peg$c71;
        peg$currPos += 5;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c72); }
      }

      return s0;
    }

    function peg$parsetkDefine() {
      var s0;

      if (input.substr(peg$currPos, 6) === peg$c73) {
        s0 = peg$c73;
        peg$currPos += 6;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c74); }
      }

      return s0;
    }

    function peg$parsetkComment() {
      var s0;

      if (input.substr(peg$currPos, 7) === peg$c75) {
        s0 = peg$c75;
        peg$currPos += 7;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c76); }
      }

      return s0;
    }

    function peg$parsetkLabel() {
      var s0;

      if (input.substr(peg$currPos, 5) === peg$c77) {
        s0 = peg$c77;
        peg$currPos += 5;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c78); }
      }

      return s0;
    }

    function peg$parseDigit() {
      var s0;

      if (peg$c79.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c80); }
      }

      return s0;
    }

    function peg$parseLetter() {
      var s0;

      if (peg$c81.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c82); }
      }

      return s0;
    }

    function peg$parseBase64() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = [];
      if (peg$c83.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c84); }
      }
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          if (peg$c83.test(input.charAt(peg$currPos))) {
            s2 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c84); }
          }
        }
      } else {
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c85(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseComment() {
      var s0, s1, s2, s3, s4, s5;

      peg$silentFails++;
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c87) {
        s1 = peg$c87;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c88); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$currPos;
        peg$silentFails++;
        s5 = peg$parseLineTerminator();
        peg$silentFails--;
        if (s5 === peg$FAILED) {
          s4 = void 0;
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
        if (s4 !== peg$FAILED) {
          if (input.length > peg$currPos) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c89); }
          }
          if (s5 !== peg$FAILED) {
            s4 = [s4, s5];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$currPos;
          peg$silentFails++;
          s5 = peg$parseLineTerminator();
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            if (input.length > peg$currPos) {
              s5 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c89); }
            }
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
        if (s2 !== peg$FAILED) {
          s1 = [s1, s2];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c86); }
      }

      return s0;
    }

    function peg$parseWs() {
      var s0, s1;

      peg$silentFails++;
      if (input.charCodeAt(peg$currPos) === 32) {
        s0 = peg$c91;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c92); }
      }
      if (s0 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 9) {
          s0 = peg$c93;
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c94); }
        }
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c90); }
      }

      return s0;
    }

    function peg$parseLineTerminator() {
      var s0;

      if (peg$c95.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c96); }
      }

      return s0;
    }

    function peg$parseLineTerminatorSequence() {
      var s0, s1;

      peg$silentFails++;
      if (input.substr(peg$currPos, 2) === peg$c98) {
        s0 = peg$c98;
        peg$currPos += 2;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c99); }
      }
      if (s0 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 10) {
          s0 = peg$c100;
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c101); }
        }
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c97); }
      }

      return s0;
    }

    function peg$parseEOF() {
      var s0, s1;

      s0 = peg$currPos;
      peg$silentFails++;
      if (input.length > peg$currPos) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c89); }
      }
      peg$silentFails--;
      if (s1 === peg$FAILED) {
        s0 = void 0;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parse_() {
      var s0, s1;

      s0 = [];
      s1 = peg$parseWs();
      while (s1 !== peg$FAILED) {
        s0.push(s1);
        s1 = peg$parseWs();
      }

      return s0;
    }

    function peg$parse__() {
      var s0, s1;

      s0 = [];
      s1 = peg$parseWs();
      if (s1 === peg$FAILED) {
        s1 = peg$parseComment();
        if (s1 === peg$FAILED) {
          s1 = peg$parseLineTerminatorSequence();
        }
      }
      while (s1 !== peg$FAILED) {
        s0.push(s1);
        s1 = peg$parseWs();
        if (s1 === peg$FAILED) {
          s1 = peg$parseComment();
          if (s1 === peg$FAILED) {
            s1 = peg$parseLineTerminatorSequence();
          }
        }
      }

      return s0;
    }


      var thisParser = this;

      var commands = require('../lib/hrm-commands.js');
      var validator = require('../lib/validator.js')(this.hrm$options);
      var pegutils = require('../lib/pegutils.js');


    peg$result = peg$startRuleFunction();

    if (peg$result !== peg$FAILED && peg$currPos === input.length) {
      return peg$result;
    } else {
      if (peg$result !== peg$FAILED && peg$currPos < input.length) {
        peg$fail({ type: "end", description: "end of input" });
      }

      throw peg$buildException(
        null,
        peg$maxFailExpected,
        peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
        peg$maxFailPos < input.length
          ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
          : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
      );
    }
  }

  return {
    SyntaxError: peg$SyntaxError,
    parse:       peg$parse
  };
})();
},{"../lib/hrm-commands.js":7,"../lib/pegutils.js":8,"../lib/validator.js":9}],6:[function(require,module,exports){
/** hrm-grammar
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

var strict = require('./build/hrm.js');
var commands = require('./lib/hrm-commands.js');

function createWrapper(parser) {
  return {
    parse: function (source, options) {
      strict.hrm$options = options || {};
      return parser.parse(source);
    }
  };
}

module.exports = {
  parser: createWrapper(strict),
  commands: commands
};

},{"./build/hrm.js":5,"./lib/hrm-commands.js":7}],7:[function(require,module,exports){
/** hrm-grammar
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

var Inbox = function (location) {
  if (!(this instanceof Inbox)) {
    return new Inbox(location);
  }

  this.type = 'inbox';
  this._location = location;
};

var Outbox = function (location) {
  if (!(this instanceof Outbox)) {
    return new Outbox(location);
  }

  this.type = 'outbox';
  this._location = location;
};

var Copyfrom = function (location, arg) {
  if (!(this instanceof Copyfrom)) {
    return new Copyfrom(location, arg);
  }

  this.type = 'copyfrom';
  this.arg = arg;
  this._location = location;
};

var Copyto = function (location, arg) {
  if (!(this instanceof Copyto)) {
    return new Copyto(location, arg);
  }

  this.type = 'copyto';
  this.arg = arg;
  this._location = location;
};

var Add = function (location, arg) {
  if (!(this instanceof Add)) {
    return new Add(location, arg);
  }

  this.type = 'add';
  this.arg = arg;
  this._location = location;
};

var Sub = function (location, arg) {
  if (!(this instanceof Sub)) {
    return new Sub(location, arg);
  }

  this.type = 'sub';
  this.arg = arg;
  this._location = location;
};

var Bumpup = function (location, arg) {
  if (!(this instanceof Bumpup)) {
    return new Bumpup(location, arg);
  }

  this.type = 'bumpup';
  this.arg = arg;
  this._location = location;
};

var Bumpdn = function (location, arg) {
  if (!(this instanceof Bumpdn)) {
    return new Bumpdn(location, arg);
  }

  this.type = 'bumpdn';
  this.arg = arg;
  this._location = location;
};

var Jump = function (location, label) {
  if (!(this instanceof Jump)) {
    return new Jump(location, label);
  }

  this.type = 'jump';
  this.label = label;
  this._location = location;
};

var Jumpz = function (location, label) {
  if (!(this instanceof Jumpz)) {
    return new Jumpz(location, label);
  }

  this.type = 'jumpz';
  this.label = label;
  this._location = location;
};

var Jumpn = function (location, label) {
  if (!(this instanceof Jumpn)) {
    return new Jumpn(location, label);
  }

  this.type = 'jumpn';
  this.label = label;
  this._location = location;
};

var Comment = function (location, ref) {
  if (!(this instanceof Comment)) {
    return new Comment(location, ref);
  }

  this.type = 'comment';
  this.ref = ref;
  this._location = location;
};

var Define = function (location, what, ref, data) {
  if (!(this instanceof Define)) {
    return new Define(location, what, ref, data);
  }

  this.type = 'define';
  this.what = what;
  this.ref = ref;
  this.data = data;
  this._location = location;
};

var Label = function (location, label) {
  if (!(this instanceof Label)) {
    return new Label(location, label);
  }

  this.type = 'label';
  this.label = label;
  this._location = location;
};

var Program = function (statements) {
  if (!(this instanceof Program)) {
    return new Program(statements);
  }

  this._ast = statements;
  this.statements = statements.filter(isExecutable);
  this.statements.filter(function (stmt) {
    return !isLabel(stmt);
  }).forEach(addLineNumber);

  this.comments = statements.filter(isComment);
  this.imageDefinitions = statements.filter(isImageDef);

  this.labels = this.statements.filter(isLabel);
  var labels = this.labelMap = this.labels.reduce(function (map, stmt) {
    map[stmt.label] = stmt;
    return map;
  }, {});

  this.undefinedLabels = statements.reduce(function (list, stmt) {
    if (isJump(stmt)) {
      if (!labels.hasOwnProperty(stmt.label)) {
        list.push({ label: stmt.label, referencedBy: stmt });
      }
    }
    return list;
  }, []);
};

module.exports = {
  Inbox: Inbox,
  Outbox: Outbox,
  Copyfrom: Copyfrom,
  Copyto: Copyto,
  Add: Add,
  Sub: Sub,
  Bumpup: Bumpup,
  Bumpdn: Bumpdn,
  Jump: Jump,
  Jumpz: Jumpz,
  Jumpn: Jumpn,
  Comment: Comment,
  Define: Define,
  Label: Label,
  Program: Program
};

function isLabel(stmt) {
  return stmt && stmt.type == 'label';
}

function isJump(stmt) {
  return stmt &&
    (stmt.type == 'jump' ||
     stmt.type == 'jumpn' ||
     stmt.type == 'jumpz');
}

function isExecutable(stmt) {
  if (!stmt) return false;
  switch (stmt.type) {
    case 'define':
    case 'comment':
      return false;
  }
  return true;
}

function isComment(stmt) {
  return stmt && stmt.type === 'comment';
}

function isImageDef(stmt) {
  return stmt && stmt.type === 'define';
}

function addLineNumber(stmt, index) {
  if (stmt) {
    stmt.lineNumber = index + 1;
  }
  return stmt;
}

},{"util":34}],8:[function(require,module,exports){
/** hrm-grammar
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

module.exports = {};

function extractList(list, index) {
  var result = new Array(list.length), i;

  for (i = 0; i < list.length; i++) {
    result[i] = list[i][index];
  }

  return result;
}

module.exports.buildList = function (head, tail, index) {
  return [head].concat(extractList(tail, index));
};

module.exports.optionalList = function (value) {
  return value !== null ? value : [];
};

},{}],9:[function(require,module,exports){
/** hrm-grammar
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

module.exports = function (options) {
  var OPTIONS = options || {};
  var LEVEL = OPTIONS.level;
  return {
      options: OPTIONS,
      level: LEVEL,

      isBlacklisted: function (command) {
        if (this.level && this.level.commands) {
          return this.level.commands.indexOf(command) < 0;
        }
        return false;
      },

      isValidTile: function (tile) {
        if (this.options.validateTiles && this.level) {
          return this.level.floor &&
                 tile >= 0 &&
                 tile < (this.level.floor.columns * this.level.floor.rows);
        }
        return true;
      },

      canDereference: function () {
        return this.level === undefined ||
               this.level.dereferencing;
      },

      canComment: function () {
        return this.level === undefined ||
               this.level.comments;
      },

      canLabelTiles: function () {
        return this.level === undefined ||
               this.level.labels;
      }
  };
};

},{}],10:[function(require,module,exports){
module.exports=[
  {
    "number": 1,
    "name": "Mail Room",
    "instructions": "Drag commands into this area to build a program.\n\nYour program should tell your worker to grab each thing from the INBOX, and drop it into the OUTBOX.",
    "commands": [ "INBOX", "OUTBOX" ],
    "examples": [
      {
        "inbox": [ 1, 9, 4 ],
        "outbox": [ 1, 9, 4 ]
      },
      {
        "inbox": [ 4, 3, 3 ],
        "outbox": [ 4, 3, 3 ]
      }
    ],
    "challenge": {
      "size": 6,
      "speed": 6
    }
  },
  {
    "number": 2,
    "name": "Busy Mail Room",
    "instructions": "Grab each thing from the INBOX, and drop each one into the OUTBOX.\n\nYou got a new command! You can drag JUMP's arrow to jump to different lines within your program.",
    "commands": [ "INBOX", "OUTBOX", "JUMP" ],
    "examples": [
      {
        "inbox": [ "B", "O", "O", "T", "S", "E", "Q" ],
        "outbox": [ "B", "O", "O", "T", "S", "E", "Q" ]
      }
    ],
    "challenge": {
      "size": 3,
      "speed": 25
    }
  },
  {
    "number": 3,
    "name": "Copy Floor",
    "instructions": "Ignore the INBOX for now, and just send the following 3 letters to the OUTBOX:\n\nB U G\n\nThe Facilities Management staff has placed some items over there on the carpet for you. If only there were a way you could pick them up...",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "JUMP" ],
    "floor": {
      "columns": 3,
      "rows": 2,
      "tiles": [ "U", "J", "X", "G", "B", "E" ]
    },
    "examples": [
      {
        "inbox": [ -99, -99, -99, -99 ],
        "outbox": [ "B", "U", "G" ]
      }
    ],
    "challenge": {
      "size": 6,
      "speed": 6
    }
  },
  {
    "number": 4,
    "name": "Scrambler Handler",
    "instructions": "Grab the first TWO things from the INBOX and drop them into the OUTBOX in the reverse order. Repeat until the INBOX is empty.\n\nYou got a new command! Feel free to COPYTO wherever you like on the carpet. It will be cleaned later.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "JUMP" ],
    "floor": {
      "columns": 3,
      "rows": 1
    },
    "examples": [
      {
        "inbox": [ 4, 8, "A", "E", 2, 5 ],
        "outbox": [ 8, 4, "E", "A", 5, 2 ]
      }
    ],
    "challenge": {
      "size": 7,
      "speed": 21
    }
  },
  {
    "number": 5,
    "name": "Coffee Time",
    "cutscene": true
  },
  {
    "number": 6,
    "name": "Rainy Summer",
    "instructions": "For each two things in the INBOX, add them together, and put the result in the OUTBOX.\n\nYou got a new command! It ADDs the contents of a tile on the floor to whatever value you're currently holding.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "JUMP" ],
    "floor": {
      "columns": 3,
      "rows": 1
    },
    "examples": [
      {
        "inbox": [ 3, 3, 1, 4, -3, 5, 0, -1 ],
        "outbox": [ 6, 5, 2, -1 ]
      }
    ],
    "challenge": {
      "size": 6,
      "speed": 24
    }
  },
  {
    "number": 7,
    "name": "Zero Exterminator",
    "instructions": "Send all things that ARE NOT ZERO to the OUTBOX.\n\nYou got a new command! It jumps ONLY if the value you are holding is ZERO. Otherwise it continues to the next line.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "JUMP", "JUMPZ" ],
    "floor": {
      "columns": 3,
      "rows": 3
    },
    "examples": [
      {
        "inbox": [ 8, 0, -4, "A", 0, 0, 9, 0 ],
        "outbox": [ 8, -4, "A", 9 ]
      }
    ],
    "challenge": {
      "size": 4,
      "speed": 23
    }
  },
  {
    "number": 8,
    "name": "Tripler Room",
    "instructions": "For each thing in the INBOX, TRIPLE it. And OUTBOX the result.\n\nSelf improvement tip: Where are we going with this? Please leave the high level decisions to management.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "JUMP" ],
    "floor": {
      "columns": 3,
      "rows": 1
    },
    "examples": [
      {
        "inbox": [ 7, -5, 5, 0 ],
        "outbox": [ 21, -15, 15, 0 ]
      }
    ],
    "challenge": {
      "size": 6,
      "speed": 24
    }
  },
  {
    "number": 9,
    "name": "Zero Preservation Initiative",
    "instructions": "Send only the ZEROs to the OUTBOX.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "JUMP", "JUMPZ" ],
    "floor": {
      "columns": 3,
      "rows": 3
    },
    "examples": [
      {
        "inbox": [ 2, 0, 1, "B", 0, 0, 6, 0 ],
        "outbox": [ 0, 0, 0, 0 ]
      }
    ],
    "challenge": {
      "size": 5,
      "speed": 25
    }
  },
  {
    "number": 10,
    "name": "Octoplier Suite",
    "instructions": "For each thing in the INBOX, multiply it by 8, and put the result in the OUTBOX.\n\nUsing a bunch of ADD commands is easy, but WASTEFUL! Can you do it using only 3 ADD commands? Management is watching.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "JUMP" ],
    "floor": {
      "columns": 5,
      "rows": 1
    },
    "examples": [
      {
        "inbox": [ 2, -1, 3, 0 ],
        "outbox": [ 16, -8, 24, 0 ]
      }
    ],
    "challenge": {
      "size": 9,
      "speed": 36
    }
  },
  {
    "number": 11,
    "name": "Sub Hallway",
    "instructions": "For each two things in the INBOX, first subtract the 1st from the 2nd and put the result in the OUTBOX. AND THEN, subtract the 2nd from the 1st and put the result in the OUTBOX. Repeat.\n\nYou got a new command! SUBtracts the contents of a tile on the floor FROM whatever value you're currently holding.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "JUMP", "JUMPZ" ],
    "floor": {
      "columns": 3,
      "rows": 1
    },
    "examples": [
      {
        "inbox": [ 4, 5, 8, 4, -9, -9, 5, -3 ],
        "outbox": [ 1, -1, -4, 4, 0, 0, -8, 8 ]
      }
    ],
    "challenge": {
      "size": 10,
      "speed": 40
    }
  },
  {
    "number": 12,
    "name": "Tetracontiplier",
    "instructions": "For each thing in the INBOX, multiply it by 40, and put the result in the OUTBOX.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "JUMP" ],
    "floor": {
      "columns": 5,
      "rows": 1
    },
    "examples": [
      {
        "inbox": [ 2, -6, 5, 0 ],
        "outbox": [ 80, -240, 200, 0 ]
      }
    ],
    "challenge": {
      "size": 14,
      "speed": 56
    }
  },
  {
    "number": 13,
    "name": "Equalization Room",
    "instructions": "Get two things from the INBOX. If they are EQUAL, put ONE of them in the OUTBOX. Discard non-equal pairs. Repeat!\n\nYou got... COMMENTS! You can use them, if you like, to mark sections of your program.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "JUMP", "JUMPZ" ],
    "comments": true,
    "floor": {
      "columns": 1,
      "rows": 3
    },
    "examples": [
      {
        "inbox": [ 6, 1, 8, 8, 5, 0, -4, -4 ],
        "outbox": [ 8, -4 ]
      }
    ],
    "challenge": {
      "size": 9,
      "speed": 27
    }
  },
  {
    "number": 14,
    "name": "Maximization Room",
    "instructions": "Grab TWO things form the INBOX, and put only the BIGGER of the two in the OUTBOX. If they are equal, just pick either one. Repeat!\n\nYou got a new command! Jumps only if the thing you're holding is negative. (Less than zero.) Otherwise continues to the next line.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "JUMP", "JUMPZ", "JUMPN" ],
    "comments": true,
    "floor": {
      "columns": 3,
      "rows": 1
    },
    "examples": [
      {
        "inbox": [ 4, 9, -8, -4, 9, 9, -6, -3 ],
        "outbox": [ 9, -4, 9, -3 ]
      }
    ],
    "challenge": {
      "size": 10,
      "speed": 34
    }
  },
  {
    "number": 15,
    "name": "Employee Morale Insertion",
    "cutscene": true
  },
  {
    "number": 16,
    "name": "Absolute Positivity",
    "instructions": "Send each thing from the INBOX to the OUTBOX, BUT, if a number is negative, first remove its negative sign.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "JUMP", "JUMPZ", "JUMPN" ],
    "comments": true,
    "floor": {
      "columns": 1,
      "rows": 3
    },
    "examples": [
      {
        "inbox": [ 2, -6, -5, 0, -3, -7, 9 ],
        "outbox": [ 2, 6, 5, 0, 3, 7, 9 ]
      }
    ],
    "challenge": {
      "size": 8,
      "speed": 36
    }
  },
  {
    "number": 17,
    "name": "Exclusive Lounge",
    "instructions": "For each TWO things in the INBOX:\n\nSend a 0 to the OUTBOX if they have the same sign. (Both positive or both negative.)\n\nSend a 1 to the OUTBOX if their signs are different. Repeat until the INBOX is empty.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "JUMP", "JUMPZ", "JUMPN" ],
    "comments": true,
    "floor": {
      "columns": 2,
      "rows": 3,
      "tiles": {
        "4": 0,
        "5": 1
      }
    },
    "examples": [
      {
        "inbox": [ 3, 5, -2, -6, 1, -9, -8, 7 ],
        "outbox": [ 0, 0, 1, 1 ]
      }
    ],
    "challenge": {
      "size": 12,
      "speed": 28
    }
  },
  {
    "number": 18,
    "name": "Sabbatical Beach Paradise",
    "cutscene": true
  },
  {
    "number": 19,
    "name": "Countdown",
    "instructions": "For each number in the INBOX, send that number to the OUTBOX, followed by all numbers down to (or up to) zero. It's a countdown!\n\nYou got new commands! They add ONE or subtract ONE from an item on the floor. The result is given back to you, and for your convenience, also written right back to the floor. BUMP!",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "comments": true,
    "floor": {
      "columns": 5,
      "rows": 2
    },
    "examples": [
      {
        "inbox": [ 8, -5, 0, 3 ],
        "outbox": [ 8, 7, 6, 5, 4, 3, 2, 1, 0, -5, -4, -3, -2, -1, 0, 0, 3, 2, 1, 0 ]
      }
    ],
    "challenge": {
      "size": 10,
      "speed": 82
    }
  },
  {
    "number": 20,
    "name": "Multiplication Workshop",
    "instructions": "For each two things in the INBOX, multiply them, and OUTBOX the result. Don't worry about negative numbers for now.\n\nYou got... LABELS! They can help you remember the purpose of each tile on the floor. Just tap any tile on the floor to edit.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 2,
      "tiles": {
        "9": 0
      }
    },
    "examples": [
      {
        "inbox": [ 9, 4, 1, 7, 7, 0, 0, 8, 4, 2 ],
        "outbox": [ 36, 7, 0, 0, 8 ]
      }
    ],
    "challenge": {
      "size": 15,
      "speed": 109
    }
  },
  {
    "number": 21,
    "name": "Zero Terminated Sum",
    "instructions": "The INBOX is filled with zero terminated strings! What's that? Ask me. Your Boss.\n\nAdd together all the numbers in each string. When you reach the end of a string (marked by a ZERO), put your sum in the OUTBOX. Reset and report for each string.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 3,
      "rows": 2,
      "tiles": {
        "5": 0
      }
    },
    "examples": [
      {
        "inbox": [ 7, 7, 0, 2, -9, 8, 0, 0, 0, 2, -9, 1, 2, -8, 1, 0 ],
        "outbox": [ 14, 1, 0, 0, -11 ]
      }
    ],
    "challenge": {
      "size": 10,
      "speed": 72
    }
  },
  {
    "number": 22,
    "name": "Fibonacci Visitor",
    "instructions": "For each thing in the INBOX, send to the OUTBOX the full Fibonacci Sequence up to, but not exceeding that value. For example, if INBOX is 10, OUTBOX should be 1 1 2 3 5 8. What's a Fibonacci Sequence? Ask your boss, or a friendly search box.\n\n1 1 2 3 5 8 13 21 34 55 89 ...",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 2,
      "tiles": {
        "9": 0
      }
    },
    "examples": [
      {
        "inbox": [ 5, 20 ],
        "outbox": [ 1, 1, 2, 3, 5, 1, 1, 2, 3, 5, 8, 13 ]
      }
    ],
    "challenge": {
      "size": 19,
      "speed": 156
    }
  },
  {
    "number": 23,
    "name": "The Littlest Number",
    "instructions": "For each zero terminated string in the INBOX, send to the OUTBOX only the SMALLEST number you've seen in that string. You will never be given an empty string. Reset and repeat for each string.\n\nWhat's a \"zero terminated string\"? Go ask your boss on the previous floor!",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 2
    },
    "examples": [
      {
        "inbox": [ 8, 15, 2, 0, 19, 14, 8, 4, 0, 57, 47, 20, 44, 40, 0 ],
        "outbox": [ 2, 4, 20 ]
      }
    ],
    "challenge": {
      "size": 13,
      "speed": 75
    }
  },
  {
    "number": 24,
    "name": "Mod Module",
    "instructions": "For each two things in the INBOX, OUTBOX the remainder that would result if you had divided the first by the second. Don't worry, you don't actually have to divide. And don't worry about negative numbers for now.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 2,
      "rows": 5
    },
    "examples": [
      {
        "inbox": [ 5, 2, 6, 2, 4, 6, 0, 8 ],
        "outbox": [ 1, 0, 4, 0 ]
      }
    ],
    "challenge": {
      "size": 12,
      "speed": 57
    }
  },
  {
    "number": 25,
    "name": "Cumulative Countdown",
    "instructions": "For each thing in the INBOX, OUTBOX the sum of itself plus all numbers down to zero. For example, if INBOX is 3, OUTBOX should be 6, because 3+2+1 = 6.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 3,
      "rows": 2,
      "tiles": {
        "5": 0
      }
    },
    "examples": [
      {
        "inbox": [ 3, 3, 0, 8 ],
        "outbox": [ 6, 6, 0, 36 ]
      }
    ],
    "challenge": {
      "size": 12,
      "speed": 82
    }
  },
  {
    "number": 26,
    "name": "Small Divide",
    "instructions": "For each two things in the INBOX, how many times does the second fully fit into the first? Don't worry about negative numbers, divide by zero, or remainders.\n\nSelf improvement tip: This might be a good time to practice copying and pasting from a previous assignment!",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 2,
      "rows": 5,
      "tiles": {
        "9": 0
      }
    },
    "examples": [
      {
        "inbox": [ 9, 3, 7, 3, 3, 6, 0, 9 ],
        "outbox": [ 3, 2, 0, 0 ]
      }
    ],
    "challenge": {
      "size": 15,
      "speed": 76
    }
  },
  {
    "number": 27,
    "name": "Midnight Petroleum",
    "cutscene": true
  },
  {
    "number": 28,
    "name": "Three Sort",
    "instructions": "For each THRREE THINGS in the INBOX, send them to the OUTBOX in order from smallest to largest.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 2
    },
    "examples": [
      {
        "inbox": [ 8, 5, 2, 3, 5, 8, 6, -1, 3, 9, 6, -1 ],
        "outbox": [ 2, 5, 8, 3, 5, 8, -1, 3, 6, -1, 6, 9 ]
      }
    ],
    "challenge": {
      "size": 34,
      "speed": 78
    }
  },
  {
    "number": 29,
    "name": "Storage Floor",
    "instructions": "Imagine each thing in the INBOX is an address. And each address refers to a tile 0-9 on the floor. Your task: For each address in the INBOX, pick up the letter at that address and OUTBOX it.\n\nCongratulations! You can now access tiles on the floor INDIRECTLY! Observe this example to see how it works, compared to what you've been doing so far:",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "dereferencing": true,
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 3,
      "tiles": [ "N", "K", "A", "E", "R", "D", "O", "L", "Y", "J", null, null, 8 ]
    },
    "examples": [
      {
        "inbox": [ 7, 3, 3, 8, 8 ],
        "outbox": [ "L", "E", "E", "Y", "Y" ]
      }
    ],
    "challenge": {
      "size": 5,
      "speed": 25
    }
  },
  {
    "number": 30,
    "name": "String Storage Floor",
    "instructions": "Each thing in the INBOX is an address of a tile on the floor. For each address provided in the INBOX, OUTBOX the requested item from the floor and ALL FOLLOWING items on the floor until you reach a ZERO. Repeat!",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "dereferencing": true,
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 5,
      "tiles": [ "G", "E", "T", 0, "T", "H", 0, "T", "A", "R", 0, "A", "W", "A", "K", "E", 0, "I", "S", 0, "X", "X", "X", 0 ]
    },
    "examples": [
      {
        "inbox": [ 4, 15, 7, 0, 22, 17, 11, 20, 2, 13, 4, 17, 22 ],
        "outbox": [ "T", "H", "E", "T", "A", "R", "G", "E", "T", "X", "I", "S", "A", "W", "A", "K", "E", "X", "X", "X", "T", "A", "K", "E", "T", "H", "I", "S", "X" ]
      }
    ],
    "challenge": {
      "size": 7,
      "speed": 203
    }
  },
  {
    "number": 31,
    "name": "String Reverse",
    "instructions": "For each zero terminated string in the INBOX, reverse it and put the result in the OUTBOX. Repeat!",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "dereferencing": true,
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 3,
      "tiles": {
        "14": 0
      }
    },
    "examples": [
      {
        "inbox": [ "T", "E", "A", 0, "M", "O", "R", "E", 0, "B", "U", "G", 0 ],
        "outbox": [ "A", "E", "T", "E", "R", "O", "M", "G", "U", "B" ]
      }
    ],
    "challenge": {
      "size": 11,
      "speed": 122
    }
  },
  {
    "number": 32,
    "name": "Inventory Report",
    "instructions": "For each thing in the INBOX, send to the OUTBOX the total number of matching items on the FLOOR.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "dereferencing": true,
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 4,
      "tiles": [ "B", "A", "X", "B", "C", "X", "A", "B", "A", "X", "C", "B", "A", "B", 0 ]
    },
    "examples": [
      {
        "inbox": [ "X", "A", "C", "B" ],
        "outbox": [ 3, 4, 2, 5 ]
      }
    ],
    "challenge": {
      "size": 16,
      "speed": 393
    }
  },
  {
    "number": 33,
    "name": "Where's Carol?",
    "cutscene": true
  },
  {
    "number": 34,
    "name": "Vowel Incinerator",
    "instructions": "Send everything from the INBOX to the OUTBOX, except the vowels.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "dereferencing": true,
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 2,
      "tiles": [ "A", "E", "I", "O", "U", 0 ]
    },
    "examples": [
      {
        "inbox": [ "C", "O", "D", "E", "U", "P", "L", "A", "K", "E" ],
        "outbox": [ "C", "D", "P", "L", "K" ]
      }
    ],
    "challenge": {
      "size": 13,
      "speed": 323
    }
  },
  {
    "number": 35,
    "name": "Duplicate Removal",
    "instructions": "Send everything from the INBOX to the OUTBOX, unless you've seen the same value before. Discard any duplicates.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "dereferencing": true,
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 3,
      "tiles": {
        "14": 0
      }
    },
    "examples": [
      {
        "inbox": [ "A", "C", "E", "E", "B", "C", "C", "A", "D", "E" ],
        "outbox": [ "A", "C", "E", "B", "D" ]
      }
    ],
    "challenge": {
      "size": 17,
      "speed": 167
    }
  },
  {
    "number": 36,
    "name": "Alphabetizer",
    "instructions": "The INBOX contains exactly two words. Determine which word comes first, if you were to order them alphabetically, and send only that word to the OUTBOX.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "dereferencing": true,
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 5,
      "tiles": {
        "23": 0,
        "24": 10
      }
    },
    "examples": [
      {
        "inbox": [ "U", "N", "I", "X", 0, "U", "N", "T", "I", "E", 0 ],
        "outbox": [ "U", "N", "I", "X" ]
      }
    ],
    "challenge": {
      "size": 39,
      "speed": 109
    }
  },
  {
    "number": 37,
    "name": "Scavenger Chain",
    "instructions": "Each pair on the floor contains:\n1. data\n2. the address of another one of the pairs\n\nA scrambled chain! Each thing in the INBOX is an address of one of the pairs. OUTBOX the data for that pair, and also the data in all the following pairs in the chain. The chain ends when you reach a negative address. Repeat until the INBOX is empty.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "dereferencing": true,
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 5,
      "tiles": {
        "0": "E",
        "1": 13,
        "3": "C",
        "4": 23,
        "10": "P",
        "11": 20,
        "13": "S",
        "14": 3,
        "20": "E",
        "21": -1,
        "23": "A",
        "24": 10
      }
    },
    "examples": [
      {
        "inbox": [ 23, 0 ],
        "outbox": [ "A", "P", "E", "E", "S", "C", "A", "P", "E" ]
      }
    ],
    "challenge": {
      "size": 8,
      "speed": 63
    }
  },
  {
    "number": 38,
    "name": "Digit Exploder",
    "instructions": "Grab each number from the INBOX, and send its digits to the OUTBOX. For example, 123 becomes 1, 2, 3.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "dereferencing": true,
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 3,
      "rows": 4,
      "tiles": {
        "9": 0,
        "10": 10,
        "11": 100
      }
    },
    "examples": [
      {
        "inbox": [ 705, 8, 60, 744 ],
        "outbox": [ 7, 0, 5, 8, 6, 0, 7, 4, 4 ]
      }
    ],
    "challenge": {
      "size": 30,
      "speed": 165
    }
  },
  {
    "number": 39,
    "name": "Re-Coordinator",
    "instructions": "Each number in the INBOX is an address of a tile on the floor. Send to the OUTBOX the coordinates of that tile, column first, row second.\n\nFor example, an address of 6 has coordinates 2, 1. You may ask your boss for more examples.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "dereferencing": true,
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 4,
      "rows": 4,
      "tiles": {
        "14": 0,
        "15": 4
      }
    },
    "examples": [
      {
        "inbox": [ 1, 5, 5, 5 ],
        "outbox": [ 1, 0, 1, 1, 1, 1, 1, 1 ]
      }
    ],
    "challenge": {
      "size": 14,
      "speed": 76
    }
  },
  {
    "number": 40,
    "name": "Prime Factory",
    "instructions": "For each thing in the INBOX, send its PRIME FACTORS to the OUTBOX in order from smallest to largest.",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "dereferencing": true,
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 5,
      "tiles": {
        "24": 0
      }
    },
    "examples": [
      {
        "inbox": [ 13, 18, 11 ],
        "outbox": [ 13, 2, 3, 3, 11 ]
      }
    ],
    "challenge": {
      "size": 28,
      "speed": 399
    }
  },
  {
    "number": 41,
    "name": "Sorting Floor",
    "instructions": "For each zero terminated string in the INBOX, SORT the contents of the string, smallest first, biggest last, and put the results in the OUTBOX. Repeat for each string!",
    "commands": [ "INBOX", "OUTBOX", "COPYFROM", "COPYTO", "ADD", "SUB", "BUMPUP", "BUMPDN", "JUMP", "JUMPZ", "JUMPN" ],
    "dereferencing": true,
    "comments": true,
    "labels": true,
    "floor": {
      "columns": 5,
      "rows": 5,
      "tiles": {
        "24": 0
      }
    },
    "examples": [
      {
        "inbox": [ 91, 21, 46, 0, "T", "H", "I", "N", "K", 0, 86, 85, 83, 37, 32, 51, 19, 62, 72, 59, 0, 66, 0 ],
        "outbox": [ 21, 46, 91, "H", "I", "K", "N", "T", 19, 32, 37, 51, 59, 62, 72, 83, 85, 86, 66 ]
      }
    ],
    "challenge": {
      "size": 34,
      "speed": 714
    }
  },
  {
    "number": 42,
    "name": "End Program. Congratulations.",
    "cutscene": true
  }
]

},{}],11:[function(require,module,exports){
var pick = require('./pick'),
    levels = require('hrm-level-data');

var tilesForLevel = {};

levels.forEach(function (level) {
    tilesForLevel[level.number] = level.floor && level.floor.tiles;
});

var generators = {
    /*** Mail Room ***/
    '1': function () {
        return pick.exactly(3).numbersBetween(1, 9).toArray();
    },
    /*** Busy Mail Room ***/
    '2': function () {
        return pick.between(6, 15).letters().toArray();
    },
    /*** Copy Floor ***/
    '3': function () {
        return [ -99, -99, -99, -99 ];
    },
    /*** Scrambler Handler ***/
    '4': function () {
        return [].concat(
            pick.exactly(1).pairsOf().numbersBetween(1, 10).toArray(),
            pick.exactly(1).pairsOf().letters().toArray(),
            pick.exactly(1).pairsOf().numbersBetween(1, 10).toArray()
        );
    },
    /*** Coffee Time ***/
    '5': null,
    /*** Rainy Summer ***/
    '6': function () {
        return pick.between(3, 6).pairsOf().numbersBetween(-9, 9).toArray();
    },
    /*** Zero Exterminator ***/
    '7': function () {
        return pick.between(6, 15).letters().or().numbersBetween(-9, 9).toArray();
    },
    /*** Tripler Room ***/
    '8': function () {
        return pick.between(3, 6).numbersBetween(-9, 9).toArray();
    },
    /*** Zero Preservation Initiative ***/
    '9': function () {
        return pick.between(6, 15).letters().or().numbersBetween(-9, 9).toArray();
    },
    /*** Octoplier Suite ***/
    '10': function () {
        return pick.between(3, 6).numbersBetween(-9, 9).toArray();
    },
    /*** Sub Hallway ***/
    '11': function () {
        return pick.between(3, 6).pairsOf().numbersBetween(-9, 9).toArray();
    },
    /*** Tetracontiplier ***/
    '12': function () {
        return pick.between(3, 6).numbersBetween(-9, 9).toArray();
    },
    /*** Equalization Room ***/
    '13': function () {
        return pick.exactly(4).pairsOf().numbersBetween(-9, 9).toArray();
    },
    /*** Maximization Room ***/
    '14': function () {
        return pick.between(3, 6).pairsOf().numbersBetween(-9, 9).toArray();
    },
    /*** Employee Morale Insertion ***/
    '15': null,
    /*** Absolute Positivity ***/
    '16': function () {
        return pick.exactly(7).numbersBetween(-9, 9).toArray();
    },
    /*** Exclusive Lounge ***/
    '17': function () {
        return pick.exactly(4).pairsOf().nonZero().numbersBetween(-9, 9).toArray();
    },
    /*** Sabbatical Beach Paradise ***/
    '18': null,
    /*** Countdown ***/
    '19': function () {
        return pick.exactly(4).numbersBetween(-9, 9).toArray();
    },
    /*** Multiplication Workshop ***/
    '20': function () {
        return pick.exactly(5).pairsOf().numbersBetween(0, 9).toArray();
    },
    /*** Zero Terminated Sum ***/
    '21': function () {
        return [].concat(
            pick.between(0, 5).nonZero().numbersBetween(-9, 9).toArray().concat(0),
            pick.between(0, 5).nonZero().numbersBetween(-9, 9).toArray().concat(0),
            pick.between(0, 5).nonZero().numbersBetween(-9, 9).toArray().concat(0)
        );
    },
    /*** Fibonacci Visitor ***/
    '22': function () {
        return pick.exactly(2).numbersBetween(5, 25).toArray();
    },
    /*** The Littlest Number ***/
    '23': function () {
        return [].concat(
            pick.between(3, 5).numbersBetween(1, 99).toArray().concat(0),
            pick.between(3, 5).numbersBetween(1, 99).toArray().concat(0),
            pick.between(3, 5).numbersBetween(1, 99).toArray().concat(0)
        );
    },
    /*** Mod Module ***/
    '24': function () {
        return pick.exactly(4).pairsOf().numbersBetween(1, 9).toArray(); // @todo allow 0 in dividend
    },
    /*** Cumulative Countdown ***/
    '25': function () {
        return pick.exactly(4).numbersBetween(0, 9).toArray();
    },
    /*** Small Divide ***/
    '26': function () {
        return pick.exactly(4).pairsOf().numbersBetween(1, 9).toArray(); // @todo allow 0 in dividend
    },
    /*** Midnight Petroleum ***/
    '27': null,
    /*** Three Sort ***/
    '28': function () {
        return pick.exactly(4).triplesOf().numbersBetween(-9, 9).toArray();
    },
    /*** Storage Floor ***/
    '29': function () {
        return pick.between(4, 8).numbersBetween(0, 9).toArray();
    },
    /*** String Storage Floor ***/
    '30': function () {
        return [ 4, 15, 7, 0, 22, 17, 11, 20, 2, 13, 4, 17, 22 ];
    },
    /*** String Reverse ***/
    '31': function () {
        return [].concat(
            pick.between(1, 5).letters().toArray().concat(0),
            pick.between(1, 5).letters().toArray().concat(0),
            pick.between(1, 5).letters().toArray().concat(0)
        );
    },
    /*** Inventory Report ***/
    '32': function (tiles) {
        var letterMap = {};

        tiles.forEach(function (tile) {
            if (tile !== 0) {
                letterMap[tile] = true;
            }
        });

        return pick.exactly(4).from(function () {
            var letters = Object.keys(letterMap),
                letter = letters[Math.floor(Math.random() * letters.length)];

            delete letterMap[letter];

            return letter;
        }).toArray();
    },
    /*** Where's Carol? ***/
    '33': null,
    /*** Vowel Incinerator ***/
    '34': function () {
        return pick.exactly(10).letters().toArray();
    },
    /*** Duplicate Removal ***/
    '35': function () {
        return pick.exactly(10).letters().toArray();
    },
    /*** Alphabetizer ***/
    '36': function () {
        return [].concat(
            pick.between(3, 6).letters().toArray().concat(0),
            pick.between(3, 6).letters().toArray().concat(0)
        );
    },
    /*** Scavenger Chain ***/
    '37': function () {
        return [ 23, 0 ];
    },
    /*** Digit Exploder ***/
    '38': function () {
        return pick.exactly(4).numbersBetween(1, 999).toArray();
    },
    /*** Re-Coordinator ***/
    '39': function () {
        return pick.exactly(4).numbersBetween(0, 15).toArray();
    },
    /*** Prime Factory ***/
    '40': function () {
        return pick.exactly(3).numbersBetween(2, 30).toArray(); // @todo .primes().or().nonPrimes()
    },
    /*** Sorting Floor ***/
    '41': function () {
        return [].concat(
            pick.between(1, 10).nonZero().numbersBetween(1, 10).toArray().concat(0),
            pick.between(1, 10).letters().toArray().concat(0),
            pick.between(1, 10).nonZero().numbersBetween(1, 10).toArray().concat(0)
        );
    },
    /*** End Program. Congratulations. ***/
    '42': null
};

exports.generate = function (levelNumber) {
    var generator = generators[levelNumber];

    if (!generator) {
        return null;
    }

    return generator(tilesForLevel[levelNumber]);
};

},{"./pick":12,"hrm-level-data":10}],12:[function(require,module,exports){
// @todo Assert state/chain transitions

function randomNumberBetween(min, max, nonZero) {
    var number;

    do {
        number = Math.floor(Math.random() * (max - min + 1)) + min;
    } while (nonZero && number === 0);

    return number;
}

function Slots(count) {
    this._count = count;
}

Slots.prototype.toArray = function () {
    return this._slots.slice(0);
};

Slots.prototype.pairsOf = function () {
    this._count *= 2;
    return this;
};

Slots.prototype.triplesOf = function () {
    this._count *= 3;
    return this;
};

Slots.prototype.numbersBetween = function (min, max) {
    this._slots = this._slots || [];

    for (var i = 0; i < this._count; i++) {
        if (this._or && Math.random() > 0.5) {
            continue;
        }
        this._slots[i] = randomNumberBetween(min, max, this._nonZero);
    }

    this._or = false;

    return this;
};

Slots.prototype.letters = function () {
    this._slots = this._slots || [];

    var a = 'A'.charCodeAt(0),
        z = 'Z'.charCodeAt(0);

    for (var i = 0; i < this._count; i++) {
        if (this._or && Math.random() > 0.5) {
            continue;
        }
        this._slots[i] = String.fromCharCode(randomNumberBetween(a, z));
    }

    this._or = false;

    return this;
};

Slots.prototype.from = function (factory) {
    this._slots = this._slots || [];

    for (var i = 0; i < this._count; i++) {
        if (this._or && Math.random() > 0.5) {
            continue;
        }
        this._slots[i] = factory();
    }

    this._or = false;

    return this;
};

Slots.prototype.or = function () {
    this._or = true;
    return this;
};

Slots.prototype.nonZero = function () {
    this._nonZero = true;
    return this;
};

exports.exactly = function (count) {
    return new Slots(count);
};

exports.between = function (min, max) {
    return new Slots(randomNumberBetween(min, max));
};

},{}],13:[function(require,module,exports){
var pf = require('quick-primefactors'),
    levels = require('hrm-level-data');

var tilesForLevel = {};

levels.forEach(function (level) {
    tilesForLevel[level.number] = level.floor && level.floor.tiles;
});

function splitStrings(arr) {
    var strings = [],
        zeroPos;

    while (arr.length) {
        zeroPos = arr.indexOf(0);
        strings.push(arr.slice(0, zeroPos));
        arr = arr.slice(zeroPos + 1);
    }

    return strings;
}

function splitGroups(arr, groupSize) {
    var strings = [],
        zeroPos;

    for (var i = 0; i < arr.length; i += groupSize) {
        strings.push(arr.slice(i, i + groupSize));
    }

    return strings;
}

var generators = {
    /*** Mail Room ***/
    '1': function (inbox) {
        // Direct copy
        return inbox.slice(0);
    },
    /*** Busy Mail Room ***/
    '2': function (inbox) {
        // Direct copy
        return inbox.slice(0);
    },
    /*** Copy Floor ***/
    '3': function () {
        // Hard-coded
        return [ "B", "U", "G" ];
    },
    /*** Scrambler Handler ***/
    '4': function (inbox) {
        // Output each pair with the items sorted in reverse order
        return splitGroups(inbox, 2).reduce(function (outbox, pair) {
            return outbox.concat(pair.sort(function (a, b) {
                return a === b
                    ? 0
                    : a < b
                        ? 1
                        : -1;
            }));
        }, []);
    },
    /*** Coffee Time ***/
    '5': null,
    /*** Rainy Summer ***/
    '6': function (inbox) {
        // Output the sum of each pair
        return splitGroups(inbox, 2).map(function (pair) {
            return pair[0] + pair[1];
        });
    },
    /*** Zero Exterminator ***/
    '7': function (inbox) {
        // Filter out zeros
        return inbox.filter(function (item) {
            return item !== 0;
        });
    },
    /*** Tripler Room ***/
    '8': function (inbox) {
        // Multiply the numbers by 3
        return inbox.map(function (item) {
            return item * 3;
        });
    },
    /*** Zero Preservation Initiative ***/
    '9': function (inbox) {
        // Preserve zeros
        return inbox.filter(function (item) {
            return item === 0;
        });
    },
    /*** Octoplier Suite ***/
    '10': function (inbox) {
        // Multiply the numbers by 8
        return inbox.map(function (item) {
            return item * 8;
        });
    },
    /*** Sub Hallway ***/
    '11': function (inbox) {
        // Output difference of each pair, both ways
        return splitGroups(inbox, 2)
            .map(function (pair) {
                var diff = pair[1] - pair[0];

                return [ diff, -diff ];
            })
            .reduce(function (outbox, diffs) {
                return outbox.concat(diffs);
            });
    },
    /*** Tetracontiplier ***/
    '12': function (inbox) {
        // Multiply the numbers by 40
        return inbox.map(function (item) {
            return item * 40;
        });
    },
    /*** Equalization Room ***/
    '13': function (inbox) {
        // Output one of equal pairs
        return splitGroups(inbox, 2)
            .filter(function (pair) {
                return pair[0] === pair[1];
            })
            .map(function (pair) {
                return pair[0];
            });
    },
    /*** Maximization Room ***/
    '14': function (inbox) {
        // Output the maximum of each pair
        return splitGroups(inbox, 2).map(function (pair) {
            return Math.max.apply(null, pair);
        });
    },
    /*** Employee Morale Insertion ***/
    '15': null,
    /*** Absolute Positivity ***/
    '16': function (inbox) {
        // Output absolute values
        return inbox.map(Math.abs);
    },
    /*** Exclusive Lounge ***/
    '17': function (inbox) {
        // For each pair, output 1 if the signs are the same, 0 if different
        return splitGroups(inbox, 2).map(function (pair) {
            return pair[0] * pair[1] < 0 ? 1 : 0;
        });
    },
    /*** Sabbatical Beach Paradise ***/
    '18': null,
    /*** Countdown ***/
    '19': function (inbox) {
        return inbox.reduce(function (outbox, item) {
            if (item >= 0) {
                for (var i = item; i >= 0; i--) {
                    outbox.push(i);
                }
            } else {
                for (var i = item; i <= 0; i++) {
                    outbox.push(i);
                }
            }

            return outbox;
        }, []);
    },
    /*** Multiplication Workshop ***/
    '20': function (inbox) {
        // For each pair, output their product
        return splitGroups(inbox, 2).map(function (pair) {
            return pair[0] * pair[1];
        });
    },
    /*** Zero Terminated Sum ***/
    '21': function (inbox) {
        return splitStrings(inbox)
            .map(function (string) {
                return string.reduce(function (sum, item) {
                    return sum + item;
                }, 0);
            });
    },
    /*** Fibonacci Visitor ***/
    '22': function (inbox) {
        return inbox.reduce(function (outbox, item) {
            var i = 1,
                j = 1,
                tmp;

            do {
                outbox.push(i);
                tmp = j;
                j += i;
                i = tmp;
            } while (i <= item);

            return outbox;
        }, []);
    },
    /*** The Littlest Number ***/
    '23': function (inbox) {
        return splitStrings(inbox).map(function (string) {
            return Math.min.apply(null, string);
        });
    },
    /*** Mod Module ***/
    '24': function (inbox) {
        // For each pair, output the modulus
        return splitGroups(inbox, 2).map(function (pair) {
            return pair[0] % pair[1];
        });
    },
    /*** Cumulative Countdown ***/
    '25': function (inbox) {
        // Sum of all numbers up to and including item
        return inbox.map(function (item) {
            return item * (item + 1) / 2;
        });
    },
    /*** Small Divide ***/
    '26': function (inbox) {
        // For each pair, output the quotient
        return splitGroups(inbox, 2).map(function (pair) {
            return Math.floor(pair[0] / pair[1]);
        });
    },
    /*** Midnight Petroleum ***/
    '27': null,
    /*** Three Sort ***/
    '28': function (inbox) {
        // For each triple, sort then output
        return splitGroups(inbox, 3).reduce(function (outbox, triplet) {
            return outbox.concat(triplet.sort());
        }, []);
    },
    /*** Storage Floor ***/
    '29': function (inbox, tiles) {
        // Lookup floor tiles
        return inbox.map(function (item) {
            return tiles[item];
        });
    },
    /*** String Storage Floor ***/
    '30': function (inbox, tiles) {
        // Output strings from the floor
        return inbox.reduce(function (outbox, item) {
            do {
                outbox.push(tiles[item]);
            } while (tiles[++item]);

            return outbox;
        }, []);
    },
    /*** String Reverse ***/
    '31': function (inbox) {
        // Reverse strings and output
        return splitStrings(inbox).reduce(function (outbox, string) {
            return outbox.concat(string.reverse());
        }, []);
    },
    /*** Inventory Report ***/
    '32': function (inbox, tiles) {
        // Count occurence of item in tiles
        return inbox.map(function (item) {
            return tiles.filter(function (tile) {
                return tile === item;
            }).length;
        });
    },
    /*** Where's Carol? ***/
    '33': null,
    /*** Vowel Incinerator ***/
    '34': function (inbox, tiles) {
        // Drop the vowels
        return inbox.filter(function (item) {
            return tiles.indexOf(item) === -1;
        });
    },
    /*** Duplicate Removal ***/
    '35': function (inbox) {
        var seen = {};

        // Drop duplicates
        return inbox.filter(function (item) {
            if (seen[item]) {
                return false;
            } else {
                seen[item] = true;
                return true;
            }
        });
    },
    /*** Alphabetizer ***/
    '36': function (inbox) {
        // Output the smaller of two strings
        return splitStrings(inbox).slice(0, 2).reduce(function (first, second) {
            var firstSmallerOrEqual = true;

            first.some(function (item, idx) {
                if (idx === second.length || item > second[idx]) {
                    firstSmallerOrEqual = false;
                    return true;
                } else if (item < second[idx]) {
                    return true;
                }
            });

            return firstSmallerOrEqual ? first : second;
        });
    },
    /*** Scavenger Chain ***/
    '37': function (inbox, tiles) {
        // Follow address chains and output letters
        return inbox.reduce(function (outbox, item) {
            while (item !== -1) {
                outbox.push(tiles[item]);
                item = tiles[item + 1];
            }

            return outbox;
        }, []);
    },
    /*** Digit Exploder ***/
    '38': function (inbox) {
        // Output digits of each number
        return inbox.reduce(function (outbox, item) {
            return outbox.concat(item.toString().split(''));
        }, []);
    },
    /*** Re-Coordinator ***/
    '39': function (inbox) {
        // Output coordinates of each tile
        return inbox.reduce(function (outbox, item) {
            return outbox.concat(item % 4, Math.floor(item / 4));
        }, []);
    },
    /*** Prime Factory ***/
    '40': function (inbox) {
        // Output prime factors smallest to largest of each number
        return inbox.reduce(function (outbox, item) {
            return outbox.concat(pf(item));
        }, []);
    },
    /*** Sorting Floor ***/
    '41': function (inbox) {
        // Split strings, sort items in each string, then output all strings
        return splitStrings(inbox)
            .map(function (string) {
                return string.sort();
            })
            .reduce(function (output, string) {
                return output.concat(string);
            });
    },
    /*** End Program. Congratulations. ***/
    '42': null
};

exports.generate = function (levelNumber, inbox) {
    var generator = generators[levelNumber];

    if (!generator) {
        return null;
    }

    return generator(inbox, tilesForLevel[levelNumber]);
};

},{"hrm-level-data":10,"quick-primefactors":31}],14:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],15:[function(require,module,exports){
/**
 * lodash 3.3.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var baseIsEqual = require('lodash._baseisequal'),
    bindCallback = require('lodash._bindcallback'),
    isArray = require('lodash.isarray'),
    pairs = require('lodash.pairs');

/** Used to match property names within property paths. */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\n\\]|\\.)*?\1)\]/,
    reIsPlainProp = /^\w*$/,
    rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;

/**
 * Converts `value` to a string if it's not one. An empty string is returned
 * for `null` or `undefined` values.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  return value == null ? '' : (value + '');
}

/**
 * The base implementation of `_.callback` which supports specifying the
 * number of arguments to provide to `func`.
 *
 * @private
 * @param {*} [func=_.identity] The value to convert to a callback.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function baseCallback(func, thisArg, argCount) {
  var type = typeof func;
  if (type == 'function') {
    return thisArg === undefined
      ? func
      : bindCallback(func, thisArg, argCount);
  }
  if (func == null) {
    return identity;
  }
  if (type == 'object') {
    return baseMatches(func);
  }
  return thisArg === undefined
    ? property(func)
    : baseMatchesProperty(func, thisArg);
}

/**
 * The base implementation of `get` without support for string paths
 * and default values.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array} path The path of the property to get.
 * @param {string} [pathKey] The key representation of path.
 * @returns {*} Returns the resolved value.
 */
function baseGet(object, path, pathKey) {
  if (object == null) {
    return;
  }
  if (pathKey !== undefined && pathKey in toObject(object)) {
    path = [pathKey];
  }
  var index = 0,
      length = path.length;

  while (object != null && index < length) {
    object = object[path[index++]];
  }
  return (index && index == length) ? object : undefined;
}

/**
 * The base implementation of `_.isMatch` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to inspect.
 * @param {Array} matchData The propery names, values, and compare flags to match.
 * @param {Function} [customizer] The function to customize comparing objects.
 * @returns {boolean} Returns `true` if `object` is a match, else `false`.
 */
function baseIsMatch(object, matchData, customizer) {
  var index = matchData.length,
      length = index,
      noCustomizer = !customizer;

  if (object == null) {
    return !length;
  }
  object = toObject(object);
  while (index--) {
    var data = matchData[index];
    if ((noCustomizer && data[2])
          ? data[1] !== object[data[0]]
          : !(data[0] in object)
        ) {
      return false;
    }
  }
  while (++index < length) {
    data = matchData[index];
    var key = data[0],
        objValue = object[key],
        srcValue = data[1];

    if (noCustomizer && data[2]) {
      if (objValue === undefined && !(key in object)) {
        return false;
      }
    } else {
      var result = customizer ? customizer(objValue, srcValue, key) : undefined;
      if (!(result === undefined ? baseIsEqual(srcValue, objValue, customizer, true) : result)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * The base implementation of `_.matches` which does not clone `source`.
 *
 * @private
 * @param {Object} source The object of property values to match.
 * @returns {Function} Returns the new function.
 */
function baseMatches(source) {
  var matchData = getMatchData(source);
  if (matchData.length == 1 && matchData[0][2]) {
    var key = matchData[0][0],
        value = matchData[0][1];

    return function(object) {
      if (object == null) {
        return false;
      }
      return object[key] === value && (value !== undefined || (key in toObject(object)));
    };
  }
  return function(object) {
    return baseIsMatch(object, matchData);
  };
}

/**
 * The base implementation of `_.matchesProperty` which does not clone `srcValue`.
 *
 * @private
 * @param {string} path The path of the property to get.
 * @param {*} srcValue The value to compare.
 * @returns {Function} Returns the new function.
 */
function baseMatchesProperty(path, srcValue) {
  var isArr = isArray(path),
      isCommon = isKey(path) && isStrictComparable(srcValue),
      pathKey = (path + '');

  path = toPath(path);
  return function(object) {
    if (object == null) {
      return false;
    }
    var key = pathKey;
    object = toObject(object);
    if ((isArr || !isCommon) && !(key in object)) {
      object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
      if (object == null) {
        return false;
      }
      key = last(path);
      object = toObject(object);
    }
    return object[key] === srcValue
      ? (srcValue !== undefined || (key in object))
      : baseIsEqual(srcValue, object[key], undefined, true);
  };
}

/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}

/**
 * A specialized version of `baseProperty` which supports deep paths.
 *
 * @private
 * @param {Array|string} path The path of the property to get.
 * @returns {Function} Returns the new function.
 */
function basePropertyDeep(path) {
  var pathKey = (path + '');
  path = toPath(path);
  return function(object) {
    return baseGet(object, path, pathKey);
  };
}

/**
 * The base implementation of `_.slice` without an iteratee call guard.
 *
 * @private
 * @param {Array} array The array to slice.
 * @param {number} [start=0] The start position.
 * @param {number} [end=array.length] The end position.
 * @returns {Array} Returns the slice of `array`.
 */
function baseSlice(array, start, end) {
  var index = -1,
      length = array.length;

  start = start == null ? 0 : (+start || 0);
  if (start < 0) {
    start = -start > length ? 0 : (length + start);
  }
  end = (end === undefined || end > length) ? length : (+end || 0);
  if (end < 0) {
    end += length;
  }
  length = start > end ? 0 : ((end - start) >>> 0);
  start >>>= 0;

  var result = Array(length);
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

/**
 * Gets the propery names, values, and compare flags of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the match data of `object`.
 */
function getMatchData(object) {
  var result = pairs(object),
      length = result.length;

  while (length--) {
    result[length][2] = isStrictComparable(result[length][1]);
  }
  return result;
}

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey(value, object) {
  var type = typeof value;
  if ((type == 'string' && reIsPlainProp.test(value)) || type == 'number') {
    return true;
  }
  if (isArray(value)) {
    return false;
  }
  var result = !reIsDeepProp.test(value);
  return result || (object != null && value in toObject(object));
}

/**
 * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` if suitable for strict
 *  equality comparisons, else `false`.
 */
function isStrictComparable(value) {
  return value === value && !isObject(value);
}

/**
 * Converts `value` to an object if it's not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Object} Returns the object.
 */
function toObject(value) {
  return isObject(value) ? value : Object(value);
}

/**
 * Converts `value` to property path array if it's not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Array} Returns the property path array.
 */
function toPath(value) {
  if (isArray(value)) {
    return value;
  }
  var result = [];
  baseToString(value).replace(rePropName, function(match, number, quote, string) {
    result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
}

/**
 * Gets the last element of `array`.
 *
 * @static
 * @memberOf _
 * @category Array
 * @param {Array} array The array to query.
 * @returns {*} Returns the last element of `array`.
 * @example
 *
 * _.last([1, 2, 3]);
 * // => 3
 */
function last(array) {
  var length = array ? array.length : 0;
  return length ? array[length - 1] : undefined;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * This method returns the first argument provided to it.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {*} value Any value.
 * @returns {*} Returns `value`.
 * @example
 *
 * var object = { 'user': 'fred' };
 *
 * _.identity(object) === object;
 * // => true
 */
function identity(value) {
  return value;
}

/**
 * Creates a function that returns the property value at `path` on a
 * given object.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {Array|string} path The path of the property to get.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var objects = [
 *   { 'a': { 'b': { 'c': 2 } } },
 *   { 'a': { 'b': { 'c': 1 } } }
 * ];
 *
 * _.map(objects, _.property('a.b.c'));
 * // => [2, 1]
 *
 * _.pluck(_.sortBy(objects, _.property(['a', 'b', 'c'])), 'a.b.c');
 * // => [1, 2]
 */
function property(path) {
  return isKey(path) ? baseProperty(path) : basePropertyDeep(path);
}

module.exports = baseCallback;

},{"lodash._baseisequal":19,"lodash._bindcallback":20,"lodash.isarray":26,"lodash.pairs":29}],16:[function(require,module,exports){
/**
 * lodash 3.0.4 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var keys = require('lodash.keys');

/**
 * Used as the [maximum length](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * The base implementation of `_.forEach` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array|Object|string} Returns `collection`.
 */
var baseEach = createBaseEach(baseForOwn);

/**
 * The base implementation of `baseForIn` and `baseForOwn` which iterates
 * over `object` properties returned by `keysFunc` invoking `iteratee` for
 * each property. Iteratee functions may exit iteration early by explicitly
 * returning `false`.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @returns {Object} Returns `object`.
 */
var baseFor = createBaseFor();

/**
 * The base implementation of `_.forOwn` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Object} Returns `object`.
 */
function baseForOwn(object, iteratee) {
  return baseFor(object, iteratee, keys);
}

/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}

/**
 * Creates a `baseEach` or `baseEachRight` function.
 *
 * @private
 * @param {Function} eachFunc The function to iterate over a collection.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new base function.
 */
function createBaseEach(eachFunc, fromRight) {
  return function(collection, iteratee) {
    var length = collection ? getLength(collection) : 0;
    if (!isLength(length)) {
      return eachFunc(collection, iteratee);
    }
    var index = fromRight ? length : -1,
        iterable = toObject(collection);

    while ((fromRight ? index-- : ++index < length)) {
      if (iteratee(iterable[index], index, iterable) === false) {
        break;
      }
    }
    return collection;
  };
}

/**
 * Creates a base function for `_.forIn` or `_.forInRight`.
 *
 * @private
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new base function.
 */
function createBaseFor(fromRight) {
  return function(object, iteratee, keysFunc) {
    var iterable = toObject(object),
        props = keysFunc(object),
        length = props.length,
        index = fromRight ? length : -1;

    while ((fromRight ? index-- : ++index < length)) {
      var key = props[index];
      if (iteratee(iterable[key], key, iterable) === false) {
        break;
      }
    }
    return object;
  };
}

/**
 * Gets the "length" property value of `object`.
 *
 * **Note:** This function is used to avoid a [JIT bug](https://bugs.webkit.org/show_bug.cgi?id=142792)
 * that affects Safari on at least iOS 8.1-8.3 ARM64.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {*} Returns the "length" value.
 */
var getLength = baseProperty('length');

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Converts `value` to an object if it's not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Object} Returns the object.
 */
function toObject(value) {
  return isObject(value) ? value : Object(value);
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

module.exports = baseEach;

},{"lodash.keys":28}],17:[function(require,module,exports){
/**
 * lodash 3.0.0 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.7.0 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/**
 * The base implementation of `_.find`, `_.findLast`, `_.findKey`, and `_.findLastKey`,
 * without support for callback shorthands and `this` binding, which iterates
 * over `collection` using the provided `eachFunc`.
 *
 * @private
 * @param {Array|Object|string} collection The collection to search.
 * @param {Function} predicate The function invoked per iteration.
 * @param {Function} eachFunc The function to iterate over `collection`.
 * @param {boolean} [retKey] Specify returning the key of the found element
 *  instead of the element itself.
 * @returns {*} Returns the found element or its key, else `undefined`.
 */
function baseFind(collection, predicate, eachFunc, retKey) {
  var result;
  eachFunc(collection, function(value, key, collection) {
    if (predicate(value, key, collection)) {
      result = retKey ? key : value;
      return false;
    }
  });
  return result;
}

module.exports = baseFind;

},{}],18:[function(require,module,exports){
/**
 * lodash 3.6.0 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/**
 * The base implementation of `_.findIndex` and `_.findLastIndex` without
 * support for callback shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {Function} predicate The function invoked per iteration.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseFindIndex(array, predicate, fromRight) {
  var length = array.length,
      index = fromRight ? length : -1;

  while ((fromRight ? index-- : ++index < length)) {
    if (predicate(array[index], index, array)) {
      return index;
    }
  }
  return -1;
}

module.exports = baseFindIndex;

},{}],19:[function(require,module,exports){
/**
 * lodash 3.0.7 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var isArray = require('lodash.isarray'),
    isTypedArray = require('lodash.istypedarray'),
    keys = require('lodash.keys');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    stringTag = '[object String]';

/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * A specialized version of `_.some` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {boolean} Returns `true` if any element passes the predicate check,
 *  else `false`.
 */
function arraySome(array, predicate) {
  var index = -1,
      length = array.length;

  while (++index < length) {
    if (predicate(array[index], index, array)) {
      return true;
    }
  }
  return false;
}

/**
 * The base implementation of `_.isEqual` without support for `this` binding
 * `customizer` functions.
 *
 * @private
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @param {Function} [customizer] The function to customize comparing values.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 */
function baseIsEqual(value, other, customizer, isLoose, stackA, stackB) {
  if (value === other) {
    return true;
  }
  if (value == null || other == null || (!isObject(value) && !isObjectLike(other))) {
    return value !== value && other !== other;
  }
  return baseIsEqualDeep(value, other, baseIsEqual, customizer, isLoose, stackA, stackB);
}

/**
 * A specialized version of `baseIsEqual` for arrays and objects which performs
 * deep comparisons and tracks traversed objects enabling objects with circular
 * references to be compared.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing objects.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA=[]] Tracks traversed `value` objects.
 * @param {Array} [stackB=[]] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function baseIsEqualDeep(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var objIsArr = isArray(object),
      othIsArr = isArray(other),
      objTag = arrayTag,
      othTag = arrayTag;

  if (!objIsArr) {
    objTag = objToString.call(object);
    if (objTag == argsTag) {
      objTag = objectTag;
    } else if (objTag != objectTag) {
      objIsArr = isTypedArray(object);
    }
  }
  if (!othIsArr) {
    othTag = objToString.call(other);
    if (othTag == argsTag) {
      othTag = objectTag;
    } else if (othTag != objectTag) {
      othIsArr = isTypedArray(other);
    }
  }
  var objIsObj = objTag == objectTag,
      othIsObj = othTag == objectTag,
      isSameTag = objTag == othTag;

  if (isSameTag && !(objIsArr || objIsObj)) {
    return equalByTag(object, other, objTag);
  }
  if (!isLoose) {
    var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
        othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

    if (objIsWrapped || othIsWrapped) {
      return equalFunc(objIsWrapped ? object.value() : object, othIsWrapped ? other.value() : other, customizer, isLoose, stackA, stackB);
    }
  }
  if (!isSameTag) {
    return false;
  }
  // Assume cyclic values are equal.
  // For more information on detecting circular references see https://es5.github.io/#JO.
  stackA || (stackA = []);
  stackB || (stackB = []);

  var length = stackA.length;
  while (length--) {
    if (stackA[length] == object) {
      return stackB[length] == other;
    }
  }
  // Add `object` and `other` to the stack of traversed objects.
  stackA.push(object);
  stackB.push(other);

  var result = (objIsArr ? equalArrays : equalObjects)(object, other, equalFunc, customizer, isLoose, stackA, stackB);

  stackA.pop();
  stackB.pop();

  return result;
}

/**
 * A specialized version of `baseIsEqualDeep` for arrays with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Array} array The array to compare.
 * @param {Array} other The other array to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing arrays.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
 */
function equalArrays(array, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var index = -1,
      arrLength = array.length,
      othLength = other.length;

  if (arrLength != othLength && !(isLoose && othLength > arrLength)) {
    return false;
  }
  // Ignore non-index properties.
  while (++index < arrLength) {
    var arrValue = array[index],
        othValue = other[index],
        result = customizer ? customizer(isLoose ? othValue : arrValue, isLoose ? arrValue : othValue, index) : undefined;

    if (result !== undefined) {
      if (result) {
        continue;
      }
      return false;
    }
    // Recursively compare arrays (susceptible to call stack limits).
    if (isLoose) {
      if (!arraySome(other, function(othValue) {
            return arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB);
          })) {
        return false;
      }
    } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB))) {
      return false;
    }
  }
  return true;
}

/**
 * A specialized version of `baseIsEqualDeep` for comparing objects of
 * the same `toStringTag`.
 *
 * **Note:** This function only supports comparing values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} value The object to compare.
 * @param {Object} other The other object to compare.
 * @param {string} tag The `toStringTag` of the objects to compare.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalByTag(object, other, tag) {
  switch (tag) {
    case boolTag:
    case dateTag:
      // Coerce dates and booleans to numbers, dates to milliseconds and booleans
      // to `1` or `0` treating invalid dates coerced to `NaN` as not equal.
      return +object == +other;

    case errorTag:
      return object.name == other.name && object.message == other.message;

    case numberTag:
      // Treat `NaN` vs. `NaN` as equal.
      return (object != +object)
        ? other != +other
        : object == +other;

    case regexpTag:
    case stringTag:
      // Coerce regexes to strings and treat strings primitives and string
      // objects as equal. See https://es5.github.io/#x15.10.6.4 for more details.
      return object == (other + '');
  }
  return false;
}

/**
 * A specialized version of `baseIsEqualDeep` for objects with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing values.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalObjects(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var objProps = keys(object),
      objLength = objProps.length,
      othProps = keys(other),
      othLength = othProps.length;

  if (objLength != othLength && !isLoose) {
    return false;
  }
  var index = objLength;
  while (index--) {
    var key = objProps[index];
    if (!(isLoose ? key in other : hasOwnProperty.call(other, key))) {
      return false;
    }
  }
  var skipCtor = isLoose;
  while (++index < objLength) {
    key = objProps[index];
    var objValue = object[key],
        othValue = other[key],
        result = customizer ? customizer(isLoose ? othValue : objValue, isLoose? objValue : othValue, key) : undefined;

    // Recursively compare objects (susceptible to call stack limits).
    if (!(result === undefined ? equalFunc(objValue, othValue, customizer, isLoose, stackA, stackB) : result)) {
      return false;
    }
    skipCtor || (skipCtor = key == 'constructor');
  }
  if (!skipCtor) {
    var objCtor = object.constructor,
        othCtor = other.constructor;

    // Non `Object` object instances with different constructors are not equal.
    if (objCtor != othCtor &&
        ('constructor' in object && 'constructor' in other) &&
        !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
          typeof othCtor == 'function' && othCtor instanceof othCtor)) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

module.exports = baseIsEqual;

},{"lodash.isarray":26,"lodash.istypedarray":27,"lodash.keys":28}],20:[function(require,module,exports){
/**
 * lodash 3.0.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/**
 * A specialized version of `baseCallback` which only supports `this` binding
 * and specifying the number of arguments to provide to `func`.
 *
 * @private
 * @param {Function} func The function to bind.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function bindCallback(func, thisArg, argCount) {
  if (typeof func != 'function') {
    return identity;
  }
  if (thisArg === undefined) {
    return func;
  }
  switch (argCount) {
    case 1: return function(value) {
      return func.call(thisArg, value);
    };
    case 3: return function(value, index, collection) {
      return func.call(thisArg, value, index, collection);
    };
    case 4: return function(accumulator, value, index, collection) {
      return func.call(thisArg, accumulator, value, index, collection);
    };
    case 5: return function(value, other, key, object, source) {
      return func.call(thisArg, value, other, key, object, source);
    };
  }
  return function() {
    return func.apply(thisArg, arguments);
  };
}

/**
 * This method returns the first argument provided to it.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {*} value Any value.
 * @returns {*} Returns `value`.
 * @example
 *
 * var object = { 'user': 'fred' };
 *
 * _.identity(object) === object;
 * // => true
 */
function identity(value) {
  return value;
}

module.exports = bindCallback;

},{}],21:[function(require,module,exports){
/**
 * lodash 3.0.0 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.7.0 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var baseCallback = require('lodash._basecallback'),
    baseEach = require('lodash._baseeach'),
    isArray = require('lodash.isarray');

/**
 * Creates a function that aggregates a collection, creating an accumulator
 * object composed from the results of running each element in the collection
 * through an iteratee. The `setter` sets the keys and values of the accumulator
 * object. If `initializer` is provided initializes the accumulator object.
 *
 * @private
 * @param {Function} setter The function to set keys and values of the accumulator object.
 * @param {Function} [initializer] The function to initialize the accumulator object.
 * @returns {Function} Returns the new aggregator function.
 */
function createAggregator(setter, initializer) {
  return function(collection, iteratee, thisArg) {
    var result = initializer ? initializer() : {};
    iteratee = baseCallback(iteratee, thisArg, 3);

    if (isArray(collection)) {
      var index = -1,
          length = collection.length;

      while (++index < length) {
        var value = collection[index];
        setter(result, value, iteratee(value, index, collection), collection);
      }
    } else {
      baseEach(collection, function(value, key, collection) {
        setter(result, value, iteratee(value, key, collection), collection);
      });
    }
    return result;
  };
}

module.exports = createAggregator;

},{"lodash._basecallback":15,"lodash._baseeach":16,"lodash.isarray":26}],22:[function(require,module,exports){
/**
 * lodash 3.9.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** `Object#toString` result references. */
var funcTag = '[object Function]';

/** Used to detect host constructors (Safari > 5). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = object == null ? undefined : object[key];
  return isNative(value) ? value : undefined;
}

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in older versions of Chrome and Safari which return 'function' for regexes
  // and Safari 8 equivalents which return 'object' for typed array constructors.
  return isObject(value) && objToString.call(value) == funcTag;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is a native function.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function, else `false`.
 * @example
 *
 * _.isNative(Array.prototype.push);
 * // => true
 *
 * _.isNative(_);
 * // => false
 */
function isNative(value) {
  if (value == null) {
    return false;
  }
  if (isFunction(value)) {
    return reIsNative.test(fnToString.call(value));
  }
  return isObjectLike(value) && reIsHostCtor.test(value);
}

module.exports = getNative;

},{}],23:[function(require,module,exports){
/**
 * lodash 3.2.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var baseCallback = require('lodash._basecallback'),
    baseEach = require('lodash._baseeach'),
    baseFind = require('lodash._basefind'),
    baseFindIndex = require('lodash._basefindindex'),
    isArray = require('lodash.isarray');

/**
 * Creates a `_.find` or `_.findLast` function.
 *
 * @private
 * @param {Function} eachFunc The function to iterate over a collection.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new find function.
 */
function createFind(eachFunc, fromRight) {
  return function(collection, predicate, thisArg) {
    predicate = baseCallback(predicate, thisArg, 3);
    if (isArray(collection)) {
      var index = baseFindIndex(collection, predicate, fromRight);
      return index > -1 ? collection[index] : undefined;
    }
    return baseFind(collection, predicate, eachFunc);
  };
}

/**
 * Iterates over elements of `collection`, returning the first element
 * `predicate` returns truthy for. The predicate is bound to `thisArg` and
 * invoked with three arguments: (value, index|key, collection).
 *
 * If a property name is provided for `predicate` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `predicate` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @alias detect
 * @category Collection
 * @param {Array|Object|string} collection The collection to search.
 * @param {Function|Object|string} [predicate=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `predicate`.
 * @returns {*} Returns the matched element, else `undefined`.
 * @example
 *
 * var users = [
 *   { 'user': 'barney',  'age': 36, 'active': true },
 *   { 'user': 'fred',    'age': 40, 'active': false },
 *   { 'user': 'pebbles', 'age': 1,  'active': true }
 * ];
 *
 * _.result(_.find(users, function(chr) {
 *   return chr.age < 40;
 * }), 'user');
 * // => 'barney'
 *
 * // using the `_.matches` callback shorthand
 * _.result(_.find(users, { 'age': 1, 'active': true }), 'user');
 * // => 'pebbles'
 *
 * // using the `_.matchesProperty` callback shorthand
 * _.result(_.find(users, 'active', false), 'user');
 * // => 'fred'
 *
 * // using the `_.property` callback shorthand
 * _.result(_.find(users, 'active'), 'user');
 * // => 'barney'
 */
var find = createFind(baseEach);

module.exports = find;

},{"lodash._basecallback":15,"lodash._baseeach":16,"lodash._basefind":17,"lodash._basefindindex":18,"lodash.isarray":26}],24:[function(require,module,exports){
/**
 * lodash 3.1.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var createAggregator = require('lodash._createaggregator');

/**
 * Creates an object composed of keys generated from the results of running
 * each element of `collection` through `iteratee`. The corresponding value
 * of each key is the last element responsible for generating the key. The
 * iteratee function is bound to `thisArg` and invoked with three arguments:
 * (value, index|key, collection).
 *
 * If a property name is provided for `iteratee` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `iteratee` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [iteratee=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Object} Returns the composed aggregate object.
 * @example
 *
 * var keyData = [
 *   { 'dir': 'left', 'code': 97 },
 *   { 'dir': 'right', 'code': 100 }
 * ];
 *
 * _.indexBy(keyData, 'dir');
 * // => { 'left': { 'dir': 'left', 'code': 97 }, 'right': { 'dir': 'right', 'code': 100 } }
 *
 * _.indexBy(keyData, function(object) {
 *   return String.fromCharCode(object.code);
 * });
 * // => { 'a': { 'dir': 'left', 'code': 97 }, 'd': { 'dir': 'right', 'code': 100 } }
 *
 * _.indexBy(keyData, function(object) {
 *   return this.fromCharCode(object.code);
 * }, String);
 * // => { 'a': { 'dir': 'left', 'code': 97 }, 'd': { 'dir': 'right', 'code': 100 } }
 */
var indexBy = createAggregator(function(result, value, key) {
  result[key] = value;
});

module.exports = indexBy;

},{"lodash._createaggregator":21}],25:[function(require,module,exports){
/**
 * lodash 3.0.8 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright 2012-2016 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]';

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Built-in value references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}

/**
 * Gets the "length" property value of `object`.
 *
 * **Note:** This function is used to avoid a [JIT bug](https://bugs.webkit.org/show_bug.cgi?id=142792)
 * that affects Safari on at least iOS 8.1-8.3 ARM64.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {*} Returns the "length" value.
 */
var getLength = baseProperty('length');

/**
 * Checks if `value` is likely an `arguments` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  // Safari 8.1 incorrectly makes `arguments.callee` enumerable in strict mode.
  return isArrayLikeObject(value) && hasOwnProperty.call(value, 'callee') &&
    (!propertyIsEnumerable.call(value, 'callee') || objectToString.call(value) == argsTag);
}

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 * @example
 *
 * _.isArrayLike([1, 2, 3]);
 * // => true
 *
 * _.isArrayLike(document.body.children);
 * // => true
 *
 * _.isArrayLike('abc');
 * // => true
 *
 * _.isArrayLike(_.noop);
 * // => false
 */
function isArrayLike(value) {
  return value != null && isLength(getLength(value)) && !isFunction(value);
}

/**
 * This method is like `_.isArrayLike` except that it also checks if `value`
 * is an object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array-like object, else `false`.
 * @example
 *
 * _.isArrayLikeObject([1, 2, 3]);
 * // => true
 *
 * _.isArrayLikeObject(document.body.children);
 * // => true
 *
 * _.isArrayLikeObject('abc');
 * // => false
 *
 * _.isArrayLikeObject(_.noop);
 * // => false
 */
function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8 which returns 'object' for typed array and weak map constructors,
  // and PhantomJS 1.9 which returns 'function' for `NodeList` instances.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is loosely based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

module.exports = isArguments;

},{}],26:[function(require,module,exports){
/**
 * lodash 3.0.4 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** `Object#toString` result references. */
var arrayTag = '[object Array]',
    funcTag = '[object Function]';

/** Used to detect host constructors (Safari > 5). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/* Native method references for those with the same name as other `lodash` methods. */
var nativeIsArray = getNative(Array, 'isArray');

/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = object == null ? undefined : object[key];
  return isNative(value) ? value : undefined;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(function() { return arguments; }());
 * // => false
 */
var isArray = nativeIsArray || function(value) {
  return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag;
};

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in older versions of Chrome and Safari which return 'function' for regexes
  // and Safari 8 equivalents which return 'object' for typed array constructors.
  return isObject(value) && objToString.call(value) == funcTag;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is a native function.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function, else `false`.
 * @example
 *
 * _.isNative(Array.prototype.push);
 * // => true
 *
 * _.isNative(_);
 * // => false
 */
function isNative(value) {
  if (value == null) {
    return false;
  }
  if (isFunction(value)) {
    return reIsNative.test(fnToString.call(value));
  }
  return isObjectLike(value) && reIsHostCtor.test(value);
}

module.exports = isArray;

},{}],27:[function(require,module,exports){
/**
 * lodash 3.0.6 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    dataViewTag = '[object DataView]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values of typed arrays. */
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
typedArrayTags[dataViewTag] = typedArrayTags[dateTag] =
typedArrayTags[errorTag] = typedArrayTags[funcTag] =
typedArrayTags[mapTag] = typedArrayTags[numberTag] =
typedArrayTags[objectTag] = typedArrayTags[regexpTag] =
typedArrayTags[setTag] = typedArrayTags[stringTag] =
typedArrayTags[weakMapTag] = false;

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is loosely based on
 * [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length,
 *  else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a typed array.
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified,
 *  else `false`.
 * @example
 *
 * _.isTypedArray(new Uint8Array);
 * // => true
 *
 * _.isTypedArray([]);
 * // => false
 */
function isTypedArray(value) {
  return isObjectLike(value) &&
    isLength(value.length) && !!typedArrayTags[objectToString.call(value)];
}

module.exports = isTypedArray;

},{}],28:[function(require,module,exports){
/**
 * lodash 3.1.2 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var getNative = require('lodash._getnative'),
    isArguments = require('lodash.isarguments'),
    isArray = require('lodash.isarray');

/** Used to detect unsigned integer values. */
var reIsUint = /^\d+$/;

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/* Native method references for those with the same name as other `lodash` methods. */
var nativeKeys = getNative(Object, 'keys');

/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}

/**
 * Gets the "length" property value of `object`.
 *
 * **Note:** This function is used to avoid a [JIT bug](https://bugs.webkit.org/show_bug.cgi?id=142792)
 * that affects Safari on at least iOS 8.1-8.3 ARM64.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {*} Returns the "length" value.
 */
var getLength = baseProperty('length');

/**
 * Checks if `value` is array-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 */
function isArrayLike(value) {
  return value != null && isLength(getLength(value));
}

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  value = (typeof value == 'number' || reIsUint.test(value)) ? +value : -1;
  length = length == null ? MAX_SAFE_INTEGER : length;
  return value > -1 && value % 1 == 0 && value < length;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * A fallback implementation of `Object.keys` which creates an array of the
 * own enumerable property names of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function shimKeys(object) {
  var props = keysIn(object),
      propsLength = props.length,
      length = propsLength && object.length;

  var allowIndexes = !!length && isLength(length) &&
    (isArray(object) || isArguments(object));

  var index = -1,
      result = [];

  while (++index < propsLength) {
    var key = props[index];
    if ((allowIndexes && isIndex(key, length)) || hasOwnProperty.call(object, key)) {
      result.push(key);
    }
  }
  return result;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/6.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
var keys = !nativeKeys ? shimKeys : function(object) {
  var Ctor = object == null ? undefined : object.constructor;
  if ((typeof Ctor == 'function' && Ctor.prototype === object) ||
      (typeof object != 'function' && isArrayLike(object))) {
    return shimKeys(object);
  }
  return isObject(object) ? nativeKeys(object) : [];
};

/**
 * Creates an array of the own and inherited enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keysIn(new Foo);
 * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
 */
function keysIn(object) {
  if (object == null) {
    return [];
  }
  if (!isObject(object)) {
    object = Object(object);
  }
  var length = object.length;
  length = (length && isLength(length) &&
    (isArray(object) || isArguments(object)) && length) || 0;

  var Ctor = object.constructor,
      index = -1,
      isProto = typeof Ctor == 'function' && Ctor.prototype === object,
      result = Array(length),
      skipIndexes = length > 0;

  while (++index < length) {
    result[index] = (index + '');
  }
  for (var key in object) {
    if (!(skipIndexes && isIndex(key, length)) &&
        !(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
      result.push(key);
    }
  }
  return result;
}

module.exports = keys;

},{"lodash._getnative":22,"lodash.isarguments":25,"lodash.isarray":26}],29:[function(require,module,exports){
/**
 * lodash 3.0.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var keys = require('lodash.keys');

/**
 * Converts `value` to an object if it's not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Object} Returns the object.
 */
function toObject(value) {
  return isObject(value) ? value : Object(value);
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Creates a two dimensional array of the key-value pairs for `object`,
 * e.g. `[[key1, value1], [key2, value2]]`.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the new array of key-value pairs.
 * @example
 *
 * _.pairs({ 'barney': 36, 'fred': 40 });
 * // => [['barney', 36], ['fred', 40]] (iteration order is not guaranteed)
 */
function pairs(object) {
  object = toObject(object);

  var index = -1,
      props = keys(object),
      length = props.length,
      result = Array(length);

  while (++index < length) {
    var key = props[index];
    result[index] = [key, object[key]];
  }
  return result;
}

module.exports = pairs;

},{"lodash.keys":28}],30:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],31:[function(require,module,exports){
'use strict';

var sieve = {list: [], set: {}, limit: 0};

function updateSieve(newLimit) {
  sieve.list = require('sieve-of-eratosthenes')(newLimit + 1);
  sieve.set = require('lodash.indexby')(sieve.list);
  sieve.limit = newLimit;
}

function findFactors(number, factors) {
  if (sieve.set[number]) {
    factors.push(number);
    return factors;
  }

  var factor = require('lodash.find')(sieve.list, function (prime) {
    return number % prime === 0;
  });

  factors.push(factor);

  return findFactors(number / factor, factors);
}

module.exports = function (number) {
  if (!number || number === 1) {
    return [];
  }

  if (number > sieve.limit) {
    updateSieve(number);
  }

  return findFactors(number, []);
};

},{"lodash.find":23,"lodash.indexby":24,"sieve-of-eratosthenes":32}],32:[function(require,module,exports){
(function(root) {
  'use strict';

  function sieveOfErathosthenes(max) {
    var flags = [];
    var primes = [];
    var prime = 2;

    var n = max;
    while(n--) {
      flags[max-n] = true;
    }

    for (prime = 2; prime < Math.sqrt(max); prime++) {
      if (flags[prime]) {
        for (var j = prime + prime; j < max; j += prime) {
          flags[j] = false;
        }
      }
    }

    for (var i = 2; i < max; i++) {
      if (flags[i]) {
        primes.push(i);
      }
    }

    return primes;
  }

  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = sieveOfErathosthenes;
    }
    exports.sieveOfErathosthenes = sieveOfErathosthenes;
  } else if (typeof define === 'function' && define.amd) {
    define([], function() {
      return sieveOfErathosthenes;
    });
  } else {
    root.sieveOfErathosthenes = sieveOfErathosthenes;
  }

})(this);

},{}],33:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],34:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":33,"_process":30,"inherits":14}]},{},[1]);
