
const {defaultHighlightStyle} = require("@codemirror/language");
const rules = defaultHighlightStyle.spec;
const mono = rules.filter(r => r.tag && r.tag.name === "monospace");
console.log(JSON.stringify(mono, null, 2));
// Also check for "processingInstruction" which is used for markdown code marks
const pi = rules.filter(r => {
  if (!r.tag) return false;
  const names = [];
  let t = r.tag;
  while (t) { if (t.name) names.push(t.name); t = t.base; }
  return names.includes("monospace");
});
console.log("All monospace-related rules:", JSON.stringify(pi.map(r => ({tag: r.tag ? r.tag.name : null, color: r.color, fontFamily: r.fontFamily})), null, 2));
