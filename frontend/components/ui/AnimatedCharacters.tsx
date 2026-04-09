'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Pupil (sem branco ao redor) ────────────────────────────────── */

interface PupilProps {
  size?: number;
  maxDistance?: number;
  color?: string;
  forceLookX?: number;
  forceLookY?: number;
}

function Pupil({
  size = 12,
  maxDistance = 5,
  color = '#1A1A2E',
  forceLookX,
  forceLookY,
}: PupilProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const pos = useCallback(() => {
    if (forceLookX !== undefined && forceLookY !== undefined)
      return { x: forceLookX, y: forceLookY };
    if (!ref.current) return { x: 0, y: 0 };
    const r = ref.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = mouse.x - cx;
    const dy = mouse.y - cy;
    const dist = Math.min(Math.sqrt(dx ** 2 + dy ** 2), maxDistance);
    const angle = Math.atan2(dy, dx);
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
  }, [mouse, maxDistance, forceLookX, forceLookY]);

  const p = pos();

  return (
    <div
      ref={ref}
      className="rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        transform: `translate(${p.x}px, ${p.y}px)`,
        transition: 'transform 0.1s ease-out',
      }}
    />
  );
}

/* ─── EyeBall (branco + pupila) ──────────────────────────────────── */

interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
}

function EyeBall({
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = 'white',
  pupilColor = '#1A1A2E',
  isBlinking = false,
  forceLookX,
  forceLookY,
}: EyeBallProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const pos = useCallback(() => {
    if (forceLookX !== undefined && forceLookY !== undefined)
      return { x: forceLookX, y: forceLookY };
    if (!ref.current) return { x: 0, y: 0 };
    const r = ref.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = mouse.x - cx;
    const dy = mouse.y - cy;
    const dist = Math.min(Math.sqrt(dx ** 2 + dy ** 2), maxDistance);
    const angle = Math.atan2(dy, dx);
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
  }, [mouse, maxDistance, forceLookX, forceLookY]);

  const p = pos();

  return (
    <div
      ref={ref}
      className="rounded-full flex items-center justify-center transition-all duration-150"
      style={{
        width: size,
        height: isBlinking ? 2 : size,
        backgroundColor: eyeColor,
        overflow: 'hidden',
      }}
    >
      {!isBlinking && (
        <div
          className="rounded-full"
          style={{
            width: pupilSize,
            height: pupilSize,
            backgroundColor: pupilColor,
            transform: `translate(${p.x}px, ${p.y}px)`,
            transition: 'transform 0.1s ease-out',
          }}
        />
      )}
    </div>
  );
}

/* ─── Hook: blink aleatório ──────────────────────────────────────── */

function useRandomBlink() {
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        setBlinking(true);
        setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 150);
      }, Math.random() * 4000 + 3000);
    };
    schedule();
    return () => clearTimeout(timeout);
  }, []);

  return blinking;
}

/* ─── Composição: 4 personagens ──────────────────────────────────── */

interface AnimatedCharactersProps {
  isTyping?: boolean;
  isPasswordVisible?: boolean;
  hasPassword?: boolean;
  /** Incrementar para disparar animação de medo + headshake */
  errorTrigger?: number;
}

