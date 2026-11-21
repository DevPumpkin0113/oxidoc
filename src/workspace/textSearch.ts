/** Most matches collected in one search, so a one-letter query stays cheap. */
export const MAX_TEXT_MATCHES = 1000;

/**
 * Case-insensitive matches of `query` in the text under `root`, as DOM ranges
 * in document order. A match may span several text nodes (inline formatting).
 */
export function findTextRanges(root: Node, query: string): Range[] {
  if (!query) return [];
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  const walker = root.ownerDocument!.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    starts.push(text.length);
    text += node.nodeValue ?? "";
  }
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  // Lower-casing may change lengths for a few scripts; fall back to exact.
  const exact = haystack.length !== text.length;
  const source = exact ? text : haystack;
  const target = exact ? query : needle;
  const ranges: Range[] = [];
  let nodeIndex = 0;
  const locate = (offset: number, end: boolean) => {
    while (
      nodeIndex < nodes.length - 1 &&
      (end ? starts[nodeIndex + 1] < offset : starts[nodeIndex + 1] <= offset)
    )
      nodeIndex++;
    return { node: nodes[nodeIndex], offset: offset - starts[nodeIndex] };
  };
  for (
    let found = source.indexOf(target);
    found >= 0 && ranges.length < MAX_TEXT_MATCHES;
    found = source.indexOf(target, found + target.length)
  ) {
    const start = locate(found, false);
    const startIndex = nodeIndex;
    const end = locate(found + target.length, true);
    const range = root.ownerDocument!.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    ranges.push(range);
    nodeIndex = startIndex;
  }
  return ranges;
}
