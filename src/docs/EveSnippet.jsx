import React from 'react';

const TOKEN_RE =
  /(<!--[\s\S]*?-->|<\/?[A-Za-z_][A-Za-z0-9_-]*|\/>|>|&(?:#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);|\$\{[^}]*\}|"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_-]*(?=\s*=))/g;

function classify(token) {
  if (token.startsWith('<!--')) return 'comment';
  if (token.startsWith('</') || (token.startsWith('<') && token.length > 1)) return 'tag';
  if (token === '>' || token === '/>') return 'punct';
  if (token.startsWith('&')) return 'entity';
  if (token.startsWith('${')) return 'interp';
  if (token.startsWith('"') || token.startsWith("'")) return 'string';
  return 'attr';
}

export default function EveSnippet({ code, maxLines, showLineNumbers = true, title }) {
  const allLines = String(code || '').replace(/\s+$/, '').split('\n');
  const lines = maxLines ? allLines.slice(0, maxLines) : allLines;
  return (
    <div className="eve-snippet">
      {title ? <div className="eve-snippet-title">{title}</div> : null}
      <div className="eve-snippet-body">
        {lines.map((line, lineIndex) => {
          const tokens = line.match(TOKEN_RE) || [];
          const pieces = [];
          let cursor = 0;
          tokens.forEach((token, tokenIndex) => {
            const index = line.indexOf(token, cursor);
            if (index > cursor) pieces.push(line.slice(cursor, index));
            pieces.push(
              <span key={`${lineIndex}-${tokenIndex}`} className={`eve-tok-${classify(token)}`}>
                {token}
              </span>,
            );
            cursor = index + token.length;
          });
          if (cursor < line.length) pieces.push(line.slice(cursor));
          return (
            <div className="eve-snippet-line" key={lineIndex}>
              {showLineNumbers ? (
                <span className="eve-snippet-number">{lineIndex + 1}</span>
              ) : null}
              <span className="eve-snippet-code">{pieces.length ? pieces : '\u00A0'}</span>
            </div>
          );
        })}
        {maxLines && allLines.length > maxLines ? (
          <div className="eve-snippet-more">
            + {allLines.length - maxLines} more line{allLines.length - maxLines === 1 ? '' : 's'}
          </div>
        ) : null}
      </div>
    </div>
  );
}
