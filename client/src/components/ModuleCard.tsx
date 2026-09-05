import { Link } from 'react-router-dom';
import type { ModuleDef } from '../config/modules';

export function ModuleCard({ mod }: { mod: ModuleDef }) {
  return (
    <Link to={mod.path} className="module-card">
      <div className="module-card-header">
        <span className="module-card-icon" style={{ background: mod.color }}>
          {mod.id}
        </span>
        <h3>{mod.name.toUpperCase()}</h3>
      </div>
      <ul>
        {mod.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </Link>
  );
}
