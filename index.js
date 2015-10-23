var MAX_STATEMENTS = 200;

module.exports = function(program, inbox) {

// 1. Map Labels
var labels = {};
for (var ix = 0; ix < program.statements.length; ++ix) {
  var stmt = program.statements[ix];
  if (stmt.type == 'label') {
    labels[stmt.name] = ix;
  }
}

var outbox = [];
var hand = undefined;
var variables = {};

printInbox();

var done = false;
var ip = 0;
var ipCounter = 0;
while (!done && ipCounter++ < MAX_STATEMENTS) {
   var stmt = program.statements[ip++];
   switch (stmt.type) {
   case 'label':
     continue;
     
   case 'inbox':
     hand = stmt_inbox();
     break;
     
   case 'outbox':
     hand = stmt_outbox();
     break;
     
   case 'copyfrom':
     hand = stmt_copyfrom(stmt.var);
     break;
     
   case 'copyto':
     hand = stmt_copyto(stmt.var);
     break;
     
   case 'add':
   case 'sub':
   case 'bump+':
   case 'bump-':
     hand = stmt_math(stmt.type, stmt.var);
     break;
     
   case 'jump':
     ip = stmt_jump(stmt.label);
     break;
     
   case 'jump_zero':
     ip = stmt_jumpz(stmt.label);
     break;
   
   case 'jump_negative':
     ip = stmt_jumpneg(stmt.label);
     break;
     
   default:
     throw new Error('Unknown instruction: ' + stmt.type);
   }
}

printVar();
printInbox();
printOutbox();

function stmt_inbox() {
  if (inbox.length) {
    return inbox.shift();
  } else {
    done = true;
    return undefined;
  }
}

function stmt_outbox() {
  if (hand !== undefined) {
    outbox.unshift(hand);
    return undefined;
  }
  else {
    throw new Error('Nothing in your hand to outbox!');
  }
}

function stmt_copyfrom(variable) {
  if (variables.hasOwnProperty(variable)
   && variables[variable] !== undefined) {
    return variables[variable];
  }
  else {
    throw new Error('Cannot copy from empy or non-existent variable: ' + variable);
  }
}

function stmt_copyto(variable) {
  if (hand !== undefined) {
    return variables[variable] = hand;
  }
  else {
    throw new Error('Cannot copy to variable with an empty hand');
  }
}

function stmt_jump(label) {
  if (!labels.hasOwnProperty(label)) {
    throw new Error('Unknown label: ' + label);
  }
  
  return labels[label];
}

function stmt_jumpz(label) {
  if (!labels.hasOwnProperty(label)) {
    throw new Error('Unknown label: ' + label);
  }

  if (hand !== undefined) {
    if (hand == 0) {
      return labels[label];
    }
    else {
      return ip;
    }
  }
  
  throw new Error('Cannot jumpz with an empty hand');
}

function stmt_jumpneg(label) {
  if (!labels.hasOwnProperty(label)) {
    throw new Error('Unknown label: ' + label);
  }

  if (hand !== undefined) {
    if (hand < 0) {
      return labels[label];
    }
    else {
      return ip;
    }
  }
  
  throw new Error('Cannot jumpneg with an empty hand');
}

function stmt_math(op, variable) {

  if (hand !== undefined
   && variables.hasOwnProperty(variable)
   && variables[variable] !== undefined) {
    switch (op) {
    case 'add':
      return hand + variables[variable];
    case 'sub':
      return hand - variables[variable];
    case 'bump+':
      return ++variables[variable];
    case 'bump-':
      return --variables[variable];
    default:
      throw new Error('Unsupported math operation: ' + op);
    }
  }
  
  throw new Error('Hand is empty or variable is empty or variable is not found: ' + variable);
}

function printVar() {
console.log('VARIABLES:');
console.dir(variables);
}

function printInbox() {
console.log('INBOX:');
console.dir(inbox);
}

function printOutbox() {
console.log('OUTBOX:');
console.dir(outbox);
}
};
