/*
This file is part of human-resource-machine-viewer, 
copyright 2015 Alan De Smet.

human-resource-machine-viewer is free software you can
redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option)
any later version.

human-resource-machine-viewer is distributed in the hope that it
will be useful, but WITHOUT ANY WARRANTY; without even the
implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with human-resource-machine-view.  If not, see
<http://www.gnu.org/licenses/>.
*/


////////////////////////////////////////////////////////////////////////////////
// HRMLabel
//
// Takes a Human Resource Machine encoded label and optional height, width, and
// brush diameter for the output.  If not specified, the height is 40, the
// width is 3*height, and the brush diameter is height/11.
//
// Resulting object has .strokes, a list of strokes. Each stroke is a list of
// points that should be connected with straight line segments.  Each point is
// a list of two elements [x,y], scaled to the specified height and width.
//
// Resulting object also has .extents, which contains the extents
// (.extents.min_x, .extents.min_y, .extents.max_x, .extents.max_y) and size
// (.extents.width and .extends.height).  The extents are the smallest extents
// that encompass all of the strokes, including accounting for the brush
// diameter.  However, the extents will never go outside of the range 0,0
// through width,height; strokes near the edge will be clipped, comforming to
// Human Resource Machine's behavior.
//
// The height, width, and brush diameter, either the defaults or the specified
// ones, are available as .height, .width, and .brush_diameter
function HRMLabel(encoded_label, height, width, brush_diameter) {
	"use strict";
	function rescale(x, oldmax, newmax) { return x * newmax / oldmax; }

	this.height = height || 40;
	this.width = width || this.height*3;
	this.brush_diameter = brush_diameter || this.height / 11;

	var hrm_max = 65535;

	var zlib = window.atob(encoded_label);
	var zlibu8 = new Uint8Array(zlib.length);
	for(var i = 0; i < zlib.length; i++) {
		zlibu8[i] = zlib.charCodeAt(i);
	}
	var raw = pako.inflate(zlibu8);

	var dv = new DataView(raw.buffer);
	var elements = dv.getUint16(0, true);
	var points = [];
	this.strokes = [];

	var min_x = this.width;
	var max_x = 0;
	var min_y = this.height;
	var max_y = 0;
	for(var i = 0; i < elements && (i*4+6)<= raw.length; i++) {
		var index = i*4+4;
		var x = dv.getUint16(index, true);
		var y = dv.getUint16(index+2, true);
		if(x == 0 && y == 0) {
			this.strokes.push(points);
			points = [];
		} else {
			x = rescale(x, hrm_max, this.width);
			y = rescale(y, hrm_max, this.height);
			points.push([x,y]);
			max_x = Math.max(max_x, x);
			min_x = Math.min(min_x, x);
			max_y = Math.max(max_y, y);
			min_y = Math.min(min_y, y);
		}
	}


	this.extents = {
		min_x: Math.max(min_x-this.brush_diameter/2, 0),
		min_y: Math.max(min_y-this.brush_diameter/2, 0),
		max_x: Math.min(max_x+this.brush_diameter/2, this.width),
		max_y: Math.min(max_y+this.brush_diameter/2, this.height),
	}
	this.extents.width = this.extents.max_x - this.extents.min_x;
	this.extents.height = this.extents.max_y - this.extents.min_y;
}

////////////////////////////////////////////////////////////////////////////////
// HRMParser
//
// Pass in an HRM program in assembly format, either an as array of strings,
// with each element representing a single line, or as a single string with
// embedded newlines (prefixed with optional carriage returns).
//
// The "-- HUMAN RESOURCE MACHINE PROGRAM --" header is optional; if present
// it will be discarded.
//
// The returned object will have:
//
// .comments - Object of the various code comments, indexed on the comment 
//             identifier.  So example.comments["3"] retrieves comment 3.
//             These are the encoded, text form!
//
// .labels - Same as .comments, but for labels for memory addresses.
//
// .code - Array of objects describing lines in the source file. Contains:
//         .code[NUM].cmd - String. The command.  One of copyfrom, copyto,
//                          bumpup, bumpdn, jump, jumpn, jumpz, add, sub,
//                          inbox, outbox, comment, blank, asm_comment,
//                          jumpdst, or error
//         .code[NUM].arg - The argument to the command.  Only present for
//                          copyfrom, copyto, bumpup, bumpdn, jump,
//                          jumpn, jumpz, add, sub, comment, asm_comment,
//                          and invalid.  For comment it's the identifier
//                          for the image, available through 
//                          .comments[.code[NUM].arg].  For asm_comment,
//                          it's the text of the comment, including the
//                          leading "--".  For invalid, it's the entire line.
//         .code[NUM].line_num - Integer. The line number, as Human
//                          Resource Machine counts them.  Not present
//                          for invalid, blank, jumpdst, asm_comment or
//                          comment.


