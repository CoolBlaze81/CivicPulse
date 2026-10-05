// Profile picture with a change / remove control (any role).
import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { compressImage } from '../lib/image.js';
import { Avatar, Icon } from './ui.jsx';

export default function AvatarEditor({ size = 84, onMessage = () => {} }) {
  const { user, refresh } = useAuth();
  const fileRef = useRef();
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { onMessage('Choose a photo (JPEG, PNG, WebP or HEIC).'); return; }
    setBusy(true);
    try {
      const small = await compressImage(file, { maxSide: 512, quality: 0.85 });
      const form = new FormData();
      form.append('photo', small);
      await api('/me/avatar', { method: 'POST', form });
      await refresh();
      onMessage('Profile picture updated.');
    } catch (e) {
      onMessage(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api('/me/avatar', { method: 'DELETE' });
      await refresh();
      onMessage('Profile picture removed.');
    } catch (e) { onMessage(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="avatar-editor">
      <button type="button" className="avatar-edit-btn" onClick={() => fileRef.current?.click()} disabled={busy}
        aria-label={user?.avatar_url ? 'Change profile picture' : 'Add a profile picture'}>
        <Avatar user={user} size={size} className="lg" />
        <span className="avatar-cam">{busy ? <span className="spinner small-spin" /> : <Icon name="camera" size={16} />}</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
      {user?.avatar_url && <button type="button" className="link-btn tiny" onClick={remove} disabled={busy}>Remove photo</button>}
    </div>
  );
}
