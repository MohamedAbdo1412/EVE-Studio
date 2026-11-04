import React from 'react';
import { classifyCodeToken, tokenizeCodeLine } from './codeTokens.js';

export default function CodeViewer({ code, language = 'cpp', maxHeight }) {
  const lines = String(code || '').split('\n');
  return (
    <div className="eve-code-viewer" style={maxHeight ? { maxHeight } : undefined}>
      <div className="eve-code-scroll">
        {lines.map((line, lineIndex) => {
          const tokens = tokenizeCodeLine(line);
          return (
            <div className="eve-code-line" key={lineIndex}>
              <span className="eve-code-line-number">{lineIndex + 1}</span>
              <span className="eve-code-line-content">
                {tokens.map((token, tokenIndex) => {
                  if (!token) return null;
                  const kind = classifyCodeToken(token);
                  if (kind === 'plain') return <React.Fragment key={tokenIndex}>{token}</React.Fragment>;
                  return (
                    <span key={tokenIndex} className={`tok-${kind}`}>
                      {token}
                    </span>
                  );
                })}
                {line.length === 0 ? '\u00A0' : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