function HRMParser(lines) {
	"use strict";

	function is_code(cmd) {
		if(cmd == 'invalid' ||
			cmd == 'blank' ||
			cmd == 'jumpdst' ||
			cmd == 'asm_comment' ||
			cmd == 'comment') { return 0; }
		return 1;
	}

	function tokenize_line(line) {
		var re_asm_comment = /^--/;
		var re_jump_dst = /^(\S+):/;
		var re_whitespace = /\s+/;

		var match;

		line = line.replace(/^\s+/, '');
		line = line.replace(/\s+$/, '');

		if(line == "") { return [ 'blank' ]; }
		if(match = re_jump_dst.exec(line)) { return ['jumpdst', match[1]]; }
		if(re_asm_comment.test(line)) { return ['asm_comment', line]; }

		var tokens = line.split(re_whitespace);

		var cmd = tokens[0].toLowerCase();

		var onearg = ['copyfrom', 'copyto', 'bumpup', 'bumpdn', 'jump', 'jumpn', 'jumpz', 'add', 'sub', 'comment'];
		var zeroarg = ['inbox', 'outbox'];

		if(tokens.length == 2) {
			for(var i = 0; i < onearg.length; i++) {
				if(cmd == onearg[i]) { return [cmd, tokens[1]]; }
			}
		} else if(tokens.length == 1) {
			for(var i = 0; i < zeroarg.length; i++) {
				if(cmd == zeroarg[i]) { return [cmd]; }
			}
		}

		return [ 'invalid', line ];
	}

	if((typeof lines) === "string") { lines = lines.split(/\r?\n/); }

	// Discard header.
	var line_number_offset = 0;
	if(lines[0] == "-- HUMAN RESOURCE MACHINE PROGRAM --") {
		lines.shift();
		line_number_offset++;
	}

	var parts = this.extract_labels(lines);
	this.comments = parts.labels['comment'];
	this.labels = parts.labels['label'];

	var asm_lines = parts.olines;
	this.code = [];
	var code_line_num = 0;
	var tokens;
	var lineobj;
	for(var line = 0; line < asm_lines.length; line++) {
		tokens = tokenize_line(asm_lines[line]);
		lineobj = {
			cmd: tokens[0],
			src_line_num: line + line_number_offset
		};
		if(is_code(lineobj.cmd)) {
			code_line_num++;
			lineobj.line_num = code_line_num;
		}
		if(tokens.length == 2) { lineobj.arg = tokens[1]; }
		this.code.push(lineobj);
	}
}




// Given an array of strings representing lines in an HRM program,
// break out the graphic labels.  Returns an object:
// .olines - The input lines minus any used by the labels.
// .labels['comment'][NUMBER] = encoded_comment_number
// .labels['label'][NUMBER] = encoded_label_number (the memory address)
HRMParser.prototype.extract_labels = function(ilines) {
	"use strict";
	var out = {};
	out.olines = [];
	out.labels = {};
	out.labels['comment'] = {};
	out.labels['label'] = {};
	for(var i = 0; i < ilines.length; i++) {
		var thisline = ilines[i];
		var match
		//console.log(i,thisline);
		if(match = this.re_define.exec(thisline)) {
			//console.log('hit');
			var body = '';
			var more = 1;
			while(more) {
				i++;
				var line = ilines[i];
				line = line.replace(/^\s+/, '');
				line = line.replace(/\s+$/, '');
				if(/;$/.test(line)) {
					line = line.replace(/;$/, '');
					more = 0;
				}
				body += line;
				if(i >= ilines.length) { more = 0; }
			}
			var mytype = match[1].toLowerCase();
			out.labels[mytype][match[2]] = body;
			//console.log(mytype,">"+match[2]+"->",body);
		} else {
			//console.log('miss');
			out.olines.push(thisline);
		}
	}

	return out;
}

HRMParser.prototype.re_define = /^DEFINE\s+(\S+)\s+(\S+)/i;

