'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { motion, type Variants } from 'framer-motion';
import { CARD_TYPE_MAP } from '@/lib/presentations/cardTypes';
import type { PlayerNodeData } from './stages';
import { Typewriter } from './Typewriter';

const BORDER: Record<string, string> = { fina: '1px', media: '2px', grossa: '3px' };

type PlayerNode = Node<PlayerNodeData, 'playerCard'>;

function variants(effect: PlayerNodeData['efeito']): Variants {
  const common = { visible: { opacity: 1, x: 0, y: 0, scale: 1 } };
  switch (effect) {
    case 'slide-up':    return { ...common, hidden: { opacity: 0, y: 40 } };
    case 'slide-down':  return { ...common, hidden: { opacity: 0, y: -40 } };
    case 'slide-left':  return { ...common, hidden: { opacity: 0, x: 40 } };
    case 'slide-right': return { ...common, hidden: { opacity: 0, x: -40 } };
    case 'zoom':        return { ...common, hidden: { opacity: 0, scale: 1.4 } };
    case 'pop':         return { ...common, hidden: { opacity: 0, scale: 0.6 } };
    case 'draw':
    case 'typewriter':
    case 'fade':
    default:            return { ...common, hidden: { opacity: 0 } };
  }
}

function PlayerCardNodeComponent({ data }: NodeProps<PlayerNode>) {
  const { stage, original, efeito, duracao_ms, delay_ms, intensidade_dim } = data;
  const meta = CARD_TYPE_MAP[original.tipo];
  const Icon = meta.icon;
  const cor = original.cor_override ?? meta.cor;

  if (stage === 'hidden') return null;

  const isTypewriter = efeito === 'typewriter' && stage === 'entering';
  const animateTo = stage === 'dimmed' || stage === 'exiting' ? 'dimmed' : 'visible';
  const allVariants: Variants = {
    ...variants(efeito),
    dimmed: { opacity: 1 - intensidade_dim, scale: 1 },
  };

  return (
    <motion.div
      initial={stage === 'entering' ? 'hidden' : 'visible'}
      animate={animateTo}
      variants={allVariants}
      transition={{
        duration: duracao_ms / 1000,
        delay: delay_ms / 1000,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="rounded-lg bg-[color:var(--pr-bg-elevated)] min-w-[220px] max-w-[280px] shadow-[0_6px_30px_rgba(0,0,0,0.6)]"
      style={{ border: `${BORDER[original.borda]} solid ${cor}` }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--pr-border)]">
        <div className="flex items-center justify-center w-6 h-6 rounded-md" style={{ backgroundColor: `${cor}22`, color: cor }}>
          <Icon size={14} />
        </div>
        <div className="text-[10px] uppercase tracking-widest font-medium flex-1 truncate" style={{ color: cor }}>
          {meta.label}
        </div>
        {original.logo_url && (
          <img src={original.logo_url} alt="" className="w-5 h-5 object-contain rounded-sm" />
        )}
      </div>

      <div className="px-3 py-3">
        <div className="text-sm font-medium text-[color:var(--pr-text-primary)] leading-tight">
          <Typewriter
            text={original.titulo}
            durationMs={Math.max(300, duracao_ms * 0.6)}
            startDelay={delay_ms}
            enabled={isTypewriter}
          />
        </div>
        {original.descricao && (
          <div className="text-xs text-[color:var(--pr-text-secondary)] mt-1.5 leading-snug">
            <Typewriter
              text={original.descricao}
              durationMs={Math.max(500, duracao_ms * 1.2)}
              startDelay={delay_ms + Math.max(300, duracao_ms * 0.6)}
              enabled={isTypewriter}
            />
          </div>
        )}
        {original.bullets.length > 0 && (
          <ul className="mt-2 space-y-1">
            {original.bullets.map((b, i) => (
              <li key={i} className="text-xs text-[color:var(--pr-text-secondary)] flex gap-1.5">
                <span style={{ color: cor }}>›</span>
                <span className="leading-snug">{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(['Top', 'Right', 'Bottom', 'Left'] as const).map((side) => (
        <Handle key={side} id={side.toLowerCase()} type="source" position={Position[side]} className="!opacity-0 !pointer-events-none" />
      ))}
      {(['Top', 'Right', 'Bottom', 'Left'] as const).map((side) => (
        <Handle key={`t-${side}`} id={`t-${side.toLowerCase()}`} type="target" position={Position[side]} className="!opacity-0 !pointer-events-none" />
      ))}
    </motion.div>
  );
}

export const PlayerCardNode = memo(PlayerCardNodeComponent);
