/** hrmfiddle Web Controller
 * Christopher A. Watford <christopher.watford@gmail.com>
 * https://github.com/sixlettervariables/hrmsandbox
 */
"use strict";

var DELAY_MS_UPDATE_CODEVIEWER = 250;

var UI_STATE_STOPPED  = 0;
var UI_STATE_STARTING = 1;
var UI_STATE_RUNNING  = 2;
var UI_STATE_STEPPED  = 3;
var UI_STATE_BREAK    = 4;

var Controller = function (editorId) {
  if (!(this instanceof Controller)) {
    return new Controller(editorId);
  }

  // HRM execution state
  this.uiState = UI_STATE_STOPPED;
  this.program = undefined;
  this.state = undefined;
  this.breakpoints = [];

  // Speed in ms for animated steps
  this.selectedSpeed = 300;

  // visuals
  this.shouldRenderCodeView = true;
  this.lastUiState = undefined;
  this.lastMarkedText = undefined;

  this.setEditor(editorId);
};
var CP = Controller.prototype;

CP.setEditor = function (eltId) {
  var self = this;

  this.editor = CodeMirror.fromTextArea(document.getElementById(eltId), {
    mode: 'hrm',
    lineNumbers: true,
    styleActiveLine: true,
    viewportMargin: Infinity,
    gutters: ["CodeMirror-linenumbers", "breakpoints"]
  });

  var oldCode = '';
  this.editor.on('change', function(e) {
      var currentCode = self.editor.getValue();
      if (currentCode == oldCode) {
        return; //check to prevent multiple simultaneous triggers
      }

      oldCode = currentCode;
      self.shouldRenderCodeView = true;
  });

  this.editor.on("gutterClick", function(cm, n) {
    var info = cm.lineInfo(n);
    cm.setGutterMarker(n, "breakpoints", info.gutterMarkers ? null : makeMarker());
    self.toggleBreakpoint(info.line);
  });

  function makeMarker () {
    var marker = document.createElement("div");
    marker.style.color = "#822";
    marker.innerHTML = "●";
    return marker;
  }
};

CP.setCodeViewer = function (eltId, $modal) {
  var self = this;

  this.viewCode = debounce(function (code) {
    var hrmv = new hrm_viewer();
    hrmv.append_code_table(eltId, code);
  }, DELAY_MS_UPDATE_CODEVIEWER, false);

  $modal.on('shown.bs.modal', function (e) {
    if (self.shouldRenderCodeView) {
      self.shouldRenderCodeView = false;
      self.viewCode(self.editor.getValue());
    }
  });
};

CP.toggleBreakpoint = function (bp) {
  bp = bp + 1;
  var idx = this.breakpoints.indexOf(bp);
  if (idx < 0) {
    this.breakpoints.push(bp);
  }
  else {
    this.breakpoints.splice(idx, 1);
  }

  this.assignBreakpoints();
};

CP.assignBreakpoints = function () {
  if (this.program) {
    this.program.setBreakpoints(this.breakpoints);
  }
};

CP.parseSource = function () {
  try {
    var inbox = readInbox($('#inbox'));
    var variables = $.parseJSON($('#variables').val());

    this.state = new HrmProgramState({
      inbox: inbox,
      variables: variables
    });

    var source = this.editor.getValue();
    this.program = HrmProgram.parse(source);

    this.assignBreakpoints();

    this.updateUI(this.state, UI_STATE_STARTING);

    return true;

  } catch(error) {
    console.error(error);
    this.onErrorCaught(error);
  }

  return false;

  function readInbox($inbox) {
    return $inbox.val().split(/[, \t\n\"']/).filter(function (v) {
      return v.trim().length > 0;
    }).map(function (s) {
      var n = Number(s);
      return Number.isNaN(n) ? s : n;
    });
  }
};

