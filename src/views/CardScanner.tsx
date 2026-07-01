import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, ChevronLeft, Camera, Loader2, ChevronDown } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { searchCardFuzzy, fetchCardPrints } from '../services/scryfall';
import type { ScryfallCard } from '../services/scryfall';
import type { CollectionCard } from '../types/collection';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanResult {
  scanId: string;
  card: ScryfallCard;
  printing: ScryfallCard;   // the specific printing the user chose
  quantity: number;
  foil: boolean;
}

interface CardScannerProps {
  defaultGroupId: string;
  wantedIds: Set<string>;
  onAddCards: (cards: Omit<CollectionCard, 'id' | 'addedAt'>[]) => void;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TUTORIAL_KEY = 'arbiter_scanner_tutorial_done_v2';

const PROXY_URL = import.meta.env.DEV
  ? 'http://localhost:8888/.netlify/functions/vision-proxy'
  : Capacitor.isNativePlatform()
    ? 'https://mtg-judge.netlify.app/.netlify/functions/vision-proxy'
    : '/.netlify/functions/vision-proxy';

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

/** Extract the most likely card name from raw Vision OCR text. */
function parseCardName(ocrText: string): string {
  const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);

  // Skip lines that look like mana costs, set codes, or oracle keywords
  const skipPatterns = [
    /^\{[WUBRGCXYZ0-9/]+\}/, // mana cost
    /^[0-9]+\/[0-9]+$/,       // P/T
    /^(Legendary|Creature|Artifact|Enchantment|Instant|Sorcery|Land|Planeswalker|Battle)/i,
    /^\d+$/,                   // just a number
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
          maxHeight: '72vh',
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 10px' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>{card.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginTop: '2px' }}>
              {printings.length} printing{printings.length !== 1 ? 's' : ''} — choose yours
            </div>
          </div>
          <button onClick={onDismiss} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px', padding: '7px', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Foil toggle */}
        <div style={{ padding: '0 18px 12px' }}>
          <button
            onClick={() => setFoil(f => !f)}
            style={{
              padding: '7px 14px', borderRadius: '20px',
              border: `1px solid ${foil ? 'rgba(234,179,8,0.6)' : 'rgba(255,255,255,0.18)'}`,
              background: foil ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.05)',
              color: foil ? '#fbbf24' : 'rgba(255,255,255,0.7)',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            }}
          >
            ✨ Foil {foil ? 'ON' : 'OFF'}
          </button>
        </div>

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
                  width: '100%', padding: '10px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                {/* Thumbnail */}
                <div style={{ width: '42px', height: '58px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.05)' }}>
                  {img && <img src={img} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>
                      {p.set_name}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: rarityColor(p.rarity), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {p.rarity?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', marginTop: '2px' }}>
                    {(p.set ?? '').toUpperCase()} · #{p.collector_number}
                    {p.released_at ? ` · ${new Date(p.released_at).getFullYear()}` : ''}
                  </div>
                </div>

                {/* Price */}
                {price != null && (
                  <div style={{ color: '#86efac', fontSize: '0.82rem', fontWeight: 700, flexShrink: 0 }}>
                    ${price.toFixed(2)}
                  </div>
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
  | 'viewfinder'   // live camera, waiting for user to tap capture
  | 'processing'   // sent to Vision, awaiting result
  | 'pick-printing'// card found, showing printing picker
  | 'error';       // something went wrong

export const CardScanner: React.FC<CardScannerProps> = ({ defaultGroupId, wantedIds: _wantedIds, onAddCards, onClose }) => {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  const [phase,      setPhase]      = useState<ScanPhase>('viewfinder');
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [cameraErr,  setCameraErr]  = useState<string | null>(null);
  const [globalFoil, setGlobalFoil] = useState(false);
  const [adding,     setAdding]     = useState(false);
  const [results,    setResults]    = useState<ScanResult[]>([]);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem(TUTORIAL_KEY));

  // Printing picker state
  const [pickerCard,      setPickerCard]      = useState<ScryfallCard | null>(null);
  const [pickerPrintings, setPickerPrintings] = useState<ScryfallCard[]>([]);

  const totalCount = results.reduce((s, r) => s + r.quantity, 0);

  // ── Start camera ────────────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(stream => {
      if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const vid = videoRef.current;
      if (vid) { vid.srcObject = stream; }
    }).catch(e => {
      if (alive) setCameraErr(e.message || 'Camera access denied');
    });
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Capture frame → Vision → Scryfall ───────────────────────────────────────

  const handleCapture = useCallback(async () => {
    if (phase !== 'viewfinder') return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Draw current video frame to canvas at full resolution
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Encode as JPEG — strip the "data:image/jpeg;base64," prefix
    const dataUrl     = canvas.toDataURL('image/jpeg', 0.85);
    const imageBase64 = dataUrl.split(',')[1];

    setPhase('processing');
    setErrorMsg(null);

    try {
      // 1. Send to Vision proxy
      const visionRes = await fetch(PROXY_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageBase64 }),
      });

      if (!visionRes.ok) {
        throw new Error(`Vision proxy error ${visionRes.status}`);
      }

      const { text, error: visionErr } = await visionRes.json();
      if (visionErr || !text) {
        throw new Error(visionErr ?? 'No text detected in image');
      }

      // 2. Parse card name from OCR output
      const cardName = parseCardName(text);
      if (!cardName) {
        throw new Error('Could not find a card name in the image — try better lighting or a flatter angle');
      }

      // 3. Scryfall fuzzy lookup
      const card = await searchCardFuzzy(cardName);
      if (!card) {
        throw new Error(`"${cardName}" not found on Scryfall — make sure the card name is fully visible`);
      }

      // 4. Fetch all printings
      const prints = card.prints_search_uri
        ? await fetchCardPrints(card.prints_search_uri)
        : [card];

      if (prints.length <= 1) {
        // Only one printing — skip the picker and add directly
        addScanResult(card, prints[0] ?? card, globalFoil);
        setPhase('viewfinder');
      } else {
        setPickerCard(card);
        setPickerPrintings(prints);
        setPhase('pick-printing');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Scan failed — please try again');
      setPhase('error');
      setTimeout(() => setPhase('viewfinder'), 3500);
    }
  }, [phase, globalFoil]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add a confirmed scan result to the tray ──────────────────────────────────

  const addScanResult = useCallback((card: ScryfallCard, printing: ScryfallCard, foil: boolean) => {
    setResults(prev => {
      const existing = prev.find(r => r.printing.id === printing.id && r.foil === foil);
      if (existing) {
        return prev.map(r => r.scanId === existing.scanId ? { ...r, quantity: r.quantity + 1 } : r);
      }
      return [{
        scanId:   crypto.randomUUID(),
        card,
        printing,
        quantity: 1,
        foil,
      }, ...prev];
    });
  }, []);

  const handlePickerSelect = useCallback((printing: ScryfallCard, foil: boolean) => {
    if (!pickerCard) return;
    addScanResult(pickerCard, printing, foil);
    setPickerCard(null);
    setPickerPrintings([]);
    setPhase('viewfinder');
  }, [pickerCard, addScanResult]);

  // ── Add all to collection ────────────────────────────────────────────────────

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

  // ── Layout ───────────────────────────────────────────────────────────────────

  const NAV_CLEARANCE = 'max(env(safe-area-inset-bottom, 0px) + 80px, 96px)';

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1000, display: 'flex', flexDirection: 'column', userSelect: 'none' }}>

      {/* Live camera feed */}
      <video
        ref={videoRef}
        autoPlay playsInline muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Darkened overlay around viewfinder guide */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.7) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Viewfinder guide */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -56%)',
        width: '72%', aspectRatio: '63 / 88',
        border: phase === 'processing'
          ? '2px solid rgba(139,92,246,0.8)'
          : '2px solid rgba(255,255,255,0.5)',
        borderRadius: '8px',
        boxShadow: phase === 'processing'
          ? '0 0 22px rgba(139,92,246,0.5), inset 0 0 22px rgba(139,92,246,0.08)'
          : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        pointerEvents: 'none',
      }}>
        {/* Corner accents */}
        {[
          { top: -2, left: -2, borderTop: '3px solid #fff', borderLeft: '3px solid #fff' },
          { top: -2, right: -2, borderTop: '3px solid #fff', borderRight: '3px solid #fff' },
          { bottom: -2, left: -2, borderBottom: '3px solid #fff', borderLeft: '3px solid #fff' },
          { bottom: -2, right: -2, borderBottom: '3px solid #fff', borderRight: '3px solid #fff' },
        ].map((s, i) => (
          <div key={i} style={{ position: 'absolute', width: '20px', height: '20px', borderRadius: '2px', ...s }} />
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
            <div style={{ color: '#86efac', fontSize: '0.75rem', marginTop: '1px' }}>
              {totalCount} card{totalCount !== 1 ? 's' : ''} scanned
            </div>
          )}
        </div>

        {/* Foil toggle */}
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

      {/* Status label above viewfinder */}
      <div style={{
        position: 'absolute',
        top: 'calc(50% - 36vw * 88 / 63 - 38px)',
        left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        zIndex: 2, pointerEvents: 'none',
      }}>
        <span style={{
          color: phase === 'error' ? '#f87171' : 'rgba(255,255,255,0.9)',
          fontSize: '0.8rem', fontWeight: 600,
          textShadow: '0 1px 6px rgba(0,0,0,0.9)',
          background: 'rgba(0,0,0,0.45)', padding: '5px 14px', borderRadius: '20px',
          maxWidth: '86%', textAlign: 'center',
        }}>
          {phase === 'processing' && 'Identifying card…'}
          {phase === 'viewfinder' && 'Frame the card, then tap the button'}
          {phase === 'error' && (errorMsg ?? 'Try again')}
          {phase === 'pick-printing' && 'Choose your printing below'}
        </span>
      </div>

      {/* Processing spinner overlay */}
      {phase === 'processing' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.35)',
          pointerEvents: 'none',
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

      {/* Scanned cards tray */}
      {results.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: NAV_CLEARANCE,
          left: 0, right: 0, zIndex: 2,
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
                  <button
                    onClick={() => setResults(prev => prev.map(x => x.scanId === r.scanId ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}
                    style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}
                  >−</button>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.78rem', minWidth: '14px', textAlign: 'center' }}>{r.quantity}</span>
                  <button
                    onClick={() => setResults(prev => prev.map(x => x.scanId === r.scanId ? { ...x, quantity: x.quantity + 1 } : x))}
                    style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}
                  >+</button>
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
        {/* Add to collection button */}
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

        {/* Shutter button */}
        <button
          onClick={handleCapture}
          disabled={phase === 'processing' || phase === 'pick-printing'}
          style={{
            width: '68px', height: '68px', borderRadius: '50%',
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
            ? <Loader2 size={26} color="rgba(139,92,246,0.9)" style={{ animation: 'spin 1s linear infinite' }} />
            : <Camera size={26} color="#1a1a2e" />
          }
        </button>

        {/* Expand/collapse placeholder for symmetry when no "add" button */}
        {results.length === 0 && <div style={{ width: '80px' }} />}
      </div>

      {/* Printing picker sheet */}
      {phase === 'pick-printing' && pickerCard && (
        <PrintingPicker
          card={pickerCard}
          printings={pickerPrintings}
          foil={globalFoil}
          onSelect={handlePickerSelect}
          onDismiss={() => setPhase('viewfinder')}
        />
      )}

      {/* Camera permission error */}
      {cameraErr && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '24px', zIndex: 10 }}>
          <div style={{ color: '#f87171', fontWeight: 700, fontSize: '1rem' }}>Camera unavailable</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', textAlign: 'center' }}>{cameraErr}</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textAlign: 'center' }}>Go to Settings → Arbiter → Camera and allow access.</div>
          <button onClick={onClose} style={{ marginTop: '8px', padding: '10px 24px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', color: '#fff', cursor: 'pointer' }}>Close</button>
        </div>
      )}

      {/* First-time tutorial */}
      {showTutorial && (() => {
        const dismiss = () => { localStorage.setItem(TUTORIAL_KEY, '1'); setShowTutorial(false); };
        return (
          <div onClick={dismiss} style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.82)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#12121e', borderRadius: '24px 24px 0 0', padding: '20px 24px', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 28px)', width: '100%', position: 'relative' }}>
              <button
                onClick={dismiss}
                style={{ position: 'absolute', top: '16px', right: '16px', width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={14} />
              </button>

              <div style={{ textAlign: 'center', marginBottom: '22px', paddingRight: '32px' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: '5px' }}>How to Scan Cards</div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.82rem' }}>Powered by Google Vision — works on any card, any set</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                {[
                  { icon: '📷', title: 'Point camera at the card', sub: 'Keep it flat and well-lit — the whole name needs to be visible' },
                  { icon: '⚪', title: 'Tap the shutter button', sub: 'One tap captures and identifies the card in ~1 second' },
                  { icon: '🃏', title: 'Pick your printing', sub: 'If the card has multiple versions, choose the one you own' },
                  { icon: '✅', title: 'Tap "Add to Collection"', sub: 'Scans queue up — add as many as you want before confirming' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                      {item.icon}
                    </div>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.88rem' }}>{item.title}</div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '2px' }}>{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={dismiss}
                style={{ width: '100%', padding: '14px', borderRadius: '14px', background: '#7c3aed', border: 'none', color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Got it — start scanning
              </button>
            </div>
          </div>
        );
      })()}

      {/* Chevron hint to scroll tray */}
      {results.length > 3 && (
        <div style={{ position: 'absolute', bottom: `calc(${NAV_CLEARANCE} + 194px)`, right: '10px', zIndex: 4, pointerEvents: 'none' }}>
          <ChevronDown size={18} color="rgba(255,255,255,0.4)" />
        </div>
      )}
    </div>
  );
};