////////////////////////////////////////////////////////////////////////////////
// HRMViewer
//
// Inserts a view of Human Resource Machine assembly into current document.
// Take the id of an HTML element into which the view should be inserted, as
// well as either the HRM assembly as a single string a URL to HRM assembly.
// Relative URLs should work.  If it's HRM assembly, not a URL, the assembly
// _must_ contain at least one newline; it's used to identify it.  Conversely,
// a URL may not contain any newlines.
function HRMViewer(id, source) { 
	"use strict";

	// If nothing is passed in, assume the user will call
	// download_and_append_code_table or append_code_table themselves, although
	// that's deprecated.
	if(id === undefined) { return; }

	if(source.indexOf("\n") >= 0) {
		this.append_code_table(id, source);
	} else {
		this.download_and_append_code_table(id, source);
	}
}



HRMViewer.prototype.simple_svg = function(width, height, view_min_x, view_min_y, view_width, view_height) {
	"use strict";
	var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute('version', '1.1');
	svg.setAttribute('baseProfile', 'full');
	if(typeof view_min_x == 'undefined') {
		svg.setAttribute('width', width);
		svg.setAttribute('height', height);
	} else {
		svg.setAttribute('viewBox', view_min_x + " " + view_min_y + " " +
			view_width + " " + view_height);
	}
	svg.setAttribute('xmlns', "http://www.w3.org/2000/svg");
	this.svg = svg;


	this.new_el = function(name) {
		return document.createElementNS(this.svg.namespaceURI,name);
	}

	var marker_size = 2.75;
	var path = this.new_el('path');
	path.setAttribute('d', "M0,0"+" "+
		"L0,"+marker_size+" "+
		"L"+marker_size+","+(marker_size/2)+" "+
		"Z");
	//path.setAttribute('stroke', 'red');
	path.setAttribute('stroke-width', 0);
	path.setAttribute('class', 'jumppatharrow');

	var marker = this.new_el('marker');
	marker.setAttribute('id', 'markerArrow');
	marker.setAttribute('markerWidth', marker_size);
	marker.setAttribute('markerHeight', marker_size);
	marker.setAttribute('refX', '0');
	marker.setAttribute('refY', marker_size/2);
	marker.setAttribute('orient', 'auto');
	marker.setAttribute('markerUnits', 'strokeWidth');
	marker.appendChild(path);

	var defs = this.new_el('defs');
	defs.appendChild(marker);
	this.svg.appendChild(defs);

	this.rect = function(x,y,width,height, color) {
		var e = this.new_el('rect');
		e.setAttribute('x',x);
		e.setAttribute('y',y);
		e.setAttribute('width',width);
		e.setAttribute('height',height);
		e.setAttribute('fill',color);
		this.svg.appendChild(e);
	}

	this.circle = function(x, y, radius, newclass) {
		var e = this.new_el('circle');
		e.setAttribute('cx',x);
		e.setAttribute('cy',y);
		e.setAttribute('r',radius);
		e.setAttribute('class',newclass);
		this.svg.appendChild(e);
	}

	this.polyline = function(points, width, newclass) {
		var e = this.new_el('polyline');
		var pts = "";
		for(var i = 0; i < points.length; i++) {
			pts += points[i][0] + " " + points[i][1] + " ";
		}
		e.setAttribute('points', pts);
		e.setAttribute('class', newclass);
		e.setAttribute('fill', 'transparent');
		e.setAttribute('stroke-width', width);
		this.svg.appendChild(e);
	}

	this.path = function(command, thisclass) {
		var e = this.new_el('path');
		e.setAttribute('d', command);
		e.setAttribute('class', thisclass);
		e.setAttribute('style', 'marker-end: url(#markerArrow)');
		this.svg.appendChild(e);
	}
}

////////////////////////////////////////////////////////////////////////////////
HRMViewer.prototype.new_hrm_label_svg = function(enclabel) {
	"use strict";
	var label = new HRMLabel(enclabel);

	var new_svg = new this.simple_svg(label.width, label.height,
		label.extents.min_x, label.extents.min_y, 
		label.extents.width, label.extents.height);
	for(var i = 0; i < label.strokes.length; i++) {
		var points = label.strokes[i];
		if(points.length == 0) {
		} else if(points.length == 1) {
			new_svg.circle(points[0][0], points[0][1], label.brush_diameter/2, 'stroke');
		} else {
			new_svg.polyline(points, label.brush_diameter, 'stroke');
		}
	}

	return new_svg.svg;
}


////////////////////////////////////////////////////////////////////////////////





