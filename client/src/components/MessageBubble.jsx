import { useRef, useState, useCallback } from 'react';
import { format } from 'date-fns';
import logo from '../logo.jpeg';
import './MessageBubble.css';

// Approximate popover height — used to decide whether the popover
// can fit above the link without clipping the viewport. We don't
// measure the popover itself because it's rendered with opacity:0
// until hover; the link rect is always reliable.
const POPOVER_HEIGHT_HINT = 220;

// Wikipedia-style hover popover for an inline citation. The link
// itself opens the source in a new tab; hovering shows a small card
// with the citation label and (when available) a snippet of the
// source text. The popover flips between above-link and below-link
// placement so it never gets clipped by the top of the viewport.
// Falls back to a plain <a> with native title tooltip when there is
// no snippet to show.
function CitationLink({ citation, children }) {
  const wrapRef = useRef(null);
  // 'above' / 'below' — recomputed on every hover so a flipped
  // citation doesn't get stuck once the page scrolls.
  const [placement, setPlacement] = useState('above');

  const choosePlacement = useCallback(() => {
    const node = wrapRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    // Prefer above when there's room. Flip below only when the
    // above-anchor would clip and below has more space.
    if (spaceAbove < POPOVER_HEIGHT_HINT && spaceBelow > spaceAbove) {
      setPlacement('below');
    } else {
      setPlacement('above');
    }
  }, []);

  const className = `citation citation-${citation.kind || 'doc'}`;
  const linkProps = {
    className,
    href: citation.url,
    target: '_blank',
    rel: 'noopener noreferrer',
  };

  if (!citation.snippet) {
    return <a {...linkProps} title={citation.label}>{children}</a>;
  }

  return (
    <span
      className="citation-wrap"
      ref={wrapRef}
      onMouseEnter={choosePlacement}
      onFocus={choosePlacement}
    >
      <a {...linkProps}>{children}</a>
      <span
        className={`citation-popover citation-popover-${placement}`}
        role="tooltip"
        aria-hidden="true"
      >
        <span className="citation-popover-label">{citation.label}</span>
        <span className="citation-popover-snippet">{citation.snippet}</span>
        <span className="citation-popover-cta">Open source ↗</span>
      </span>
    </span>
  );
}

// Render a reply, inserting CitationLink wrappers wherever a citation
// entry's {start, end} range matches the original text. Citations are
// produced server-side from RAG sources, internal documents, and the
// configured regex patterns in data/citation-patterns.json.
function renderTextWithCitations(text, citations) {
  if (!text) return null;
  if (!Array.isArray(citations) || citations.length === 0) return text;

  // Defensive: sort by start, drop invalid ranges.
  const valid = citations
    .filter((c) =>
      typeof c.start === 'number' &&
      typeof c.end === 'number' &&
      c.start >= 0 && c.end > c.start && c.end <= text.length)
    .sort((a, b) => a.start - b.start);

  const out = [];
  let cursor = 0;
  valid.forEach((c, i) => {
    if (c.start < cursor) return; // skip overlap
    if (c.start > cursor) out.push(text.slice(cursor, c.start));
    out.push(
      <CitationLink key={`cite-${i}`} citation={c}>
        {text.slice(c.start, c.end)}
      </CitationLink>
    );
    cursor = c.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

export default function MessageBubble({ message }) {
  const { role, text, timestamp, fileName, fileType, filePreview, citations, sourceCount } = message;
  const isUser = role === 'user';
  const isBot  = role === 'bot';
  const isImage = fileType && fileType.startsWith('image/');

  const timeStr = timestamp
    ? format(new Date(timestamp), 'HH:mm')
    : '';

  return (
    <div className={`message-bubble ${role}`}>
      <div className={`bubble-avatar ${isUser ? 'user-avatar' : 'bot-avatar'}`}>
        {isUser ? 'U' : role === 'error' ? '⚠️' : <img src={logo} alt="Graham" className="bot-logo-img" />}
      </div>
      <div className="bubble-content">
        {/* File attachment badge */}
        {fileName && !isImage && (
          <div className="bubble-file-badge">
            <span className="bubble-file-icon">📄</span>
            <span className="bubble-file-name">{fileName}</span>
          </div>
        )}
        {/* Image preview */}
        {isImage && filePreview && (
          <img src={filePreview} alt={fileName} className="bubble-image-preview" />
        )}
        <div className="bubble-text">
          {isBot ? renderTextWithCitations(text, citations) : text}
        </div>
        <div className="bubble-meta">
          {timeStr && <span className="bubble-time">{timeStr}</span>}
          {isBot && sourceCount > 0 && (
            <span className="source-badge" title={`${sourceCount} source${sourceCount === 1 ? '' : 's'} cited`}>
              📎 {sourceCount} source{sourceCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
