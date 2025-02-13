import { useState } from 'preact/hooks';
import { CopyToClipboard } from '~web/components/copy-to-clipboard';
import { Icon } from '~web/components/icon';
import { cn } from '~web/utils/helpers';
import { formatForClipboard, formatValuePreview, safeGetValue } from './utils';

const ArrayHeader = ({
  length,
  expanded,
  onToggle,
  isNegative,
}: {
    length: number;
  expanded: boolean;
  onToggle: () => void;
  isNegative: boolean;
  }) => (
  <div className="flex items-center gap-1">
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center p-0 opacity-50"
    >
      <Icon
        name="icon-chevron-right"
        size={12}
        className={cn('transition-transform text-[#4ade80]', {
          'rotate-90': expanded,
          'text-[#f87171]': isNegative,
        })}
      />
    </button>
    <span>Array({length})</span>
  </div>
);

const TreeNode = ({
  value,
  path,
  isNegative,
}: {
  value: unknown;
  path: string;
  isNegative: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const canExpand = value !== null &&
    typeof value === 'object' &&
    !(value instanceof Date);

  if (!canExpand) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-gray-500">{path}:</span>
        <span className="truncate">{formatValuePreview(value)}</span>
      </div>
    );
  }

  const entries = Object.entries(value as object);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center p-0 opacity-50"
        >
          <Icon
            name="icon-chevron-right"
            size={12}
            className={cn('transition-transform text-[#4ade80]', {
              'rotate-90': isExpanded,
              'text-[#f87171]': isNegative,
            })}
          />
        </button>
        <span className="text-gray-500">{path}:</span>
        {!isExpanded && (
          <span className="truncate">
            {value instanceof Date ? formatValuePreview(value) : `{${Object.keys(value).join(', ')}}`}
          </span>
        )}
      </div>
      {isExpanded && (
        <div className="pl-5 border-l border-[#333] mt-0.5 ml-1 flex flex-col gap-0.5">
          {entries.map(([key, val]) => (
            <TreeNode
              key={key}
              value={val}
              path={key}
              isNegative={isNegative}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const DiffValueView = ({
  value,
  expanded,
  onToggle,
  isNegative,
}: {
  value: unknown;
  expanded: boolean;
  onToggle: () => void;
  isNegative: boolean;
}) => {
  const { value: safeValue, error } = safeGetValue(value);

  if (error) {
    return <span className="text-gray-500 font-italic">{error}</span>;
  }

  if (!Array.isArray(safeValue)) {
    return <span>{formatValuePreview(safeValue)}</span>;
  }

  return (
    <div className="flex flex-col gap-1 relative">
      <ArrayHeader
        length={safeValue.length}
        expanded={expanded}
        onToggle={onToggle}
        isNegative={isNegative}
      />
      {expanded && (
        <div className="pl-2 border-l border-[#333] mt-0.5 ml-1 flex flex-col gap-0.5">
          {safeValue.map((item, index) => (
            <TreeNode
              key={index.toString()}
              value={item}
              path={index.toString()}
              isNegative={isNegative}
            />
          ))}
        </div>
      )}
      <CopyToClipboard
        text={formatForClipboard(safeValue)}
        className="absolute top-0.5 right-0.5 opacity-0 transition-opacity group-hover:opacity-100 self-end"
      >
        {({ ClipboardIcon }) => <>{ClipboardIcon}</>}
      </CopyToClipboard>
    </div>
  );
};
