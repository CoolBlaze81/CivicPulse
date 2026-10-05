// Admin: staff accounts and roles.
import { useState } from 'react';
import { api } from '../api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { ROLE_LABEL } from '../lib/format.js';
import { Icon, Spinner, Tabs, Toast } from '../components/ui.jsx';

export default function Users() {
  const { data, reload } = useApi('/admin/users');
  const { data: meta } = useApi('/meta');
  const { data: crews } = useApi('/admin/crews');
  const [form, setForm] = useState(null);
  const [reset, setReset] = useState(null);
  const [role, setRole] = useState('ALL');
  const [q, setQ] = useState('');
  const [toast, showToast] = useToast();
  if (!data || !meta || !crews) return <Spinner />;
  const staff = data.filter((u) => u.user_id);
  const citizens = data.find((u) => u.role === 'CITIZEN' && u.count != null)?.count;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/users', { method: 'POST', body: form });
      setForm(null);
      reload();
      showToast('Account created.');
    } catch (err) { showToast(err.message); }
  };
  const unlock = async (u) => {
    try {
      await api(`/admin/users/${u.user_id}/unlock`, { method: 'POST' });
      showToast(`${u.name} unlocked.`);
      reload();
    } catch (err) { showToast(err.message); }
  };
  const toggle = async (u) => {
    try {
      await api(`/admin/users/${u.user_id}/disable`, { method: 'POST', body: { disabled: !u.disabled } });
      showToast(`${u.name} ${u.disabled ? 'switched back on' : 'switched off and signed out'}.`);
      reload();
    } catch (err) { showToast(err.message); }
  };
  const doReset = async (e) => {
    e.preventDefault();
    try {
      await api(`/admin/users/${reset.user.user_id}/password`, { method: 'POST', body: { password: reset.password } });
      showToast(`New password set for ${reset.user.name}.`);
      setReset(null);
    } catch (err) { showToast(err.message); }
  };
  const term = q.trim().toLowerCase();
  const shown = staff
    .filter((u) => role === 'ALL' || u.role === role)
    .filter((u) => !term || [u.name, u.staff_id, u.department_name, u.crew_name].some((x) => String(x || '').toLowerCase().includes(term)));

  return (
    <>
      <div className="staff-head">
        <div className="stack tight" style={{ gap: 2 }}><h1>Users & roles</h1><span className="muted">{staff.length} staff accounts · {citizens} citizens</span></div>
        <button type="button" className="btn outline" onClick={() => setForm({ role: 'OFFICER', name: '', staff_id: '', password: '', wards: '' })}><Icon name="plus" size={18} /> Add staff</button>
      </div>
      {form && (
        <form className="card stack add-form" onSubmit={create}>
          <div className="row wrap">
            <select className="input" style={{ width: 180 }} value={form.role} onChange={set('role')}>
              {['OFFICER', 'DEPT_HEAD', 'FIELD_WORKER', 'ADMIN'].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <input className="input" style={{ width: 180 }} placeholder="Name" value={form.name} onChange={set('name')} />
            <input className="input mono" style={{ width: 150 }} placeholder="Staff ID" value={form.staff_id} onChange={set('staff_id')} />
            <input className="input" style={{ width: 180 }} type="password" placeholder="Password (8+)" value={form.password} onChange={set('password')} />
            {form.role === 'OFFICER' && <input className="input" style={{ width: 150 }} placeholder="Wards e.g. 1,2,3" value={form.wards} onChange={set('wards')} />}
            {form.role === 'DEPT_HEAD' && (
              <select className="input" style={{ width: 220 }} value={form.department_id || ''} onChange={set('department_id')}>
                <option value="">Department…</option>{meta.departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
              </select>
            )}
            {form.role === 'FIELD_WORKER' && (
              <select className="input" style={{ width: 220 }} value={form.crew_id || ''} onChange={set('crew_id')}>
                <option value="">Crew…</option>{crews.map((c) => <option key={c.crew_id} value={c.crew_id}>{c.name} · {c.department_name}</option>)}
              </select>
            )}
          </div>
          <div className="row"><button className="btn primary">Create account</button><button type="button" className="link-btn" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
      <Tabs value={role} onChange={setRole} className="fit"
        tabs={[['ALL', 'All', staff.length], ...['OFFICER', 'DEPT_HEAD', 'FIELD_WORKER', 'ADMIN'].map((r) => [r, ROLE_LABEL[r], staff.filter((u) => u.role === r).length])]} />
      <label className="search">
        <Icon name="search" size={18} />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, staff ID or department" aria-label="Search staff" />
      </label>
      <div className="panel">
        <table className="table stackable">
          <thead><tr><th>Name</th><th>Staff ID</th><th>Role</th><th>Department / crew</th><th>Status</th><th /></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.user_id} className={u.disabled ? 'dimmed' : ''}>
                <td className="bold cell-main">{u.name}{u.wards ? <div className="sub">Wards {u.wards}</div> : null}</td>
                <td className="mono" data-label="Staff ID">{u.staff_id}</td>
                <td data-label="Role">{ROLE_LABEL[u.role]}</td>
                <td data-label="Department">{u.department_name || '—'}{u.crew_name ? ` · ${u.crew_name}` : ''}</td>
                <td data-label="Status">
                  {u.disabled ? <span className="pill REOPENED">Switched off</span>
                    : u.locked ? <span className="pill IN_PROGRESS">Locked</span>
                      : <span className="pill CLOSED">Active</span>}
                </td>
                <td className="cell-action">
                  <div className="row wrap" style={{ gap: 6 }}>
                    {u.locked && <button type="button" className="btn ghost sm" onClick={() => unlock(u)}>Unlock</button>}
                    <button type="button" className="btn ghost sm" onClick={() => setReset({ user: u, password: '' })}>Reset password</button>
                    <button type="button" className={`btn ${u.disabled ? 'outline' : 'danger'} sm`} onClick={() => toggle(u)}>{u.disabled ? 'Switch on' : 'Switch off'}</button>
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="center muted" style={{ padding: 24 }}>No staff match that search.</td></tr>}
          </tbody>
        </table>
      </div>
      {reset && (
        <div className="modal-scrim" onClick={() => setReset(null)}>
          <form className="card stack modal" onClick={(e) => e.stopPropagation()} onSubmit={doReset}>
            <h3>New password for {reset.user.name}</h3>
            <p className="small muted">They are signed out everywhere and use this password next time. At least 8 characters with a letter and a number.</p>
            <input className="input" type="text" autoFocus value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} placeholder="New password" />
            <div className="row wrap">
              <button className="btn primary">Set password</button>
              <button type="button" className="btn ghost" onClick={() => setReset(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      <Toast msg={toast} />
    </>
  );
}
