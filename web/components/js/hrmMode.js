/* Human Resource Machine Mode for CodeMirror
 */

CodeMirror.defineSimpleMode("hrm", {
  // The start state contains the rules that are intially used
  start: [
    // Rules are matched in the order in which they appear, so there is
    // no ambiguity between this one and the one above
    {regex: /(?:inbox|outbox)\b/i,
     token: "keyword"},
    {regex: /(copyfrom|copyto|add|sub|bumpup|bumpdn|comment|define\s+(?:comment|label))\s+([0-9]+)/i,
     token: ["keyword", "number"]},
     {regex: /(copyfrom|copyto|add|sub|bumpup|bumpdn|comment|define\s+(?:comment|label))\s+\[\s*([0-9]+)\s*\]/i,
      token: ["keyword", "number"]},
    {regex: /--.*/, token: "comment"},
    {regex: /(jump|jumpz|jumpn)\s+([a-zA-Z]+)/, token: ["keyword", null, "label-dest"]},
    {regex: /([a-zA-Z]+):/, token: ["label"]}
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
