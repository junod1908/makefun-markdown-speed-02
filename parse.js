// Render in two phases: collect block structure/references, then resolve inlines.
const anchorContext = Symbol('anchor context');
const escapeHtml = value => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const escapeAttribute = value => value.replace(/&[a-zA-Z][a-zA-Z0-9]*;|[&<>"']/g,
  entity => entity.length > 1 ? entity : escapeHtml(entity));
const decodeDestination = value => value
  .replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/g, '$1')
  .replace(/&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/gi, (whole, name) => {
    if (name[0] !== '#') return whole;
    const number = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : +name.slice(1);
    try { return String.fromCodePoint(number); } catch { return '\uFFFD'; }
  });
function encodeAddress(value) {
  try { return escapeAttribute(encodeURI(value).replace(/%25/g, '%')); }
  catch { return escapeHtml(value); }
}
const linkAddress = value => encodeAddress(decodeDestination(value)
  .replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/g, '$1'));
const referenceKey = value => value.trim().toLowerCase().toUpperCase().toLowerCase().replace(/\s+/g, ' ');

function findCode(source) {
  const opening = /^`+/.exec(source);
  if (!opening) return null;
  const ticks = /`+/g;
  ticks.lastIndex = opening[0].length;
  let closing;
  while ((closing = ticks.exec(source))) {
    if (closing[0].length === opening[0].length) {
      return [source.slice(0, ticks.lastIndex), opening[0], source.slice(opening[0].length, closing.index)];
    }
  }
  return null;
}

// ASCII dispatch avoids invoking the recognizers for ordinary text.
const characterClass = new Uint8Array(128);
for (const character of "\\`<![*_~&(!") characterClass[character.charCodeAt(0)] = 1;
for (let code = 0; code < 128; code++) {
  if (/\s/.test(String.fromCharCode(code))) characterClass[code] = 2;
}
const atBoundary = character => character === undefined || character === '(' || character === '<' ||
  (character.charCodeAt(0) < 128 ? characterClass[character.charCodeAt(0)] === 2 : /\s/.test(character));

