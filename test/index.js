
var util = require('util');
var test = require('tape');
var hrm = require('../lib/hrm-engine.js');
var levels = require('hrm-level-data').reduce(function (mm, ll) {
      mm[ll.number] = ll;
      return mm;
    }, {});
var inboxer = require('hrm-level-inbox-generator');
var outboxer = require('hrm-level-outbox-generator');
var solutions = require('./fixtures/hrm-solutions.json');

solutions.forEach(function (solution) {
  test(solution.path, function (assert) {
    var level = levels[solution.levelNumber];

    try {
      var inbox = inboxer.generate(level.number);
      var outbox = outboxer.generate(inbox, level.number);
      if (inbox === null || outbox === null) {
        inbox = level.examples[0].inbox;
        outbox = level.examples[0].outbox;
      }

      assert.ok(inbox, 'Inbox is not empty');
      assert.ok(outbox, 'Expected Outbox is not empty');

      var program = hrm.parse(solution.source, { level: level, validateTiles: true });
      assert.ok(program, 'Could parse solution');

      var state = program.createState({
        inbox: inbox.slice(),
        variables: util._extend({}, (level.floor || { tiles: {} }).tiles)
      });
      assert.ok(state, 'Created state for solution');

      program.resume(state);
      assert.ok(true, 'Program could be run');

      //assert.equals(state.inbox.length, 0, 'Inbox has no entries after run');
      assert.equals(outbox.length, state.outbox.length, 'Outbox is of expected length');
      for (var ii = 0; ii < outbox.length; ++ii) {
        assert.equals(outbox[ii], state.outbox[ii], 'Outbox entry ' + ii + ' is correct');
      }

      assert.end();
    } catch (e) {
      assert.end(e);
    }
  });
});
