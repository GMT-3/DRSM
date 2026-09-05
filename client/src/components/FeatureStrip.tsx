import { RefreshCw, WifiOff, Users, ShieldCheck, LineChart } from 'lucide-react';
import { FEATURE_STRIP } from '../config/modules';

const ICONS = [RefreshCw, WifiOff, Users, ShieldCheck, LineChart];

export function FeatureStrip() {
  return (
    <section className="feature-strip">
      {FEATURE_STRIP.map((f, i) => {
        const Icon = ICONS[i];
        return (
          <div className="feature-strip-item" key={f.label}>
            <Icon size={20} />
            <div>
              <div className="feature-strip-label">{f.label}</div>
              <div className="feature-strip-desc">{f.description}</div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
