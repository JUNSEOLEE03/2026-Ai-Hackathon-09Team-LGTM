(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WonjuPdf = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const UNSUPPORTED = "확인 필요 / 처리 불가. 텍스트가 있는 PDF만 읽습니다. 스캔본은 처리하지 않으며, 서버로 대신 보내지 않습니다.";

  function latin1(bytes) {
    return new TextDecoder("latin1").decode(bytes);
  }

  async function inflate(bytes) {
    try {
      return await inflateWith("deflate", bytes);
    } catch (error) {
      const raw = bytes.subarray(2, Math.max(2, bytes.length - 4));
      return inflateWith("deflate-raw", raw);
    }
  }

  async function inflateWith(format, bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function findStreams(bytes) {
    const raw = latin1(bytes);
    const found = [];
    let pos = 0;
    while (pos < raw.length) {
      const at = raw.indexOf("stream", pos);
      if (at < 0) break;
      const head = raw.slice(Math.max(0, at - 300), at);
      const lengths = [...head.matchAll(/\/Length(?!\d)\s*(\d+)/g)];
      if (raw.slice(at - 3, at) === "end" || !lengths.length || !/FlateDecode/.test(head)) {
        pos = at + 6;
        continue;
      }
      const length = Number(lengths[lengths.length - 1][1]);
      let start = at + 6;
      if (raw.charCodeAt(start) === 13) start += 1;
      if (raw.charCodeAt(start) === 10) start += 1;
      if (start + length > bytes.length) {
        pos = at + 6;
        continue;
      }
      found.push(bytes.subarray(start, start + length));
      pos = start + length;
    }
    return found;
  }

  function parseCmap(text) {
    const ranges = [];
    let mode = null;
    text.split(/\r?\n/).forEach(function (line) {
      if (line.includes("beginbfchar")) mode = "char";
      else if (line.includes("endbfchar")) mode = null;
      else if (line.includes("beginbfrange")) mode = "range";
      else if (line.includes("endbfrange")) mode = null;
      else if (mode === "char") {
        const parts = [...line.matchAll(/<([0-9A-Fa-f]+)>/g)].map(function (match) { return match[1]; });
        if (parts.length >= 2) {
          ranges.push({ start: parseInt(parts[0], 16), end: parseInt(parts[0], 16), dest: parts[1] });
        }
      } else if (mode === "range") {
        const parts = [...line.matchAll(/<([0-9A-Fa-f]+)>/g)].map(function (match) { return match[1]; });
        if (parts.length >= 3) {
          ranges.push({ start: parseInt(parts[0], 16), end: parseInt(parts[1], 16), dest: parts[2] });
        }
      }
    });
    return ranges;
  }

  function utf16be(hex) {
    let out = "";
    for (let i = 0; i + 3 < hex.length; i += 4) {
      out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
    }
    return out;
  }

  function mapCid(cid, ranges) {
    for (let i = 0; i < ranges.length; i += 1) {
      const range = ranges[i];
      if (cid >= range.start && cid <= range.end) {
        const dest = parseInt(range.dest, 16) + (cid - range.start);
        return String.fromCharCode(dest);
      }
    }
    return "\uFFFD";
  }

  function decodeHex(hex, ranges) {
    let out = "";
    for (let i = 0; i + 3 < hex.length; i += 4) {
      out += mapCid(parseInt(hex.substr(i, 4), 16), ranges);
    }
    return out;
  }

  function pageText(content, ranges) {
    const lines = [];
    let currentY = null;
    let buffer = "";
    const token = /([\d.\-]+)\s+([\d.\-]+)\s+Tm|\[([\s\S]*?)\]\s*TJ/g;
    let match;
    while ((match = token.exec(content))) {
      if (match[1] != null && match[2] != null && match[3] == null) {
        const y = Number(match[2]);
        if (currentY != null && y !== currentY && buffer) {
          lines.push(buffer);
          buffer = "";
        }
        currentY = y;
        continue;
      }
      const hexes = [...match[3].matchAll(/<([0-9A-Fa-f]+)>/g)];
      hexes.forEach(function (hex) {
        buffer += decodeHex(hex[1], ranges);
      });
    }
    if (buffer) lines.push(buffer);
    return lines.join("\n");
  }

  async function extractPdfText(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const streams = findStreams(bytes);
    const decoded = [];
    for (let i = 0; i < streams.length; i += 1) {
      try {
        decoded.push(latin1(await inflate(streams[i])));
      } catch (error) {
        decoded.push("");
      }
    }
    const ranges = [];
    const pages = [];
    decoded.forEach(function (text) {
      if (text.includes("begincmap")) {
        parseCmap(text).forEach(function (range) { ranges.push(range); });
      }
    });
    decoded.forEach(function (text) {
      if (text.includes("begincmap")) return;
      if (text.includes(" BT") || text.startsWith("BT") || text.includes("\nBT")) pages.push(text);
    });
    if (!pages.length || !ranges.length) {
      return { ok: false, reason: UNSUPPORTED, text: "", pdfPages: pages.length };
    }
    const text = pages.map(function (page) { return pageText(page, ranges); }).filter(function (page) {
      return page.trim() && page.indexOf("\uFFFD") === -1;
    }).join("\n");
    if (!text.trim()) {
      return { ok: false, reason: UNSUPPORTED, text: "", pdfPages: pages.length };
    }
    return { ok: true, text: text, pdfPages: pages.length, reason: "" };
  }

  return { extractPdfText: extractPdfText, UNSUPPORTED: UNSUPPORTED, utf16be: utf16be };
});
