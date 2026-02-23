import React from 'react';

type LinkifiedTextProps = {
  text: string;
  className?: string;
  linkClassName?: string;
  as?: 'p' | 'div' | 'span';
};

const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

const trimTrailingPunctuation = (value: string) => {
  let result = value;
  while (/[),.;!?]$/.test(result)) {
    result = result.slice(0, -1);
  }
  return result;
};

const normalizeHref = (value: string) => {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
};

const linkifyLine = (line: string, lineKey: string, linkClassName?: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(line)) !== null) {
    const rawMatch = match[0];
    const cleanUrl = trimTrailingPunctuation(rawMatch);
    const matchIndex = match.index;
    const cleanLength = cleanUrl.length;
    const trailing = rawMatch.slice(cleanLength);

    if (matchIndex > lastIndex) {
      nodes.push(line.slice(lastIndex, matchIndex));
    }

    nodes.push(
      <a
        key={`${lineKey}-link-${matchIndex}`}
        href={normalizeHref(cleanUrl)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName ?? 'underline decoration-dotted underline-offset-2 hover:opacity-80'}
      >
        {cleanUrl}
      </a>,
    );

    if (trailing) nodes.push(trailing);
    lastIndex = matchIndex + rawMatch.length;
  }

  if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
  if (nodes.length === 0) nodes.push(line);

  return nodes;
};

export const linkifyTextNodes = (text: string, linkClassName?: string) => {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, index) => {
    nodes.push(...linkifyLine(line, `line-${index}`, linkClassName));
    if (index < lines.length - 1) {
      nodes.push(<br key={`br-${index}`} />);
    }
  });

  return nodes;
};

export default function LinkifiedText({
  text,
  className,
  linkClassName,
  as = 'p',
}: LinkifiedTextProps) {
  const Tag = as;
  return <Tag className={className}>{linkifyTextNodes(text, linkClassName)}</Tag>;
}
