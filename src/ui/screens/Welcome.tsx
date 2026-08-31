import { useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { AVATAR_OPTIONS, importAll } from '../../store/db';

export function Welcome() {
  const createProfile = useStore((s) => s.createProfile);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string>(AVATAR_OPTIONS[0]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!name.trim()) return;
    void createProfile(name, avatar);
  };

  /**
   * Restore progress from another device — this is the whole point of
   * exposing it here rather than only in Settings. A brand-new device (e.g.
   * a tablet, the first time it opens the site) has no profile yet, so it
   * can never reach Home/Settings on its own. This is the only door in.
   */
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file if it fails
    if (!file) return;

    setImportError(null);
    setImporting(true);
    try {
      const text = await file.text();
      await importAll(text);
      // Reload rather than patching store state in place — this picks up
      // the restored profile through the normal init() path, exactly as if
      // the device had always had it.
      window.location.reload();
    } catch (err) {
      setImporting(false);
      setImportError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  return (
    <div className="app">
      <div className="spacer" />
      <div className="center" style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 68, lineHeight: 1 }}>🧬</div>
        <h1>Genesis Lab</h1>
        <p className="dim">
          Every genome in this lab is locked. You will need to earn the DNA to
          sequence them — and each species needs a different skill before you
          can even start.
        </p>
      </div>

      <div className="card">
        <h3>Sign in to the lab</h3>
        <input
          type="text"
          value={name}
          placeholder="Your name"
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </div>

      <div className="card">
        <h3>Pick your avatar</h3>
        <div className="avatar-grid">
          {AVATAR_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              className={emoji === avatar ? 'avatar-choice selected' : 'avatar-choice'}
              onClick={() => setAvatar(emoji)}
              aria-label={`Choose ${emoji} as your avatar`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-primary btn-wide btn-lg" disabled={!name.trim()} onClick={submit}>
        Start clearance test
      </button>
      <p className="small dim center" style={{ marginTop: 12, marginBottom: 4 }}>
        About 20 quick questions to work out where to start you. Some will be
        too hard on purpose — that is how the test finds your level.
      </p>

      <div className="center" style={{ marginTop: 14 }}>
        <button
          className="btn btn-ghost small"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
        >
          {importing ? 'Restoring…' : 'Already playing on another device? Restore a backup'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => void handleImportFile(e)}
        />
        {importError ? (
          <p className="small" style={{ color: 'var(--red)', marginTop: 8 }}>
            {importError}
          </p>
        ) : null}
      </div>

      <div className="spacer" />
    </div>
  );
}
