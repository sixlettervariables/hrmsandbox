/* pako 0.2.8 nodeca/pako */(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.pako = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';


var TYPED_OK =  (typeof Uint8Array !== 'undefined') &&
                (typeof Uint16Array !== 'undefined') &&
                (typeof Int32Array !== 'undefined');


exports.assign = function (obj /*from1, from2, from3, ...*/) {
  var sources = Array.prototype.slice.call(arguments, 1);
  while (sources.length) {
    var source = sources.shift();
    if (!source) { continue; }

    if (typeof source !== 'object') {
      throw new TypeError(source + 'must be non-object');
    }

    for (var p in source) {
      if (source.hasOwnProperty(p)) {
        obj[p] = source[p];
      }
    }
  }

  return obj;
};


// reduce buffer size, avoiding mem copy
exports.shrinkBuf = function (buf, size) {
  if (buf.length === size) { return buf; }
  if (buf.subarray) { return buf.subarray(0, size); }
  buf.length = size;
  return buf;
};


var fnTyped = {
  arraySet: function (dest, src, src_offs, len, dest_offs) {
    if (src.subarray && dest.subarray) {
      dest.set(src.subarray(src_offs, src_offs+len), dest_offs);
      return;
    }
    // Fallback to ordinary array
    for (var i=0; i<len; i++) {
      dest[dest_offs + i] = src[src_offs + i];
    }
  },
  // Join array of chunks to single array.
  flattenChunks: function(chunks) {
    var i, l, len, pos, chunk, result;

    // calculate data length
    len = 0;
    for (i=0, l=chunks.length; i<l; i++) {
      len += chunks[i].length;
    }

    // join chunks
    result = new Uint8Array(len);
    pos = 0;
    for (i=0, l=chunks.length; i<l; i++) {
      chunk = chunks[i];
      result.set(chunk, pos);
      pos += chunk.length;
    }

    return result;
  }
};

var fnUntyped = {
  arraySet: function (dest, src, src_offs, len, dest_offs) {
    for (var i=0; i<len; i++) {
      dest[dest_offs + i] = src[src_offs + i];
    }
  },
  // Join array of chunks to single array.
  flattenChunks: function(chunks) {
    return [].concat.apply([], chunks);
  }
};


// Enable/Disable typed arrays use, for testing
//
exports.setTyped = function (on) {
  if (on) {
    exports.Buf8  = Uint8Array;
    exports.Buf16 = Uint16Array;
    exports.Buf32 = Int32Array;
    exports.assign(exports, fnTyped);
  } else {
    exports.Buf8  = Array;
    exports.Buf16 = Array;
    exports.Buf32 = Array;
    exports.assign(exports, fnUntyped);
  }
};

exports.setTyped(TYPED_OK);

},{}],2:[function(require,module,exports){
// String encode/decode helpers
'use strict';


var utils = require('./common');


// Quick check if we can use fast array to bin string conversion
//
// - apply(Array) can fail on Android 2.2
// - apply(Uint8Array) can fail on iOS 5.1 Safary
//
var STR_APPLY_OK = true;
var STR_APPLY_UIA_OK = true;

try { String.fromCharCode.apply(null, [0]); } catch(__) { STR_APPLY_OK = false; }
try { String.fromCharCode.apply(null, new Uint8Array(1)); } catch(__) { STR_APPLY_UIA_OK = false; }


// Table with utf8 lengths (calculated by first byte of sequence)
// Note, that 5 & 6-byte values and some 4-byte values can not be represented in JS,
// because max possible codepoint is 0x10ffff
var _utf8len = new utils.Buf8(256);
for (var q=0; q<256; q++) {
  _utf8len[q] = (q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1);
}
_utf8len[254]=_utf8len[254]=1; // Invalid sequence start


// convert string to array (typed, when possible)
exports.string2buf = function (str) {
  var buf, c, c2, m_pos, i, str_len = str.length, buf_len = 0;

  // count binary size
  for (m_pos = 0; m_pos < str_len; m_pos++) {
    c = str.charCodeAt(m_pos);
    if ((c & 0xfc00) === 0xd800 && (m_pos+1 < str_len)) {
      c2 = str.charCodeAt(m_pos+1);
      if ((c2 & 0xfc00) === 0xdc00) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        m_pos++;
      }
    }
    buf_len += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }

  // allocate buffer
  buf = new utils.Buf8(buf_len);

  // convert
  for (i=0, m_pos = 0; i < buf_len; m_pos++) {
    c = str.charCodeAt(m_pos);
    if ((c & 0xfc00) === 0xd800 && (m_pos+1 < str_len)) {
      c2 = str.charCodeAt(m_pos+1);
      if ((c2 & 0xfc00) === 0xdc00) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        m_pos++;
      }
    }
    if (c < 0x80) {
      /* one byte */
      buf[i++] = c;
    } else if (c < 0x800) {
      /* two bytes */
      buf[i++] = 0xC0 | (c >>> 6);
      buf[i++] = 0x80 | (c & 0x3f);
    } else if (c < 0x10000) {
      /* three bytes */
      buf[i++] = 0xE0 | (c >>> 12);
      buf[i++] = 0x80 | (c >>> 6 & 0x3f);
      buf[i++] = 0x80 | (c & 0x3f);
    } else {
      /* four bytes */
      buf[i++] = 0xf0 | (c >>> 18);
      buf[i++] = 0x80 | (c >>> 12 & 0x3f);
      buf[i++] = 0x80 | (c >>> 6 & 0x3f);
      buf[i++] = 0x80 | (c & 0x3f);
    }
  }

  return buf;
};

// Helper (used in 2 places)
function buf2binstring(buf, len) {
  // use fallback for big arrays to avoid stack overflow
  if (len < 65537) {
    if ((buf.subarray && STR_APPLY_UIA_OK) || (!buf.subarray && STR_APPLY_OK)) {
      return String.fromCharCode.apply(null, utils.shrinkBuf(buf, len));
    }
  }

  var result = '';
  for (var i=0; i < len; i++) {
    result += String.fromCharCode(buf[i]);
  }
  return result;
}


// Convert byte array to binary string
exports.buf2binstring = function(buf) {
  return buf2binstring(buf, buf.length);
};


// Convert binary string (typed, when possible)
exports.binstring2buf = function(str) {
  var buf = new utils.Buf8(str.length);
  for (var i=0, len=buf.length; i < len; i++) {
    buf[i] = str.charCodeAt(i);
  }
  return buf;
};


// convert array to string
exports.buf2string = function (buf, max) {
  var i, out, c, c_len;
  var len = max || buf.length;

  // Reserve max possible length (2 words per char)
  // NB: by unknown reasons, Array is significantly faster for
  //     String.fromCharCode.apply than Uint16Array.
  var utf16buf = new Array(len*2);

  for (out=0, i=0; i<len;) {
    c = buf[i++];
    // quick process ascii
    if (c < 0x80) { utf16buf[out++] = c; continue; }

    c_len = _utf8len[c];
    // skip 5 & 6 byte codes
    if (c_len > 4) { utf16buf[out++] = 0xfffd; i += c_len-1; continue; }

    // apply mask on first byte
    c &= c_len === 2 ? 0x1f : c_len === 3 ? 0x0f : 0x07;
    // join the rest
    while (c_len > 1 && i < len) {
      c = (c << 6) | (buf[i++] & 0x3f);
      c_len--;
    }

    // terminated by end of string?
    if (c_len > 1) { utf16buf[out++] = 0xfffd; continue; }

    if (c < 0x10000) {
      utf16buf[out++] = c;
    } else {
      c -= 0x10000;
      utf16buf[out++] = 0xd800 | ((c >> 10) & 0x3ff);
      utf16buf[out++] = 0xdc00 | (c & 0x3ff);
    }
  }

  return buf2binstring(utf16buf, out);
};


