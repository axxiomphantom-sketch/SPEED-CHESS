import type { ReactNode } from 'react';

/**
 * Renders the lesson/content markdown subset used across SPEED CHESS:
 * headings, bold/italic/code, lists, tables, blockquotes and paragraphs.
 * Deliberately small and dependency-free so lesson content cannot inject HTML.
 */
export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const blocks = parseBlocks(source);
  return <div className={`prose ${className}`}>{blocks.map((block, index) => <Block key={index} block={block} />)}</div>;
}

type Block =
  | { kind: 'h'; level: 2 | 3 | 4; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'hr' };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) { blocks.push({ kind: 'p', text: paragraph.join(' ') }); paragraph = []; }
  };
  const flushList = () => {
    if (list) { blocks.push({ kind: list.ordered ? 'ol' : 'ul', items: list.items }); list = null; }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { flushParagraph(); flushList(); continue; }

    const heading = /^(#{2,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph(); flushList();
      blocks.push({ kind: 'h', level: heading[1].length as 2 | 3 | 4, text: heading[2] });
      continue;
    }
    if (/^---+\s*$/.test(trimmed)) { flushParagraph(); flushList(); blocks.push({ kind: 'hr' }); continue; }

    if (trimmed.startsWith('> ')) {
      flushParagraph(); flushList();
      blocks.push({ kind: 'quote', text: trimmed.slice(2) });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(bullet[1]);
      continue;
    }
    const ordered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (ordered) {
      flushParagraph();
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(ordered[1]);
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushParagraph(); flushList();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().slice(1, -1).split('|').map(c => c.trim());
        if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      if (rows.length) blocks.push({ kind: 'table', head: rows[0], rows: rows.slice(1) });
      continue;
    }

    paragraph.push(trimmed);
  }
  flushParagraph(); flushList();
  return blocks;
}

function Inline({ text }: { text: string }) {
  // Split on **bold**, *italic* and `code` while keeping plain text intact.
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  const parts = text.split(pattern).filter(part => part !== '');
  return <>{parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} style={{ background: '#22222b', padding: '1px 5px', borderRadius: 4 }}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return <span key={index}>{part}</span>;
  })}</>;
}

function Block({ block }: { block: Block }): ReactNode {
  switch (block.kind) {
    case 'h':
      return block.level === 2 ? <h2><Inline text={block.text} /></h2> : block.level === 3 ? <h3><Inline text={block.text} /></h3> : <h4><Inline text={block.text} /></h4>;
    case 'p':
      return <p><Inline text={block.text} /></p>;
    case 'ul':
      return <ul>{block.items.map((item, i) => <li key={i}><Inline text={item} /></li>)}</ul>;
    case 'ol':
      return <ol>{block.items.map((item, i) => <li key={i}><Inline text={item} /></li>)}</ol>;
    case 'quote':
      return <blockquote><Inline text={block.text} /></blockquote>;
    case 'hr':
      return <hr />;
    case 'table':
      return (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead><tr>{block.head.map((cell, i) => <th key={i}>{cell}</th>)}</tr></thead>
            <tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}><Inline text={cell} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}
