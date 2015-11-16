
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
