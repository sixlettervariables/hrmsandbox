
var util = require('util');
var hrm = require('../lib/hrm-engine.js');
var levels = require('hrm-level-data');
var inboxer = require('hrm-level-inbox-generator');
var outboxer = require('hrm-level-outbox-generator');
var solutions = require('./fixtures/hrm-solutions.json');

console.dir(inboxer);

levels.forEach(function (level) {
  if (level.cutscene) return;

  var inbox = inboxer.generate(level.number);
  var outbox = outboxer.generate(inbox, level.number);
  if (inbox === null || outbox === null) {
    inbox = level.examples[0].inbox;
    outbox = level.examples[0].outbox;
  }

  solutions.filter(function (solution) {
    return solution.levelNumber == level.number;
  }).forEach(function (solution) {
    console.log('testing ' + solution.path);
    try {
      var program = hrm.parse(solution.source);
      var state = program.createState({
        inbox: inbox.slice(),
        variables: util._extend({}, (level.floor || { tiles: {} }).tiles)
      });

      program.resume(state);
      if (outbox.length !== state.outbox.length) {
        throw new Error('Did not correctly complete');
      }
      state.outbox = state.outbox.reverse();
      for (var ii = 0; ii < outbox.length; ++ii) {
        if (outbox[ii] !== state.outbox[ii]) {
          throw new Error('Did not correctly complete');
        }
      }
    } catch (e) {
      console.error(e);
    }
  });
});
