export interface TextChunk {
  index: number;
  text: string;
  startChar: number;
  endChar: number;
}

export function splitTextIntoChunks(
  text: string,
  maxCharacters: number,
  overlap: number,
): TextChunk[] {
  if (
    !Number.isInteger(maxCharacters) ||
    !Number.isInteger(overlap) ||
    maxCharacters < 1 ||
    overlap < 0 ||
    overlap >= maxCharacters
  ) {
    throw new RangeError('Invalid text chunk size or overlap');
  }

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxCharacters, text.length);
    if (end < text.length) {
      const minimumBoundary = start + Math.floor(maxCharacters * 0.7);
      let boundary = end;
      while (boundary > minimumBoundary && !/\s/.test(text[boundary - 1])) {
        boundary -= 1;
      }
      if (boundary > minimumBoundary) {
        end = boundary;
      }
    }

    if (
      end < text.length &&
      text.charCodeAt(end - 1) >= 0xd800 &&
      text.charCodeAt(end - 1) <= 0xdbff
    ) {
      end -= 1;
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push({
        index: chunks.length,
        text: chunk,
        startChar: start,
        endChar: end,
      });
    }

    if (end >= text.length) {
      break;
    }

    start = Math.max(end - overlap, start + 1);
    while (start < text.length && /\s/.test(text[start])) {
      start += 1;
    }
  }

  return chunks;
}
