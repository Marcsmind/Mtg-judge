import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, ChevronLeft, Loader2, ChevronDown } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { searchCardFuzzy, fetchCardPrints } from '../services/scryfall';
import type { ScryfallCard } from '../services/scryfall';
import type { CollectionCard } from '../types/collection';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { ScannerPaywall } from '../components/ScannerPaywall';
import type { SubscriptionTier } from '../types/subscription';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanResult {
  scanId: string;
  card: ScryfallCard;
  printing: ScryfallCard;
  quantity: number;
  foil: boolean;
}

interface CardScannerProps {
  defaultGroupId: string;
  isPro: boolean;
  onAddCards: (cards: Omit<CollectionCard, 'id' | 'addedAt'>[]) => void;
  onTierChange: (tier: SubscriptionTier) => void;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TUTORIAL_KEY = 'arbiter_scanner_tutorial_done_v3';

const PROXY_URL = import.meta.env.DEV
  ? 'http://localhost:8888/.netlify/functions/vision-proxy'
  : Capacitor.isNativePlatform()
    ? 'https://mtg-judge.netlify.app/.netlify/functions/vision-proxy'
    : '/.netlify/functions/vision-proxy';

// Motion detection constants
const MOTION_SIZE       = 80;   // px — tiny canvas for fast pixel diff
const STILL_THRESHOLD   = 14;   // avg diff per RGB channel (0–255)
const STILL_FRAMES      = 4;    // consecutive still frames needed (~800ms at 200ms interval)
const SCAN_COOLDOWN_MS  = 2200; // ms to wait before allowing next auto-scan after error

// Free tier scan limit
const FREE_SCAN_LIMIT = 5;

function getScansUsed(): number {
  return parseInt(localStorage.getItem(STORAGE_KEYS.FREE_SCANS_USED) ?? '0', 10);
}
function incrementScansUsed(): number {
  const next = getScansUsed() + 1;
  localStorage.setItem(STORAGE_KEYS.FREE_SCANS_USED, String(next));
  return next;
}

function cardImage(card: ScryfallCard, size: 'small' | 'normal' = 'small'): string {
  return (
    card.image_uris?.[size] ??
    card.card_faces?.[0]?.image_uris?.[size] ??
    ''
  );
}

function rarityColor(rarity?: string): string {
  switch (rarity) {
    case 'mythic':   return '#f97316';
    case 'rare':     return '#fbbf24';
    case 'uncommon': return '#9fd1c7';
    default:         return '#d1d5db';
  }
}

function parseCardName(ocrText: string): string {
  const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
  const skipPatterns = [
    /^\{[WUBRGCXYZ0-9/]+\}/,
    /^[0-9]+\/[0-9]+$/,
    /^(Legendary|Creature|Artifact|Enchantment|Instant|Sorcery|Land|Planeswalker|Battle)/i,
    /^\d+$/,
  ];
  for (const line of lines) {
    if (line.length < 2) continue;
    if (skipPatterns.some(p => p.test(line))) continue;
    return line;
  }
  return lines[0] ?? '';
}

// ── Printing Picker ───────────────────────────────────────────────────────────

interface PrintingPickerProps {
  card: ScryfallCard;
  printings: ScryfallCard[];
  foil: boolean;
  onSelect: (printing: ScryfallCard, foil: boolean) => void;
  onDismiss: () => void;
}

const PrintingPicker: React.FC<PrintingPickerProps> = ({ card, printings, foil: initialFoil, onSelect, onDismiss }) => {
  const [foil, setFoil] = useState(initialFoil);

  // Auto-select the most recent printing immediately
  const mostRecent = printings[0];

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'absolute', inset: 0, zIndex: 30,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#12121e',
          borderRadius: '20px 20px 0 0',
          maxHeight: '65vh',
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 8px' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>{card.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginTop: '2px' }}>
              {printings.length} printings — tap one or use the latest
            </div>
          </div>
          <button onClick={onDismiss} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px', padding: '7px', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Quick-add most recent */}
        {mostRecent && (
          <div style={{ padding: '0 18px 10px' }}>
            <button
              onClick={() => onSelect(mostRecent, foil)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '12px',
                background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.5)',
                color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span>✓ Use latest — {mostRecent.set_name}</span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400, fontSize: '0.75rem' }}>
                {mostRecent.released_at ? new Date(mostRecent.released_at).getFullYear() : ''}
                {(foil ? parseFloat(mostRecent.prices?.usd_foil ?? '0') : parseFloat(mostRecent.prices?.usd ?? '0')) > 0
                  ? ` · $${(foil ? parseFloat(mostRecent.prices?.usd_foil ?? '0') : parseFloat(mostRecent.prices?.usd ?? '0')).toFixed(2)}`
                  : ''}
              </span>
            </button>
          </div>
        )}

        {/* Foil toggle */}
        <div style={{ padding: '0 18px 10px' }}>
          <button
            onClick={() => setFoil(f => !f)}
            style={{
              padding: '6px 14px', borderRadius: '20px',
              border: `1px solid ${foil ? 'rgba(234,179,8,0.6)' : 'rgba(255,255,255,0.18)'}`,
              background: foil ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.05)',
              color: foil ? '#fbbf24' : 'rgba(255,255,255,0.7)',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            }}
          >
            ✨ Foil {foil ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 18px 4px' }} />
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', padding: '4px 18px 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>All printings</div>

        {/* Printings list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 18px' }}>
          {printings.map(p => {
            const img = cardImage(p, 'small');
            const price = foil
              ? parseFloat(p.prices?.usd_foil ?? '0') || null
              : parseFloat(p.prices?.usd ?? '0') || null;

            return (
              <button
                key={p.id}
                onClick={() => onSelect(p, foil)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  width: '100%', padding: '9px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ width: '40px', height: '55px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.05)' }}>
                  {img && <img src={img} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>{p.set_name}</span>
                    <span style={{ fontSize: '0.68rem', color: rarityColor(p.rarity), fontWeight: 700, textTransform: 'uppercase' }}>{p.rarity?.charAt(0).toUpperCase()}</span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', marginTop: '2px' }}>
                    {(p.set ?? '').toUpperCase()} · #{p.collector_number}
                    {p.released_at ? ` · ${new Date(p.released_at).getFullYear()}` : ''}
                  </div>
                </div>
                {price != null && (
                  <div style={{ color: '#86efac', fontSize: '0.82rem', fontWeight: 700, flexShrink: 0 }}>${price.toFixed(2)}</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Main Scanner ───────────────────────────────────────────────────────────────

type ScanPhase =
  | 'viewfinder'
  | 'processing'
  | 'pick-printing'
  | 'error';

export const CardScanner: React.FC<CardScannerProps> = ({ defaultGroupId, isPro, onAddCards, onTierChange, onClose }) => {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const motionCanvas  = useRef<HTMLCanvasElement>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const prevFrameRef  = useRef<Uint8ClampedArray | null>(null);
  const stillCountRef = useRef(0);
  const cooldownRef   = useRef(false);
  const phaseRef      = useRef<ScanPhase>('viewfinder');

  const [phase,        setPhase]        = useState<ScanPhase>('viewfinder');
  const [lockProgress, setLockProgress] = useState(0);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [cameraErr,    setCameraErr]    = useState<string | null>(null);
  const [globalFoil,   setGlobalFoil]   = useState(false);
  const [adding,       setAdding]       = useState(false);
  const [results,      setResults]      = useState<ScanResult[]>([]);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem(TUTORIAL_KEY));
  const [showPaywall,  setShowPaywall]  = useState(false);
  const [scansUsed,    setScansUsed]    = useState(() => getScansUsed());
  const scansLeft = isPro ? Infinity : Math.max(0, FREE_SCAN_LIMIT - scansUsed);

  const [pickerCard,      setPickerCard]      = useState<ScryfallCard | null>(null);
  const [pickerPrintings, setPickerPrintings] = useState<ScryfallCard[]>([]);

  // Keep phaseRef in sync so the motion interval can read it without stale closure
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const totalCount = results.reduce((s, r) => s + r.quantity, 0);

  // ── Camera ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(stream => {
      if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch(e => {
      if (alive) setCameraErr(e.message || 'Camera access denied');
    });
    return () => { alive = false; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  // ── Add scan result ──────────────────────────────────────────────────────────

  const addScanResult = useCallback((card: ScryfallCard, printing: ScryfallCard, foil: boolean) => {
    setResults(prev => {
      const existing = prev.find(r => r.printing.id === printing.id && r.foil === foil);
      if (existing) {
        return prev.map(r => r.scanId === existing.scanId ? { ...r, quantity: r.quantity + 1 } : r);
      }
      return [{ scanId: crypto.randomUUID(), card, printing, quantity: 1, foil }, ...prev];
    });

    if (!isPro) {
      const used = incrementScansUsed();
      setScansUsed(used);
      if (used >= FREE_SCAN_LIMIT) {
        // Let the card appear in the tray for a beat, then show paywall
        setTimeout(() => setShowPaywall(true), 900);
      }
    }
  }, [isPro]);

  // ── Capture & identify ───────────────────────────────────────────────────────

  const handleCapture = useCallback(async () => {
    if (phaseRef.current !== 'viewfinder') return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl     = canvas.toDataURL('image/jpeg', 0.85);
    const imageBase64 = dataUrl.split(',')[1];

    setPhase('processing');
    setLockProgress(0);
    setErrorMsg(null);
    prevFrameRef.current = null; // reset motion baseline after capture
    stillCountRef.current = 0;

    try {
      const visionRes = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });
      if (!visionRes.ok) throw new Error(`Vision proxy error ${visionRes.status}`);

      const { text, error: visionErr } = await visionRes.json();
      if (visionErr || !text) throw new Error(visionErr ?? 'No text detected — try better lighting');

      const cardName = parseCardName(text);
      if (!cardName) throw new Error('Could not read the card name — keep the card flat and well-lit');

      const card = await searchCardFuzzy(cardName);
      if (!card) throw new Error(`"${cardName}" not found — make sure the full name is visible`);

      const prints = card.prints_search_uri
        ? await fetchCardPrints(card.prints_search_uri)
        : [card];

      if (prints.length <= 1) {
        addScanResult(card, prints[0] ?? card, globalFoil);
        setPhase('viewfinder');
      } else {
        setPickerCard(card);
        setPickerPrintings(prints);
        setPhase('pick-printing');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Scan failed — try again');
      setPhase('error');
      cooldownRef.current = true;
      setTimeout(() => {
        cooldownRef.current = false;
        setPhase('viewfinder');
      }, SCAN_COOLDOWN_MS);
    }
  }, [globalFoil, addScanResult]);

  // ── Motion detection → auto-capture ─────────────────────────────────────────

  const handleCaptureRef = useRef(handleCapture);
  useEffect(() => { handleCaptureRef.current = handleCapture; }, [handleCapture]);

  useEffect(() => {
    if (phase !== 'viewfinder') {
      // Reset motion state when not in viewfinder
      prevFrameRef.current = null;
      stillCountRef.current = 0;
      setLockProgress(0);
      return;
    }

    const mc = motionCanvas.current;
    if (!mc) return;
    const ctx = mc.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    mc.width  = MOTION_SIZE;
    mc.height = MOTION_SIZE;

    const intervalId = setInterval(() => {
      if (phaseRef.current !== 'viewfinder' || cooldownRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      ctx.drawImage(video, 0, 0, MOTION_SIZE, MOTION_SIZE);
      const curr = ctx.getImageData(0, 0, MOTION_SIZE, MOTION_SIZE).data;

      if (prevFrameRef.current) {
        let diff = 0;
        for (let i = 0; i < curr.length; i += 4) {
          diff += Math.abs(curr[i]   - prevFrameRef.current[i]);
          diff += Math.abs(curr[i+1] - prevFrameRef.current[i+1]);
          diff += Math.abs(curr[i+2] - prevFrameRef.current[i+2]);
        }
        const avg = diff / (MOTION_SIZE * MOTION_SIZE * 3);

        if (avg < STILL_THRESHOLD) {
          stillCountRef.current = Math.min(stillCountRef.current + 1, STILL_FRAMES);
        } else {
          stillCountRef.current = Math.max(stillCountRef.current - 1, 0);
        }

        const progress = stillCountRef.current / STILL_FRAMES;
        setLockProgress(progress);

        if (stillCountRef.current >= STILL_FRAMES) {
          stillCountRef.current = 0;
          prevFrameRef.current = null;
          handleCaptureRef.current();
          return;
        }
      }

      prevFrameRef.current = new Uint8ClampedArray(curr);
    }, 200);

    return () => clearInterval(intervalId);
  }, [phase]);

  // ── Picker select ────────────────────────────────────────────────────────────

  const handlePickerSelect = useCallback((printing: ScryfallCard, foil: boolean) => {
    if (!pickerCard) return;
    addScanResult(pickerCard, printing, foil);
    setPickerCard(null);
    setPickerPrintings([]);
    setPhase('viewfinder');
  }, [pickerCard, addScanResult]);

  // ── Add to collection ────────────────────────────────────────────────────────

  const handleAdd = useCallback(async () => {
    if (!results.length || adding) return;
    setAdding(true);
    const cards: Omit<CollectionCard, 'id' | 'addedAt'>[] = results.map(r => ({
      groupId:    defaultGroupId,
      scryfallId: r.printing.id,
      name:       r.printing.name,
      quantity:   r.quantity,
      foil:       r.foil,
      colors:     r.printing.colors ?? r.printing.color_identity ?? [],
      typeLine:   r.printing.type_line ?? '',
      cmc:        r.printing.cmc ?? 0,
      imageUri:   cardImage(r.printing, 'small'),
      priceUsd:   r.foil
        ? parseFloat(r.printing.prices?.usd_foil ?? '0') || null
        : parseFloat(r.printing.prices?.usd ?? '0') || null,
      rarity:     (r.printing as unknown as { rarity?: string }).rarity ?? 'common',
      setCode:    r.printing.set ?? '',
    }));
    onAddCards(cards);
    onClose();
  }, [results, adding, defaultGroupId, onAddCards, onClose]);

  // ── Viewfinder border color based on lock progress ───────────────────────────

  const NAV_CLEARANCE = 'max(env(safe-area-inset-bottom, 0px) + 80px, 96px)';

  const borderColor = phase === 'processing'
    ? 'rgba(139,92,246,0.9)'
    : phase === 'error'
      ? 'rgba(248,113,113,0.9)'
      : lockProgress > 0
        ? `rgba(${Math.round(255 - lockProgress * 116)}, ${Math.round(255 - lockProgress * 61)}, ${Math.round(255 - lockProgress * 10)}, ${0.5 + lockProgress * 0.5})`
        : 'rgba(255,255,255,0.5)';

  const borderGlow = phase === 'processing'
    ? '0 0 24px rgba(139,92,246,0.6), inset 0 0 24px rgba(139,92,246,0.1)'
    : lockProgress > 0.5
      ? `0 0 ${Math.round(lockProgress * 28)}px rgba(139,92,246,${lockProgress * 0.7})`
      : 'none';

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1000, display: 'flex', flexDirection: 'column', userSelect: 'none' }}>

      <video
        ref={videoRef}
        autoPlay playsInline muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <canvas ref={motionCanvas} style={{ display: 'none' }} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.7) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Viewfinder */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -56%)',
        width: '72%', aspectRatio: '63 / 88',
        border: `2px solid ${borderColor}`,
        borderRadius: '8px',
        boxShadow: borderGlow,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        pointerEvents: 'none',
      }}>
        {[
          { top: -2, left: -2, borderTop: `3px solid ${borderColor}`, borderLeft: `3px solid ${borderColor}` },
          { top: -2, right: -2, borderTop: `3px solid ${borderColor}`, borderRight: `3px solid ${borderColor}` },
          { bottom: -2, left: -2, borderBottom: `3px solid ${borderColor}`, borderLeft: `3px solid ${borderColor}` },
          { bottom: -2, right: -2, borderBottom: `3px solid ${borderColor}`, borderRight: `3px solid ${borderColor}` },
        ].map((s, i) => (
          <div key={i} style={{ position: 'absolute', width: '20px', height: '20px', borderRadius: '2px', transition: 'border-color 0.15s', ...s }} />
        ))}
      </div>

      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px 16px',
        paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
      }}>
        <button
          onClick={onClose}
          style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
        >
          <ChevronLeft size={20} />
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>Card Scanner</div>
          {totalCount > 0 && (
            <div style={{ color: '#86efac', fontSize: '0.75rem', marginTop: '1px' }}>{totalCount} card{totalCount !== 1 ? 's' : ''} scanned</div>
          )}
          {!isPro && scansLeft < FREE_SCAN_LIMIT && (
            <div style={{
              fontSize: '0.7rem', marginTop: '2px', fontWeight: 600,
              color: scansLeft <= 1 ? '#f87171' : scansLeft <= 2 ? '#fbbf24' : 'rgba(255,255,255,0.55)',
            }}>
              {scansLeft === 0 ? 'No free scans left' : `${scansLeft} free scan${scansLeft !== 1 ? 's' : ''} left`}
            </div>
          )}
        </div>

        <button
          onClick={() => setGlobalFoil(f => !f)}
          style={{
            padding: '7px 12px', borderRadius: '20px',
            border: `1px solid ${globalFoil ? 'rgba(234,179,8,0.7)' : 'rgba(255,255,255,0.3)'}`,
            background: globalFoil ? 'rgba(234,179,8,0.2)' : 'rgba(0,0,0,0.5)',
            color: globalFoil ? '#fbbf24' : '#fff',
            fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(8px)',
          }}
        >
          ✨ Foil
        </button>
      </div>

      {/* Status label */}
      <div style={{
        position: 'absolute',
        top: 'calc(50% - 36vw * 88 / 63 - 38px)',
        left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        zIndex: 2, pointerEvents: 'none',
      }}>
        <span style={{
          color: phase === 'error' ? '#f87171' : lockProgress > 0.6 ? '#a78bfa' : 'rgba(255,255,255,0.9)',
          fontSize: '0.8rem', fontWeight: 600,
          textShadow: '0 1px 6px rgba(0,0,0,0.9)',
          background: 'rgba(0,0,0,0.45)', padding: '5px 14px', borderRadius: '20px',
          maxWidth: '86%', textAlign: 'center',
          transition: 'color 0.2s',
        }}>
          {phase === 'processing'   && 'Identifying card…'}
          {phase === 'error'        && (errorMsg ?? 'Try again')}
          {phase === 'pick-printing'&& 'Choose your printing below'}
          {phase === 'viewfinder'   && (
            lockProgress > 0.6
              ? 'Hold still…'
              : 'Point at a card'
          )}
        </span>
      </div>

      {/* Processing overlay */}
      {phase === 'processing' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.35)', pointerEvents: 'none',
        }}>
          <div style={{
            background: 'rgba(10,8,20,0.9)', borderRadius: '16px', padding: '22px 28px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
            border: '1px solid rgba(139,92,246,0.3)',
          }}>
            <Loader2 size={28} color="var(--accent-purple, #8b5cf6)" style={{ animation: 'spin 1s linear infinite' }} />
            <div style={{ color: '#fff', fontSize: '0.88rem', fontWeight: 600 }}>Reading card…</div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Scanned tray */}
      {results.length > 0 && (
        <div style={{
          position: 'absolute', bottom: NAV_CLEARANCE, left: 0, right: 0, zIndex: 2,
          height: '190px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.92) 70%, transparent)',
        }}>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', height: '100%', alignItems: 'flex-end', padding: '0 16px 16px', scrollbarWidth: 'none' }}>
            {results.map(r => (
              <div key={r.scanId} style={{ position: 'relative', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                <button
                  onClick={() => setResults(prev => prev.filter(x => x.scanId !== r.scanId))}
                  style={{ position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
                >
                  <X size={10} color="#fff" />
                </button>
                <img
                  src={cardImage(r.printing, 'small')}
                  alt={r.printing.name}
                  style={{ width: '68px', height: '95px', borderRadius: '5px', objectFit: 'cover', border: r.foil ? '2px solid rgba(234,179,8,0.7)' : '1px solid rgba(255,255,255,0.15)' }}
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <button onClick={() => setResults(prev => prev.map(x => x.scanId === r.scanId ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}
                    style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>−</button>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.78rem', minWidth: '14px', textAlign: 'center' }}>{r.quantity}</span>
                  <button onClick={() => setResults(prev => prev.map(x => x.scanId === r.scanId ? { ...x, quantity: x.quantity + 1 } : x))}
                    style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div style={{
        position: 'absolute',
        bottom: `calc(${results.length > 0 ? '190px + ' : ''}${NAV_CLEARANCE})`,
        left: 0, right: 0, zIndex: 3,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '28px',
        transition: 'bottom 0.2s',
      }}>
        {results.length > 0 && (
          <button
            onClick={handleAdd}
            disabled={adding}
            style={{
              padding: '11px 20px', borderRadius: '24px', border: 'none',
              background: adding ? 'rgba(139,92,246,0.4)' : 'rgba(139,92,246,0.9)',
              color: '#fff', fontSize: '0.88rem', fontWeight: 700,
              cursor: adding ? 'default' : 'pointer', backdropFilter: 'blur(8px)',
            }}
          >
            {adding ? 'Adding…' : `Add ${totalCount} to Collection`}
          </button>
        )}

        {/* Lock-progress ring around shutter */}
        <div style={{ position: 'relative', width: '68px', height: '68px' }}>
          {lockProgress > 0 && (
            <svg
              width="68" height="68"
              style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', pointerEvents: 'none' }}
            >
              <circle cx="34" cy="34" r="31" fill="none" stroke="rgba(139,92,246,0.25)" strokeWidth="3" />
              <circle
                cx="34" cy="34" r="31" fill="none"
                stroke="rgba(139,92,246,0.9)" strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * 31}`}
                strokeDashoffset={`${2 * Math.PI * 31 * (1 - lockProgress)}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.18s ease' }}
              />
            </svg>
          )}
          <button
            onClick={handleCapture}
            disabled={phase === 'processing' || phase === 'pick-printing'}
            style={{
              position: 'absolute', inset: '4px',
              borderRadius: '50%',
              background: phase === 'processing' ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.95)',
              border: '3px solid rgba(255,255,255,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: phase === 'processing' ? 'default' : 'pointer',
              boxShadow: '0 0 20px rgba(0,0,0,0.5)',
              transition: 'transform 0.1s, background 0.15s',
            }}
            onPointerDown={e => { if (phase === 'viewfinder') (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.92)'; }}
            onPointerUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
          >
            {phase === 'processing'
              ? <Loader2 size={22} color="rgba(139,92,246,0.9)" style={{ animation: 'spin 1s linear infinite' }} />
              : <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: lockProgress > 0.7 ? 'rgba(139,92,246,0.8)' : '#1a1a2e', transition: 'background 0.2s' }} />
            }
          </button>
        </div>

        {results.length === 0 && <div style={{ width: '80px' }} />}
      </div>

      {/* Printing picker */}
      {phase === 'pick-printing' && pickerCard && (
        <PrintingPicker
          card={pickerCard}
          printings={pickerPrintings}
          foil={globalFoil}
          onSelect={handlePickerSelect}
          onDismiss={() => setPhase('viewfinder')}
        />
      )}

      {/* Camera error */}
      {cameraErr && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '24px', zIndex: 10 }}>
          <div style={{ color: '#f87171', fontWeight: 700, fontSize: '1rem' }}>Camera unavailable</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', textAlign: 'center' }}>{cameraErr}</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textAlign: 'center' }}>Go to Settings → Arbiter → Camera and allow access.</div>
          <button onClick={onClose} style={{ marginTop: '8px', padding: '10px 24px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', color: '#fff', cursor: 'pointer' }}>Close</button>
        </div>
      )}

      {/* Tutorial */}
      {showTutorial && (() => {
        const dismiss = () => { localStorage.setItem(TUTORIAL_KEY, '1'); setShowTutorial(false); };
        return (
          <div onClick={dismiss} style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.82)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#12121e', borderRadius: '24px 24px 0 0', padding: '20px 24px', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 28px)', width: '100%', position: 'relative' }}>
              <button onClick={dismiss} style={{ position: 'absolute', top: '16px', right: '16px', width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} />
              </button>
              <div style={{ textAlign: 'center', marginBottom: '22px', paddingRight: '32px' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: '5px' }}>Automatic Card Scanner</div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.82rem' }}>Just hold the card steady — it scans itself</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                {[
                  { icon: '📷', title: 'Point camera at the card', sub: 'Fill the frame with the card — name must be visible' },
                  { icon: '⬜', title: 'Hold it still', sub: 'The border glows purple as it locks on — takes about 0.8s' },
                  { icon: '🃏', title: 'Confirm the printing', sub: 'Tap "Use latest" or pick a specific set if needed' },
                  { icon: '✅', title: 'Tap "Add to Collection"', sub: 'Scan as many cards as you want before confirming' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>{item.icon}</div>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.88rem' }}>{item.title}</div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '2px' }}>{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={dismiss} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: '#7c3aed', border: 'none', color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}>
                Got it — start scanning
              </button>
            </div>
          </div>
        );
      })()}

      {results.length > 3 && (
        <div style={{ position: 'absolute', bottom: `calc(${NAV_CLEARANCE} + 194px)`, right: '10px', zIndex: 4, pointerEvents: 'none' }}>
          <ChevronDown size={18} color="rgba(255,255,255,0.4)" />
        </div>
      )}

      {/* Free scan limit paywall — appears after 5th successful scan */}
      {showPaywall && (
        <ScannerPaywall
          variant="limit-reached"
          onClose={() => setShowPaywall(false)}
          onTierChange={onTierChange}
          onUnlocked={() => setShowPaywall(false)}
        />
      )}
    </div>
  );
};