// Calculate max possible position in utf8 buffer,
// that will not break sequence. If that's not possible
// - (very small limits) return max size as is.
//
// buf[] - utf8 bytes array
// max   - length limit (mandatory);
exports.utf8border = function(buf, max) {
  var pos;

  max = max || buf.length;
  if (max > buf.length) { max = buf.length; }

  // go back from last position, until start of sequence found
  pos = max-1;
  while (pos >= 0 && (buf[pos] & 0xC0) === 0x80) { pos--; }

  // Fuckup - very small and broken sequence,
  // return max, because we should return something anyway.
  if (pos < 0) { return max; }

  // If we came to start of buffer - that means vuffer is too small,
  // return max too.
  if (pos === 0) { return max; }

  return (pos + _utf8len[buf[pos]] > max) ? pos : max;
};

},{"./common":1}],3:[function(require,module,exports){
'use strict';

// Note: adler32 takes 12% for level 0 and 2% for level 6.
// It doesn't worth to make additional optimizationa as in original.
// Small size is preferable.

function adler32(adler, buf, len, pos) {
  var s1 = (adler & 0xffff) |0,
      s2 = ((adler >>> 16) & 0xffff) |0,
      n = 0;

  while (len !== 0) {
    // Set limit ~ twice less than 5552, to keep
    // s2 in 31-bits, because we force signed ints.
    // in other case %= will fail.
    n = len > 2000 ? 2000 : len;
    len -= n;

    do {
      s1 = (s1 + buf[pos++]) |0;
      s2 = (s2 + s1) |0;
    } while (--n);

    s1 %= 65521;
    s2 %= 65521;
  }

  return (s1 | (s2 << 16)) |0;
}


module.exports = adler32;

},{}],4:[function(require,module,exports){
module.exports = {

  /* Allowed flush values; see deflate() and inflate() below for details */
  Z_NO_FLUSH:         0,
  Z_PARTIAL_FLUSH:    1,
  Z_SYNC_FLUSH:       2,
  Z_FULL_FLUSH:       3,
  Z_FINISH:           4,
  Z_BLOCK:            5,
  Z_TREES:            6,

  /* Return codes for the compression/decompression functions. Negative values
  * are errors, positive values are used for special but normal events.
  */
  Z_OK:               0,
  Z_STREAM_END:       1,
  Z_NEED_DICT:        2,
  Z_ERRNO:           -1,
  Z_STREAM_ERROR:    -2,
  Z_DATA_ERROR:      -3,
  //Z_MEM_ERROR:     -4,
  Z_BUF_ERROR:       -5,
  //Z_VERSION_ERROR: -6,

  /* compression levels */
  Z_NO_COMPRESSION:         0,
  Z_BEST_SPEED:             1,
  Z_BEST_COMPRESSION:       9,
  Z_DEFAULT_COMPRESSION:   -1,


  Z_FILTERED:               1,
  Z_HUFFMAN_ONLY:           2,
  Z_RLE:                    3,
  Z_FIXED:                  4,
  Z_DEFAULT_STRATEGY:       0,

  /* Possible values of the data_type field (though see inflate()) */
  Z_BINARY:                 0,
  Z_TEXT:                   1,
  //Z_ASCII:                1, // = Z_TEXT (deprecated)
  Z_UNKNOWN:                2,

  /* The deflate compression method */
  Z_DEFLATED:               8
  //Z_NULL:                 null // Use -1 or null inline, depending on var type
};

},{}],5:[function(require,module,exports){
'use strict';

// Note: we can't get significant speed boost here.
// So write code to minimize size - no pregenerated tables
// and array tools dependencies.


// Use ordinary array, since untyped makes no boost here
function makeTable() {
  var c, table = [];

  for (var n =0; n < 256; n++) {
    c = n;
    for (var k =0; k < 8; k++) {
      c = ((c&1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }

  return table;
}

// Create table on load. Just 255 signed longs. Not a problem.
var crcTable = makeTable();


function crc32(crc, buf, len, pos) {
  var t = crcTable,
      end = pos + len;

  crc = crc ^ (-1);

  for (var i = pos; i < end; i++) {
    crc = (crc >>> 8) ^ t[(crc ^ buf[i]) & 0xFF];
  }

  return (crc ^ (-1)); // >>> 0;
}


module.exports = crc32;

},{}],6:[function(require,module,exports){
'use strict';


function GZheader() {
  /* true if compressed data believed to be text */
  this.text       = 0;
  /* modification time */
  this.time       = 0;
  /* extra flags (not used when writing a gzip file) */
  this.xflags     = 0;
  /* operating system */
  this.os         = 0;
  /* pointer to extra field or Z_NULL if none */
  this.extra      = null;
  /* extra field length (valid if extra != Z_NULL) */
  this.extra_len  = 0; // Actually, we don't need it in JS,
                       // but leave for few code modifications

  //
  // Setup limits is not necessary because in js we should not preallocate memory
  // for inflate use constant limit in 65536 bytes
  //

  /* space at extra (only when reading header) */
  // this.extra_max  = 0;
  /* pointer to zero-terminated file name or Z_NULL */
  this.name       = '';
  /* space at name (only when reading header) */
  // this.name_max   = 0;
  /* pointer to zero-terminated comment or Z_NULL */
  this.comment    = '';
  /* space at comment (only when reading header) */
  // this.comm_max   = 0;
  /* true if there was or will be a header crc */
  this.hcrc       = 0;
  /* true when done reading gzip header (not used when writing a gzip file) */
  this.done       = false;
}

module.exports = GZheader;

},{}],7:[function(require,module,exports){
'use strict';

// See state defs from inflate.js
var BAD = 30;       /* got a data error -- remain here until reset */
var TYPE = 12;      /* i: waiting for type bits, including last-flag bit */

/*
   Decode literal, length, and distance codes and write out the resulting
   literal and match bytes until either not enough input or output is
   available, an end-of-block is encountered, or a data error is encountered.
   When large enough input and output buffers are supplied to inflate(), for
   example, a 16K input buffer and a 64K output buffer, more than 95% of the
   inflate execution time is spent in this routine.

   Entry assumptions:

        state.mode === LEN
        strm.avail_in >= 6
        strm.avail_out >= 258
        start >= strm.avail_out
        state.bits < 8

   On return, state.mode is one of:

        LEN -- ran out of enough output space or enough available input
        TYPE -- reached end of block code, inflate() to interpret next block
        BAD -- error in block data

   Notes:

    - The maximum input bits used by a length/distance pair is 15 bits for the
      length code, 5 bits for the length extra, 15 bits for the distance code,
      and 13 bits for the distance extra.  This totals 48 bits, or six bytes.
      Therefore if strm.avail_in >= 6, then there is enough input to avoid
      checking for available input while decoding.

    - The maximum bytes that a single length/distance pair can output is 258
      bytes, which is the maximum length that can be coded.  inflate_fast()
      requires strm.avail_out >= 258 for each loop to avoid checking for
      output space.
 */
module.exports = function inflate_fast(strm, start) {
  var state;
  var _in;                    /* local strm.input */
  var last;                   /* have enough input while in < last */
  var _out;                   /* local strm.output */
  var beg;                    /* inflate()'s initial strm.output */
  var end;                    /* while out < end, enough space available */
//#ifdef INFLATE_STRICT
  var dmax;                   /* maximum distance from zlib header */
//#endif
  var wsize;                  /* window size or zero if not using window */
  var whave;                  /* valid bytes in the window */
  var wnext;                  /* window write index */
  // Use `s_window` instead `window`, avoid conflict with instrumentation tools
  var s_window;               /* allocated sliding window, if wsize != 0 */
  var hold;                   /* local strm.hold */
  var bits;                   /* local strm.bits */
  var lcode;                  /* local strm.lencode */
  var dcode;                  /* local strm.distcode */
  var lmask;                  /* mask for first level of length codes */
  var dmask;                  /* mask for first level of distance codes */
  var here;                   /* retrieved table entry */
  var op;                     /* code bits, operation, extra bits, or */
                              /*  window position, window bytes to copy */
  var len;                    /* match length, unused bytes */
  var dist;                   /* match distance */
  var from;                   /* where to copy match from */
  var from_source;


  var input, output; // JS specific, because we have no pointers

  /* copy state to local variables */
  state = strm.state;
  //here = state.here;
  _in = strm.next_in;
  input = strm.input;
  last = _in + (strm.avail_in - 5);
  _out = strm.next_out;
  output = strm.output;
  beg = _out - (start - strm.avail_out);
  end = _out + (strm.avail_out - 257);
//#ifdef INFLATE_STRICT
  dmax = state.dmax;
//#endif
  wsize = state.wsize;
  whave = state.whave;
  wnext = state.wnext;
  s_window = state.window;
  hold = state.hold;
  bits = state.bits;
  lcode = state.lencode;
  dcode = state.distcode;
  lmask = (1 << state.lenbits) - 1;
  dmask = (1 << state.distbits) - 1;


  /* decode literals and length/distances until end-of-block or not enough
     input data or output space */

  top:
  do {
    if (bits < 15) {
      hold += input[_in++] << bits;
      bits += 8;
      hold += input[_in++] << bits;
      bits += 8;
    }

    here = lcode[hold & lmask];

    dolen:
    for (;;) { // Goto emulation
      op = here >>> 24/*here.bits*/;
      hold >>>= op;
      bits -= op;
      op = (here >>> 16) & 0xff/*here.op*/;
      if (op === 0) {                          /* literal */
        //Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
        //        "inflate:         literal '%c'\n" :
        //        "inflate:         literal 0x%02x\n", here.val));
        output[_out++] = here & 0xffff/*here.val*/;
      }
      else if (op & 16) {                     /* length base */
        len = here & 0xffff/*here.val*/;
        op &= 15;                           /* number of extra bits */
        if (op) {
          if (bits < op) {
            hold += input[_in++] << bits;
            bits += 8;
          }
          len += hold & ((1 << op) - 1);
          hold >>>= op;
          bits -= op;
        }
        //Tracevv((stderr, "inflate:         length %u\n", len));
        if (bits < 15) {
          hold += input[_in++] << bits;
          bits += 8;
          hold += input[_in++] << bits;
          bits += 8;
        }
        here = dcode[hold & dmask];

        dodist:
        for (;;) { // goto emulation
          op = here >>> 24/*here.bits*/;
          hold >>>= op;
          bits -= op;
          op = (here >>> 16) & 0xff/*here.op*/;

          if (op & 16) {                      /* distance base */
            dist = here & 0xffff/*here.val*/;
            op &= 15;                       /* number of extra bits */
            if (bits < op) {
              hold += input[_in++] << bits;
              bits += 8;
              if (bits < op) {
                hold += input[_in++] << bits;
                bits += 8;
              }
            }
            dist += hold & ((1 << op) - 1);
//#ifdef INFLATE_STRICT
            if (dist > dmax) {
              strm.msg = 'invalid distance too far back';
              state.mode = BAD;
              break top;
            }
//#endif
            hold >>>= op;
            bits -= op;
            //Tracevv((stderr, "inflate:         distance %u\n", dist));
            op = _out - beg;                /* max distance in output */
            if (dist > op) {                /* see if copy from window */
              op = dist - op;               /* distance back in window */
              if (op > whave) {
                if (state.sane) {
                  strm.msg = 'invalid distance too far back';
                  state.mode = BAD;
                  break top;
                }

// (!) This block is disabled in zlib defailts,
// don't enable it for binary compatibility
//#ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
//                if (len <= op - whave) {
//                  do {
//                    output[_out++] = 0;
//                  } while (--len);
//                  continue top;
//                }
//                len -= op - whave;
//                do {
//                  output[_out++] = 0;
//                } while (--op > whave);
//                if (op === 0) {
//                  from = _out - dist;
//                  do {
//                    output[_out++] = output[from++];
//                  } while (--len);
//                  continue top;
//                }
//#endif
              }
              from = 0; // window index
              from_source = s_window;
              if (wnext === 0) {           /* very common case */
                from += wsize - op;
                if (op < len) {         /* some from window */
                  len -= op;
                  do {
                    output[_out++] = s_window[from++];
                  } while (--op);
                  from = _out - dist;  /* rest from output */
                  from_source = output;
                }
              }
              else if (wnext < op) {      /* wrap around window */
                from += wsize + wnext - op;
                op -= wnext;
                if (op < len) {         /* some from end of window */
                  len -= op;
                  do {
                    output[_out++] = s_window[from++];
                  } while (--op);
                  from = 0;
                  if (wnext < len) {  /* some from start of window */
                    op = wnext;
                    len -= op;
                    do {
                      output[_out++] = s_window[from++];
                    } while (--op);
                    from = _out - dist;      /* rest from output */
                    from_source = output;
                  }
                }
              }
              else {                      /* contiguous in window */
                from += wnext - op;
                if (op < len) {         /* some from window */
                  len -= op;
                  do {
                    output[_out++] = s_window[from++];
                  } while (--op);
                  from = _out - dist;  /* rest from output */
                  from_source = output;
                }
              }
              while (len > 2) {
                output[_out++] = from_source[from++];
                output[_out++] = from_source[from++];
                output[_out++] = from_source[from++];
                len -= 3;
              }
              if (len) {
                output[_out++] = from_source[from++];
                if (len > 1) {
                  output[_out++] = from_source[from++];
                }
              }
            }
            else {
              from = _out - dist;          /* copy direct from output */
              do {                        /* minimum length is three */
                output[_out++] = output[from++];
                output[_out++] = output[from++];
                output[_out++] = output[from++];
                len -= 3;
              } while (len > 2);
              if (len) {
                output[_out++] = output[from++];
                if (len > 1) {
                  output[_out++] = output[from++];
                }
              }
            }
          }
          else if ((op & 64) === 0) {          /* 2nd level distance code */
            here = dcode[(here & 0xffff)/*here.val*/ + (hold & ((1 << op) - 1))];
            continue dodist;
          }
          else {
            strm.msg = 'invalid distance code';
            state.mode = BAD;
            break top;
          }

          break; // need to emulate goto via "continue"
        }
      }
      else if ((op & 64) === 0) {              /* 2nd level length code */
        here = lcode[(here & 0xffff)/*here.val*/ + (hold & ((1 << op) - 1))];
        continue dolen;
      }
      else if (op & 32) {                     /* end-of-block */
        //Tracevv((stderr, "inflate:         end of block\n"));
        state.mode = TYPE;
        break top;
      }
      else {
        strm.msg = 'invalid literal/length code';
        state.mode = BAD;
        break top;
      }

      break; // need to emulate goto via "continue"
    }
  } while (_in < last && _out < end);

  /* return unused bytes (on entry, bits < 8, so in won't go too far back) */
  len = bits >> 3;
  _in -= len;
  bits -= len << 3;
  hold &= (1 << bits) - 1;

  /* update state and return */
  strm.next_in = _in;
  strm.next_out = _out;
  strm.avail_in = (_in < last ? 5 + (last - _in) : 5 - (_in - last));
  strm.avail_out = (_out < end ? 257 + (end - _out) : 257 - (_out - end));
  state.hold = hold;
  state.bits = bits;
  return;
};

},{}],8:[function(require,module,exports){
'use strict';


var utils = require('../utils/common');
var adler32 = require('./adler32');
var crc32   = require('./crc32');
var inflate_fast = require('./inffast');
var inflate_table = require('./inftrees');

var CODES = 0;
var LENS = 1;
var DISTS = 2;

/* Public constants ==========================================================*/
/* ===========================================================================*/


/* Allowed flush values; see deflate() and inflate() below for details */
//var Z_NO_FLUSH      = 0;
//var Z_PARTIAL_FLUSH = 1;
//var Z_SYNC_FLUSH    = 2;
//var Z_FULL_FLUSH    = 3;
var Z_FINISH        = 4;
var Z_BLOCK         = 5;
var Z_TREES         = 6;


/* Return codes for the compression/decompression functions. Negative values
 * are errors, positive values are used for special but normal events.
 */
var Z_OK            = 0;
var Z_STREAM_END    = 1;
var Z_NEED_DICT     = 2;
//var Z_ERRNO         = -1;
var Z_STREAM_ERROR  = -2;
var Z_DATA_ERROR    = -3;
var Z_MEM_ERROR     = -4;
var Z_BUF_ERROR     = -5;
//var Z_VERSION_ERROR = -6;

/* The deflate compression method */
var Z_DEFLATED  = 8;


/* STATES ====================================================================*/
/* ===========================================================================*/


var    HEAD = 1;       /* i: waiting for magic header */
var    FLAGS = 2;      /* i: waiting for method and flags (gzip) */
var    TIME = 3;       /* i: waiting for modification time (gzip) */
var    OS = 4;         /* i: waiting for extra flags and operating system (gzip) */
var    EXLEN = 5;      /* i: waiting for extra length (gzip) */
var    EXTRA = 6;      /* i: waiting for extra bytes (gzip) */
var    NAME = 7;       /* i: waiting for end of file name (gzip) */
var    COMMENT = 8;    /* i: waiting for end of comment (gzip) */
var    HCRC = 9;       /* i: waiting for header crc (gzip) */
var    DICTID = 10;    /* i: waiting for dictionary check value */
var    DICT = 11;      /* waiting for inflateSetDictionary() call */
var        TYPE = 12;      /* i: waiting for type bits, including last-flag bit */
var        TYPEDO = 13;    /* i: same, but skip check to exit inflate on new block */
var        STORED = 14;    /* i: waiting for stored size (length and complement) */
var        COPY_ = 15;     /* i/o: same as COPY below, but only first time in */
var        COPY = 16;      /* i/o: waiting for input or output to copy stored block */
var        TABLE = 17;     /* i: waiting for dynamic block table lengths */
var        LENLENS = 18;   /* i: waiting for code length code lengths */
var        CODELENS = 19;  /* i: waiting for length/lit and distance code lengths */
var            LEN_ = 20;      /* i: same as LEN below, but only first time in */
var            LEN = 21;       /* i: waiting for length/lit/eob code */
var            LENEXT = 22;    /* i: waiting for length extra bits */
var            DIST = 23;      /* i: waiting for distance code */
var            DISTEXT = 24;   /* i: waiting for distance extra bits */
var            MATCH = 25;     /* o: waiting for output space to copy string */
var            LIT = 26;       /* o: waiting for output space to write literal */
var    CHECK = 27;     /* i: waiting for 32-bit check value */
var    LENGTH = 28;    /* i: waiting for 32-bit length (gzip) */
var    DONE = 29;      /* finished check, done -- remain here until reset */
var    BAD = 30;       /* got a data error -- remain here until reset */
var    MEM = 31;       /* got an inflate() memory error -- remain here until reset */
var    SYNC = 32;      /* looking for synchronization bytes to restart inflate() */

/* ===========================================================================*/



var ENOUGH_LENS = 852;
var ENOUGH_DISTS = 592;
//var ENOUGH =  (ENOUGH_LENS+ENOUGH_DISTS);

var MAX_WBITS = 15;
/* 32K LZ77 window */
var DEF_WBITS = MAX_WBITS;


function ZSWAP32(q) {
  return  (((q >>> 24) & 0xff) +
          ((q >>> 8) & 0xff00) +
          ((q & 0xff00) << 8) +
          ((q & 0xff) << 24));
}


function InflateState() {
  this.mode = 0;             /* current inflate mode */
  this.last = false;          /* true if processing last block */
  this.wrap = 0;              /* bit 0 true for zlib, bit 1 true for gzip */
  this.havedict = false;      /* true if dictionary provided */
  this.flags = 0;             /* gzip header method and flags (0 if zlib) */
  this.dmax = 0;              /* zlib header max distance (INFLATE_STRICT) */
  this.check = 0;             /* protected copy of check value */
  this.total = 0;             /* protected copy of output count */
  // TODO: may be {}
  this.head = null;           /* where to save gzip header information */

  /* sliding window */
  this.wbits = 0;             /* log base 2 of requested window size */
  this.wsize = 0;             /* window size or zero if not using window */
  this.whave = 0;             /* valid bytes in the window */
  this.wnext = 0;             /* window write index */
  this.window = null;         /* allocated sliding window, if needed */

  /* bit accumulator */
  this.hold = 0;              /* input bit accumulator */
  this.bits = 0;              /* number of bits in "in" */

  /* for string and stored block copying */
  this.length = 0;            /* literal or length of data to copy */
  this.offset = 0;            /* distance back to copy string from */

  /* for table and code decoding */
  this.extra = 0;             /* extra bits needed */

  /* fixed and dynamic code tables */
  this.lencode = null;          /* starting table for length/literal codes */
  this.distcode = null;         /* starting table for distance codes */
  this.lenbits = 0;           /* index bits for lencode */
  this.distbits = 0;          /* index bits for distcode */

  /* dynamic table building */
  this.ncode = 0;             /* number of code length code lengths */
  this.nlen = 0;              /* number of length code lengths */
  this.ndist = 0;             /* number of distance code lengths */
  this.have = 0;              /* number of code lengths in lens[] */
  this.next = null;              /* next available space in codes[] */

  this.lens = new utils.Buf16(320); /* temporary storage for code lengths */
  this.work = new utils.Buf16(288); /* work area for code table building */

  /*
   because we don't have pointers in js, we use lencode and distcode directly
   as buffers so we don't need codes
  */
  //this.codes = new utils.Buf32(ENOUGH);       /* space for code tables */
  this.lendyn = null;              /* dynamic table for length/literal codes (JS specific) */
  this.distdyn = null;             /* dynamic table for distance codes (JS specific) */
  this.sane = 0;                   /* if false, allow invalid distance too far */
  this.back = 0;                   /* bits back of last unprocessed length/lit */
  this.was = 0;                    /* initial length of match */
}

function inflateResetKeep(strm) {
  var state;

  if (!strm || !strm.state) { return Z_STREAM_ERROR; }
  state = strm.state;
  strm.total_in = strm.total_out = state.total = 0;
  strm.msg = ''; /*Z_NULL*/
  if (state.wrap) {       /* to support ill-conceived Java test suite */
    strm.adler = state.wrap & 1;
  }
  state.mode = HEAD;
  state.last = 0;
  state.havedict = 0;
  state.dmax = 32768;
  state.head = null/*Z_NULL*/;
  state.hold = 0;
  state.bits = 0;
  //state.lencode = state.distcode = state.next = state.codes;
  state.lencode = state.lendyn = new utils.Buf32(ENOUGH_LENS);
  state.distcode = state.distdyn = new utils.Buf32(ENOUGH_DISTS);

  state.sane = 1;
  state.back = -1;
  //Tracev((stderr, "inflate: reset\n"));
  return Z_OK;
}

function inflateReset(strm) {
  var state;

  if (!strm || !strm.state) { return Z_STREAM_ERROR; }
  state = strm.state;
  state.wsize = 0;
  state.whave = 0;
  state.wnext = 0;
  return inflateResetKeep(strm);

}

function inflateReset2(strm, windowBits) {
  var wrap;
  var state;

  /* get the state */
  if (!strm || !strm.state) { return Z_STREAM_ERROR; }
  state = strm.state;

  /* extract wrap request from windowBits parameter */
  if (windowBits < 0) {
    wrap = 0;
    windowBits = -windowBits;
  }
  else {
    wrap = (windowBits >> 4) + 1;
    if (windowBits < 48) {
      windowBits &= 15;
    }
  }

  /* set number of window bits, free window if different */
  if (windowBits && (windowBits < 8 || windowBits > 15)) {
    return Z_STREAM_ERROR;
  }
  if (state.window !== null && state.wbits !== windowBits) {
    state.window = null;
  }

  /* update state and reset the rest of it */
  state.wrap = wrap;
  state.wbits = windowBits;
  return inflateReset(strm);
}

function inflateInit2(strm, windowBits) {
  var ret;
  var state;

  if (!strm) { return Z_STREAM_ERROR; }
  //strm.msg = Z_NULL;                 /* in case we return an error */

  state = new InflateState();

  //if (state === Z_NULL) return Z_MEM_ERROR;
  //Tracev((stderr, "inflate: allocated\n"));
  strm.state = state;
  state.window = null/*Z_NULL*/;
  ret = inflateReset2(strm, windowBits);
  if (ret !== Z_OK) {
    strm.state = null/*Z_NULL*/;
  }
  return ret;
}

function inflateInit(strm) {
  return inflateInit2(strm, DEF_WBITS);
}


/*
 Return state with length and distance decoding tables and index sizes set to
 fixed code decoding.  Normally this returns fixed tables from inffixed.h.
 If BUILDFIXED is defined, then instead this routine builds the tables the
 first time it's called, and returns those tables the first time and
 thereafter.  This reduces the size of the code by about 2K bytes, in
 exchange for a little execution time.  However, BUILDFIXED should not be
 used for threaded applications, since the rewriting of the tables and virgin
 may not be thread-safe.
 */
var virgin = true;

var lenfix, distfix; // We have no pointers in JS, so keep tables separate

function fixedtables(state) {
  /* build fixed huffman tables if first call (may not be thread safe) */
  if (virgin) {
    var sym;

    lenfix = new utils.Buf32(512);
    distfix = new utils.Buf32(32);

    /* literal/length table */
    sym = 0;
    while (sym < 144) { state.lens[sym++] = 8; }
    while (sym < 256) { state.lens[sym++] = 9; }
    while (sym < 280) { state.lens[sym++] = 7; }
    while (sym < 288) { state.lens[sym++] = 8; }

    inflate_table(LENS,  state.lens, 0, 288, lenfix,   0, state.work, {bits: 9});

    /* distance table */
    sym = 0;
    while (sym < 32) { state.lens[sym++] = 5; }

    inflate_table(DISTS, state.lens, 0, 32,   distfix, 0, state.work, {bits: 5});

    /* do this just once */
    virgin = false;
  }

  state.lencode = lenfix;
  state.lenbits = 9;
  state.distcode = distfix;
  state.distbits = 5;
}


/*
 Update the window with the last wsize (normally 32K) bytes written before
 returning.  If window does not exist yet, create it.  This is only called
 when a window is already in use, or when output has been written during this
 inflate call, but the end of the deflate stream has not been reached yet.
 It is also called to create a window for dictionary data when a dictionary
 is loaded.

 Providing output buffers larger than 32K to inflate() should provide a speed
 advantage, since only the last 32K of output is copied to the sliding window
 upon return from inflate(), and since all distances after the first 32K of
 output will fall in the output data, making match copies simpler and faster.
 The advantage may be dependent on the size of the processor's data caches.
 */
function updatewindow(strm, src, end, copy) {
  var dist;
  var state = strm.state;

  /* if it hasn't been done already, allocate space for the window */
  if (state.window === null) {
    state.wsize = 1 << state.wbits;
    state.wnext = 0;
    state.whave = 0;

    state.window = new utils.Buf8(state.wsize);
  }

  /* copy state->wsize or less output bytes into the circular window */
  if (copy >= state.wsize) {
    utils.arraySet(state.window,src, end - state.wsize, state.wsize, 0);
    state.wnext = 0;
    state.whave = state.wsize;
  }
  else {
    dist = state.wsize - state.wnext;
    if (dist > copy) {
      dist = copy;
    }
    //zmemcpy(state->window + state->wnext, end - copy, dist);
    utils.arraySet(state.window,src, end - copy, dist, state.wnext);
    copy -= dist;
    if (copy) {
      //zmemcpy(state->window, end - copy, copy);
      utils.arraySet(state.window,src, end - copy, copy, 0);
      state.wnext = copy;
      state.whave = state.wsize;
    }
    else {
      state.wnext += dist;
      if (state.wnext === state.wsize) { state.wnext = 0; }
      if (state.whave < state.wsize) { state.whave += dist; }
    }
  }
  return 0;
}

function inflate(strm, flush) {
  var state;
  var input, output;          // input/output buffers
  var next;                   /* next input INDEX */
  var put;                    /* next output INDEX */
  var have, left;             /* available input and output */
  var hold;                   /* bit buffer */
  var bits;                   /* bits in bit buffer */
  var _in, _out;              /* save starting available input and output */
  var copy;                   /* number of stored or match bytes to copy */
  var from;                   /* where to copy match bytes from */
  var from_source;
  var here = 0;               /* current decoding table entry */
  var here_bits, here_op, here_val; // paked "here" denormalized (JS specific)
  //var last;                   /* parent table entry */
  var last_bits, last_op, last_val; // paked "last" denormalized (JS specific)
  var len;                    /* length to copy for repeats, bits to drop */
  var ret;                    /* return code */
  var hbuf = new utils.Buf8(4);    /* buffer for gzip header crc calculation */
  var opts;

  var n; // temporary var for NEED_BITS

  var order = /* permutation of code lengths */
    [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];


  if (!strm || !strm.state || !strm.output ||
      (!strm.input && strm.avail_in !== 0)) {
    return Z_STREAM_ERROR;
  }

  state = strm.state;
  if (state.mode === TYPE) { state.mode = TYPEDO; }    /* skip check */


  //--- LOAD() ---
  put = strm.next_out;
  output = strm.output;
  left = strm.avail_out;
  next = strm.next_in;
  input = strm.input;
  have = strm.avail_in;
  hold = state.hold;
  bits = state.bits;
  //---

  _in = have;
  _out = left;
  ret = Z_OK;

  inf_leave: // goto emulation
  for (;;) {
    switch (state.mode) {
    case HEAD:
      if (state.wrap === 0) {
        state.mode = TYPEDO;
        break;
      }
      //=== NEEDBITS(16);
      while (bits < 16) {
        if (have === 0) { break inf_leave; }
        have--;
        hold += input[next++] << bits;
        bits += 8;
      }
      //===//
      if ((state.wrap & 2) && hold === 0x8b1f) {  /* gzip header */
        state.check = 0/*crc32(0L, Z_NULL, 0)*/;
        //=== CRC2(state.check, hold);
        hbuf[0] = hold & 0xff;
        hbuf[1] = (hold >>> 8) & 0xff;
        state.check = crc32(state.check, hbuf, 2, 0);
        //===//

        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = FLAGS;
        break;
      }
      state.flags = 0;           /* expect zlib header */
      if (state.head) {
        state.head.done = false;
      }
      if (!(state.wrap & 1) ||   /* check if zlib header allowed */
        (((hold & 0xff)/*BITS(8)*/ << 8) + (hold >> 8)) % 31) {
        strm.msg = 'incorrect header check';
        state.mode = BAD;
        break;
      }
      if ((hold & 0x0f)/*BITS(4)*/ !== Z_DEFLATED) {
        strm.msg = 'unknown compression method';
        state.mode = BAD;
        break;
      }
      //--- DROPBITS(4) ---//
      hold >>>= 4;
      bits -= 4;
      //---//
      len = (hold & 0x0f)/*BITS(4)*/ + 8;
      if (state.wbits === 0) {
        state.wbits = len;
      }
      else if (len > state.wbits) {
        strm.msg = 'invalid window size';
        state.mode = BAD;
        break;
      }
      state.dmax = 1 << len;
      //Tracev((stderr, "inflate:   zlib header ok\n"));
      strm.adler = state.check = 1/*adler32(0L, Z_NULL, 0)*/;
      state.mode = hold & 0x200 ? DICTID : TYPE;
      //=== INITBITS();
      hold = 0;
      bits = 0;
      //===//
      break;
    case FLAGS:
      //=== NEEDBITS(16); */
      while (bits < 16) {
        if (have === 0) { break inf_leave; }
        have--;
        hold += input[next++] << bits;
        bits += 8;
      }
      //===//
      state.flags = hold;
      if ((state.flags & 0xff) !== Z_DEFLATED) {
        strm.msg = 'unknown compression method';
        state.mode = BAD;
        break;
      }
      if (state.flags & 0xe000) {
        strm.msg = 'unknown header flags set';
        state.mode = BAD;
        break;
      }
      if (state.head) {
        state.head.text = ((hold >> 8) & 1);
      }
      if (state.flags & 0x0200) {
        //=== CRC2(state.check, hold);
        hbuf[0] = hold & 0xff;
        hbuf[1] = (hold >>> 8) & 0xff;
        state.check = crc32(state.check, hbuf, 2, 0);
        //===//
      }
      //=== INITBITS();
      hold = 0;
      bits = 0;
      //===//
      state.mode = TIME;
      /* falls through */
    case TIME:
      //=== NEEDBITS(32); */
      while (bits < 32) {
        if (have === 0) { break inf_leave; }
        have--;
        hold += input[next++] << bits;
        bits += 8;
      }
      //===//
      if (state.head) {
        state.head.time = hold;
      }
      if (state.flags & 0x0200) {
        //=== CRC4(state.check, hold)
        hbuf[0] = hold & 0xff;
        hbuf[1] = (hold >>> 8) & 0xff;
        hbuf[2] = (hold >>> 16) & 0xff;
        hbuf[3] = (hold >>> 24) & 0xff;
        state.check = crc32(state.check, hbuf, 4, 0);
        //===
      }
      //=== INITBITS();
      hold = 0;
      bits = 0;
      //===//
      state.mode = OS;
      /* falls through */
    case OS:
      //=== NEEDBITS(16); */
      while (bits < 16) {
        if (have === 0) { break inf_leave; }
        have--;
        hold += input[next++] << bits;
        bits += 8;
      }
      //===//
      if (state.head) {
        state.head.xflags = (hold & 0xff);
        state.head.os = (hold >> 8);
      }
      if (state.flags & 0x0200) {
        //=== CRC2(state.check, hold);
        hbuf[0] = hold & 0xff;
        hbuf[1] = (hold >>> 8) & 0xff;
        state.check = crc32(state.check, hbuf, 2, 0);
        //===//
      }
      //=== INITBITS();
      hold = 0;
      bits = 0;
      //===//
      state.mode = EXLEN;
      /* falls through */
    case EXLEN:
      if (state.flags & 0x0400) {
        //=== NEEDBITS(16); */
        while (bits < 16) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.length = hold;
        if (state.head) {
          state.head.extra_len = hold;
        }
        if (state.flags & 0x0200) {
          //=== CRC2(state.check, hold);
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          state.check = crc32(state.check, hbuf, 2, 0);
          //===//
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
      }
      else if (state.head) {
        state.head.extra = null/*Z_NULL*/;
      }
      state.mode = EXTRA;
      /* falls through */
    case EXTRA:
      if (state.flags & 0x0400) {
        copy = state.length;
        if (copy > have) { copy = have; }
        if (copy) {
          if (state.head) {
            len = state.head.extra_len - state.length;
            if (!state.head.extra) {
              // Use untyped array for more conveniend processing later
              state.head.extra = new Array(state.head.extra_len);
            }
            utils.arraySet(
              state.head.extra,
              input,
              next,
              // extra field is limited to 65536 bytes
              // - no need for additional size check
              copy,
              /*len + copy > state.head.extra_max - len ? state.head.extra_max : copy,*/
              len
            );
            //zmemcpy(state.head.extra + len, next,
            //        len + copy > state.head.extra_max ?
            //        state.head.extra_max - len : copy);
          }
          if (state.flags & 0x0200) {
            state.check = crc32(state.check, input, copy, next);
          }
          have -= copy;
          next += copy;
          state.length -= copy;
        }
        if (state.length) { break inf_leave; }
      }
      state.length = 0;
      state.mode = NAME;
      /* falls through */
    case NAME:
      if (state.flags & 0x0800) {
        if (have === 0) { break inf_leave; }
        copy = 0;
        do {
          // TODO: 2 or 1 bytes?
          len = input[next + copy++];
          /* use constant limit because in js we should not preallocate memory */
          if (state.head && len &&
              (state.length < 65536 /*state.head.name_max*/)) {
            state.head.name += String.fromCharCode(len);
          }
        } while (len && copy < have);

        if (state.flags & 0x0200) {
          state.check = crc32(state.check, input, copy, next);
        }
        have -= copy;
        next += copy;
        if (len) { break inf_leave; }
      }
      else if (state.head) {
        state.head.name = null;
      }
      state.length = 0;
      state.mode = COMMENT;
      /* falls through */
    case COMMENT:
      if (state.flags & 0x1000) {
        if (have === 0) { break inf_leave; }
        copy = 0;
        do {
          len = input[next + copy++];
          /* use constant limit because in js we should not preallocate memory */
          if (state.head && len &&
              (state.length < 65536 /*state.head.comm_max*/)) {
            state.head.comment += String.fromCharCode(len);
          }
        } while (len && copy < have);
        if (state.flags & 0x0200) {
          state.check = crc32(state.check, input, copy, next);
        }
        have -= copy;
        next += copy;
        if (len) { break inf_leave; }
      }
      else if (state.head) {
        state.head.comment = null;
      }
      state.mode = HCRC;
      /* falls through */
    case HCRC:
      if (state.flags & 0x0200) {
        //=== NEEDBITS(16); */
        while (bits < 16) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if (hold !== (state.check & 0xffff)) {
          strm.msg = 'header crc mismatch';
          state.mode = BAD;
          break;
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
      }
      if (state.head) {
        state.head.hcrc = ((state.flags >> 9) & 1);
        state.head.done = true;
      }
      strm.adler = state.check = 0 /*crc32(0L, Z_NULL, 0)*/;
      state.mode = TYPE;
      break;
    case DICTID:
      //=== NEEDBITS(32); */
      while (bits < 32) {
        if (have === 0) { break inf_leave; }
        have--;
        hold += input[next++] << bits;
        bits += 8;
      }
      //===//
      strm.adler = state.check = ZSWAP32(hold);
      //=== INITBITS();
      hold = 0;
      bits = 0;
      //===//
      state.mode = DICT;
      /* falls through */
    case DICT:
      if (state.havedict === 0) {
        //--- RESTORE() ---
        strm.next_out = put;
        strm.avail_out = left;
        strm.next_in = next;
        strm.avail_in = have;
        state.hold = hold;
        state.bits = bits;
        //---
        return Z_NEED_DICT;
      }
      strm.adler = state.check = 1/*adler32(0L, Z_NULL, 0)*/;
      state.mode = TYPE;
      /* falls through */
    case TYPE:
      if (flush === Z_BLOCK || flush === Z_TREES) { break inf_leave; }
      /* falls through */
    case TYPEDO:
      if (state.last) {
        //--- BYTEBITS() ---//
        hold >>>= bits & 7;
        bits -= bits & 7;
        //---//
        state.mode = CHECK;
        break;
      }
      //=== NEEDBITS(3); */
      while (bits < 3) {
        if (have === 0) { break inf_leave; }
        have--;
        hold += input[next++] << bits;
        bits += 8;
      }
      //===//
      state.last = (hold & 0x01)/*BITS(1)*/;
      //--- DROPBITS(1) ---//
      hold >>>= 1;
      bits -= 1;
      //---//

      switch ((hold & 0x03)/*BITS(2)*/) {
      case 0:                             /* stored block */
        //Tracev((stderr, "inflate:     stored block%s\n",
        //        state.last ? " (last)" : ""));
        state.mode = STORED;
        break;
      case 1:                             /* fixed block */
        fixedtables(state);
        //Tracev((stderr, "inflate:     fixed codes block%s\n",
        //        state.last ? " (last)" : ""));
        state.mode = LEN_;             /* decode codes */
        if (flush === Z_TREES) {
          //--- DROPBITS(2) ---//
          hold >>>= 2;
          bits -= 2;
          //---//
          break inf_leave;
        }
        break;
      case 2:                             /* dynamic block */
        //Tracev((stderr, "inflate:     dynamic codes block%s\n",
        //        state.last ? " (last)" : ""));
        state.mode = TABLE;
        break;
      case 3:
        strm.msg = 'invalid block type';
        state.mode = BAD;
      }
      //--- DROPBITS(2) ---//
      hold >>>= 2;
      bits -= 2;
      //---//
      break;
    case STORED:
      //--- BYTEBITS() ---// /* go to byte boundary */
      hold >>>= bits & 7;
      bits -= bits & 7;
      //---//
      //=== NEEDBITS(32); */
      while (bits < 32) {
        if (have === 0) { break inf_leave; }
        have--;
        hold += input[next++] << bits;
        bits += 8;
      }
      //===//
      if ((hold & 0xffff) !== ((hold >>> 16) ^ 0xffff)) {
        strm.msg = 'invalid stored block lengths';
        state.mode = BAD;
        break;
      }
      state.length = hold & 0xffff;
      //Tracev((stderr, "inflate:       stored length %u\n",
      //        state.length));
      //=== INITBITS();
      hold = 0;
      bits = 0;
      //===//
      state.mode = COPY_;
      if (flush === Z_TREES) { break inf_leave; }
      /* falls through */
    case COPY_:
      state.mode = COPY;
      /* falls through */
    case COPY:
      copy = state.length;
      if (copy) {
        if (copy > have) { copy = have; }
        if (copy > left) { copy = left; }
        if (copy === 0) { break inf_leave; }
        //--- zmemcpy(put, next, copy); ---
        utils.arraySet(output, input, next, copy, put);
        //---//
        have -= copy;
        next += copy;
        left -= copy;
        put += copy;
        state.length -= copy;
        break;
      }
      //Tracev((stderr, "inflate:       stored end\n"));
      state.mode = TYPE;
      break;
    case TABLE:
      //=== NEEDBITS(14); */
      while (bits < 14) {
        if (have === 0) { break inf_leave; }
        have--;
        hold += input[next++] << bits;
        bits += 8;
      }
      //===//
      state.nlen = (hold & 0x1f)/*BITS(5)*/ + 257;
      //--- DROPBITS(5) ---//
      hold >>>= 5;
      bits -= 5;
      //---//
      state.ndist = (hold & 0x1f)/*BITS(5)*/ + 1;
      //--- DROPBITS(5) ---//
      hold >>>= 5;
      bits -= 5;
      //---//
      state.ncode = (hold & 0x0f)/*BITS(4)*/ + 4;
      //--- DROPBITS(4) ---//
      hold >>>= 4;
      bits -= 4;
      //---//
//#ifndef PKZIP_BUG_WORKAROUND
      if (state.nlen > 286 || state.ndist > 30) {
        strm.msg = 'too many length or distance symbols';
        state.mode = BAD;
        break;
      }
//#endif
      //Tracev((stderr, "inflate:       table sizes ok\n"));
      state.have = 0;
      state.mode = LENLENS;
      /* falls through */
    case LENLENS:
      while (state.have < state.ncode) {
        //=== NEEDBITS(3);
        while (bits < 3) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.lens[order[state.have++]] = (hold & 0x07);//BITS(3);
        //--- DROPBITS(3) ---//
        hold >>>= 3;
        bits -= 3;
        //---//
      }
      while (state.have < 19) {
        state.lens[order[state.have++]] = 0;
      }
      // We have separate tables & no pointers. 2 commented lines below not needed.
      //state.next = state.codes;
      //state.lencode = state.next;
      // Switch to use dynamic table
      state.lencode = state.lendyn;
      state.lenbits = 7;

      opts = {bits: state.lenbits};
      ret = inflate_table(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts);
      state.lenbits = opts.bits;

      if (ret) {
        strm.msg = 'invalid code lengths set';
        state.mode = BAD;
        break;
      }
      //Tracev((stderr, "inflate:       code lengths ok\n"));
      state.have = 0;
      state.mode = CODELENS;
      /* falls through */
    case CODELENS:
      while (state.have < state.nlen + state.ndist) {
        for (;;) {
          here = state.lencode[hold & ((1 << state.lenbits) - 1)];/*BITS(state.lenbits)*/
          here_bits = here >>> 24;
          here_op = (here >>> 16) & 0xff;
          here_val = here & 0xffff;

          if ((here_bits) <= bits) { break; }
          //--- PULLBYTE() ---//
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
          //---//
        }
        if (here_val < 16) {
          //--- DROPBITS(here.bits) ---//
          hold >>>= here_bits;
          bits -= here_bits;
          //---//
          state.lens[state.have++] = here_val;
        }
        else {
          if (here_val === 16) {
            //=== NEEDBITS(here.bits + 2);
            n = here_bits + 2;
            while (bits < n) {
              if (have === 0) { break inf_leave; }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            //===//
            //--- DROPBITS(here.bits) ---//
            hold >>>= here_bits;
            bits -= here_bits;
            //---//
            if (state.have === 0) {
              strm.msg = 'invalid bit length repeat';
              state.mode = BAD;
              break;
            }
            len = state.lens[state.have - 1];
            copy = 3 + (hold & 0x03);//BITS(2);
            //--- DROPBITS(2) ---//
            hold >>>= 2;
            bits -= 2;
            //---//
          }
          else if (here_val === 17) {
            //=== NEEDBITS(here.bits + 3);
            n = here_bits + 3;
            while (bits < n) {
              if (have === 0) { break inf_leave; }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            //===//
            //--- DROPBITS(here.bits) ---//
            hold >>>= here_bits;
            bits -= here_bits;
            //---//
            len = 0;
            copy = 3 + (hold & 0x07);//BITS(3);
            //--- DROPBITS(3) ---//
            hold >>>= 3;
            bits -= 3;
            //---//
          }
          else {
            //=== NEEDBITS(here.bits + 7);
            n = here_bits + 7;
            while (bits < n) {
              if (have === 0) { break inf_leave; }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            //===//
            //--- DROPBITS(here.bits) ---//
            hold >>>= here_bits;
            bits -= here_bits;
            //---//
            len = 0;
            copy = 11 + (hold & 0x7f);//BITS(7);
            //--- DROPBITS(7) ---//
            hold >>>= 7;
            bits -= 7;
            //---//
          }
          if (state.have + copy > state.nlen + state.ndist) {
            strm.msg = 'invalid bit length repeat';
            state.mode = BAD;
            break;
          }
          while (copy--) {
            state.lens[state.have++] = len;
          }
        }
      }

      /* handle error breaks in while */
      if (state.mode === BAD) { break; }

      /* check for end-of-block code (better have one) */
      if (state.lens[256] === 0) {
        strm.msg = 'invalid code -- missing end-of-block';
        state.mode = BAD;
        break;
      }

      /* build code tables -- note: do not change the lenbits or distbits
         values here (9 and 6) without reading the comments in inftrees.h
         concerning the ENOUGH constants, which depend on those values */
      state.lenbits = 9;

      opts = {bits: state.lenbits};
      ret = inflate_table(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
      // We have separate tables & no pointers. 2 commented lines below not needed.
      // state.next_index = opts.table_index;
      state.lenbits = opts.bits;
      // state.lencode = state.next;

      if (ret) {
        strm.msg = 'invalid literal/lengths set';
        state.mode = BAD;
        break;
      }

      state.distbits = 6;
      //state.distcode.copy(state.codes);
      // Switch to use dynamic table
      state.distcode = state.distdyn;
      opts = {bits: state.distbits};
      ret = inflate_table(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
      // We have separate tables & no pointers. 2 commented lines below not needed.
      // state.next_index = opts.table_index;
      state.distbits = opts.bits;
      // state.distcode = state.next;

      if (ret) {
        strm.msg = 'invalid distances set';
        state.mode = BAD;
        break;
      }
      //Tracev((stderr, 'inflate:       codes ok\n'));
      state.mode = LEN_;
      if (flush === Z_TREES) { break inf_leave; }
      /* falls through */
    case LEN_:
      state.mode = LEN;
      /* falls through */
    case LEN:
      if (have >= 6 && left >= 258) {
        //--- RESTORE() ---
        strm.next_out = put;
        strm.avail_out = left;
        strm.next_in = next;
        strm.avail_in = have;
        state.hold = hold;
        state.bits = bits;
        //---
        inflate_fast(strm, _out);
        //--- LOAD() ---
        put = strm.next_out;
        output = strm.output;
        left = strm.avail_out;
        next = strm.next_in;
        input = strm.input;
        have = strm.avail_in;
        hold = state.hold;
        bits = state.bits;
        //---

        if (state.mode === TYPE) {
          state.back = -1;
        }
        break;
      }
      state.back = 0;
      for (;;) {
        here = state.lencode[hold & ((1 << state.lenbits) -1)];  /*BITS(state.lenbits)*/
        here_bits = here >>> 24;
        here_op = (here >>> 16) & 0xff;
        here_val = here & 0xffff;

        if (here_bits <= bits) { break; }
        //--- PULLBYTE() ---//
        if (have === 0) { break inf_leave; }
        have--;
        hold += input[next++] << bits;
        bits += 8;
        //---//
      }
      if (here_op && (here_op & 0xf0) === 0) {
        last_bits = here_bits;
        last_op = here_op;
        last_val = here_val;
        for (;;) {
          here = state.lencode[last_val +
                  ((hold & ((1 << (last_bits + last_op)) -1))/*BITS(last.bits + last.op)*/ >> last_bits)];
          here_bits = here >>> 24;
          here_op = (here >>> 16) & 0xff;
          here_val = here & 0xffff;

          if ((last_bits + here_bits) <= bits) { break; }
          //--- PULLBYTE() ---//
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
          //---//
        }
        //--- DROPBITS(last.bits) ---//
        hold >>>= last_bits;
        bits -= last_bits;
        //---//
        state.back += last_bits;
      }
      //--- DROPBITS(here.bits) ---//
      hold >>>= here_bits;
      bits -= here_bits;
      //---//
      state.back += here_bits;
      state.length = here_val;
      if (here_op === 0) {
        //Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
        //        "inflate:         literal '%c'\n" :
        //        "inflate:         literal 0x%02x\n", here.val));
        state.mode = LIT;
        break;
      }
      if (here_op & 32) {
        //Tracevv((stderr, "inflate:         end of block\n"));
        state.back = -1;
        state.mode = TYPE;
        break;
      }
      if (here_op & 64) {
        strm.msg = 'invalid literal/length code';
        state.mode = BAD;
        break;
      }
      state.extra = here_op & 15;
      state.mode = LENEXT;
      /* falls through */
    case LENEXT:
      if (state.extra) {
        //=== NEEDBITS(state.extra);
        n = state.extra;
        while (bits < n) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.length += hold & ((1 << state.extra) -1)/*BITS(state.extra)*/;
        //--- DROPBITS(state.extra) ---//
        hold >>>= state.extra;
        bits -= state.extra;
        //---//
        state.back += state.extra;
      }
      //Tracevv((stderr, "inflate:         length %u\n", state.length));
      state.was = state.length;
      state.mode = DIST;
      /* falls through */
    case DIST:
      for (;;) {
        here = state.distcode[hold & ((1 << state.distbits) -1)];/*BITS(state.distbits)*/
        here_bits = here >>> 24;
        here_op = (here >>> 16) & 0xff;
        here_val = here & 0xffff;

        if ((here_bits) <= bits) { break; }
        //--- PULLBYTE() ---//
        if (have === 0) { break inf_leave; }
        have--;
        hold += input[next++] << bits;
        bits += 8;
        //---//
      }
      if ((here_op & 0xf0) === 0) {
        last_bits = here_bits;
        last_op = here_op;
        last_val = here_val;
        for (;;) {
          here = state.distcode[last_val +
                  ((hold & ((1 << (last_bits + last_op)) -1))/*BITS(last.bits + last.op)*/ >> last_bits)];
          here_bits = here >>> 24;
          here_op = (here >>> 16) & 0xff;
          here_val = here & 0xffff;

          if ((last_bits + here_bits) <= bits) { break; }
          //--- PULLBYTE() ---//
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
          //---//
        }
        //--- DROPBITS(last.bits) ---//
        hold >>>= last_bits;
        bits -= last_bits;
        //---//
        state.back += last_bits;
      }
      //--- DROPBITS(here.bits) ---//
      hold >>>= here_bits;
      bits -= here_bits;
      //---//
      state.back += here_bits;
      if (here_op & 64) {
        strm.msg = 'invalid distance code';
        state.mode = BAD;
        break;
      }
      state.offset = here_val;
      state.extra = (here_op) & 15;
      state.mode = DISTEXT;
      /* falls through */
    case DISTEXT:
      if (state.extra) {
        //=== NEEDBITS(state.extra);
        n = state.extra;
        while (bits < n) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.offset += hold & ((1 << state.extra) -1)/*BITS(state.extra)*/;
        //--- DROPBITS(state.extra) ---//
        hold >>>= state.extra;
        bits -= state.extra;
        //---//
        state.back += state.extra;
      }
//#ifdef INFLATE_STRICT
      if (state.offset > state.dmax) {
        strm.msg = 'invalid distance too far back';
        state.mode = BAD;
        break;
      }
//#endif
      //Tracevv((stderr, "inflate:         distance %u\n", state.offset));
      state.mode = MATCH;
      /* falls through */
    case MATCH:
      if (left === 0) { break inf_leave; }
      copy = _out - left;
      if (state.offset > copy) {         /* copy from window */
        copy = state.offset - copy;
        if (copy > state.whave) {
          if (state.sane) {
            strm.msg = 'invalid distance too far back';
            state.mode = BAD;
            break;
          }
// (!) This block is disabled in zlib defailts,
// don't enable it for binary compatibility
//#ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
//          Trace((stderr, "inflate.c too far\n"));
//          copy -= state.whave;
//          if (copy > state.length) { copy = state.length; }
//          if (copy > left) { copy = left; }
//          left -= copy;
//          state.length -= copy;
//          do {
//            output[put++] = 0;
//          } while (--copy);
//          if (state.length === 0) { state.mode = LEN; }
//          break;
//#endif
        }
        if (copy > state.wnext) {
          copy -= state.wnext;
          from = state.wsize - copy;
        }
        else {
          from = state.wnext - copy;
        }
        if (copy > state.length) { copy = state.length; }
        from_source = state.window;
      }
      else {                              /* copy from output */
        from_source = output;
        from = put - state.offset;
        copy = state.length;
      }
      if (copy > left) { copy = left; }
      left -= copy;
      state.length -= copy;
      do {
        output[put++] = from_source[from++];
      } while (--copy);
      if (state.length === 0) { state.mode = LEN; }
      break;
    case LIT:
      if (left === 0) { break inf_leave; }
      output[put++] = state.length;
      left--;
      state.mode = LEN;
      break;
    case CHECK:
      if (state.wrap) {
        //=== NEEDBITS(32);
        while (bits < 32) {
          if (have === 0) { break inf_leave; }
          have--;
          // Use '|' insdead of '+' to make sure that result is signed
          hold |= input[next++] << bits;
          bits += 8;
        }
        //===//
        _out -= left;
        strm.total_out += _out;
        state.total += _out;
        if (_out) {
          strm.adler = state.check =
              /*UPDATE(state.check, put - _out, _out);*/
              (state.flags ? crc32(state.check, output, _out, put - _out) : adler32(state.check, output, _out, put - _out));

        }
        _out = left;
        // NB: crc32 stored as signed 32-bit int, ZSWAP32 returns signed too
        if ((state.flags ? hold : ZSWAP32(hold)) !== state.check) {
          strm.msg = 'incorrect data check';
          state.mode = BAD;
          break;
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        //Tracev((stderr, "inflate:   check matches trailer\n"));
      }
      state.mode = LENGTH;
      /* falls through */
    case LENGTH:
      if (state.wrap && state.flags) {
        //=== NEEDBITS(32);
        while (bits < 32) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if (hold !== (state.total & 0xffffffff)) {
          strm.msg = 'incorrect length check';
          state.mode = BAD;
          break;
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        //Tracev((stderr, "inflate:   length matches trailer\n"));
      }
      state.mode = DONE;
      /* falls through */
    case DONE:
      ret = Z_STREAM_END;
      break inf_leave;
    case BAD:
      ret = Z_DATA_ERROR;
      break inf_leave;
    case MEM:
      return Z_MEM_ERROR;
    case SYNC:
      /* falls through */
    default:
      return Z_STREAM_ERROR;
    }
  }

  // inf_leave <- here is real place for "goto inf_leave", emulated via "break inf_leave"

  /*
     Return from inflate(), updating the total counts and the check value.
     If there was no progress during the inflate() call, return a buffer
     error.  Call updatewindow() to create and/or update the window state.
     Note: a memory error from inflate() is non-recoverable.
   */

  //--- RESTORE() ---
  strm.next_out = put;
  strm.avail_out = left;
  strm.next_in = next;
  strm.avail_in = have;
  state.hold = hold;
  state.bits = bits;
  //---

  if (state.wsize || (_out !== strm.avail_out && state.mode < BAD &&
                      (state.mode < CHECK || flush !== Z_FINISH))) {
    if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) {
      state.mode = MEM;
      return Z_MEM_ERROR;
    }
  }
  _in -= strm.avail_in;
  _out -= strm.avail_out;
  strm.total_in += _in;
  strm.total_out += _out;
  state.total += _out;
  if (state.wrap && _out) {
    strm.adler = state.check = /*UPDATE(state.check, strm.next_out - _out, _out);*/
      (state.flags ? crc32(state.check, output, _out, strm.next_out - _out) : adler32(state.check, output, _out, strm.next_out - _out));
  }
  strm.data_type = state.bits + (state.last ? 64 : 0) +
                    (state.mode === TYPE ? 128 : 0) +
                    (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
  if (((_in === 0 && _out === 0) || flush === Z_FINISH) && ret === Z_OK) {
    ret = Z_BUF_ERROR;
  }
  return ret;
}

function inflateEnd(strm) {

  if (!strm || !strm.state /*|| strm->zfree == (free_func)0*/) {
    return Z_STREAM_ERROR;
  }

  var state = strm.state;
  if (state.window) {
    state.window = null;
  }
  strm.state = null;
  return Z_OK;
}

function inflateGetHeader(strm, head) {
  var state;

  /* check state */
  if (!strm || !strm.state) { return Z_STREAM_ERROR; }
  state = strm.state;
  if ((state.wrap & 2) === 0) { return Z_STREAM_ERROR; }

  /* save header structure */
  state.head = head;
  head.done = false;
  return Z_OK;
}


exports.inflateReset = inflateReset;
exports.inflateReset2 = inflateReset2;
exports.inflateResetKeep = inflateResetKeep;
exports.inflateInit = inflateInit;
exports.inflateInit2 = inflateInit2;
exports.inflate = inflate;
exports.inflateEnd = inflateEnd;
exports.inflateGetHeader = inflateGetHeader;
exports.inflateInfo = 'pako inflate (from Nodeca project)';

/* Not implemented
exports.inflateCopy = inflateCopy;
exports.inflateGetDictionary = inflateGetDictionary;
exports.inflateMark = inflateMark;
exports.inflatePrime = inflatePrime;
exports.inflateSetDictionary = inflateSetDictionary;
exports.inflateSync = inflateSync;
exports.inflateSyncPoint = inflateSyncPoint;
exports.inflateUndermine = inflateUndermine;
*/

},{"../utils/common":1,"./adler32":3,"./crc32":5,"./inffast":7,"./inftrees":9}],9:[function(require,module,exports){
'use strict';


var utils = require('../utils/common');

var MAXBITS = 15;
var ENOUGH_LENS = 852;
var ENOUGH_DISTS = 592;
//var ENOUGH = (ENOUGH_LENS+ENOUGH_DISTS);

var CODES = 0;
var LENS = 1;
var DISTS = 2;

var lbase = [ /* Length codes 257..285 base */
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0
];

var lext = [ /* Length codes 257..285 extra */
  16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18,
  19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78
];

var dbase = [ /* Distance codes 0..29 base */
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577, 0, 0
];

var dext = [ /* Distance codes 0..29 extra */
  16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22,
  23, 23, 24, 24, 25, 25, 26, 26, 27, 27,
  28, 28, 29, 29, 64, 64
];

module.exports = function inflate_table(type, lens, lens_index, codes, table, table_index, work, opts)
{
  var bits = opts.bits;
      //here = opts.here; /* table entry for duplication */

  var len = 0;               /* a code's length in bits */
  var sym = 0;               /* index of code symbols */
  var min = 0, max = 0;          /* minimum and maximum code lengths */
  var root = 0;              /* number of index bits for root table */
  var curr = 0;              /* number of index bits for current table */
  var drop = 0;              /* code bits to drop for sub-table */
  var left = 0;                   /* number of prefix codes available */
  var used = 0;              /* code entries in table used */
  var huff = 0;              /* Huffman code */
  var incr;              /* for incrementing code, index */
  var fill;              /* index for replicating entries */
  var low;               /* low bits for current root entry */
  var mask;              /* mask for low root bits */
  var next;             /* next available space in table */
  var base = null;     /* base value table to use */
  var base_index = 0;
//  var shoextra;    /* extra bits table to use */
  var end;                    /* use base and extra for symbol > end */
  var count = new utils.Buf16(MAXBITS+1); //[MAXBITS+1];    /* number of codes of each length */
  var offs = new utils.Buf16(MAXBITS+1); //[MAXBITS+1];     /* offsets in table for each length */
  var extra = null;
  var extra_index = 0;

  var here_bits, here_op, here_val;

  /*
   Process a set of code lengths to create a canonical Huffman code.  The
   code lengths are lens[0..codes-1].  Each length corresponds to the
   symbols 0..codes-1.  The Huffman code is generated by first sorting the
   symbols by length from short to long, and retaining the symbol order
   for codes with equal lengths.  Then the code starts with all zero bits
   for the first code of the shortest length, and the codes are integer
   increments for the same length, and zeros are appended as the length
   increases.  For the deflate format, these bits are stored backwards
   from their more natural integer increment ordering, and so when the
   decoding tables are built in the large loop below, the integer codes
   are incremented backwards.

   This routine assumes, but does not check, that all of the entries in
   lens[] are in the range 0..MAXBITS.  The caller must assure this.
   1..MAXBITS is interpreted as that code length.  zero means that that
   symbol does not occur in this code.

   The codes are sorted by computing a count of codes for each length,
   creating from that a table of starting indices for each length in the
   sorted table, and then entering the symbols in order in the sorted
   table.  The sorted table is work[], with that space being provided by
   the caller.

   The length counts are used for other purposes as well, i.e. finding
   the minimum and maximum length codes, determining if there are any
   codes at all, checking for a valid set of lengths, and looking ahead
   at length counts to determine sub-table sizes when building the
   decoding tables.
   */

  /* accumulate lengths for codes (assumes lens[] all in 0..MAXBITS) */
  for (len = 0; len <= MAXBITS; len++) {
    count[len] = 0;
  }
  for (sym = 0; sym < codes; sym++) {
    count[lens[lens_index + sym]]++;
  }

  /* bound code lengths, force root to be within code lengths */
  root = bits;
  for (max = MAXBITS; max >= 1; max--) {
    if (count[max] !== 0) { break; }
  }
  if (root > max) {
    root = max;
  }
  if (max === 0) {                     /* no symbols to code at all */
    //table.op[opts.table_index] = 64;  //here.op = (var char)64;    /* invalid code marker */
    //table.bits[opts.table_index] = 1;   //here.bits = (var char)1;
    //table.val[opts.table_index++] = 0;   //here.val = (var short)0;
    table[table_index++] = (1 << 24) | (64 << 16) | 0;


    //table.op[opts.table_index] = 64;
    //table.bits[opts.table_index] = 1;
    //table.val[opts.table_index++] = 0;
    table[table_index++] = (1 << 24) | (64 << 16) | 0;

    opts.bits = 1;
    return 0;     /* no symbols, but wait for decoding to report error */
  }
  for (min = 1; min < max; min++) {
    if (count[min] !== 0) { break; }
  }
  if (root < min) {
    root = min;
  }

  /* check for an over-subscribed or incomplete set of lengths */
  left = 1;
  for (len = 1; len <= MAXBITS; len++) {
    left <<= 1;
    left -= count[len];
    if (left < 0) {
      return -1;
    }        /* over-subscribed */
  }
  if (left > 0 && (type === CODES || max !== 1)) {
    return -1;                      /* incomplete set */
  }

  /* generate offsets into symbol table for each length for sorting */
  offs[1] = 0;
  for (len = 1; len < MAXBITS; len++) {
    offs[len + 1] = offs[len] + count[len];
  }

  /* sort symbols by length, by symbol order within each length */
  for (sym = 0; sym < codes; sym++) {
    if (lens[lens_index + sym] !== 0) {
      work[offs[lens[lens_index + sym]]++] = sym;
    }
  }

  /*
   Create and fill in decoding tables.  In this loop, the table being
   filled is at next and has curr index bits.  The code being used is huff
   with length len.  That code is converted to an index by dropping drop
   bits off of the bottom.  For codes where len is less than drop + curr,
   those top drop + curr - len bits are incremented through all values to
   fill the table with replicated entries.

   root is the number of index bits for the root table.  When len exceeds
   root, sub-tables are created pointed to by the root entry with an index
   of the low root bits of huff.  This is saved in low to check for when a
   new sub-table should be started.  drop is zero when the root table is
   being filled, and drop is root when sub-tables are being filled.

   When a new sub-table is needed, it is necessary to look ahead in the
   code lengths to determine what size sub-table is needed.  The length
   counts are used for this, and so count[] is decremented as codes are
   entered in the tables.

   used keeps track of how many table entries have been allocated from the
   provided *table space.  It is checked for LENS and DIST tables against
   the constants ENOUGH_LENS and ENOUGH_DISTS to guard against changes in
   the initial root table size constants.  See the comments in inftrees.h
   for more information.

   sym increments through all symbols, and the loop terminates when
   all codes of length max, i.e. all codes, have been processed.  This
   routine permits incomplete codes, so another loop after this one fills
   in the rest of the decoding tables with invalid code markers.
   */

  /* set up for code type */
  // poor man optimization - use if-else instead of switch,
  // to avoid deopts in old v8
  if (type === CODES) {
    base = extra = work;    /* dummy value--not used */
    end = 19;

  } else if (type === LENS) {
    base = lbase;
    base_index -= 257;
    extra = lext;
    extra_index -= 257;
    end = 256;

  } else {                    /* DISTS */
    base = dbase;
    extra = dext;
    end = -1;
  }

  /* initialize opts for loop */
  huff = 0;                   /* starting code */
  sym = 0;                    /* starting code symbol */
  len = min;                  /* starting code length */
  next = table_index;              /* current table to fill in */
  curr = root;                /* current table index bits */
  drop = 0;                   /* current bits to drop from code for index */
  low = -1;                   /* trigger new sub-table when len > root */
  used = 1 << root;          /* use root table entries */
  mask = used - 1;            /* mask for comparing low */

  /* check available table space */
  if ((type === LENS && used > ENOUGH_LENS) ||
    (type === DISTS && used > ENOUGH_DISTS)) {
    return 1;
  }

  var i=0;
  /* process all codes and make table entries */
  for (;;) {
    i++;
    /* create table entry */
    here_bits = len - drop;
    if (work[sym] < end) {
      here_op = 0;
      here_val = work[sym];
    }
    else if (work[sym] > end) {
      here_op = extra[extra_index + work[sym]];
      here_val = base[base_index + work[sym]];
    }
    else {
      here_op = 32 + 64;         /* end of block */
      here_val = 0;
    }

    /* replicate for those indices with low len bits equal to huff */
    incr = 1 << (len - drop);
    fill = 1 << curr;
    min = fill;                 /* save offset to next table */
    do {
      fill -= incr;
      table[next + (huff >> drop) + fill] = (here_bits << 24) | (here_op << 16) | here_val |0;
    } while (fill !== 0);

    /* backwards increment the len-bit code huff */
    incr = 1 << (len - 1);
    while (huff & incr) {
      incr >>= 1;
    }
    if (incr !== 0) {
      huff &= incr - 1;
      huff += incr;
    } else {
      huff = 0;
    }

    /* go to next symbol, update count, len */
    sym++;
    if (--count[len] === 0) {
      if (len === max) { break; }
      len = lens[lens_index + work[sym]];
    }

    /* create new sub-table if needed */
    if (len > root && (huff & mask) !== low) {
      /* if first time, transition to sub-tables */
      if (drop === 0) {
        drop = root;
      }

      /* increment past last table */
      next += min;            /* here min is 1 << curr */

      /* determine length of next table */
      curr = len - drop;
      left = 1 << curr;
      while (curr + drop < max) {
        left -= count[curr + drop];
        if (left <= 0) { break; }
        curr++;
        left <<= 1;
      }

      /* check for enough space */
      used += 1 << curr;
      if ((type === LENS && used > ENOUGH_LENS) ||
        (type === DISTS && used > ENOUGH_DISTS)) {
        return 1;
      }

      /* point entry in root table to sub-table */
      low = huff & mask;
      /*table.op[low] = curr;
      table.bits[low] = root;
      table.val[low] = next - opts.table_index;*/
      table[low] = (root << 24) | (curr << 16) | (next - table_index) |0;
    }
  }

  /* fill in remaining table entry if code is incomplete (guaranteed to have
   at most one remaining entry, since if the code is incomplete, the
   maximum code length that was allowed to get this far is one bit) */
  if (huff !== 0) {
    //table.op[next + huff] = 64;            /* invalid code marker */
    //table.bits[next + huff] = len - drop;
    //table.val[next + huff] = 0;
    table[next + huff] = ((len - drop) << 24) | (64 << 16) |0;
  }

  /* set return parameters */
  //opts.table_index += used;
  opts.bits = root;
  return 0;
};

},{"../utils/common":1}],10:[function(require,module,exports){
'use strict';

module.exports = {
  '2':    'need dictionary',     /* Z_NEED_DICT       2  */
  '1':    'stream end',          /* Z_STREAM_END      1  */
  '0':    '',                    /* Z_OK              0  */
  '-1':   'file error',          /* Z_ERRNO         (-1) */
  '-2':   'stream error',        /* Z_STREAM_ERROR  (-2) */
  '-3':   'data error',          /* Z_DATA_ERROR    (-3) */
  '-4':   'insufficient memory', /* Z_MEM_ERROR     (-4) */
  '-5':   'buffer error',        /* Z_BUF_ERROR     (-5) */
  '-6':   'incompatible version' /* Z_VERSION_ERROR (-6) */
};

},{}],11:[function(require,module,exports){
'use strict';


function ZStream() {
  /* next input byte */
  this.input = null; // JS specific, because we have no pointers
  this.next_in = 0;
  /* number of bytes available at input */
  this.avail_in = 0;
  /* total number of input bytes read so far */
  this.total_in = 0;
  /* next output byte should be put there */
  this.output = null; // JS specific, because we have no pointers
  this.next_out = 0;
  /* remaining free space at output */
  this.avail_out = 0;
  /* total number of bytes output so far */
  this.total_out = 0;
  /* last error message, NULL if no error */
  this.msg = ''/*Z_NULL*/;
  /* not visible by applications */
  this.state = null;
  /* best guess about the data type: binary or text */
  this.data_type = 2/*Z_UNKNOWN*/;
  /* adler32 value of the uncompressed data */
  this.adler = 0;
}

module.exports = ZStream;

},{}],"/lib/inflate.js":[function(require,module,exports){
'use strict';


var zlib_inflate = require('./zlib/inflate.js');
var utils = require('./utils/common');
var strings = require('./utils/strings');
var c = require('./zlib/constants');
var msg = require('./zlib/messages');
var zstream = require('./zlib/zstream');
var gzheader = require('./zlib/gzheader');

var toString = Object.prototype.toString;

/**
 * class Inflate
 *
 * Generic JS-style wrapper for zlib calls. If you don't need
 * streaming behaviour - use more simple functions: [[inflate]]
 * and [[inflateRaw]].
 **/

/* internal
 * inflate.chunks -> Array
 *
 * Chunks of output data, if [[Inflate#onData]] not overriden.
 **/

/**
 * Inflate.result -> Uint8Array|Array|String
 *
 * Uncompressed result, generated by default [[Inflate#onData]]
 * and [[Inflate#onEnd]] handlers. Filled after you push last chunk
 * (call [[Inflate#push]] with `Z_FINISH` / `true` param) or if you
 * push a chunk with explicit flush (call [[Inflate#push]] with
 * `Z_SYNC_FLUSH` param).
 **/

/**
 * Inflate.err -> Number
 *
 * Error code after inflate finished. 0 (Z_OK) on success.
 * Should be checked if broken data possible.
 **/

/**
 * Inflate.msg -> String
 *
 * Error message, if [[Inflate.err]] != 0
 **/


/**
 * new Inflate(options)
 * - options (Object): zlib inflate options.
 *
 * Creates new inflator instance with specified params. Throws exception
 * on bad params. Supported options:
 *
 * - `windowBits`
 *
 * [http://zlib.net/manual.html#Advanced](http://zlib.net/manual.html#Advanced)
 * for more information on these.
 *
 * Additional options, for internal needs:
 *
 * - `chunkSize` - size of generated data chunks (16K by default)
 * - `raw` (Boolean) - do raw inflate
 * - `to` (String) - if equal to 'string', then result will be converted
 *   from utf8 to utf16 (javascript) string. When string output requested,
 *   chunk length can differ from `chunkSize`, depending on content.
 *
 * By default, when no options set, autodetect deflate/gzip data format via
 * wrapper header.
 *
 * ##### Example:
 *
 * ```javascript
 * var pako = require('pako')
 *   , chunk1 = Uint8Array([1,2,3,4,5,6,7,8,9])
 *   , chunk2 = Uint8Array([10,11,12,13,14,15,16,17,18,19]);
 *
 * var inflate = new pako.Inflate({ level: 3});
 *
 * inflate.push(chunk1, false);
 * inflate.push(chunk2, true);  // true -> last chunk
 *
 * if (inflate.err) { throw new Error(inflate.err); }
 *
 * console.log(inflate.result);
 * ```
 **/
var Inflate = function(options) {

  this.options = utils.assign({
    chunkSize: 16384,
    windowBits: 0,
    to: ''
  }, options || {});

  var opt = this.options;

  // Force window size for `raw` data, if not set directly,
  // because we have no header for autodetect.
  if (opt.raw && (opt.windowBits >= 0) && (opt.windowBits < 16)) {
    opt.windowBits = -opt.windowBits;
    if (opt.windowBits === 0) { opt.windowBits = -15; }
  }

  // If `windowBits` not defined (and mode not raw) - set autodetect flag for gzip/deflate
  if ((opt.windowBits >= 0) && (opt.windowBits < 16) &&
      !(options && options.windowBits)) {
    opt.windowBits += 32;
  }

  // Gzip header has no info about windows size, we can do autodetect only
  // for deflate. So, if window size not set, force it to max when gzip possible
  if ((opt.windowBits > 15) && (opt.windowBits < 48)) {
    // bit 3 (16) -> gzipped data
    // bit 4 (32) -> autodetect gzip/deflate
    if ((opt.windowBits & 15) === 0) {
      opt.windowBits |= 15;
    }
  }

  this.err    = 0;      // error code, if happens (0 = Z_OK)
  this.msg    = '';     // error message
  this.ended  = false;  // used to avoid multiple onEnd() calls
  this.chunks = [];     // chunks of compressed data

  this.strm   = new zstream();
  this.strm.avail_out = 0;

  var status  = zlib_inflate.inflateInit2(
    this.strm,
    opt.windowBits
  );

  if (status !== c.Z_OK) {
    throw new Error(msg[status]);
  }

  this.header = new gzheader();

  zlib_inflate.inflateGetHeader(this.strm, this.header);
};

/**
 * Inflate#push(data[, mode]) -> Boolean
 * - data (Uint8Array|Array|ArrayBuffer|String): input data
 * - mode (Number|Boolean): 0..6 for corresponding Z_NO_FLUSH..Z_TREE modes.
 *   See constants. Skipped or `false` means Z_NO_FLUSH, `true` meansh Z_FINISH.
 *
 * Sends input data to inflate pipe, generating [[Inflate#onData]] calls with
 * new output chunks. Returns `true` on success. The last data block must have
 * mode Z_FINISH (or `true`). That will flush internal pending buffers and call
 * [[Inflate#onEnd]]. For interim explicit flushes (without ending the stream) you
 * can use mode Z_SYNC_FLUSH, keeping the decompression context.
 *
 * On fail call [[Inflate#onEnd]] with error code and return false.
 *
 * We strongly recommend to use `Uint8Array` on input for best speed (output
 * format is detected automatically). Also, don't skip last param and always
 * use the same type in your code (boolean or number). That will improve JS speed.
 *
 * For regular `Array`-s make sure all elements are [0..255].
 *
 * ##### Example
 *
 * ```javascript
 * push(chunk, false); // push one of data chunks
 * ...
 * push(chunk, true);  // push last chunk
 * ```
 **/
Inflate.prototype.push = function(data, mode) {
  var strm = this.strm;
  var chunkSize = this.options.chunkSize;
  var status, _mode;
  var next_out_utf8, tail, utf8str;

  // Flag to properly process Z_BUF_ERROR on testing inflate call
  // when we check that all output data was flushed.
  var allowBufError = false;

  if (this.ended) { return false; }
  _mode = (mode === ~~mode) ? mode : ((mode === true) ? c.Z_FINISH : c.Z_NO_FLUSH);

  // Convert data if needed
  if (typeof data === 'string') {
    // Only binary strings can be decompressed on practice
    strm.input = strings.binstring2buf(data);
  } else if (toString.call(data) === '[object ArrayBuffer]') {
    strm.input = new Uint8Array(data);
  } else {
    strm.input = data;
  }

  strm.next_in = 0;
  strm.avail_in = strm.input.length;

  do {
    if (strm.avail_out === 0) {
      strm.output = new utils.Buf8(chunkSize);
      strm.next_out = 0;
      strm.avail_out = chunkSize;
    }

    status = zlib_inflate.inflate(strm, c.Z_NO_FLUSH);    /* no bad return value */

    if (status === c.Z_BUF_ERROR && allowBufError === true) {
      status = c.Z_OK;
      allowBufError = false;
    }

    if (status !== c.Z_STREAM_END && status !== c.Z_OK) {
      this.onEnd(status);
      this.ended = true;
      return false;
    }

    if (strm.next_out) {
      if (strm.avail_out === 0 || status === c.Z_STREAM_END || (strm.avail_in === 0 && (_mode === c.Z_FINISH || _mode === c.Z_SYNC_FLUSH))) {

        if (this.options.to === 'string') {

          next_out_utf8 = strings.utf8border(strm.output, strm.next_out);

          tail = strm.next_out - next_out_utf8;
          utf8str = strings.buf2string(strm.output, next_out_utf8);

          // move tail
          strm.next_out = tail;
          strm.avail_out = chunkSize - tail;
          if (tail) { utils.arraySet(strm.output, strm.output, next_out_utf8, tail, 0); }

          this.onData(utf8str);

        } else {
          this.onData(utils.shrinkBuf(strm.output, strm.next_out));
        }
      }
    }

    // When no more input data, we should check that internal inflate buffers
    // are flushed. The only way to do it when avail_out = 0 - run one more
    // inflate pass. But if output data not exists, inflate return Z_BUF_ERROR.
    // Here we set flag to process this error properly.
    //
    // NOTE. Deflate does not return error in this case and does not needs such
    // logic.
    if (strm.avail_in === 0 && strm.avail_out === 0) {
      allowBufError = true;
    }

  } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== c.Z_STREAM_END);

  if (status === c.Z_STREAM_END) {
    _mode = c.Z_FINISH;
  }

  // Finalize on the last chunk.
  if (_mode === c.Z_FINISH) {
    status = zlib_inflate.inflateEnd(this.strm);
    this.onEnd(status);
    this.ended = true;
    return status === c.Z_OK;
  }

  // callback interim results if Z_SYNC_FLUSH.
  if (_mode === c.Z_SYNC_FLUSH) {
    this.onEnd(c.Z_OK);
    strm.avail_out = 0;
    return true;
  }

  return true;
};


/**
 * Inflate#onData(chunk) -> Void
 * - chunk (Uint8Array|Array|String): ouput data. Type of array depends
 *   on js engine support. When string output requested, each chunk
 *   will be string.
 *
 * By default, stores data blocks in `chunks[]` property and glue
 * those in `onEnd`. Override this handler, if you need another behaviour.
 **/
Inflate.prototype.onData = function(chunk) {
  this.chunks.push(chunk);
};


/**
 * Inflate#onEnd(status) -> Void
 * - status (Number): inflate status. 0 (Z_OK) on success,
 *   other if not.
 *
 * Called either after you tell inflate that the input stream is
 * complete (Z_FINISH) or should be flushed (Z_SYNC_FLUSH)
 * or if an error happened. By default - join collected chunks,
 * free memory and fill `results` / `err` properties.
 **/
Inflate.prototype.onEnd = function(status) {
  // On success - join
  if (status === c.Z_OK) {
    if (this.options.to === 'string') {
      // Glue & convert here, until we teach pako to send
      // utf8 alligned strings to onData
      this.result = this.chunks.join('');
    } else {
      this.result = utils.flattenChunks(this.chunks);
    }
  }
  this.chunks = [];
  this.err = status;
  this.msg = this.strm.msg;
};


/**
 * inflate(data[, options]) -> Uint8Array|Array|String
 * - data (Uint8Array|Array|String): input data to decompress.
 * - options (Object): zlib inflate options.
 *
 * Decompress `data` with inflate/ungzip and `options`. Autodetect
 * format via wrapper header by default. That's why we don't provide
 * separate `ungzip` method.
 *
 * Supported options are:
 *
 * - windowBits
 *
 * [http://zlib.net/manual.html#Advanced](http://zlib.net/manual.html#Advanced)
 * for more information.
 *
 * Sugar (options):
 *
 * - `raw` (Boolean) - say that we work with raw stream, if you don't wish to specify
 *   negative windowBits implicitly.
 * - `to` (String) - if equal to 'string', then result will be converted
 *   from utf8 to utf16 (javascript) string. When string output requested,
 *   chunk length can differ from `chunkSize`, depending on content.
 *
 *
 * ##### Example:
 *
 * ```javascript
 * var pako = require('pako')
 *   , input = pako.deflate([1,2,3,4,5,6,7,8,9])
 *   , output;
 *
 * try {
 *   output = pako.inflate(input);
 * } catch (err)
 *   console.log(err);
 * }
 * ```
 **/
function inflate(input, options) {
  var inflator = new Inflate(options);

  inflator.push(input, true);

  // That will never happens, if you don't cheat with options :)
  if (inflator.err) { throw inflator.msg; }

  return inflator.result;
}


/**
 * inflateRaw(data[, options]) -> Uint8Array|Array|String
 * - data (Uint8Array|Array|String): input data to decompress.
 * - options (Object): zlib inflate options.
 *
 * The same as [[inflate]], but creates raw data, without wrapper
 * (header and adler32 crc).
 **/
function inflateRaw(input, options) {
  options = options || {};
  options.raw = true;
  return inflate(input, options);
}


/**
 * ungzip(data[, options]) -> Uint8Array|Array|String
 * - data (Uint8Array|Array|String): input data to decompress.
 * - options (Object): zlib inflate options.
 *
 * Just shortcut to [[inflate]], because it autodetects format
 * by header.content. Done for convenience.
 **/


exports.Inflate = Inflate;
exports.inflate = inflate;
exports.inflateRaw = inflateRaw;
exports.ungzip  = inflate;

},{"./utils/common":1,"./utils/strings":2,"./zlib/constants":4,"./zlib/gzheader":6,"./zlib/inflate.js":8,"./zlib/messages":10,"./zlib/zstream":11}]},{},[])("/lib/inflate.js")
});
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

// jshint ignore: start
/*!

Split Pane v0.1

Copyright (c) 2012 Simon HagstrÃ¶m

Released under the MIT license
https://raw.github.com/shagstrom/split-pane/master/LICENSE

*/
(function($) {

	$.fn.splitPane = function() {
		var $splitPanes = this;
		$splitPanes.each(setMinHeightAndMinWidth);
		$splitPanes.append('<div class="split-pane-resize-shim">');
		$splitPanes.children('.split-pane-divider').bind('mousedown', mousedownHandler);
		setTimeout(function() {
			// Doing this later because of an issue with Chrome (v23.0.1271.64) returning split-pane width = 0
			// and triggering multiple resize events when page is being opened from an <a target="_blank"> .
			$splitPanes.bind('_splitpaneparentresize', parentresizeHandler);
			$(window).trigger('resize');
		}, 100);
	};

	var SPLITPANERESIZE_HANDLER = '_splitpaneparentresizeHandler';

	/**
	 * A special event that will "capture" a resize event from the parent split-pane or window.
	 * The event will NOT propagate to grandchildren.
	 */
	jQuery.event.special._splitpaneparentresize = {
		setup: function(data, namespaces) {
			var element = this,
				parent = $(this).parent().closest('.split-pane')[0] || window;
			$(this).data(SPLITPANERESIZE_HANDLER, function(event) {
				var target = event.target === document ? window : event.target;
				if (target === parent) {
					event.type = "_splitpaneparentresize";
					jQuery.event.handle.apply(element, arguments);
				} else {
					event.stopPropagation();
				}
			});
			$(parent).bind('resize', $(this).data(SPLITPANERESIZE_HANDLER));
		},
		teardown: function(namespaces) {
			var parent = $(this).parent().closest('.split-pane')[0] || window;
			$(parent).unbind('resize', $(this).data(SPLITPANERESIZE_HANDLER));
			$(this).removeData(SPLITPANERESIZE_HANDLER);
		}
	};

	function setMinHeightAndMinWidth() {
		var $splitPane = $(this),
			$firstComponent = $splitPane.children('.split-pane-component:first'),
			$divider = $splitPane.children('.split-pane-divider'),
			$lastComponent = $splitPane.children('.split-pane-component:last');
		if ($splitPane.is('.fixed-top, .fixed-bottom, .horizontal-percent')) {
			$splitPane.css('min-height', (minHeight($firstComponent) + minHeight($lastComponent) + $divider.height()) + 'px');
		} else {
			$splitPane.css('min-width', (minWidth($firstComponent) + minWidth($lastComponent) + $divider.width()) + 'px');
		}
	}

	function mousedownHandler(event) {
		event.preventDefault();
		var $resizeShim = $(this).siblings('.split-pane-resize-shim').show(),
			mousemove = createMousemove($(this).parent(), event.pageX, event.pageY);
		$(document).mousemove(mousemove);
		$(document).one('mouseup', function(event) {
			$(document).unbind('mousemove', mousemove);
			$resizeShim.hide();
		});
	}

	function parentresizeHandler() {
		var $splitPane = $(this),
			$firstComponent = $splitPane.children('.split-pane-component:first'),
			$divider = $splitPane.children('.split-pane-divider'),
			$lastComponent = $splitPane.children('.split-pane-component:last');
		if ($splitPane.is('.fixed-top')) {
			var maxfirstComponentHeight = $splitPane.height() - minHeight($lastComponent) - $divider.height();
			if ($firstComponent.height() > maxfirstComponentHeight) {
				setTop($splitPane, $firstComponent, $divider, $lastComponent, maxfirstComponentHeight + 'px');
			} else {
				$splitPane.resize();
			}
		} else if ($splitPane.is('.fixed-bottom')) {
			var maxLastComponentHeight = $splitPane.height() - minHeight($firstComponent) - $divider.height();
			if ($lastComponent.height() > maxLastComponentHeight) {
				setBottom($splitPane, $firstComponent, $divider, $lastComponent, maxLastComponentHeight + 'px')
			} else {
				$splitPane.resize();
			}
		} else if ($splitPane.is('.horizontal-percent')) {
			var maxLastComponentHeight = $splitPane.height() - minHeight($firstComponent) - $divider.height();
			if ($lastComponent.height() > maxLastComponentHeight) {
				setBottom($splitPane, $firstComponent, $divider, $lastComponent, (maxLastComponentHeight / $splitPane.height() * 100) + '%');
			} else {
				var lastComponentMinHeight = minHeight($lastComponent);
				if ($splitPane.height() - $firstComponent.height() - $divider.height() < lastComponentMinHeight) {
					setBottom($splitPane, $firstComponent, $divider, $lastComponent, (lastComponentMinHeight / $splitPane.height() * 100) + '%');
				} else {
					$splitPane.resize();
				}
			}
		} else if ($splitPane.is('.fixed-left')) {
			var maxFirstComponentWidth = $splitPane.width() - minWidth($lastComponent) - $divider.width();
			if ($firstComponent.width() > maxFirstComponentWidth) {
				setLeft($splitPane, $firstComponent, $divider, $lastComponent, maxFirstComponentWidth + 'px');
			} else {
				$splitPane.resize();
			}
		} else if ($splitPane.is('.fixed-right')) {
			var maxLastComponentWidth = $splitPane.width() - minWidth($firstComponent) - $divider.width();
			if ($lastComponent.width() > maxLastComponentWidth) {
				setRight($splitPane, $firstComponent, $divider, $lastComponent, maxLastComponentWidth + 'px')
			} else {
				$splitPane.resize();
			}
		} else if ($splitPane.is('.vertical-percent')) {
			var maxLastComponentWidth = $splitPane.width() - minWidth($firstComponent) - $divider.width();
			if ($lastComponent.width() > maxLastComponentWidth) {
				setRight($splitPane, $firstComponent, $divider, $lastComponent, (maxLastComponentWidth / $splitPane.width() * 100) + '%');
			} else {
				var lastComponentMinWidth = minWidth($lastComponent);
				if ($splitPane.width() - $firstComponent.width() - $divider.width() < lastComponentMinWidth) {
					setRight($splitPane, $firstComponent, $divider, $lastComponent, (lastComponentMinWidth / $splitPane.width() * 100) + '%');
				} else {
					$splitPane.resize();
				}
			}
		}
	}

	function createMousemove($splitPane, pageX, pageY) {
		var $firstComponent = $splitPane.children('.split-pane-component:first'),
			$divider = $splitPane.children('.split-pane-divider'),
			$lastComponent = $splitPane.children('.split-pane-component:last');
		if ($splitPane.is('.fixed-top')) {
			var firstComponentMinHeight =  minHeight($firstComponent),
				maxFirstComponentHeight = $splitPane.height() - minHeight($lastComponent) - $divider.height(),
				topOffset = $divider.position().top - pageY;
			return function(event) {
				event.preventDefault();
				var top = Math.min(Math.max(firstComponentMinHeight, topOffset + event.pageY), maxFirstComponentHeight);
				setTop($splitPane, $firstComponent, $divider, $lastComponent, top + 'px')
			};
		} else if ($splitPane.is('.fixed-bottom')) {
			var lastComponentMinHeight = minHeight($lastComponent),
				maxLastComponentHeight = $splitPane.height() - minHeight($firstComponent) - $divider.height(),
				bottomOffset = $lastComponent.height() + pageY;
			return function(event) {
				event.preventDefault();
				var bottom = Math.min(Math.max(lastComponentMinHeight, bottomOffset - event.pageY), maxLastComponentHeight);
				setBottom($splitPane, $firstComponent, $divider, $lastComponent, bottom + 'px');
			};
		} else if ($splitPane.is('.horizontal-percent')) {
			var splitPaneHeight = $splitPane.height(),
				lastComponentMinHeight = minHeight($lastComponent),
				maxLastComponentHeight = splitPaneHeight - minHeight($firstComponent) - $divider.height(),
				bottomOffset = $lastComponent.height() + pageY;
			return function(event) {
				event.preventDefault();
				var bottom = Math.min(Math.max(lastComponentMinHeight, bottomOffset - event.pageY), maxLastComponentHeight);
				setBottom($splitPane, $firstComponent, $divider, $lastComponent, (bottom / splitPaneHeight * 100) + '%');
			};
		} else if ($splitPane.is('.fixed-left')) {
			var firstComponentMinWidth = minWidth($firstComponent),
				maxFirstComponentWidth = $splitPane.width() - minWidth($lastComponent) - $divider.width(),
				leftOffset = $divider.position().left - pageX;
			return function(event) {
				event.preventDefault();
				var left = Math.min(Math.max(firstComponentMinWidth, leftOffset + event.pageX), maxFirstComponentWidth);
				setLeft($splitPane, $firstComponent, $divider, $lastComponent, left + 'px')
			};
		} else if ($splitPane.is('.fixed-right')) {
			var lastComponentMinWidth = minWidth($lastComponent),
				maxLastComponentWidth = $splitPane.width() - minWidth($firstComponent) - $divider.width(),
				rightOffset = $lastComponent.width() + pageX;
			return function(event) {
				event.preventDefault();
				var right = Math.min(Math.max(lastComponentMinWidth, rightOffset - event.pageX), maxLastComponentWidth);
				setRight($splitPane, $firstComponent, $divider, $lastComponent, right + 'px');
			};
		} else if ($splitPane.is('.vertical-percent')) {
			var splitPaneWidth = $splitPane.width(),
				lastComponentMinWidth = minWidth($lastComponent),
				maxLastComponentWidth = splitPaneWidth - minWidth($firstComponent) - $divider.width(),
				rightOffset = $lastComponent.width() + pageX;
			return function(event) {
				event.preventDefault();
				var right = Math.min(Math.max(lastComponentMinWidth, rightOffset - event.pageX), maxLastComponentWidth);
				setRight($splitPane, $firstComponent, $divider, $lastComponent, (right / splitPaneWidth * 100) + '%');
			};
		}
	}

	function minHeight($element) {
		return parseInt($element.css('min-height')) || 0;
	}

	function minWidth($element) {
		return parseInt($element.css('min-width')) || 0;
	}

	function setTop($splitPane, $firstComponent, $divider, $lastComponent, top) {
		$firstComponent.css('height', top);
		$divider.css('top', top);
		$lastComponent.css('top', top);
		$splitPane.resize();
	}

	function setBottom($splitPane, $firstComponent, $divider, $lastComponent, bottom) {
		$firstComponent.css('bottom', bottom);
		$divider.css('bottom', bottom);
		$lastComponent.css('height', bottom);
		$splitPane.resize();
	}

	function setLeft($splitPane, $firstComponent, $divider, $lastComponent, left) {
		$firstComponent.css('width', left);
		$divider.css('left', left);
		$lastComponent.css('left', left);
		$splitPane.resize();
	}

	function setRight($splitPane, $firstComponent, $divider, $lastComponent, right) {
		$firstComponent.css('right', right);
		$divider.css('right', right);
		$lastComponent.css('width', right);
		$splitPane.resize();
	}

})(jQuery);

/* Human Resource Machine Mode for CodeMirror
 */

CodeMirror.defineSimpleMode("hrm", {
  // The start state contains the rules that are intially used
  start: [
    // Rules are matched in the order in which they appear, so there is
    // no ambiguity between this one and the one above
    {regex: /(?:INBOX|OUTBOX)\b/,
     token: "keyword"},
    {regex: /(COPYFROM|COPYTO|ADD|SUB|BUMPUP|BUMPDN|COMMENT|DEFINE\s+(?:COMMENT|LABEL))\s+([0-9]+)/,
     token: ["keyword", "number"]},
     {regex: /(COPYFROM|COPYTO|ADD|SUB|BUMPUP|BUMPDN|COMMENT|DEFINE\s+(?:COMMENT|LABEL))\s+\[\s*([0-9]+)\s*\]/,
      token: ["keyword", "number"]},
    {regex: /--.*/, token: "comment"},
    {regex: /(JUMP|JUMPZ|JUMPN)\s+([a-zA-Z][a-zA-Z0-9]*)/, token: ["keyword", null, "label-dest"]},
    {regex: /([a-zA-Z][a-zA-Z0-9]*):/, token: ["label"]}
  ],
  // The meta property contains global information about the mode. It
  // can contain properties like lineComment, which are supported by
  // all modes, and also directives like dontIndentStates, which are
  // specific to simple modes.
  meta: {
    dontIndentStates: ["comment"],
    lineComment: "--"
  }
});

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

  this.hrmv = undefined;

  this.viewCode = debounce(function (code) {
    self.hrmv = new HRMViewer(eltId, code);
  }, DELAY_MS_UPDATE_CODEVIEWER, false);

  var vv = true;
  $('#view').on('click', function (e) {
    if (vv) {
      vv = false;

      if (self.shouldRenderCodeView) {
        self.shouldRenderCodeView = false;
        self.viewCode(self.editor.getValue());
      }
      else if (self.hrmv !== undefined) {

      }

      $('#code-view').toggleClass('hidden', false);
    }
    else {
      vv = true;

      $('#code-view').toggleClass('hidden', true);
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
    if (this.program && this.program._program &&
        this.program._program.undefinedLabels.length > 0) {
      this.state.ip = this.program._program.statements.indexOf(
        this.program._program.undefinedLabels[0].referencedBy) + 1;
      throw new HrmProgramError(
        'Undefined label: ' + this.program._program.undefinedLabels[0].label,
        this.state);
    }

    this.assignBreakpoints();

    this.updateUI(this.state, UI_STATE_STARTING);

    return true;
  } catch(error) {
    console.error(error);
    this.onErrorCaught(error);
  }

  return false;
};

var KEY_LOCALSTORAGE_LEVELS = 'hrmsandbox-Levels';
var SAVE_VERSION = "0.0.2";

CP.createSave = function (name) {
  return {
    name: name || (new Date().getTime().toString(16)),
    when: new Date(),
    level: this.getLevel(),
    source: this.editor.getValue()
  };
};

CP.saveSource = function (name) {
  var saves = this.getSaves();

  saves.solutions.push(this.createSave(name));
  saves.solutions.sort(function (a, b) {
    return -(a.when.localeCompare(b.when));
  });

  localStorage.setItem(KEY_LOCALSTORAGE_LEVELS, JSON.stringify(saves));

  return saves;
};

CP.getSaves = function () {
  var saves = localStorage.getItem(KEY_LOCALSTORAGE_LEVELS);
  if (!saves) {
    saves = { version: "0.0.1", solutions: [] };
  }
  else {
    try {
      saves = JSON.parse(saves);
    } catch (e) {
      console.error(e);
      saves = { version: "0.0.1", solutions: [] };
    }
  }

  return saves;
};

CP.getLevel = function () {
  var level = $('#level-selector').val();
  if (level === 0) {
    return {
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
        tiles: $.parseJSON($('#variables').val())
      },
      examples: [{
          inbox: readInbox($('#inbox')),
          outbox: [ ]
      }]
    };
  } else {
    return HrmLevelData[level];
  }
};

CP.loadSave = function (save) {
  this.editor.setValue(save.source);
  $('#level-selector').val(HrmLevelData.findIndex(function (level) {
    return level.number == save.level.number;
  }));
  $('#inbox').val(save.level.examples[0].inbox.join(", "));
  if (save.level.floor) {
    $('#variables').val(JSON.stringify(save.level.floor.tiles, null, 2));
  }
  else {
    $('#variables').val("{}");
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

CP.runToEnd = function () {
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

CP.pause = function () {
  var nextUiState = UI_STATE_STEPPED;
  if (this.uiState == UI_STATE_RUNNING &&
      this.intervalId !== undefined) {
    clearInterval(this.intervalId);
    this.intervalId = undefined;

    this.updateUI(this.state, nextUiState);
  }
};

CP.stop = function () {
  if (this.uiState == UI_STATE_RUNNING &&
      this.intervalId !== undefined) {
    clearInterval(this.intervalId);
    this.intervalId = undefined;
  }

  this.program = undefined;
  this.state = undefined;

  this.updateUI(this.state, UI_STATE_STOPPED);
};

CP.onErrorCaught = function (error) {
  this.updateUI(this.state, UI_STATE_STOPPED);

  //TODO: mark the line in error if we know about it!

  $('#error').toggleClass('hidden', false);
  $('#error-content').empty();

  var loc;
  if (error.name && error.name === 'SyntaxError') {
    if (error.location) {
      loc = error.location;
      $('#error-content').append('<b>Error parsing HRM program, aborted.</b><br />' +
        'Line ' + loc.start.line + ' Column ' + loc.start.column + '<br />' +
        error.message
      );

      this.editor.setCursor(loc.start.line - 1);
      if (this.lastMark) this.lastMark.clear();
      this.lastMark = this.editor.markText(
        { line: loc.start.line - 1, ch: loc.start.column - 1 },
        { line: loc.end.line - 1, ch: loc.end.column - 1 },
        { className: 'line-error' }
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
    if (this.state) {
      this.state.ip--;
      loc = this.locFromState(this.state);
      this.editor.setCursor(loc.start.line);
      if (this.lastMark) this.lastMark.clear();
      this.lastMark = this.editor.markText(
        { line: loc.start.line, ch: loc.start.column },
        { line: loc.end.line, ch: loc.end.column },
        { className: 'line-error' }
      );
    }
  }

  this.program = undefined;
  this.state = undefined;
};

var ELT_WRAPPER_NUMBER = '<span class="label label-success">';
var ELT_WRAPPER_ALPHA  = '<span class="label label-primary">';

CP.updateUI = function (hrmState, nextUiState) {
  this.uiState = nextUiState;
  if (this.lastUiState !== this.uiState) {
    this.lastUiState = this.uiState;

    // Update Edit State indicator
    switch (this.uiState) {
      case UI_STATE_STARTING:
      case UI_STATE_RUNNING:
      case UI_STATE_STEPPED:
        $('#edit-state').toggleClass('active', true);
        $('#edit-state').toggleClass('progress-bar-striped', true);
        $('#edit-state').toggleClass('progress-bar-success', true);
        $('#edit-state').toggleClass('progress-bar-warning', false);
        break;

      case UI_STATE_STOPPED:
        $('#edit-state').toggleClass('active', false);
        $('#edit-state').toggleClass('progress-bar-striped', false);
        $('#edit-state').toggleClass('progress-bar-success', false);
        $('#edit-state').toggleClass('progress-bar-warning', false);
        break;

      case UI_STATE_BREAK:
        $('#edit-state').toggleClass('active', true);
        $('#edit-state').toggleClass('progress-bar-striped', true);
        $('#edit-state').toggleClass('progress-bar-success', false);
        $('#edit-state').toggleClass('progress-bar-warning', true);
        break;
    }

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
        $('#run').prop('disabled', false);
        $('#runToEnd').prop('disabled', false);
        $('#stepInto').prop('disabled', false);
        $('#pause').prop('disabled', true);
        $('#stop').prop('disabled', true);
        break;
      case UI_STATE_BREAK:
      case UI_STATE_STEPPED:
        $('#run').prop('disabled', false);
        $('#runToEnd').prop('disabled', false);
        $('#stepInto').prop('disabled', false);
        $('#pause').prop('disabled', true);
        $('#stop').prop('disabled', false);
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

  // Update floor
  if (hrmState !== undefined && this.getLevel().floor !== undefined && hrmState.variables !== undefined) {
    for (var i = 0; i < this.getLevel().floor.rows * this.getLevel().floor.columns; i++) {
      var displayed = '';
      if (hrmState.variables[i] !== undefined) {
        displayed = hrmState.variables[i];
      }

      $('#floor' + i).text(displayed);
    }
  } else {
    $('#floorState td').text('');
  }
  // Update hand
  if (hrmState !== undefined && hrmState.hand !== undefined) {
    $('#handState').text(hrmState.hand);
  } else {
    $('#handState').text('');
  }

  // Update Editor
  var line = hrmState !== undefined ? this.lineFromState(hrmState) : 0;
  this.editor.setCursor(line);
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

  // Update Code Viewer
  if (this.hrmv !== undefined) {
    this.hrmv.setActiveLine(line);
  }

  // Update Stats
  $('#stats').empty();
  if (hrmState !== undefined) {
    $('#stats').append('iterations: ' + (hrmState.iterations - hrmState.labelsHit));
  }

  // Update Outbox
  $('#outbox').empty();
  if (hrmState !== undefined) {
    for (var ii = hrmState.outbox.length - 1; ii >= 0; --ii) {
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

  $('#level-selector').empty();
  for (var ll = 0; ll < HrmLevelData.length; ++ll) {
    var level = HrmLevelData[ll];
    var opt = $('<option>', { value: ll });
    opt.text(level.number + ': ' + level.name);
    $('#level-selector').append(opt);
  }
  $('#level-selector').val(0);
  $('#level-instructions').text(HrmLevelData[0].instructions);

  $('#level-selector').change(function() {
    self.stop();
    var level = $(this).val();
    $('#level-instructions').text(HrmLevelData[level].instructions);
    $('#inbox').val(HrmLevelData[level].examples[0].inbox.join(", "));
    
    $('#floorState').empty();

    if (HrmLevelData[level].floor) {
      $('#variables').val(JSON.stringify(HrmLevelData[level].floor.tiles || {}, null, 2));

      // Create floor
      var rows = HrmLevelData[level].floor.rows || 5;
      var columns = HrmLevelData[level].floor.columns || 5;
      var tiles = HrmLevelData[level].floor.tiles;
      var count = 0;
      for (var row = 0; row < rows; row++) {
        var rowElement = $('<tr>').appendTo('#floorState');
        for (var column = 0; column < columns; column++) {
          var text = '';
          if ($.isArray(tiles)) {
            if (tiles.length > count) {
              text = tiles[count];
            }
          } else if (typeof tiles === 'object') {
            if (tiles.hasOwnProperty(count)) {
              text = tiles[count];
            }
          }
          
          $('<td>').attr('id', 'floor' + count).text(text).appendTo(rowElement);
          count++;
        }
      }
    } else {
      $('#variables').val("{}");
    }
  }).trigger('change');

  $('#saveModal').on('shown.bs.modal', function () {
    $('#save-errors').empty();
    $('#save-name').val(undefined);
    $('#save-name').focus();
  });

  $('#do-save').on('click', function () {
    try {
      self.saveSource($('#save-name').val());
      $('#saveModal').modal('hide');
    } catch (e) {
      console.error(e);
      var alert = $('<div class="alert alert-danger alert-dismissible" role="alert">');
      alert.append('<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>');
      alert.append('<strong>Could not save!</strong> ' + e.toString());
      $('#save-errors').empty();
      $('#save-errors').append(alert);
    }
  });

  $('#saves-to-load').on('click', 'a.load-save', function () {
    self.stop();
    var id = $(this).attr('data-save-id');
    var saves = self.getSaves();
    $('#loadModal').modal('hide');
    self.loadSave(saves.solutions[id]);
  });

  $('#loadModal').on('shown.bs.modal', function () {
    $('#saves-to-load').empty();
    var saves = self.getSaves();
    if (saves && saves.solutions) {
      for (var ss = 0; ss < saves.solutions.length; ++ss) {
        var save = saves.solutions[ss];
        var link = $('<a>', { class: 'load-save', href: "#", "data-save-id": ss });
        link.text('Level ' + save.level.number + ': ' + save.name + ' (' + save.when + ')');
        $('#saves-to-load').append(
          $('<li>').append(link)
        );
      }
    }
    else {
      $('#saves-to-load').append('<li>No saves found</li>');
    }
  });

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

function readInbox($inbox) {
  return $inbox.val().split(/[, \t\n\"']/).filter(function (v) {
    return v.trim().length > 0;
  }).map(function (s) {
    var n = Number(s);
    return Number.isNaN(n) ? s : n;
  });
}

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

//
// Array.find and findIndex polyfills from MDN
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
//
if (!Array.prototype.find) {
  Array.prototype.find = function(predicate) {
    if (this === null) {
      throw new TypeError('Array.prototype.find called on null or undefined');
    }
    if (typeof predicate !== 'function') {
      throw new TypeError('predicate must be a function');
    }
    var list = Object(this);
    var length = list.length >>> 0;
    var thisArg = arguments[1];
    var value;

    for (var i = 0; i < length; i++) {
      value = list[i];
      if (predicate.call(thisArg, value, i, list)) {
        return value;
      }
    }
    return undefined;
  };
}
if (!Array.prototype.findIndex) {
  Array.prototype.findIndex = function(predicate) {
    if (this === null) {
      throw new TypeError('Array.prototype.findIndex called on null or undefined');
    }
    if (typeof predicate !== 'function') {
      throw new TypeError('predicate must be a function');
    }
    var list = Object(this);
    var length = list.length >>> 0;
    var thisArg = arguments[1];
    var value;

    for (var i = 0; i < length; i++) {
      value = list[i];
      if (predicate.call(thisArg, value, i, list)) {
        return i;
      }
    }
    return -1;
  };
}