CP.step = function (nextUiState) {
  nextUiState = nextUiState || UI_STATE_RUNNING;
  try {
    var done = false;
    var step = this.program.step(this.state);
    if (!step) {
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }

      done = true;
      nextUiState = UI_STATE_STOPPED;
    }
    else if (step === 'break') {
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }

      nextUiState = UI_STATE_BREAK;
    }

    this.updateUI(this.state, nextUiState);

    if (done) {
      this.program = undefined;
      this.state = undefined;
    }
  } catch (error) {
    console.error(error);

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.onErrorCaught(error);
  }
};

CP.runSteps = function (speed) {
  var self = this;
  this.intervalId = undefined;
  if (speed) {
    this.intervalId = setInterval(function () {
      self.step();
    }, speed);
  }
  else {
    this.step(UI_STATE_STEPPED);
  }
};

CP.runToEnd = function runToEnd() {
  var nextUiState = UI_STATE_RUNNING;
  try {
    var done = false;
    var step = this.program.resume(this.state);
    if (!step) {
      nextUiState = UI_STATE_STOPPED;
      done = true;
    }
    else if (step === 'break') {
      nextUiState = UI_STATE_BREAK;
    }

    this.updateUI(this.state, nextUiState);

    if (done) {
      this.program = undefined;
      this.state = undefined;
    }
  } catch (error) {
    console.error(error);

    this.onErrorCaught(error);
  }
};

CP.onErrorCaught = function (error) {
  this.program = undefined;
  var errorState = this.state;
  this.state = undefined;

  this.updateUI(errorState, UI_STATE_STOPPED);

  //TODO: mark the line in error if we know about it!

  $('#error').toggleClass('hidden', false);
  if (error.name && error.name === 'SyntaxError') {
    if (error.location) {
      var loc = error.location.start;
      $('#error-content').append('<b>Error parsing HRM program, aborted.</b><br />' +
        'Line ' + loc.line + ' Column ' + loc.column + '<br />' +
        error.message
      );
    }
    else {
      $('#error-content').append('<b>Error parsing HRM program, aborted.</b><br />' +
        error.message
      );
    }
  }
  else {
    $('#error-content').append('<b>Error running HRM program, aborted.</b><br />' +
      error.message
    );
  }
};

var ELT_WRAPPER_NUMBER = '<span class="label label-success">';
var ELT_WRAPPER_ALPHA  = '<span class="label label-primary">';

CP.updateUI = function (hrmState, nextUiState) {
  this.uiState = nextUiState;
  if (this.lastUiState !== this.uiState) {
    this.lastUiState = this.uiState;

    // Update fields
    switch (this.uiState) {
      case UI_STATE_STARTING:
        $('#error').toggleClass('hidden', true);
        $('#error-content').empty();
        break;
    }

    // Update editor
    switch (this.uiState) {
      case UI_STATE_STOPPED:
        this.editor.setOption('readOnly', false);
        break;

      case UI_STATE_STARTING:
      case UI_STATE_BREAK:
      case UI_STATE_RUNNING:
      case UI_STATE_STEPPED:
        this.editor.setOption('readOnly', true);
        break;
    }

    // Update buttons
    switch (this.uiState) {
      case UI_STATE_STOPPED:
      case UI_STATE_BREAK:
      case UI_STATE_STEPPED:
        $('#run').prop('disabled', false);
        $('#runToEnd').prop('disabled', false);
        $('#stepInto').prop('disabled', false);
        $('#pause').prop('disabled', true);
        $('#stop').prop('disabled', true);
        break;
      case UI_STATE_RUNNING:
        $('#run').prop('disabled', true);
        $('#runToEnd').prop('disabled', true);
        $('#stepInto').prop('disabled', true);
        $('#pause').prop('disabled', false);
        $('#stop').prop('disabled', false);
        break;
      case UI_STATE_STARTING:
        $('#run').prop('disabled', true);
        $('#runToEnd').prop('disabled', true);
        $('#stepInto').prop('disabled', true);
        $('#pause').prop('disabled', true);
        $('#stop').prop('disabled', true);
        break;
    }
  }

  // Update Editor
  this.editor.setCursor(hrmState !== undefined ? this.lineFromState(hrmState) : 0);
  if (this.lastMark) {
    this.lastMark.clear();
    this.lastMark = undefined;
  }

  if (hrmState !== undefined && hrmState.isAtBreakpoint) {
    var loc = this.locFromState(hrmState);
    this.lastMark = this.editor.markText(
      { line: loc.start.line, ch: loc.start.column },
      { line: loc.end.line, ch: loc.end.column },
      { className: 'line-breakpoint' }
    );
  }

  // Update Stats
  $('#stats').empty();
  if (hrmState !== undefined) {
    $('#stats').append('iterations: ' + (hrmState.iterations - hrmState.labelsHit));
  }

  // Update Outbox
  $('#outbox').empty();
  if (hrmState !== undefined) {
    for (var ii = 0; ii < hrmState.outbox.length; ++ii) {
      var isNumber = typeof hrmState.outbox[ii] === 'number';
      var wrapper = isNumber ? ELT_WRAPPER_NUMBER : ELT_WRAPPER_ALPHA;
      $('#outbox').append(
        $('<li>').append(
          $(wrapper).append(hrmState.outbox[ii].toString())
        )
      );
    }
  }
};

