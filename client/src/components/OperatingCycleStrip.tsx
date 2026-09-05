import { Smartphone, CloudCog, Cpu, LineChart, ClipboardCheck, RefreshCw, ArrowRight } from 'lucide-react';
import { OPERATING_CYCLE } from '../config/modules';

const ICONS = [Smartphone, CloudCog, Cpu, LineChart, ClipboardCheck, RefreshCw];

export function OperatingCycleStrip() {
  return (
    <section className="panel operating-cycle">
      <h2>How the System Works</h2>
      <div className="operating-cycle-row">
        {OPERATING_CYCLE.map((stage, i) => {
          const Icon = ICONS[i];
          return (
            <div className="operating-cycle-stage" key={stage.key}>
              <div className="operating-cycle-icon" style={{ background: stage.color }}>
                <Icon size={22} color="#fff" />
              </div>
              <div className="operating-cycle-label">{stage.label}</div>
              <div className="operating-cycle-desc">{stage.description}</div>
              {i < OPERATING_CYCLE.length - 1 && <ArrowRight className="operating-cycle-arrow" size={16} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