HRMViewer.prototype.create_jump_diagram = function(width, height, offset_left, offset_top, srcs, dsts) {
	"use strict";
	var new_svg = new this.simple_svg(width, height);
	//new_svg.rect(0,0,table_width,table_height, 'green');

	var max_start_x = 0;
	var gaps = [];
	for(var i = 0; i < srcs.length; i++) {
		var src = srcs[i]['el'];
		var start_x = src.offset().left + src.outerWidth() - offset_left;
		if(max_start_x < start_x) { max_start_x = start_x; }
		var sy = src.offset().top;

		var label = srcs[i]['dst'];
		if(label in dsts) {
			var dst = dsts[label];
			var dy = dst.offset().top;
			gaps.push(Math.abs(dy-sy));
		}
	}
	gaps.sort(function(a,b){ return a-b; });

	// A "transit" is the point on the arc furthest to the right.  We try to
	// space them out evenly.
	var first_transit = max_start_x + 0;
	var transit_width = 10;
	var last_transit = width - transit_width;
	var num_transits = Math.floor((last_transit - first_transit)/transit_width + 1);

	var transit_breaks = [];
	var gaps_per_transit = gaps.length / num_transits;
	for(var i = 0; i < num_transits; i++) {
		transit_breaks.push(gaps[Math.floor(gaps_per_transit*i)]);
	}
	//console.log("transits",num_transits);
	//console.log("gaps_per_transit",gaps_per_transit);
	//console.log("gaps", gaps);
	//console.log("transit_breaks", transit_breaks);

	for(var i = 0; i < srcs.length; i++) {
		var label = srcs[i]['dst'];
		var src = srcs[i]['el'];
		if(label in dsts) {
			var dst = dsts[label];

			var startx = src.offset().left-offset_left + src.outerWidth();
			var starty = src.offset().top-offset_top + src.outerHeight()/2;

			var endx = dst.offset().left-offset_left + dst.outerWidth() + 25;
			var endy = dst.offset().top-offset_top + dst.outerHeight()/2;

			var gap_y = Math.abs(endy-starty);
			var transit = 0;
			for(transit = 0; transit < transit_breaks.length; transit++) {
				if(gap_y < transit_breaks[transit]) { break; }
			}
			var mid_x = first_transit + transit*transit_width;
			//console.log("(gap:",gap_y,")",first_transit,"+",transit,"*",transit_width,"=",mid_x);

			var mid_y = (starty + endy) / 2;
			var bcurve_y = (starty - endy) / 2;
			var path_cmd = ["M", startx, starty,
				"C", startx + 20, starty,
					mid_x, mid_y + bcurve_y,
					mid_x, mid_y,
				"C", mid_x, mid_y - bcurve_y,
					endx + 20, endy,
					endx, endy
					].join(" ");
			new_svg.path(path_cmd,'jumppath');
		} else {
			console.log("jump label", label, "lacks a matching destination");
		}
	}

	return new_svg.svg;
}

