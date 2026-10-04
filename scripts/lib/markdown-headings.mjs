// Heading levels of a Markdown document in order, ignoring fenced code.
// EN/TR doc pairs must match on this, so a section missing from one language
// is caught.
export function headingLevels(text) {
  const levels = [];
  let inFence = false;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = /^(#{1,6})\s/.exec(line);
    if (heading) levels.push(heading[1].length);
  }
  return levels;
}