CP.bindVisuals = function() {
  var self = this;

  $('div.split-pane').splitPane();

  $('#run').on('click', function btnRunClick() {
    switch (self.uiState) {
      case UI_STATE_STOPPED:
        if (self.parseSource()) {
          self.runSteps(self.selectedSpeed);
        }
        break;

      case UI_STATE_BREAK:
      case UI_STATE_STEPPED:
        self.runSteps(self.selectedSpeed);
        break;
    }
  });

  $('#runToEnd').on('click', function btnRunToEndClick() {
    switch (self.uiState) {
      case UI_STATE_STOPPED:
        if (self.parseSource()) {
          self.runToEnd();
        }
        break;

      case UI_STATE_BREAK:
      case UI_STATE_STEPPED:
        self.runToEnd();
        break;
    }
  });

  $('#stepInto').on('click', function btnStepIntoClick() {
    switch (self.uiState) {
      case UI_STATE_STOPPED:
        if (self.parseSource()) {
          self.step(UI_STATE_STEPPED);
        }
        break;

      case UI_STATE_BREAK:
      case UI_STATE_STEPPED:
        self.step(UI_STATE_STEPPED);
        break;
    }
  });

  $('#pause').on('click', function btnPauseClick() {
    switch (self.uiState) {
      case UI_STATE_RUNNING:
        self.pause();
        break;
    }
  });

  $('#stop').on('click', function () {
    switch (self.uiState) {
      case UI_STATE_RUNNING:
      case UI_STATE_BREAK:
      case UI_STATE_STEPPED:
        self.stop();
        break;
    }
  });
};

CP.lineFromState = function lineFromState(s) {
  if (this.program) {
    if (s.ip >= 0 && s.ip < this.program._program.statements.length) {
      return this.program._program.statements[s.ip]._location.start.line - 1;
    }
  }

  return 0;
};

CP.locFromState = function locFromState(s) {
  if (this.program) {
    if (s.ip >= 0 && s.ip < this.program._program.statements.length) {
      var l = this.program._program.statements[s.ip]._location;
      return {
        start: { line: l.start.line - 1, column: 0 },
        end: { line: l.end.line - 1, column: l.end.column - 1 }
      };
    }
  }

  return { start: {}, end: {} };
};

// From: Underscore.js 1.8.3
// http://underscorejs.org
// (c) 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
// MIT License
// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) {
        func.apply(context, args);
      }
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) {
      func.apply(context, args);
    }
	};
}
