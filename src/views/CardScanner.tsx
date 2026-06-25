import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Pause, Play, ChevronLeft } from 'lucide-react';
import { hashVideoFrame } from '../services/pHash';
import { loadCardDB, findCard, isDBLoaded } from '../services/cardHashDB';
import { fetchCardById } from '../services/scryfall';
import type { CardMeta } from '../services/cardHashDB';
import type { CollectionCard } from '../types/collection';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanResult {
  scanId: string;
  meta: CardMeta;
  imageUri: string;
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

function scryfallSmallUrl(id: string): string {
  return `https://cards.scryfall.io/small/front/${id[0]}/${id[1]}/${id}.jpg`;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

// Require this many consecutive frames showing the same card before committing
const REQUIRED_FRAMES = 3;

export const CardScanner: React.FC<CardScannerProps> = ({ defaultGroupId, wantedIds, onAddCards, onClose }) => {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [dbStatus,   setDbStatus]   = useState<'loading' | 'ready' | 'error'>(isDBLoaded() ? 'ready' : 'loading');
  const [dbProgress, setDbProgress] = useState(isDBLoaded() ? 100 : 0);
  const [paused,     setPaused]     = useState(false);
  const [cameraErr,  setCameraErr]  = useState<string | null>(null);
  const [frameState, setFrameState] = useState<'idle' | 'scanning' | 'detected' | 'same' | 'wanted'>('idle');
  const [wantedAlert, setWantedAlert] = useState<string | null>(null);

  const [videoDims,  setVideoDims]  = useState({ w: 0, h: 0 });
  const [results,    setResults]    = useState<ScanResult[]>([]);
  const [globalFoil, setGlobalFoil] = useState(false);
  const [adding,     setAdding]     = useState(false);

  // Tracks consecutive frames of the same card before committing
  const candidateRef = useRef<{ id: string; count: number } | null>(null);
  // Suppresses re-detecting the same card until user moves to a new one
  const lastIdRef  = useRef<string | null>(null);
  const idleTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable ref for wantedIds so the scan loop closure never goes stale
  const wantedIdsRef = useRef(wantedIds);
  useEffect(() => { wantedIdsRef.current = wantedIds; }, [wantedIds]);

  // ── Load hash database ────────────────────────────────────────────────────

  useEffect(() => {
    if (isDBLoaded()) return;
    loadCardDB(pct => setDbProgress(pct))
      .then(() => setDbStatus('ready'))
      .catch(() => setDbStatus('error'));
  }, []);

  // ── Start camera ─────────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then(stream => {
      if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const vid = videoRef.current;
      if (vid) {
        vid.srcObject = stream;
        vid.onloadedmetadata = () => setVideoDims({ w: vid.videoWidth, h: vid.videoHeight });
      }
    }).catch(e => {
      if (alive) setCameraErr(e.message || 'Camera access denied');
    });
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Scan loop ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (paused || dbStatus !== 'ready' || !videoDims.w) return;
    const video = videoRef.current;
    if (!video) return;

    const { w: vw, h: vh } = videoDims;

    // Constrain scan zone so it always fits in the video frame (handles portrait/landscape video)
    const zoneW = Math.min(vw * 0.80, vh * (63 / 88) * 0.95);
    const zoneH = zoneW * (88 / 63);
    const zoneX = (vw - zoneW) / 2;
    const zoneY = (vh - zoneH) / 2;

    const tick = () => {
      if (video.readyState < 2) return;

      // Hash the full scan zone — more robust than extracting the art sub-region
      const hash = hashVideoFrame(video, zoneX, zoneY, zoneW, zoneH);
      if (!hash) return;

      const card = findCard(hash);
      if (!card) {
        candidateRef.current = null;
        setFrameState('idle');
        return;
      }

      // Already committed and waiting for card to move
      if (card.id === lastIdRef.current) {
        setFrameState('same');
        return;
      }

      // Track consecutive detections of the same candidate
      if (candidateRef.current?.id === card.id) {
        candidateRef.current.count++;
      } else {
        candidateRef.current = { id: card.id, count: 1 };
      }

      // Not stable enough yet — show amber "scanning" state
      if (candidateRef.current.count < REQUIRED_FRAMES) {
        setFrameState('scanning');
        return;
      }

      // Stable match — commit it
      candidateRef.current = null;
      lastIdRef.current = card.id;

      if (wantedIdsRef.current.has(card.id)) {
        setFrameState('wanted');
        setWantedAlert(card.n);
        setTimeout(() => { setWantedAlert(null); setFrameState('detected'); }, 3000);
      } else {
        setFrameState('detected');
      }

      setResults(prev => {
        const existing = prev.find(r => r.meta.id === card.id && r.foil === globalFoil);
        if (existing) {
          return prev.map(r => r.scanId === existing.scanId ? { ...r, quantity: r.quantity + 1 } : r);
        }
        return [{ scanId: crypto.randomUUID(), meta: card, imageUri: scryfallSmallUrl(card.id), quantity: 1, foil: globalFoil }, ...prev];
      });

      // After 2s, allow re-detection of same card
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        setFrameState('idle');
        lastIdRef.current = null;
      }, 2000);
    };

    const interval = setInterval(tick, 900);
    return () => { clearInterval(interval); if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [paused, dbStatus, videoDims, globalFoil]);

  // ── Add to collection ─────────────────────────────────────────────────────

  const handleAdd = useCallback(async () => {
    if (!results.length || adding) return;
    setAdding(true);
    setPaused(true);

    const enriched = await Promise.all(
      results.map(async r => {
        const full = await fetchCardById(r.meta.id);
        const card: Omit<CollectionCard, 'id' | 'addedAt'> = {
          groupId:    defaultGroupId,
          scryfallId: r.meta.id,
          name:       r.meta.n,
          quantity:   r.quantity,
          foil:       r.foil,
          colors:     full?.colors ?? full?.color_identity ?? [],
          typeLine:   full?.type_line ?? '',
          cmc:        full?.cmc ?? 0,
          imageUri:   r.imageUri,
          priceUsd:   r.foil
            ? parseFloat(full?.prices?.usd_foil ?? '0') || null
            : parseFloat(full?.prices?.usd ?? '0') || null,
          rarity:     (full as unknown as { rarity?: string })?.rarity ?? 'common',
          setCode:    r.meta.s,
        };
        return card;
      })
    );

    onAddCards(enriched);
    onClose();
  }, [results, adding, defaultGroupId, onAddCards, onClose]);

  const totalCount = results.reduce((s, r) => s + r.quantity, 0);

  const borderColor =
    frameState === 'wanted'   ? '#fbbf24' :
    frameState === 'detected' ? '#22c55e' :
    frameState === 'scanning' ? '#f59e0b' :
    frameState === 'same'     ? 'rgba(255,255,255,0.4)' :
                                'rgba(255,255,255,0.55)';

  const borderGlow =
    frameState === 'wanted'   ? '0 0 28px rgba(251,191,36,0.7), inset 0 0 28px rgba(251,191,36,0.1)' :
    frameState === 'detected' ? '0 0 24px rgba(34,197,94,0.6), inset 0 0 24px rgba(34,197,94,0.08)' :
    frameState === 'scanning' ? '0 0 18px rgba(245,158,11,0.45)' :
                                'none';

  const statusText =
    dbStatus === 'loading'    ? `Loading database… ${dbProgress}%` :
    dbStatus === 'error'      ? 'Database unavailable — try restarting' :
    paused                    ? 'Paused' :
    frameState === 'wanted'   ? '⭐ On your Want List!' :
    frameState === 'detected' ? '✓ Card detected!' :
    frameState === 'scanning' ? '🔍 Identifying…' :
    frameState === 'same'     ? 'Move to next card' :
                                'Hold card inside the frame';

  // Bottom padding accounts for safe area + bottom nav bar (approx 80px)
  const NAV_CLEARANCE = 'max(env(safe-area-inset-bottom, 0px) + 80px, 96px)';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1000, display: 'flex', flexDirection: 'column', userSelect: 'none' }}>

      {/* Camera */}
      <video
        ref={videoRef}
        autoPlay playsInline muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Scan-zone overlay: 80% wide (matching hash zone), card portrait aspect, centered */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '80%', aspectRatio: '63 / 88',
        border: `2px solid ${borderColor}`,
        borderRadius: '8px',
        boxShadow: borderGlow,
        transition: 'border-color 0.12s, box-shadow 0.12s',
        pointerEvents: 'none',
        zIndex: 1,
      }} />

      {/* Want List alert banner */}
      {wantedAlert && (
        <div style={{
          position: 'absolute', top: '22%', left: '50%', transform: 'translateX(-50%)',
          zIndex: 5, display: 'flex', alignItems: 'center', gap: '10px',
          background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.6)',
          backdropFilter: 'blur(12px)', borderRadius: '16px', padding: '12px 20px',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: '1.3rem' }}>⭐</span>
          <div>
            <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.9rem' }}>On your Want List!</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', marginTop: '1px' }}>{wantedAlert}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'env(safe-area-inset-top, 0px) 16px 16px', paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)', background: 'linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)' }}>
        <button onClick={onClose} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
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
        <div style={{ width: '40px' }} />
      </div>

      {/* Status label (above scan zone) */}
      <div style={{
        position: 'absolute', top: 'calc(50% - 40vw * 88 / 63 - 28px)',
        left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 2, pointerEvents: 'none',
      }}>
        <span style={{
          color: frameState === 'detected' ? '#22c55e' : frameState === 'scanning' ? '#f59e0b' : 'rgba(255,255,255,0.8)',
          fontSize: '0.8rem', fontWeight: 600,
          textShadow: '0 1px 6px rgba(0,0,0,0.9)',
          background: 'rgba(0,0,0,0.35)', padding: '4px 12px', borderRadius: '20px',
        }}>
          {statusText}
        </span>
      </div>

      {/* Controls — sit above the tray and clear the bottom nav */}
      <div style={{
        position: 'absolute',
        bottom: results.length > 0
          ? `calc(188px + ${NAV_CLEARANCE})`
          : NAV_CLEARANCE,
        left: 0, right: 0, zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px',
        transition: 'bottom 0.2s',
      }}>
        <button
          onClick={() => setGlobalFoil(f => !f)}
          style={{ padding: '9px 18px', borderRadius: '22px', border: `1px solid ${globalFoil ? 'rgba(234,179,8,0.6)' : 'rgba(255,255,255,0.25)'}`, background: globalFoil ? 'rgba(234,179,8,0.2)' : 'rgba(0,0,0,0.5)', color: globalFoil ? '#fbbf24' : '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(8px)' }}
        >
          ✨ Foil
        </button>

        <button
          onClick={() => setPaused(p => !p)}
          style={{ width: '58px', height: '58px', borderRadius: '50%', background: 'rgba(0,0,0,0.65)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', backdropFilter: 'blur(8px)' }}
        >
          {paused ? <Play size={22} fill="#fff" /> : <Pause size={22} fill="#fff" />}
        </button>

        {results.length > 0 && (
          <button
            onClick={handleAdd}
            disabled={adding}
            style={{ padding: '9px 18px', borderRadius: '22px', border: 'none', background: adding ? 'rgba(139,92,246,0.4)' : 'rgba(139,92,246,0.85)', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: adding ? 'default' : 'pointer', backdropFilter: 'blur(8px)' }}
          >
            {adding ? 'Adding…' : `Add ${totalCount}`}
          </button>
        )}
      </div>

      {/* Scanned-cards tray — sits above the bottom nav */}
      {results.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: NAV_CLEARANCE,
          left: 0, right: 0, zIndex: 2,
          height: '188px',
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
                  src={r.imageUri}
                  alt={r.meta.n}
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

      {/* Camera permission error */}
      {cameraErr && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '24px', zIndex: 10 }}>
          <div style={{ color: '#f87171', fontWeight: 700, fontSize: '1rem' }}>Camera unavailable</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', textAlign: 'center' }}>{cameraErr}</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textAlign: 'center' }}>Go to Settings → Arbiter → Camera and allow access.</div>
          <button onClick={onClose} style={{ marginTop: '8px', padding: '10px 24px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', color: '#fff', cursor: 'pointer' }}>Close</button>
        </div>
      )}
    </div>
  );
};
