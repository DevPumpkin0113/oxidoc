export interface TextStats {
  /** Characters including spaces but not line breaks; a surrogate pair counts once. */
  characters: number;
  /** Runs of non-whitespace characters. */
  words: number;
}

/** Single pass over `text`, so large documents are counted without copies. */
export function countText(text: string): TextStats {
  let characters = 0;
  let words = 0;
  let inWord = false;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    const lineBreak = code === 10 || code === 13;
    // The low half of a surrogate pair belongs to the previous character.
    if (!lineBreak && !(code >= 0xdc00 && code <= 0xdfff)) characters++;
    const space =
      lineBreak ||
      code === 32 ||
      code === 9 ||
      code === 12 ||
      code === 11 ||
      code === 0xa0 ||
      code === 0x3000;
    if (space) inWord = false;
    else if (!inWord) {
      inWord = true;
      words++;
    }
  }
  return { characters, words };
}