function codeExclusions(source) {
  const exclusions = [];
  // These masks retain marked's precedence for overlapping code and link spans.
  for (const match of source.matchAll(/``[^`]*`[^`]*?\]\([^)]*\)[^`]*`/g)) {
    exclusions.push([match.index, match.index + match[0].length]);
  }
  for (const match of source.matchAll(/\[[^\]\n]*``[^`]*`[^`]+``[^\]\n]+\](?:\([^\n]*?\)|\[[^\]]*\])/g)) {
    exclusions.push([match.index, match.index + match[0].length]);
  }
  for (let cursor = 0; cursor < source.length; cursor++) {
    if (source[cursor] !== '`') continue;
    const span = findCode(source.slice(cursor));
    if (!span) continue;
    if (span[1].length === 2 && /^``[^`]*`[^`]*?\]\(/.test(span[0])) exclusions.push([cursor, cursor + span[0].length]);
    cursor += span[0].length - 1;
  }
  return exclusions;
}

function renderInline(source, references, nesting = 0, onlyText = false, insideAnchor = false, probeLinks = false) {
  insideAnchor ||= !!references[anchorContext];
  if (nesting > 12) return escapeHtml(source);
  // Without inline syntax, addresses, or hard breaks, text is already HTML.
  if (!/[\\`<![*_~&@]|https?:|HTTPS?:|www\.| {2,}\n/i.test(source)) return escapeHtml(source);
  let position = 0, html = '', literal = '';
  const pieces = [], runs = [];
  const ordinary = /[^\\`<![\*_~&\s(]+/y;
  const exclusions = codeExclusions(source);
  const flushLiteral = () => {
    if (literal) { html += escapeHtml(literal); literal = ''; }
  };
  const finishPiece = () => {
    flushLiteral();
    if (html) { pieces.push({html}); html = ''; }
  };
  const punctuation = character => /[\p{P}\p{S}]/u.test(character);
  const whitespace = character => !character || /\s/u.test(character);
  while (position < source.length) {
    const character = source[position];
    const boundary = position === 0 || atBoundary(source[position - 1]);
    const code = source.charCodeAt(position);
    if (!boundary && (code < 128 ? characterClass[code] === 0 : !/\s/.test(character))) {
      ordinary.lastIndex = position;
      const text = ordinary.exec(source);
      if (text) { literal += text[0]; position = ordinary.lastIndex; continue; }
    }
    const remaining = source.slice(position);
    let match;
    if (character === '`' && (match = findCode(remaining))) {
      flushLiteral();
      let content = match[2].replace(/\n/g, ' ');
      if (/^ .* $/.test(content) && /[^ ]/.test(content)) content = content.slice(1, -1);
      html += onlyText ? escapeHtml(content) : '<code>' + escapeHtml(content) + '</code>';
      position += match[0].length;
      continue;
    }
    if (character === '\\' && (match = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/.exec(remaining))) {
      flushLiteral(); html += escapeHtml(match[1]); position += match[0].length; continue;
    }
    if ((character === ' ' || character === '\\') && (match = /^ {2,}\n[ \t]*|^\\\n[ \t]*/.exec(remaining))) {
      flushLiteral(); html += '<br>'; position += match[0].length; continue;
    }
    if (character === '<' && (match = renderTag(remaining, references, insideAnchor, probeLinks))) {
      flushLiteral(); html += match.html; insideAnchor = match.insideAnchor;
      position += match.consumed; continue;
    }
    if (boundary && (match = renderAutolink(remaining, insideAnchor, runs))) {
      if (match.literal !== undefined) literal += match.literal;
      else { flushLiteral(); html += match.html; }
      position += match.consumed; continue;
    }
    if ((character === '[' || (character === '!' && remaining[1] === '[')) &&
        (match = renderLink(remaining, references, nesting, onlyText))) {
      flushLiteral(); html += match.html; position += match.consumed; continue;
    }
    if ((character === '*' || character === '_') && !exclusions.some(([start, end]) => position >= start && position < end) && /^[*_]+/.test(remaining)) {
      const marker = remaining[0];
      const sequence = new RegExp('^' + (marker === '*' ? '\\*' : '_') + '+').exec(remaining)[0];
      finishPiece();
      const previous = source.charCodeAt(position - 1), preceding = source.charCodeAt(position - 2);
      const before = position ? source.slice(position - (previous >= 0xdc00 && previous <= 0xdfff && preceding >= 0xd800 && preceding <= 0xdbff ? 2 : 1), position) : '';
      const after = position + sequence.length < source.length ? String.fromCodePoint(source.codePointAt(position + sequence.length)) : '';
      const left = !whitespace(after) && (!punctuation(after) || whitespace(before) || punctuation(before));
      const right = !whitespace(before) && (!punctuation(before) || whitespace(after) || punctuation(after));
      const run = {ch: marker, original: sequence.length, len: sequence.length,
        open: left && (marker === '*' || !right || punctuation(before)), close: right && (marker === '*' || !left || punctuation(after))};
      pieces.push(run); runs.push(run); position += sequence.length; continue;
    }
    if (remaining[0] === '~') {
      const sequence = /^~+/.exec(remaining)[0];
      if (sequence.length <= 2) {
        finishPiece();
        const run = {ch: '~', len: sequence.length, open: !/[\s~]/.test(remaining[sequence.length] || ' '), close: !/\s/.test(source[position - 1] || ' ')};
        pieces.push(run); runs.push(run); position += sequence.length; continue;
      }
    }
    if (character === '&' && (match = /^&#(?:[0-9]{1,7}|[xX][0-9a-fA-F]{1,6});/.exec(remaining))) {
      flushLiteral();
      const number = match[0][2].toLowerCase() === 'x' ? parseInt(match[0].slice(3, -1), 16) : +match[0].slice(2, -1);
      html += escapeHtml(String.fromCodePoint(!number || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff) ? 0xfffd : number));
      position += match[0].length; continue;
    }
    if (character === '&' && (match = /^&[a-z][\da-z]*;/i.exec(remaining))) {
      flushLiteral(); html += match[0]; position += match[0].length; continue;
    }
    if (character === '~' || character === '`') {
      const sequence = (character === '~' ? /^~+/ : /^`+/).exec(remaining)[0];
      literal += sequence; position += sequence.length; continue;
    }
    literal += source[position++];
    if (!atBoundary(source[position - 1])) {
      ordinary.lastIndex = position;
      const text = ordinary.exec(source);
      if (text) { literal += text[0]; position = ordinary.lastIndex; }
    }
  }
  finishPiece();
  return resolveRuns(pieces, runs, onlyText);
}

function renderTag(remaining, references, insideAnchor, probeLinks) {
  let match, html = "";
    if (!probeLinks && (match = /^<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\x00-\x20<>]*)>/.exec(remaining))) {
      html += '<a href="' + encodeAddress(match[1]) + '">' + escapeHtml(match[1]) + '</a>';
      return {html, consumed: match[0].length, insideAnchor};
    }
    if (!probeLinks && (match = /^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/.exec(remaining))) {
      html += '<a href="' + encodeAddress('mailto:' + match[1]) + '">' + escapeHtml(match[1]) + '</a>';
      return {html, consumed: match[0].length, insideAnchor};
    }
    if ((match = /^<!--(?:-?>|[^]*?-->)|^<![A-Z][^>]*>|^<!\[CDATA\[[^]*?\]\]>|^<\/[A-Za-z][A-Za-z0-9-]*\s*>|^<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:"[^"\x00]*"|'[^'\x00]*'|[^\s"'=<>`]+))?)*\s*\/?>|^<\?[\s\S]*?\?>/.exec(remaining))) {
      if (!probeLinks) {
        if (/^<a(?:\s|>)/i.test(match[0])) references[anchorContext] = insideAnchor = true;
        else if (/^<\/a\s*>/i.test(match[0])) references[anchorContext] = insideAnchor = false;
        html += match[0];
      }
      return {html, consumed: match[0].length, insideAnchor};
    }
  return null;
}