HRMViewer.prototype.append_code_table = function(id, data) {
	"use strict";
	this.root_div = $('#'+id);

	this.root_div.empty();

	var parser = new HRMParser(data);

	this.root = $(document.createElement('table'));

	// fe0e means "render preceeding as text, do not substitute a color emoji.
	// Fixes overly helpful behavior on Safari.
	var rightarrow = '➡\ufe0e';

	this.dsts = {};
	this.srcs = [];
	this.line_to_row = {};

	var num_len = 2;
	var pad = "00000";
	var code_lines = parser.code.length;
	if(code_lines.length > 9999) { num_len = 5; }
	else if(code_lines.length > 999) { num_len = 4; }
	else if(code_lines.length > 99) { num_len = 3; } 
	var line_number = 0;
	for(var i = 0; i < parser.code.length; i++) {
		var linecode = parser.code[i];
		var cmd = linecode.cmd;
		var arg = linecode.arg;
		if(cmd == 'blank') { continue; }
		var newclass = cmd;

		var text = cmd;
		var jmpdst;
		if(cmd == 'bumpup') { text = 'bump +'; }
		else if(cmd == 'bumpdn') { text = 'bump −'; }
		else if(cmd == 'inbox') { text = rightarrow + ' inbox'; }
		else if(cmd == 'outbox') { text = 'outbox ' + rightarrow; }
		else if(cmd == 'asm_comment') {
			text = arg;
			arg = undefined;
		} else if(cmd == 'jumpdst') {
			text = arg;
			arg = undefined;
		} else if(cmd == 'jump' || cmd == 'jumpn' || cmd == 'jumpz') {
			jmpdst = arg;
			arg = undefined;
		}
		
		var comment_id;
		if(cmd == 'comment') {
			comment_id = arg;
			if(comment_id in parser.comments) {
				text = '';
				arg = undefined;
			}
		}

		var e_cmd = $(document.createElement('span'));
		if(cmd == "jumpn" || cmd == "jumpz") {
			e_cmd.append(document.createTextNode("jump"));
			var overunder = $(document.createElement('div'));
			overunder.addClass("jumptype");
			overunder.append(document.createTextNode("if"));
			overunder.append(document.createElement('br'));
			if(text == "jumpn") {
				overunder.append(document.createTextNode("negative"));
			} else if(text == "jumpz") {
				overunder.append(document.createTextNode("zero"));
			} else {
				overunder.append(document.createTextNode("unknown"));
			}
			e_cmd.append(overunder);
		} else {
			e_cmd.text(text);
		}
		e_cmd.addClass(newclass);
		e_cmd.addClass('cmd');

		if(cmd == 'jumpdst') {
			this.dsts[text] = e_cmd;
		}


		if(cmd == "comment") {
			if(comment_id in parser.comments) {
				var svg = this.new_hrm_label_svg(parser.comments[comment_id]);
				svg = $(svg);
				e_cmd.append(svg);
			}
		}

		var re_memory_addr = /^\d+$/;
		var e_arg = 0;
		if(arg !== undefined) {
			e_arg = $(document.createElement('span'));
			e_arg.addClass(newclass);
			e_arg.addClass('arg');
			var tmp;
			if(re_memory_addr.test(arg)) {
				if(arg in parser.labels) {
					var svg = this.new_hrm_label_svg(parser.labels[arg]);
					svg = $(svg);
					e_arg.append(svg);
				} else {
					e_arg.text(arg);
				}
			} else if(tmp = /\[(\d+)\]/.exec(arg)) {
				var num = tmp[1];
				if(num in parser.labels) {
					e_arg.append(document.createTextNode("[ "));
					var svg = this.new_hrm_label_svg(parser.labels[num]);
					svg = $(svg);
					e_arg.append(svg);
					e_arg.append(document.createTextNode(" ]"));
				} else {
					e_arg.text(arg);
				}
			} else {
				e_arg.text(arg);
			}
		}
		if(newclass=='jump' || newclass=='jumpn' || newclass=="jumpz") {
			this.srcs.push({dst:jmpdst, el:e_cmd});
		}

		var new_td_num = $(document.createElement('td'));
		if(linecode.line_num) {
			var linenum = (pad+linecode.line_num).slice(-num_len);
			new_td_num.text(linenum);
		}
		new_td_num.addClass('linenum');

		var new_td_code = $(document.createElement('td'));
		new_td_code.append(e_cmd);
		if(e_arg) {
			new_td_code.append($(document.createTextNode(' ')));
			new_td_code.append(e_arg);
		}

		var new_row = $(document.createElement('tr'));
		new_row.append(new_td_num);
		new_row.append(new_td_code);
		this.root.append(new_row);
		this.line_to_row[linecode.src_line_num] = new_row;
	}

	this.root_div.append(this.root);

	var that=this;
	setTimeout(function(){that.updateJumpArrows()}, 10);
}

HRMViewer.prototype.updateJumpArrows = function() {
	"use strict";
	if(this.svg) { this.svg.remove(); }
	var table_width = this.root.outerWidth();
	var table_height = this.root.outerHeight();
	this.svg = this.create_jump_diagram(
		table_width + 50, table_height,
		this.root_div.offset().left, this.root_div.offset().top,
		this.srcs, this.dsts);
	this.root_div.append(this.svg);
}

// Always clears the current active line. If line_num
// is defined, that line will be highlighted by adding
// the "active" class to the <tr>
HRMViewer.prototype.setActiveLine = function(line_num) {
	if(this.active_row) { this.active_row.removeClass("active"); }
	if(line_num === undefined) { return; }
	this.active_row = this.line_to_row[line_num];
	if(this.active_row) { this.active_row.addClass("active"); }

}

HRMViewer.prototype.download_and_append_code_table = function (id, url) {
	"use strict";
	var t = this;
	function code_arrived(data) {
		t.append_code_table(id, data);
	}
	function failure(xhr,tstatus,err) {
		$('#'+id).empty();
		$('#'+id).text("Error loading "+url+". " + tstatus + " " + err);
	}
	$.ajax({
		url: url,
		success: code_arrived,
		error: failure,
		dataType: 'text',
	});
}

// Backward compatibility interface.  Deprecated.  Prefer HRMViewer.
var hrm_viewer = HRMViewer;
