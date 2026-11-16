import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, RotateCcw, Trash2, Upload, ZoomIn } from 'lucide-react';
import { Alert, Button, Modal, Tabs } from './ui';
import {
  ABSTRACT_PRESETS, PIECE_THEMES, PIECE_TYPES, PIECE_LABELS,
  avatarPresetDataUrl, presetLabel, type AvatarPreset,
} from '../lib/avatars';

/**
 * Avatar picker.
 *
 * Three tabs, one live preview, one save. The cropper is deliberately hand-rolled on a canvas
 * rather than pulled from a dependency: the requirement is zoom + reposition into a circle, which is
 * about eighty lines of pointer maths, and the project has no image-manipulation dependency to keep
 * up to date otherwise.
 *
 * Everything is prepared client-side and uploaded as a single data URL, matching what
 * `POST /me/avatar` already expects — the server resizes nothing, so the crop must come out at a
 * sensible size here (512 px, the same figure the existing upload path used).
 */

const OUTPUT_SIZE = 512;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;

export type AvatarTarget = 'account' | 'guest';

interface AvatarPickerProps {
  open: boolean;
  onClose: () => void;
  /** Current photo, if any. */
  photoUrl?: string | null;
  /** Current preset id, if any. */
  icon?: string | null;
  name: string;
  /** Guests call the guest endpoints; signed-in players call /me. */
  target?: AvatarTarget;
  /** Called after a successful save so the caller can refresh. */
  onSaved?: (result: { avatarIcon: string | null; avatarUrl: string | null }) => void;
}

type TabId = 'chess' | 'abstract' | 'upload';

