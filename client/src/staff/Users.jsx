// Admin: staff accounts and roles.
import { useState } from 'react';
import { api } from '../api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { ROLE_LABEL } from '../lib/format.js';
import { Icon, Spinner, Toast } from '../components/ui.jsx';

export default function Users() {
  const { data, reload } = useApi('/admin/users');
  const { data: meta } = useApi('/meta');
  const { data: crews } = useApi('/admin/crews');
  const [form, setForm] = useState(null);
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
    await api(`/admin/users/${u.user_id}/unlock`, { method: 'POST' });
    showToast(`${u.name} unlocked.`);
    reload();
  };

  return (
    <>
      <div className="staff-head">
        <div className="stack tight" style={{ gap: 2 }}><h1>Users & roles</h1><span className="muted">{staff.length} staff accounts · {citizens} citizens</span></div>
        <button type="button" className="btn outline" onClick={() => setForm({ role: 'OFFICER', name: '', staff_id: '', password: '', wards: '' })}><Icon name="plus" size={18} /> Add staff</button>
      </div>
      {form && (
        <form className="card stack" onSubmit={create}>
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
      <div className="panel">
        <table className="table">
          <thead><tr><th>Name</th><th>Staff ID</th><th>Role</th><th>Department / crew</th><th>Scope</th><th /></tr></thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.user_id}>
                <td className="bold">{u.name}</td><td className="mono">{u.staff_id}</td><td>{ROLE_LABEL[u.role]}</td>
                <td>{u.department_name || '—'}{u.crew_name ? ` · ${u.crew_name}` : ''}</td>
                <td className="small muted">{u.wards ? `Wards ${u.wards}` : ''}</td>
                <td><button type="button" className="link-btn small" onClick={() => unlock(u)}>Unlock</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Toast msg={toast} />
    </>
  );
}
