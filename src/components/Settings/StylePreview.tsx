import { useState } from 'react';
import { Stage, Layer, Group, Rect, Ellipse, Text } from 'react-konva';
import type { StyleConfig, ArgumentElement, SupportElement, ContributorType, SupportContributor } from '../../types';
import { theme } from '../../utils/theme';
import { resolveArgumentStyle, resolveSupportStyle, dashArrayForBorderStyle } from '../../utils/styleResolver';

interface StylePreviewProps {
  kind: 'argument' | 'support';
  typeKey: string;
  config: StyleConfig;
}

const ARGUMENT_CONTRIBUTORS: ContributorType[] = ['given', 'student', 'teacher', 'joint', 'implicit'];
const SUPPORT_CONTRIBUTORS: SupportContributor[] = ['teacher', 'student'];

const PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 140;
const ELEMENT_WIDTH = 180;
const ELEMENT_HEIGHT = 80;

export function StylePreview({ kind, typeKey, config }: StylePreviewProps) {
  const [argContributor, setArgContributor] = useState<ContributorType>('given');
  const [supContributor, setSupContributor] = useState<SupportContributor>('teacher');

  const contributor = kind === 'argument' ? argContributor : supContributor;
  const contributors = kind === 'argument' ? ARGUMENT_CONTRIBUTORS : SUPPORT_CONTRIBUTORS;

  const resolved = (() => {
    if (kind === 'argument') {
      const el = {
        id: 'preview',
        type: 'argument',
        argumentType: typeKey,
        contributor: contributor as ContributorType,
        label: 'Sample',
        content: 'Sample content',
        position: { x: 0, y: 0 },
        size: { width: ELEMENT_WIDTH, height: ELEMENT_HEIGHT },
      } as ArgumentElement;
      return resolveArgumentStyle(el, config);
    } else {
      const el = {
        id: 'preview',
        type: 'support',
        supportType: typeKey,
        contributor: contributor as SupportContributor,
        content: 'Sample',
        position: { x: 0, y: 0 },
        size: { width: ELEMENT_WIDTH, height: ELEMENT_HEIGHT },
      } as SupportElement;
      return resolveSupportStyle(el, config);
    }
  })();

  const dashArray = dashArrayForBorderStyle(resolved.borderStyle);
  const x = (PREVIEW_WIDTH - ELEMENT_WIDTH) / 2;
  const y = (PREVIEW_HEIGHT - ELEMENT_HEIGHT) / 2;

  const handleContributorChange = (c: string) => {
    if (kind === 'argument') {
      setArgContributor(c as ContributorType);
    } else {
      setSupContributor(c as SupportContributor);
    }
  };

  const labelText = kind === 'argument'
    ? config.argumentTypes[typeKey as keyof StyleConfig['argumentTypes']].label
    : config.supportTypes[typeKey as keyof StyleConfig['supportTypes']].label;

  return (
    <div className="mt-6 space-y-2">
      <div className="text-xs uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>Preview</div>

      {/* Contributor toggle */}
      <div className="flex flex-wrap gap-1">
        {contributors.map((c) => (
          <button
            key={c}
            onClick={() => handleContributorChange(c)}
            className="px-2 py-1 text-xs rounded"
            style={{
              backgroundColor: contributor === c ? theme.button.primary.bg : theme.sidebar.surface,
              color: contributor === c ? theme.button.primary.text : theme.sidebar.text,
              border: contributor === c ? 'none' : `1px solid ${theme.sidebar.border}`,
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Konva stage */}
      <div style={{ border: `1px solid ${theme.sidebar.border}`, borderRadius: 6, backgroundColor: theme.canvas.bg, display: 'inline-block' }}>
        <Stage width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT}>
          <Layer>
            <Group x={x} y={y}>
              {(resolved.borderShape === 'cloud' || resolved.borderShape === 'ellipse') ? (
                <Ellipse
                  x={ELEMENT_WIDTH / 2}
                  y={ELEMENT_HEIGHT / 2}
                  radiusX={ELEMENT_WIDTH / 2}
                  radiusY={ELEMENT_HEIGHT / 2}
                  fill={resolved.backgroundColor}
                  stroke={resolved.borderColor}
                  strokeWidth={resolved.borderWidth}
                  dash={dashArray}
                />
              ) : (
                <Rect
                  width={ELEMENT_WIDTH}
                  height={ELEMENT_HEIGHT}
                  fill={resolved.backgroundColor}
                  stroke={resolved.borderColor}
                  strokeWidth={resolved.borderWidth}
                  dash={dashArray}
                  cornerRadius={resolved.borderShape === 'rounded' ? 8 : 0}
                />
              )}
              <Text
                x={10}
                y={10}
                width={ELEMENT_WIDTH - 20}
                text={labelText}
                fontSize={14}
                fontStyle="bold"
                textDecoration="underline"
                fill={resolved.borderColor}
              />
              <Text
                x={10}
                y={32}
                width={ELEMENT_WIDTH - 20}
                text="Sample content"
                fontSize={12}
                fill="#000000"
                wrap="word"
              />
            </Group>
          </Layer>
        </Stage>
      </div>
      {resolved.borderShape === 'cloud' && (
        <div className="text-xs italic" style={{ color: theme.sidebar.muted }}>
          (Cloud shape — implicit contributor renders as a cloud on the canvas; preview shows ellipse stand-in.)
        </div>
      )}
    </div>
  );
}
