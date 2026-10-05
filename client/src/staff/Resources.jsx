// Crews & resources (design p.32).
import { useState } from 'react';
import { api } from '../api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { Icon, ErrorNote, Spinner, Toast } from '../components/ui.jsx';

const AVAIL = { ON_DUTY: 'On duty', OFF_SHIFT: 'Off shift', ON_LEAVE: 'On leave' };

function CrewRow({ c, onSave }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(c);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!edit) {
    return (
      <tr>
        <td className="bold cell-main">{c.name}</td><td data-label="Members">{c.members}</td><td data-label="Skills">{c.skills}</td><td data-label="Wards">{c.zone.replaceAll(',', ', ')}</td>
        <td data-label="Availability"><span className={`pill ${c.availability === 'ON_DUTY' ? 'CLOSED' : c.availability === 'ON_LEAVE' ? 'REOPENED' : 'REPORTED'}`}>{AVAIL[c.availability]}</span></td>
        <td data-label="Load" className="mono">{c.load}/{c.max_load}</td>
        <td className="cell-action"><button type="button" className="btn ghost sm" onClick={() => { setF(c); setEdit(true); }}>Edit</button></td>
      </tr>
    );
  }
  return (
    <tr className="editing">
      <td className="bold cell-main">{c.name}</td>
      <td data-label="Members"><input className="input" style={{ width: 70 }} type="number" min="1" value={f.members} onChange={set('members')} /></td>
      <td data-label="Skills"><input className="input" value={f.skills} onChange={set('skills')} /></td>
      <td data-label="Wards"><input className="input" style={{ width: 120 }} value={f.zone} onChange={set('zone')} aria-label="Wards" /></td>
      <td data-label="Availability"><select className="input" value={f.availability} onChange={set('availability')}>{Object.entries(AVAIL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
      <td data-label="Max jobs"><input className="input" style={{ width: 70 }} type="number" min="1" value={f.max_load} onChange={set('max_load')} aria-label="Max jobs" /></td>
      <td className="row cell-action"><button type="button" className="btn primary sm" onClick={async () => { if (await onSave(c.crew_id, f)) setEdit(false); }}>Save</button><button type="button" className="link-btn" onClick={() => setEdit(false)}>Cancel</button></td>
    </tr>
  );
}

export default function Resources() {
  const { data, error, reload } = useApi('/department/resources');
  const [toast, showToast] = useToast();
  const [newCrew, setNewCrew] = useState(null);
  if (!data) return error ? <ErrorNote error={error} onRetry={reload} /> : <Spinner />;

  const saveCrew = async (id, f) => {
    try {
      await api(`/department/crews/${id}`, { method: 'PATCH', body: f });
      reload();
      showToast('Crew updated.');
      return true;
    } catch (e) { showToast(e.message); return false; }
  };
  const addCrew = async (e) => {
    e.preventDefault();
    try {
      await api('/department/crews', { method: 'POST', body: newCrew });
      setNewCrew(null);
      reload();
      showToast('Crew added.');
    } catch (err) { showToast(err.message); }
  };
  const setEquipment = async (eq, available) => {
    try {
      await api(`/department/equipment/${eq.equipment_id}`, { method: 'PATCH', body: { available_units: available } });
      reload();
    } catch (e) { showToast(e.message); }
  };
  const toggleCategory = async (cid) => {
    const next = data.categories.includes(cid) ? data.categories.filter((c) => c !== cid) : [...data.categories, cid];
    try {
      await api('/department/categories', { method: 'PUT', body: { category_ids: next } });
      reload();
    } catch (e) { showToast(e.message); }
  };

  return (
    <>
      <div className="staff-head">
        <div className="stack tight" style={{ gap: 2 }}>
          <h1>Crews & resources</h1>
          <span className="muted">Officers see this when assigning. Keep it current.</span>
        </div>
        <button type="button" className="btn outline" onClick={() => setNewCrew({ name: '', members: 3, skills: '', zone: '', availability: 'ON_DUTY', max_load: 5 })}><Icon name="plus" size={18} /> Add crew</button>
      </div>
      {newCrew && (
        <form className="card row wrap add-form" onSubmit={addCrew}>
          <input className="input" style={{ width: 150 }} placeholder="Crew R-9" value={newCrew.name} onChange={(e) => setNewCrew({ ...newCrew, name: e.target.value })} />
          <input className="input" style={{ width: 90 }} type="number" min="1" value={newCrew.members} onChange={(e) => setNewCrew({ ...newCrew, members: e.target.value })} aria-label="Members" />
          <input className="input" style={{ width: 200 }} placeholder="Skills" value={newCrew.skills} onChange={(e) => setNewCrew({ ...newCrew, skills: e.target.value })} />
          <input className="input" style={{ width: 140 }} placeholder="Wards, e.g. 7,8" value={newCrew.zone} onChange={(e) => setNewCrew({ ...newCrew, zone: e.target.value })} />
          <button className="btn primary">Add</button>
          <button type="button" className="link-btn" onClick={() => setNewCrew(null)}>Cancel</button>
        </form>
      )}
      <div className="panel">
        <table className="table stackable">
          <thead><tr><th>Crew</th><th>Members</th><th>Skills</th><th>Zone</th><th>Availability</th><th>Load</th><th /></tr></thead>
          <tbody>{data.crews.map((c) => <CrewRow key={c.crew_id} c={c} onSave={saveCrew} />)}</tbody>
        </table>
      </div>
      <div className="two-col">
        <div className="card stack">
          <div className="row between"><h3>Equipment</h3><span className="small muted">Filled = available now</span></div>
          {data.equipment.map((eq) => (
            <div key={eq.equipment_id} className="row between wrap equip-row">
              <span>{eq.name}</span>
              <span className="row wrap" style={{ minWidth: 0 }}>
                <span className="meter tappable">{Array.from({ length: eq.total_units }, (_, k) => (
                  <i key={k} className={k < eq.available_units ? 'on' : ''}
                    onClick={() => setEquipment(eq, k < eq.available_units ? k : k + 1)} title="Click to change availability" />
                ))}</span>
                <span className="mono small">{eq.available_units}/{eq.total_units}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="card stack">
          <h3>Categories this department handles</h3>
          <div className="row wrap" style={{ gap: 8 }}>
            {data.all_categories.map((c) => {
              const mine = data.categories.includes(c.category_id);
              return (
                <button type="button" key={c.category_id} className={`chip ${mine ? 'on' : ''}`} onClick={() => toggleCategory(c.category_id)}
                  title={!mine && c.handled_by ? `Currently handled by ${c.handled_by}` : ''}>{c.name}</button>
              );
            })}
          </div>
          <p className="small muted">The system uses this list to recommend a department. Claiming a category moves it here from the department that had it.</p>
        </div>
      </div>
      <Toast msg={toast} />
    </>
  );
}