export default function AnimatedCharacters({
  isTyping = false,
  isPasswordVisible = false,
  hasPassword = false,
  errorTrigger = 0,
}: AnimatedCharactersProps) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [lookingAtEachOther, setLookingAtEachOther] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [scared, setScared] = useState(false);
  const [headShake, setHeadShake] = useState(false);

  const goldRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<HTMLDivElement>(null);
  const warmRef = useRef<HTMLDivElement>(null);

  const goldBlink = useRandomBlink();
  const darkBlink = useRandomBlink();

  const hiding = hasPassword && !isPasswordVisible;
  const showing = hasPassword && isPasswordVisible;

  useEffect(() => {
    const onMove = (e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Olham um pro outro quando começa a digitar
  useEffect(() => {
    if (isTyping) {
      setLookingAtEachOther(true);
      const t = setTimeout(() => setLookingAtEachOther(false), 800);
      return () => clearTimeout(t);
    }
    setLookingAtEachOther(false);
  }, [isTyping]);

  // Reação de medo + balança cabeça quando erro
  useEffect(() => {
    if (errorTrigger === 0) return;
    setScared(true);
    setHeadShake(true);
    const shakeEnd = setTimeout(() => setHeadShake(false), 1200);
    const scaredEnd = setTimeout(() => setScared(false), 2500);
    return () => { clearTimeout(shakeEnd); clearTimeout(scaredEnd); };
  }, [errorTrigger]);

  // Gold espia quando senha visível
  useEffect(() => {
    if (!showing) { setPeeking(false); return; }
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        setPeeking(true);
        setTimeout(() => {
          setPeeking(false);
          schedule();
        }, 800);
      }, Math.random() * 3000 + 2000);
    };
    schedule();
    return () => clearTimeout(t);
  }, [showing]);

  // Calcula posição de face + body skew
  const calc = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return { fX: 0, fY: 0, skew: 0 };
    const r = ref.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 3;
    const dx = mouse.x - cx;
    const dy = mouse.y - cy;
    return {
      fX: Math.max(-15, Math.min(15, dx / 20)),
      fY: Math.max(-10, Math.min(10, dy / 30)),
      skew: Math.max(-6, Math.min(6, -dx / 120)),
    };
  };

  const gold = calc(goldRef);
  const dark = calc(darkRef);
  const light = calc(lightRef);
  const warm = calc(warmRef);

  /* ── Cores Inova ── */
  const GOLD   = '#A6864A';
  const DARK   = '#1A1A2E';
  const LIGHT  = '#C4A67C';
  const WARM   = '#8B6F3D';
  const PUPIL  = '#1A1A2E';

  /* ── Helpers de estado assustado ── */
  // Olhos arregalados: pupilas menores, olham pra frente/baixo
  const scaredLookX = 0;
  const scaredLookY = 5;

  // Resolve forceLook considerando scared > showing > lookingAtEachOther > mouse
  const goldEyeX = scared ? scaredLookX : showing ? (peeking ? 4 : -4) : lookingAtEachOther ? 3 : undefined;
  const goldEyeY = scared ? scaredLookY : showing ? (peeking ? 5 : -4) : lookingAtEachOther ? 4 : undefined;
  const darkEyeX = scared ? scaredLookX : showing ? -4 : lookingAtEachOther ? 0 : undefined;
  const darkEyeY = scared ? scaredLookY : showing ? -4 : lookingAtEachOther ? -4 : undefined;
  const frontEyeX = scared ? scaredLookX : showing ? -5 : undefined;
  const frontEyeY = scared ? scaredLookY : showing ? -4 : undefined;

  return (
    <>
      {/* Keyframe do headshake injetado uma vez */}
      <style>{`
        @keyframes headShakeNo {
          0%   { transform: translateX(0); }
          10%  { transform: translateX(-8px) rotate(-2deg); }
          20%  { transform: translateX(8px) rotate(2deg); }
          30%  { transform: translateX(-8px) rotate(-2deg); }
          40%  { transform: translateX(8px) rotate(2deg); }
          50%  { transform: translateX(-6px) rotate(-1deg); }
          60%  { transform: translateX(6px) rotate(1deg); }
          70%  { transform: translateX(-4px); }
          80%  { transform: translateX(4px); }
          90%  { transform: translateX(-2px); }
          100% { transform: translateX(0); }
        }
      `}</style>

      <div
        className="relative"
        style={{
          width: 550,
          height: 400,
          animation: headShake ? 'headShakeNo 1.2s ease-in-out' : 'none',
        }}
      >

      {/* ── Personagem 1: Gold (alto, traseiro) ── */}
      <div
        ref={goldRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: 70,
          width: 180,
          height: scared ? 370 : (isTyping || hiding) ? 440 : 400,
          backgroundColor: GOLD,
          borderRadius: '10px 10px 0 0',
          zIndex: 1,
          transform: scared
            ? 'skewX(0deg)'
            : showing
              ? 'skewX(0deg)'
              : (isTyping || hiding)
                ? `skewX(${(gold.skew || 0) - 12}deg) translateX(40px)`
                : `skewX(${gold.skew || 0}deg)`,
          transformOrigin: 'bottom center',
        }}
      >
        <div
          className="absolute flex gap-8 transition-all duration-700 ease-in-out"
          style={{
            left: scared ? 40 : showing ? 20 : lookingAtEachOther ? 55 : 45 + gold.fX,
            top: scared ? 30 : showing ? 35 : lookingAtEachOther ? 65 : 40 + gold.fY,
          }}
        >
          <EyeBall size={scared ? 24 : 18} pupilSize={scared ? 5 : 7} maxDistance={5} pupilColor={PUPIL}
            isBlinking={scared ? false : goldBlink}
            forceLookX={goldEyeX}
            forceLookY={goldEyeY}
          />
          <EyeBall size={scared ? 24 : 18} pupilSize={scared ? 5 : 7} maxDistance={5} pupilColor={PUPIL}
            isBlinking={scared ? false : goldBlink}
            forceLookX={goldEyeX}
            forceLookY={goldEyeY}
          />
        </div>
      </div>

      {/* ── Personagem 2: Dark (médio, meio) ── */}
      <div
        ref={darkRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: 240,
          width: 120,
          height: scared ? 280 : 310,
          backgroundColor: DARK,
          borderRadius: '8px 8px 0 0',
          zIndex: 2,
          transform: scared
            ? 'skewX(0deg)'
            : showing
              ? 'skewX(0deg)'
              : lookingAtEachOther
                ? `skewX(${(dark.skew || 0) * 1.5 + 10}deg) translateX(20px)`
                : (isTyping || hiding)
                  ? `skewX(${(dark.skew || 0) * 1.5}deg)`
                  : `skewX(${dark.skew || 0}deg)`,
          transformOrigin: 'bottom center',
        }}
      >
        <div
          className="absolute flex gap-6 transition-all duration-700 ease-in-out"
          style={{
            left: scared ? 18 : showing ? 10 : lookingAtEachOther ? 32 : 26 + dark.fX,
            top: scared ? 22 : showing ? 28 : lookingAtEachOther ? 12 : 32 + dark.fY,
          }}
        >
          <EyeBall size={scared ? 22 : 16} pupilSize={scared ? 4 : 6} maxDistance={4} pupilColor={PUPIL}
            isBlinking={scared ? false : darkBlink}
            forceLookX={darkEyeX}
            forceLookY={darkEyeY}
          />
          <EyeBall size={scared ? 22 : 16} pupilSize={scared ? 4 : 6} maxDistance={4} pupilColor={PUPIL}
            isBlinking={scared ? false : darkBlink}
            forceLookX={darkEyeX}
            forceLookY={darkEyeY}
          />
        </div>
      </div>

      {/* ── Personagem 3: Light (semicírculo, frente esq) ── */}
      <div
        ref={lightRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: 0,
          width: 240,
          height: scared ? 180 : 200,
          backgroundColor: LIGHT,
          borderRadius: '120px 120px 0 0',
          zIndex: 3,
          transform: scared ? 'skewX(0deg)' : showing ? 'skewX(0deg)' : `skewX(${light.skew || 0}deg)`,
          transformOrigin: 'bottom center',
        }}
      >
        <div
          className="absolute flex gap-8 transition-all duration-200 ease-out"
          style={{
            left: scared ? 75 : showing ? 50 : 82 + light.fX,
            top: scared ? 75 : showing ? 85 : 90 + light.fY,
          }}
        >
          <Pupil size={scared ? 15 : 12} maxDistance={5} color={PUPIL} forceLookX={frontEyeX} forceLookY={frontEyeY} />
          <Pupil size={scared ? 15 : 12} maxDistance={5} color={PUPIL} forceLookX={frontEyeX} forceLookY={frontEyeY} />
        </div>
      </div>

      {/* ── Personagem 4: Warm (rounded, frente dir) ── */}
      <div
        ref={warmRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: 310,
          width: 140,
          height: scared ? 210 : 230,
          backgroundColor: WARM,
          borderRadius: '70px 70px 0 0',
          zIndex: 4,
          transform: scared ? 'skewX(0deg)' : showing ? 'skewX(0deg)' : `skewX(${warm.skew || 0}deg)`,
          transformOrigin: 'bottom center',
        }}
      >
        <div
          className="absolute flex gap-6 transition-all duration-200 ease-out"
          style={{
            left: scared ? 38 : showing ? 20 : 52 + warm.fX,
            top: scared ? 28 : showing ? 35 : 40 + warm.fY,
          }}
        >
          <Pupil size={scared ? 15 : 12} maxDistance={5} color={PUPIL} forceLookX={frontEyeX} forceLookY={frontEyeY} />
          <Pupil size={scared ? 15 : 12} maxDistance={5} color={PUPIL} forceLookX={frontEyeX} forceLookY={frontEyeY} />
        </div>
        {/* Boca — vira "O" de surpresa quando assustado */}
        {scared ? (
          <div
            className="absolute rounded-full border-2 transition-all duration-300"
            style={{
              borderColor: PUPIL,
              width: 18,
              height: 18,
              left: 58 + warm.fX,
              top: 82 + warm.fY,
            }}
          />
        ) : (
          <div
            className="absolute w-20 h-[4px] rounded-full transition-all duration-200 ease-out"
            style={{
              backgroundColor: PUPIL,
              left: showing ? 10 : 40 + warm.fX,
              top: showing ? 88 : 88 + warm.fY,
            }}
          />
        )}
      </div>
      </div>
    </>
  );
}