function renderAutolink(remaining, insideAnchor, runs) {
  let match;
    if (!insideAnchor && runs.some(run => run.ch === '_' && run.open && run.len >= 1) &&
        (match = /^(?:mailto:|xmpp:)?[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?=_{1,2}(?!\w))/.exec(remaining))) {
      const html = '<a href="' + linkAddress(match[0].includes(':') ? match[0] : 'mailto:' + match[0]) + '">' + escapeHtml(match[0]) + '</a>';
      return {html, consumed: match[0].length};
    }
    if ( (match = /^(?:mailto:|xmpp:)?[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+[_-](?![A-Za-z0-9])/.exec(remaining))) {
      return {literal: match[0], consumed: match[0].length};
    }
    if (!insideAnchor && (match = /^([hH][tT][tT][pP][sS]?:\/\/[^\s<>]+|www\.[^\s<>]+|(?:mailto:|xmpp:)?[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?!(?:[\w-]))(?:\/[A-Za-z0-9@._+-]+)?)/.exec(remaining))) {
      let address = match[0], previous;
      for (let cursor = 0; cursor < address.length; cursor++) {
        if (address[cursor] !== '(') continue;
        const close = address.indexOf(')', cursor + 1);
        if (close < 0) { address = address.slice(0, cursor); break; }
        cursor = close;
      }
      do {
        previous = address;
        address = address.replace(/(?:[?!.,:;*_~]+|&[a-zA-Z0-9]+;)$/, '');
        if (address.endsWith(')')) {
          let balance = 0, unmatched = false;
          for (const symbol of address) {
            if (symbol === '(') balance++;
            else if (symbol === ')') { unmatched = balance === 0; if (balance) balance--; }
          }
          if (unmatched) address = address.slice(0, -1);
        }
      } while (address !== previous);
      const target = address.startsWith('www.') ? 'http://' + address : address.includes('@') && !address.includes(':') ? 'mailto:' + address : address;
      const html = '<a href="' + linkAddress(target) + '">' + escapeHtml(address) + '</a>';
      return {html, consumed: address.length};
    }
  return null;
}

function renderLink(remaining, references, nesting, onlyText) {
  let html = "";
      const image = remaining[0] === '!', labelStart = image ? 2 : 1;
      let cursor = labelStart, brackets = 1;
      for (; cursor < remaining.length && brackets; cursor++) {
        if (remaining[cursor] === '\\') { cursor++; continue; }
        if (remaining[cursor] === '`') {
          const span = findCode(remaining.slice(cursor));
          if (span && !(span[1].length > 1 && /\][([]/.test(span[0]))) { cursor += span[0].length - 1; continue; }
        }
        if (remaining[cursor] === '<') {
          const tag = /^<(?:[^>"']|"[^"]*"|'[^']*')*>/.exec(remaining.slice(cursor));
          if (tag) { cursor += tag[0].length - 1; continue; }
        }
        if (remaining[cursor] === '[') brackets++;
        else if (remaining[cursor] === ']') brackets--;
      }
      if (!brackets) {
        const label = remaining.slice(labelStart, cursor - 1), suffix = remaining.slice(cursor);
        let consumed = cursor, target = null, title = '';
        if (suffix[0] === '(') {
          let end = 1;
          while (/[ \t\n]/.test(suffix[end] || '') && end < suffix.length) end++;
          const start = end;
          let destination = '', valid = true;
          if (suffix[end] === '<') {
            const start = ++end;
            while (end < suffix.length && suffix[end] !== '>' && suffix[end] !== '\n') {
              if (suffix[end] === '\\' && end + 1 < suffix.length) end++;
              else if (suffix[end] === '<') valid = false;
              end++;
            }
            if (suffix[end] !== '>') valid = false;
            destination = suffix.slice(start, end); end++;
          } else {
            let balance = 0;
            while (end < suffix.length && !/[ \t\n]/.test(suffix[end])) {
              if (suffix[end] === '\\' && end + 1 < suffix.length) { end += 2; continue; }
              if (suffix[end] === '(') balance++;
              if (suffix[end] === ')') { if (!balance) break; balance--; }
              end++;
            }
            if (balance) valid = false;
            destination = suffix.slice(start, end);
          }
          const destinationEnd = end;
          while (end < suffix.length && /[ \t\n]/.test(suffix[end])) end++;
          if (end > destinationEnd && /^["'(]$/.test(suffix[end] || '')) {
            const closing = suffix[end] === '(' ? ')' : suffix[end];
            const start = ++end;
            while (end < suffix.length && suffix[end] !== closing) { if (suffix[end] === '\\') end++; end++; }
            title = suffix.slice(start, end);
            if (suffix[end] !== closing || /\n[ \t]*\n/.test(title)) valid = false;
            end++;
            while (end < suffix.length && /[ \t\n]/.test(suffix[end])) end++;
          }
          if (valid && suffix[end] === ')') { target = destination; consumed = cursor + end + 1; }
        } else {
          const explicit = /^\[([^\]]*)\]/.exec(suffix);
          const reference = references[referenceKey(explicit ? explicit[1] || label : label)];
          if (reference) { target = reference.url; title = reference.title; consumed = cursor + (explicit ? explicit[0].length : 0); }
        }
        if (target === null && suffix[0] === '(') {
          const reference = references[referenceKey(label)];
          if (reference) { target = reference.url; title = reference.title; consumed = cursor; }
        }
        if (target !== null && !/``[^`]*`[^`]+``.+/.test(label) &&
            !(!image && /<a href=/.test(renderInline(label, references, nesting + 1, false, true, true)))) {
          if (onlyText) html += renderInline(label, references, nesting + 1, true);
          else if (image) html += '<img src="' + linkAddress(target) + '" alt="' + renderInline(label, references, nesting + 1, true) + '"' + (title ? ' title="' + escapeAttribute(decodeDestination(title)) + '"' : '') + '>';
          else html += '<a href="' + linkAddress(target) + '"' + (title ? ' title="' + escapeAttribute(decodeDestination(title)) + '"' : '') + '>' + renderInline(label, references, nesting + 1, false, true) + '</a>';
          return {html, consumed};
        }
      }
      return null;
}

function resolveRuns(pieces, runs, onlyText) {
  // Resolve closer runs in order, consuming one or two markers at a time.
  for (let closingIndex = 0; closingIndex < runs.length; closingIndex++) {
    const closing = runs[closingIndex];
    while (closing.close && closing.len) {
      let openingIndex = closingIndex - 1;
      for (; openingIndex >= 0; openingIndex--) {
        const opening = runs[openingIndex];
        if (!opening.len || !opening.open || opening.ch !== closing.ch ||
            (closing.ch === '~' && opening.len !== closing.len) ||
            (closing.ch !== '~' && (opening.close || closing.open) && (opening.len + closing.len) % 3 === 0 && (opening.len % 3 !== 0 || closing.len % 3 !== 0))) continue;
        if (opening.len === 2 && closing.len === 1) {
          let nested = false;
          for (let index = pieces.indexOf(opening) + 1, end = pieces.indexOf(closing); index < end; index++) {
            if (/<(?:em|strong)>/.test(pieces[index].html || '')) { nested = true; break; }
          }
          if (nested) {
            let later = false;
            for (let index = closingIndex + 1; index < runs.length; index++) {
              const run = runs[index];
              if (run.ch === closing.ch && run.close && run.len >= 2) { later = true; break; }
            }
            if (later) continue;
          }
        }
        break;
      }
      if (openingIndex < 0) break;
      const opening = runs[openingIndex], count = opening.len >= 2 && closing.len >= 2 ? 2 : 1;
      const start = pieces.indexOf(opening), end = pieces.indexOf(closing);
      const tag = closing.ch === '~' ? 'del' : count === 2 ? 'strong' : 'em';
      let content = '';
      for (let index = start + 1; index < end; index++) content += pieces[index].html ?? pieces[index].ch.repeat(pieces[index].len);
      if (count === 1 && closing.ch === '*' && opening.original === 1 && /(?:^|\s)<strong>[^]*<\/strong>[\p{L}\p{N}]/u.test(content)) { opening.open = false; continue; }
      if (count === 2 && opening.len === 2 && closing.len === 3 && /<\/em>[\p{L}\p{N}]+$/u.test(content)) { content += '*'; closing.len--; }
      pieces.splice(start + 1, end - start - 1, {html: (onlyText ? '' : '<' + tag + '>') + content + (onlyText ? '' : '</' + tag + '>')});
      opening.len -= count; closing.len -= count;
      runs.splice(openingIndex + 1, closingIndex - openingIndex - 1);
      closingIndex = openingIndex + 1;
    }
  }
  return pieces.map(piece => piece.html ?? piece.ch.repeat(piece.len)).join('');
}

const isBlank = line => /^[ \t]*$/.test(line);
const listPrefix = line => /^ {0,3}([-+*]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/.exec(line || '');
const isRule = line => /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
function listInterrupts(line, withinList = false) {
  const marker = listPrefix(line);
  return marker && !isRule(line) && (marker[3] || '').trim() && (!/\d/.test(marker[1]) || +marker[1].slice(0, -1) === 1 || withinList);
}
function tableCells(line) {
  line = line.trim();
  if (line.startsWith('|')) line = line.slice(1);
  if (/(?<!\\)(?:\\\\)*\|$/.test(line)) line = line.slice(0, -1);
  const cells = [];
  let cell = '';
  for (const character of line) {
    if (character !== '|') { cell += character; continue; }
    let slashes = 0;
    for (let index = cell.length - 1; index >= 0 && cell[index] === '\\'; index--) slashes++;
    if (slashes % 2) { cell = cell.slice(0, -1) + '|'; continue; }
    cells.push(cell.trim()); cell = '';
  }
  cells.push(cell.trim());
  return cells;
}
function htmlCategory(line) {
  if (/^ {0,3}<(script|pre|style|textarea)(?=[ \t>]|$)/i.test(line)) return 1;
  if (/^ {0,3}<!--/.test(line)) return 2;
  if (/^ {0,3}<\?/.test(line)) return 3;
  if (/^ {0,3}<![A-Z]/.test(line)) return 4;
  if (/^ {0,3}<!\[CDATA\[/.test(line)) return 5;
  if (/^ {0,3}<\/?(?:address|article|aside|base|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?=[ \t/>]|$)/i.test(line)) return 6;
  if (/^ {0,3}(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:"[^"\x00]*"|'[^'\x00]*'|[^\s"'=<>`]+))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)[ \t]*$/.test(line)) return 7;
  return 0;
}
function stripQuote(line) {
  const match = /^( {0,3})>(.*)$/.exec(line);
  if (!match) return null;
  const remainder = match[2];
  let column = match[1].length + 1, spaces = '', cursor = 0;
  while (cursor < remainder.length && /[ \t]/.test(remainder[cursor])) {
    const width = remainder[cursor] === '\t' ? 4 - column % 4 : 1;
    spaces += ' '.repeat(width); column += width; cursor++;
  }
  return (spaces ? spaces.slice(1) : '') + remainder.slice(cursor);
}
function removeIndent(line, width) {
  let column = 0, cursor = 0;
  while (cursor < line.length && column < width && /[ \t]/.test(line[cursor])) column += line[cursor++] === '\t' ? 4 - column % 4 : 1;
  return ' '.repeat(Math.max(0, column - width)) + line.slice(cursor);
}
function blockTokens(source, references, definitionPattern) {
  function scan(rawLines, withinList = false) {
    const lines = new Array(rawLines.length);
    for (let index = 0; index < rawLines.length; index++) {
      const line = rawLines[index];
      let cursor = 0, column = 0, containsTab = false;
      while (cursor < line.length) {
        const code = line.charCodeAt(cursor);
        if (code === 32) column++;
        else if (code === 9) { column += 4 - column % 4; containsTab = true; }
        else break;
        cursor++;
      }
      lines[index] = containsTab ? ' '.repeat(column) + line.slice(cursor) : line;
    }
    const tokens = [];
    let position = 0, blankPending = false, blankBefore = false;
    const emit = token => { token.blankBefore = blankBefore; tokens.push(token); };
    while (position < lines.length) {
      const line = lines[position];
      let match;
      if (isBlank(line)) { blankPending = true; position++; continue; }
      blankBefore = blankPending; blankPending = false;
      if ((match = /^ {0,3}(`{3,}(?!`)|~{3,})(.*)$/.exec(line)) && (match[1][0] === '~' || !match[2].includes('`'))) {
        const indentation = match[1][0] === '~' ? 0 : line.length - line.trimStart().length;
        const marker = match[1], content = [];
        position++;
        while (position < lines.length && !new RegExp('^ {0,3}' + marker[0] + '{' + marker.length + ',}\\s*$').test(lines[position])) {
          content.push(indentation && rawLines[position].startsWith('\t') ? rawLines[position++].slice(1) : removeIndent(rawLines[position++], indentation));
        }
        if (position < lines.length) position++;
        emit({type: 'code', text: content.join('\n') + (content.length && content.at(-1) !== '' ? '\n' : ''), info: match[2].trim().split(/\s+/)[0] || ''});
        continue;
      }
      if (/^ {4}/.test(line)) {
        const content = [];
        while (position < lines.length && (/^ {4}/.test(lines[position]) || isBlank(lines[position]))) content.push(removeIndent(rawLines[position++], 4));
        while (content.length && !content.at(-1)) content.pop();
        if (content.length) emit({type: 'code', text: content.join('\n') + '\n'});
        continue;
      }
      definitionPattern.lastIndex = 0;
      const definition = /^ {0,3}\[/.test(line) ? definitionPattern.exec(lines.slice(position).join('\n')) : null;
      if (definition && definition.index === 0) {
        const [whole, label, destination, doubleTitle, singleTitle, parenTitle] = definition;
        if (label.trim() && !/(?<!\\)\[/.test(label) && !/\n[ \t]*\n/.test(label) &&
            ![doubleTitle, singleTitle, parenTitle].some(title => title !== undefined && /\n[ \t]*\n/.test(title))) {
          const key = referenceKey(label);
          if (!(key in references)) references[key] = {url: destination.replace(/^<|>$/g, ''), title: doubleTitle ?? singleTitle ?? parenTitle ?? ''};
          emit({type: 'definition'});
          position += whole.split('\n').length - (whole.endsWith('\n') ? 1 : 0);
          continue;
        }
      }
      if ((match = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line))) {
        emit({type: 'heading', level: match[1].length, text: match[2].replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim()}); position++; continue;
      }
      if (isRule(line)) { emit({type: 'hr'}); position++; continue; }
      if (/^ {0,3}>[ \t]?(.*)$/.test(line)) {
        const quoted = [];
        while (position < lines.length) {
          const stripped = stripQuote(lines[position]);
          if (stripped !== null) { quoted.push(stripped); position++; continue; }
          const endsInParagraph = () => {
            let last = scan(quoted).at(-1);
            while (last?.type === 'blockquote' || last?.type === 'list') last = last.type === 'blockquote' ? last.children.at(-1) : last.items.at(-1)?.children.at(-1);
            return last?.type === 'paragraph';
          };
          if (quoted.length && !isBlank(quoted.at(-1)) && endsInParagraph() && !isBlank(lines[position]) &&
              !(htmlCategory(lines[position]) && htmlCategory(lines[position]) < 7) && !listInterrupts(lines[position], withinList) &&
              !/^ {0,3}(?:#{1,6}(?:\s|$)|`{3,}|~{3,})/.test(lines[position]) && !isRule(lines[position])) {
            quoted.push(/^ {0,3}=+[ \t]*$/.test(lines[position]) ? '    ' + lines[position++] : lines[position++]);
          } else break;
        }
        const children = scan(quoted);
        for (const child of children) if (child.type === 'paragraph') child.text = child.text.replace(/\n {4,}(?=[*+-] )/g, '\n');
        if (/^ +$/.test(quoted.at(-1) || '') && children.at(-1)?.type === 'paragraph') children.at(-1).text += '\n' + quoted.at(-1);
        emit({type: 'blockquote', children}); continue;
      }
      if ((match = listPrefix(line))) {
        const ordered = /\d/.test(match[1]), marker = ordered ? match[1].slice(-1) : match[1];
        const items = [], start = ordered ? +match[1].slice(0, -1) : 1;
        let loose = false;
        while (position < lines.length) {
          const prefix = listPrefix(lines[position]);
          if (!prefix || isRule(lines[position]) || /\d/.test(prefix[1]) !== ordered || (ordered ? prefix[1].slice(-1) : prefix[1]) !== marker) break;
          const leading = lines[position].length - lines[position].trimStart().length;
          const markerEnd = leading + prefix[1].length;
          let column = markerEnd, spacing = '';
          for (const character of prefix[2] || '') {
            const width = character === '\t' ? 4 - column % 4 : 1;
            spacing += ' '.repeat(width); column += width;
          }
          let content = prefix[3] || '', padding = spacing.length;
          if (!content.trim()) { content = ''; padding = 1; }
          else if (padding > 4) { content = spacing.slice(1) + content; padding = 1; }
          const indentation = markerEnd + padding, itemLines = [content];
          position++;
          let pending = [];
          while (position < lines.length) {
            const continuation = lines[position];
            if (isBlank(continuation)) { pending.push(''); position++; continue; }
            const spaces = continuation.length - continuation.trimStart().length;
            if (!content && pending.length) break;
            if (spaces >= indentation) {
              if (pending.length) { itemLines.push(...pending); pending = []; }
              itemLines.push(continuation.slice(indentation)); position++; continue;
            }
            if (listPrefix(continuation) || isRule(continuation) || /^ {0,3}(?:>|#{1,6}(?:\s|$)|`{3,}|~{3,})/.test(continuation)) break;
            if (pending.length || !itemLines.at(-1) || /^ {0,3}`{3,}/.test(itemLines.at(-1))) break;
            itemLines.push(continuation); position++;
          }
          const children = scan(itemLines, true);
          for (const child of children) if (child.type === 'paragraph') child.text = child.text.replace(/\n {4,}/g, '\n');
          items.push({type: 'list_item', children, loose: children.some((child, index) => index > 0 && child.blankBefore)});
          if (pending.length) blankPending = true;
          const next = listPrefix(lines[position]);
          if (pending.length && next && !isRule(lines[position]) && /\d/.test(next[1]) === ordered && (ordered ? next[1].slice(-1) : next[1]) === marker) loose = true;
        }
        if (loose) for (const item of items) item.loose = true;
        emit({type: 'list', ordered, start, items}); continue;
      }
      const category = htmlCategory(line);
      if (category) {
        const content = [], tag = /^ {0,3}<(\w+)/.exec(line)?.[1];
        const terminator = category === 1 ? new RegExp('</' + tag + '\\s*>', 'i') : category === 2 ? /-->|^ {0,3}<!---?>/ : category === 3 ? /\?>/ : category === 4 ? />/ : /\]\]>/;
        while (position < lines.length) {
          if (category >= 6 && isBlank(lines[position])) break;
          const raw = rawLines[position++]; content.push(raw);
          if (category < 6 && terminator.test(raw)) break;
        }
        const newline = category < 6 ? (category === 2 ? lines[position] !== undefined && lines[position] !== '' : position < lines.length && (lines[position] !== '' || position === lines.length - 1)) : position === lines.length - 1 && isBlank(lines[position]);
        emit({type: 'html', text: content.join('\n') + (newline ? '\n' : '')}); continue;
      }
      if (position + 1 < lines.length && line.includes('|')) {
        const head = tableCells(line), separators = tableCells(lines[position + 1]);
        if (head.length === separators.length && separators.every(cell => /^:?-+:?$/.test(cell))) {
          const table = {type: 'table', head, align: separators.map(cell => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.startsWith(':') ? 'left' : cell.endsWith(':') ? 'right' : ''), rows: []};
          emit(table); position += 2;
          while (position < lines.length && (!isBlank(lines[position]) || rawLines[position].includes('\t')) && !listInterrupts(lines[position]) && !isRule(lines[position]) &&
              !/^ {0,3}(?:>|#{1,6}(?:\s|$)|`{3,}|~{3,})/.test(lines[position]) && !(htmlCategory(lines[position]) && htmlCategory(lines[position]) < 7)) table.rows.push(tableCells(lines[position++]));
          continue;
        }
      }
      const paragraph = [line]; position++;
      while (position < lines.length && !isBlank(lines[position])) {
        if (htmlCategory(lines[position]) && htmlCategory(lines[position]) < 7) break;
        if (/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[position])) break;
        if (/^ {0,3}(?:#{1,6}(?:\s|$)|>|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$|`{3,}(?!`)[^`]*$|~{3,})/.test(lines[position]) || listInterrupts(lines[position], withinList)) break;
        paragraph.push(lines[position++]);
      }
      if (position < lines.length && (match = /^ {0,3}(=+|-+)[ \t]*$/.exec(lines[position]))) {
        emit({type: 'heading', level: match[1][0] === '=' ? 1 : 2, text: paragraph.join('\n').trim()}); position++;
      } else emit({type: 'paragraph', text: paragraph.join('\n')});
    }
    return tokens;
  }
  return scan(source.split('\n'));
}

function containsAnchor(tokens) {
  return tokens.some(token => /<a(?:\s|>)/i.test(token.text || '') ||
    (token.children && containsAnchor(token.children)) ||
    (token.items && token.items.some(item => containsAnchor(item.children))) ||
    (token.head && token.head.some(cell => /<a(?:\s|>)/i.test(cell))) ||
    (token.rows && token.rows.some(row => row.some(cell => /<a(?:\s|>)/i.test(cell)))));
}
function renderBlocks(tokens, references, parentLoose = false) {
  let html = '';
  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        html += '<h' + token.level + '>' + renderInline(token.text, references) + '</h' + token.level + '>\n'; break;
      case 'paragraph':
        html += '<p>' + renderInline(token.text, references) + '</p>\n'; break;
      case 'code':
        html += '<pre><code' + (token.info ? ' class="language-' + escapeAttribute(decodeDestination(token.info).replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/g, '$1')) + '"' : '') + '>' + escapeHtml(token.text) + '</code></pre>\n'; break;
      case 'hr': html += '<hr>\n'; break;
      case 'html': html += token.text; break;
      case 'blockquote': html += '<blockquote>\n' + renderBlocks(token.children, references) + '</blockquote>\n'; break;
      case 'list': {
        const tag = token.ordered ? 'ol' : 'ul';
        html += '<' + tag + (token.ordered && token.start !== 1 ? ' start="' + token.start + '"' : '') + '>\n';
        for (const original of token.items) {
          let item = original, checkbox = '';
          const first = item.children[0], task = first?.type === 'paragraph' && /^\[([ xX])\][ \t]+/.exec(first.text);
          if (task) {
            checkbox = '<input ' + (task[1] !== ' ' ? 'checked="" ' : '') + 'disabled="" type="checkbox"> ';
            item = {...item, children: [{...first, text: first.text.slice(task[0].length)}, ...item.children.slice(1)]};
          }
          let content;
          // The preliminary pass is observable when raw anchors change link state.
          if (token.items.some(entry => entry.loose) || containsAnchor(item.children)) content = renderBlocks(item.children, references, token.items.some(entry => entry.loose));
          if (!token.items.some(entry => entry.loose)) content = item.children.map(child => child.type === 'paragraph' ? renderInline(child.text, references) : renderBlocks([child], references)).join('');
          if (checkbox) content = content.startsWith('<p>') ? '<p>' + checkbox + content.slice(3) : checkbox + content;
          html += '<li>' + content + '</li>\n';
        }
        html += '</' + tag + '>\n'; break;
      }
      case 'table': {
        html += '<table>\n<thead>\n<tr>\n';
        for (let column = 0; column < token.head.length; column++) html += '<th' + (token.align[column] ? ' align="' + token.align[column] + '"' : '') + '>' + renderInline(token.head[column], references) + '</th>\n';
        html += '</tr>\n</thead>\n';
        if (token.rows.length) {
          html += '<tbody>';
          for (const row of token.rows) {
            html += '<tr>\n';
            for (let column = 0; column < token.head.length; column++) html += '<td' + (token.align[column] ? ' align="' + token.align[column] + '"' : '') + '>' + renderInline(row[column] || '', references) + '</td>\n';
            html += '</tr>\n';
          }
          html += '</tbody>';
        }
        html += '</table>\n'; break;
      }
    }
  }
  return html;
}
export function parse(markdown) {
  if (typeof markdown !== 'string') throw new TypeError('markdown must be a string');
  const source = markdown.replace(/\r\n?/g, '\n');
  const references = Object.create(null);
  const definitions = /^ {0,3}\[((?:\\.|[^\]\\])+)\]:[ \t]*(?:\n[ \t]*)?(<[^>]*>|(?!<)\S+)(?:(?:[ \t]+|[ \t]*\n[ \t]*)(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\)))?[ \t]*(?:\n|$)/gm;
  return renderBlocks(blockTokens(source, references, definitions), references);
}
