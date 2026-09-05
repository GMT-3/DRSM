import { useParams } from 'react-router-dom';
import { MODULES } from '../config/modules';

// Every module's real screens land in its own build phase (Implementation.md).
// This placeholder just proves routing + role-filtered sidebar nav work end
// to end for Phase 0, and previews the module's planned sub-features.
export function ModulePlaceholder() {
  const { moduleKey } = useParams();
  const mod = MODULES.find((m) => m.key === moduleKey);

  if (!mod) return <div className="panel">Unknown module.</div>;

  return (
    <div className="panel module-placeholder">
      <div className="module-card-header">
        <span className="module-card-icon" style={{ background: mod.color }}>
          {mod.id}
        </span>
        <h2>{mod.name}</h2>
      </div>
      <p className="module-placeholder-note">
        Built in a later phase per <code>Implementation.md</code>. Planned screens:
      </p>
      <ul>
        {mod.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  );
}