export function AvatarPicker({ open, onClose, photoUrl, icon, name, target = 'account', onSaved }: AvatarPickerProps) {
  const [tab, setTab] = useState<TabId>(photoUrl ? 'upload' : 'chess');
  const [selectedIcon, setSelectedIcon] = useState<string | null>(icon ?? null);
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Upload-tab state
  const [source, setSource] = useState<{ image: HTMLImageElement; url: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [progress, setProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  // Reset whenever the dialog is reopened, so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setTab(photoUrl ? 'upload' : 'chess');
    setSelectedIcon(icon ?? null);
    setError(''); setNotice(''); setProgress(0); setSaving(false); setRemoving(false);
    setSource(null); setZoom(1); setOffset({ x: 0, y: 0 });
  }, [open, icon, photoUrl]);

  const preview = useMemo(() => {
    if (source) return source.url;
    if (selectedIcon) return avatarPresetDataUrl(selectedIcon);
    return photoUrl ?? null;
  }, [source, selectedIcon, photoUrl]);

  /** Draws the crop at the current zoom/offset into the preview canvas. */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    // Cover-fit first, then apply the user's zoom and pan.
    const base = Math.max(size / source.image.width, size / source.image.height);
    const scale = base * zoom;
    const w = source.image.width * scale;
    const h = source.image.height * scale;
    ctx.drawImage(source.image, (size - w) / 2 + offset.x, (size - h) / 2 + offset.y, w, h);
    ctx.restore();
  }, [source, zoom, offset]);

  useEffect(() => { draw(); }, [draw]);

  const pickFile = async (file: File) => {
    setError(''); setNotice(''); setProgress(0);
    if (!ACCEPTED.includes(file.type)) {
      setError('Choose a PNG, JPEG or WebP image.'); return;
    }
    if (file.size > MAX_BYTES) {
      setError('That image is too large — choose one under 8 MB.'); return;
    }
    try {
      const url = URL.createObjectURL(file);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('That file could not be read as an image.'));
        img.src = url;
      });
      // Revoke the previous object URL so repeated picks do not leak memory.
      if (source) URL.revokeObjectURL(source.url);
      setSource({ image, url });
      setZoom(1); setOffset({ x: 0, y: 0 });
      setSelectedIcon(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that image.');
    }
  };

  const startDrag = (e: React.PointerEvent) => {
    if (!source) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    setOffset({ x: d.originX + (e.clientX - d.startX), y: d.originY + (e.clientY - d.startY) });
  };
  const endDrag = () => { dragState.current = null; };

  /** Renders the crop to a square data URL at OUTPUT_SIZE. */
  const cropToDataUrl = (): string | null => {
    if (!source) return null;
    const out = document.createElement('canvas');
    out.width = OUTPUT_SIZE; out.height = OUTPUT_SIZE;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    const size = OUTPUT_SIZE;
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    const base = Math.max(size / source.image.width, size / source.image.height);
    const scale = base * zoom;
    const w = source.image.width * scale;
    const h = source.image.height * scale;
    // Scale the preview offsets up to output resolution.
    const factor = size / 288;
    ctx.drawImage(source.image, (size - w) / 2 + offset.x * factor, (size - h) / 2 + offset.y * factor, w, h);
    ctx.restore();
    return out.toDataURL('image/jpeg', 0.9);
  };

  const save = async () => {
    setError(''); setNotice(''); setSaving(true);
    try {
      // Upload tab with a fresh crop
      if (tab === 'upload' && source) {
        const dataUrl = cropToDataUrl();
        if (!dataUrl) throw new Error('Could not prepare that image.');
        setProgress(35);
        if (target === 'guest') {
          // Guests keep their photo in the browser only — there is no account to store it against.
          try { localStorage.setItem('sc-guest-photo', dataUrl); } catch { /* storage disabled */ }
          setProgress(100);
          setNotice('Photo set for this session. Create an account to keep it.');
          onSaved?.({ avatarIcon: null, avatarUrl: dataUrl });
          return;
        }
        await fetch('/api/me/avatar', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        }).then(async res => {
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error((body && body.error) || 'Upload failed.');
          }
        });
        setProgress(100);
        onSaved?.({ avatarIcon: null, avatarUrl: dataUrl });
        setNotice('Photo updated.');
        onClose();
        return;
      }

      // Preset tabs
      if (selectedIcon) {
        if (target === 'guest') {
          try { localStorage.setItem('sc-guest-icon', selectedIcon); } catch { /* storage disabled */ }
          onSaved?.({ avatarIcon: selectedIcon, avatarUrl: null });
          onClose();
          return;
        }
        await fetch('/api/me/avatar/icon', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ icon: selectedIcon }),
        }).then(async res => {
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error((body && body.error) || 'Could not save that avatar.');
          }
        });
        onSaved?.({ avatarIcon: selectedIcon, avatarUrl: null });
        onClose();
        return;
      }

      // Nothing chosen and nothing uploaded: removing is the only sensible action.
      if (photoUrl || icon) { await removeCurrent(); return; }
      throw new Error('Choose an avatar first.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
      setTimeout(() => setProgress(0), 600);
    }
  };

  const removeCurrent = async () => {
    setRemoving(true); setError(''); setNotice('');
    try {
      if (target === 'guest') {
        try {
          localStorage.removeItem('sc-guest-icon');
          localStorage.removeItem('sc-guest-photo');
        } catch { /* storage disabled */ }
        onSaved?.({ avatarIcon: null, avatarUrl: null });
        onClose();
        return;
      }
      await fetch('/api/me/avatar', { method: 'DELETE', credentials: 'include' }).then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error((body && body.error) || 'Could not remove the avatar.');
        }
      });
      onSaved?.({ avatarIcon: null, avatarUrl: null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the avatar.');
    } finally {
      setRemoving(false);
    }
  };

  const hasSomething = Boolean(photoUrl || icon || selectedIcon || source);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change avatar"
      width={720}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%' }}>
          <div>
            {hasSomething && (
              <Button variant="ghost" size="sm" onClick={removeCurrent} loading={removing} icon={<Trash2 size={14} />}>
                Remove avatar
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save changes</Button>
          </div>
        </div>
      }
    >
      <div className="avatar-picker">
        {/* Live preview — the same circle every avatar in the app uses. */}
        <div className="avatar-preview">
          <span className="avatar avatar-xl">
            {preview ? <img src={preview} alt="" /> : name.slice(0, 2).toUpperCase()}
          </span>
          <span className="avatar-preview-label">
            {source ? 'Your cropped photo'
              : selectedIcon ? presetLabel(selectedIcon)
                : photoUrl ? 'Your current photo'
                  : 'Initials'}
          </span>
        </div>

        <Tabs<TabId>
          label="Avatar source"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'chess', label: 'Chess pieces' },
            { id: 'abstract', label: 'Abstract' },
            { id: 'upload', label: 'Upload picture' },
          ]}
        />

        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        {tab === 'chess' && (
          <div className="avatar-grid-groups">
            {PIECE_TYPES.map(type => (
              <div key={type} className="avatar-group">
                <h4 className="avatar-group-title">{PIECE_LABELS[type]}</h4>
                <div className="avatar-grid">
                  {PIECE_THEMES.map(theme => {
                    const id = `${type}-${theme}`;
                    return (
                      <PresetTile
                        key={id}
                        id={id}
                        selected={selectedIcon === id}
                        onSelect={() => { setSelectedIcon(id); setSource(null); }}
                        label={presetLabel(id)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'abstract' && (
          <div className="avatar-grid avatar-grid-wide">
            {ABSTRACT_PRESETS.map((p: AvatarPreset) => (
              <PresetTile
                key={p.id}
                id={p.id}
                selected={selectedIcon === p.id}
                onSelect={() => { setSelectedIcon(p.id); setSource(null); }}
                label={p.label}
              />
            ))}
          </div>
        )}

        {tab === 'upload' && (
          <div className="avatar-upload">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED.join(',')}
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void pickFile(file);
                e.target.value = '';
              }}
            />

            {!source ? (
              <button type="button" className="avatar-drop" onClick={() => fileInput.current?.click()}>
                <ImagePlus size={28} />
                <strong>Choose a picture</strong>
                <span>JPG, PNG or WebP · up to 8 MB</span>
                {photoUrl && <span className="avatar-drop-note">You already have a photo — choosing another replaces it.</span>}
              </button>
            ) : (
              <div className="avatar-cropper">
                <div
                  className="avatar-crop-stage"
                  onPointerDown={startDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <canvas ref={canvasRef} width={288} height={288} aria-label="Crop preview" />
                  <span className="avatar-crop-hint">Drag to reposition</span>
                </div>
                <div className="avatar-crop-controls">
                  <label className="avatar-zoom">
                    <ZoomIn size={16} />
                    <input
                      type="range" min={1} max={3} step={0.01} value={zoom}
                      onChange={e => setZoom(Number(e.target.value))}
                      aria-label="Zoom"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
                  >
                    <RotateCcw size={14} /> Reset
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInput.current?.click()}>
                    <Upload size={14} /> Replace
                  </button>
                </div>
              </div>
            )}

            {progress > 0 && progress < 100 && (
              <div className="avatar-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${progress}%` }} />
              </div>
            )}
            <p className="avatar-upload-note">
              Your picture is cropped in the browser and stored as a circular avatar. It is never shared
              with third parties.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PresetTile({ id, selected, onSelect, label }: { id: string; selected: boolean; onSelect: () => void; label: string }) {
  const src = avatarPresetDataUrl(id);
  return (
    <button
      type="button"
      className={`avatar-tile${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
      title={label}
    >
      {src ? <img src={src} alt={label} /> : null}
      {selected && <span className="avatar-tile-check"><Check size={12} /></span>}
    </button>
  );
}
