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
