import zlib from 'node:zlib';

/**
 * Robust zero-dependency PDF text extractor supporting multi-font /ToUnicode CMaps,
 * Type0/CID glyphs, kerning-aware TJ arrays, and literal text operators.
 */
export function extractTextFromPdfBuffer(pdfBuffer: Buffer): string {
  const pdfString = pdfBuffer.toString('latin1');

  // Step 1: Parse all PDF objects: "<id> <gen> obj ... endobj"
  const objRegex = /(\d+)\s+(\d+)\s+obj\s*([\s\S]*?)\s*endobj/g;
  const objects = new Map<number, { header: string; streamContent?: string; decompressedStream?: string }>();
  let objMatch: RegExpExecArray | null;

  while ((objMatch = objRegex.exec(pdfString)) !== null) {
    const objId = parseInt(objMatch[1], 10);
    const body = objMatch[3];
    const streamMatch = body.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);

    let decompressed: string | undefined;
    if (streamMatch) {
      const rawBuf = Buffer.from(streamMatch[1], 'latin1');
      try {
        decompressed = zlib.inflateSync(rawBuf).toString('latin1');
      } catch {
        try {
          decompressed = zlib.inflateRawSync(rawBuf).toString('latin1');
        } catch {
          decompressed = streamMatch[1];
        }
      }
    }

    objects.set(objId, {
      header: body,
      streamContent: streamMatch ? streamMatch[1] : undefined,
      decompressedStream: decompressed,
    });
  }

  // Step 2: Parse CMaps from objects that contain a CMap stream
  const cmapsByObjId = new Map<number, Map<string, string>>();
  const allGlyphsFallback = new Map<string, string>();

  const parseCMapStream = (text: string): Map<string, string> => {
    const map = new Map<string, string>();

    // Parse beginbfchar: <srcHex> <dstHex>
    const bfcharBlocks = text.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
    for (const block of bfcharBlocks) {
      const pairs = block.match(/<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>/g) || [];
      for (const pair of pairs) {
        const parts = pair.match(/<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>/);
        if (parts) {
          const srcHex = parts[1].toLowerCase().padStart(4, '0');
          const dstHex = parts[2];
          let decodedChar = '';
          for (let i = 0; i < dstHex.length; i += 4) {
            const codePoint = parseInt(dstHex.slice(i, i + 4), 16);
            if (!isNaN(codePoint)) {
              decodedChar += String.fromCodePoint(codePoint);
            }
          }
          map.set(srcHex, decodedChar);
          allGlyphsFallback.set(srcHex, decodedChar);
        }
      }
    }

    // Parse beginbfrange
    const bfrangeBlocks = text.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
    for (const block of bfrangeBlocks) {
      const lines = block.split('\n');
      for (const line of lines) {
        const arrayMatch = line.match(/<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>\s+\[([\s\S]*?)\]/);
        if (arrayMatch) {
          const start = parseInt(arrayMatch[1], 16);
          const dstList = arrayMatch[3].match(/<([0-9a-fA-F]+)>/g) || [];
          dstList.forEach((dstHexItem, idx) => {
            const srcHex = (start + idx).toString(16).padStart(4, '0').toLowerCase();
            const rawHex = dstHexItem.replace(/<|>/g, '');
            let decodedChar = '';
            for (let i = 0; i < rawHex.length; i += 4) {
              const cp = parseInt(rawHex.slice(i, i + 4), 16);
              if (!isNaN(cp)) decodedChar += String.fromCodePoint(cp);
            }
            map.set(srcHex, decodedChar);
            allGlyphsFallback.set(srcHex, decodedChar);
          });
        } else {
          const rangeMatch = line.match(/<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>/);
          if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 16);
            const end = parseInt(rangeMatch[2], 16);
            const dstStart = parseInt(rangeMatch[3], 16);
            for (let curr = start; curr <= end; curr++) {
              const srcHex = curr.toString(16).padStart(4, '0').toLowerCase();
              const dstCp = dstStart + (curr - start);
              const decodedChar = String.fromCodePoint(dstCp);
              map.set(srcHex, decodedChar);
              allGlyphsFallback.set(srcHex, decodedChar);
            }
          }
        }
      }
    }

    return map;
  };

  for (const [objId, obj] of objects.entries()) {
    if (obj.decompressedStream && (obj.decompressedStream.includes('begincmap') || obj.decompressedStream.includes('beginbfchar') || obj.decompressedStream.includes('beginbfrange'))) {
      cmapsByObjId.set(objId, parseCMapStream(obj.decompressedStream));
    }
  }

  // Step 3: Link Font Name (e.g. "F1", "TT0") -> CMap
  const fontNameToCMap = new Map<string, Map<string, string>>();

  // Map font object ID -> CMap
  const fontObjIdToCMap = new Map<number, Map<string, string>>();
  for (const [objId, obj] of objects.entries()) {
    const toUnicodeMatch = obj.header.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (toUnicodeMatch) {
      const cmapObjId = parseInt(toUnicodeMatch[1], 10);
      const cmap = cmapsByObjId.get(cmapObjId);
      if (cmap) {
        fontObjIdToCMap.set(objId, cmap);
      }
    }
  }

  // Find font resource dictionaries: "/Font << /F1 12 0 R ... >>"
  for (const [, obj] of objects.entries()) {
    const fontDictMatch = obj.header.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (fontDictMatch) {
      const entries = fontDictMatch[1].match(/\/([A-Za-z0-9_]+)\s+(\d+)\s+\d+\s+R/g) || [];
      for (const entry of entries) {
        const parts = entry.match(/\/([A-Za-z0-9_]+)\s+(\d+)\s+\d+\s+R/);
        if (parts) {
          const fontName = parts[1];
          const fontObjId = parseInt(parts[2], 10);
          const cmap = fontObjIdToCMap.get(fontObjId);
          if (cmap) {
            fontNameToCMap.set(fontName, cmap);
          }
        }
      }
    }
  }

  // Step 4: Process all page content streams
  let fullExtractedText = '';

  const decodeHexWithCMap = (hex: string, activeCMap?: Map<string, string>): string => {
    let res = '';
    const cmap = activeCMap || allGlyphsFallback;
    for (let i = 0; i < hex.length; i += 4) {
      const glyph = hex.slice(i, i + 4).toLowerCase().padStart(4, '0');
      if (cmap.has(glyph)) {
        res += cmap.get(glyph);
      } else if (allGlyphsFallback.has(glyph)) {
        res += allGlyphsFallback.get(glyph);
      } else {
        const code = parseInt(glyph, 16);
        if (code >= 32 && code <= 126) {
          res += String.fromCharCode(code);
        }
      }
    }
    return res;
  };

  for (const [, obj] of objects.entries()) {
    if (!obj.decompressedStream) continue;
    const content = obj.decompressedStream;
    if (content.includes('begincmap')) continue; // Skip CMap streams

    let activeFontName: string | undefined;

    // Parse content streams
    const btBlocks = content.match(/BT[\s\S]*?ET/g) || [content];
    for (const bt of btBlocks) {
      let blockText = '';
      const lines = bt.split('\n');

      for (const line of lines) {
        // Font selection: /F1 12 Tf
        const fontMatch = line.match(/\/([A-Za-z0-9_]+)\s+[\d.]+\s+Tf/);
        if (fontMatch) {
          activeFontName = fontMatch[1];
        }

        const activeCMap = activeFontName ? fontNameToCMap.get(activeFontName) : undefined;

        // Vertical move or new line operator (T*, or Td with non-zero dy)
        const tdMatch = line.match(/([\d.-]+)\s+([\d.-]+)\s+(?:Td|TD)/);
        if (tdMatch) {
          const dy = parseFloat(tdMatch[2]);
          if (dy !== 0 && blockText.length > 0 && !blockText.endsWith(' ') && !blockText.endsWith('\n')) {
            blockText += ' ';
          }
        } else if (line.includes('T*') || line.match(/[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+Tm/)) {
          if (blockText.length > 0 && !blockText.endsWith(' ') && !blockText.endsWith('\n')) {
            blockText += ' ';
          }
        }

        // Match TJ arrays
        if (line.includes('TJ')) {
          const tjArrays = line.match(/\[([\s\S]*?)\]\s*TJ/g) || [];
          for (const tj of tjArrays) {
            const tokenRegex = /<([0-9a-fA-F]+)>|\(([^)]*)\)|(-?\d+(?:\.\d+)?)/g;
            let tjMatch: RegExpExecArray | null;
            while ((tjMatch = tokenRegex.exec(tj)) !== null) {
              if (tjMatch[1]) {
                blockText += decodeHexWithCMap(tjMatch[1], activeCMap);
              } else if (tjMatch[2] !== undefined) {
                blockText += tjMatch[2];
              } else if (tjMatch[3]) {
                const kerning = parseFloat(tjMatch[3]);
                if (kerning < -250 && !blockText.endsWith(' ')) {
                  blockText += ' ';
                }
              }
            }
          }
        }

        // Match single Tj / ' / "
        if (line.match(/(?:<[0-9a-fA-F]+>|\([^)]*\))\s*(?:Tj|'|")/)) {
          const singles = line.match(/(?:<[0-9a-fA-F]+>|\([^)]*\))\s*(?:Tj|'|")/g) || [];
          for (const single of singles) {
            const tok = single.replace(/\s*(?:Tj|'|")$/, '');
            if (tok.startsWith('<')) {
              blockText += decodeHexWithCMap(tok.slice(1, -1), activeCMap);
            } else if (tok.startsWith('(')) {
              blockText += tok.slice(1, -1);
            }
          }
        }
      }

      fullExtractedText += ' ' + blockText;
    }

    fullExtractedText += ' ' + content;
  }

  fullExtractedText += ' ' + pdfString;
  return fullExtractedText;
}
