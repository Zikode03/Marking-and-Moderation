import type { Epoch, ModelKind } from './studioApi';

const COLORS = ['#3a8764', '#c29655', '#7975b8'];
export default function LearningChart({ history, kind }: { history: Epoch[]; kind: ModelKind }) {
  const label = kind === 'ocr' ? 'Validation character error rate' : 'Validation mark error · fraction of maximum';
  const points = history.map(point => ({ ...point, value: kind === 'ocr' ? point.validation_cer : point.validation_mae_fraction })).filter((point): point is Epoch & { value: number } => typeof point.value === 'number' && Number.isFinite(point.value));
  if (!points.length) return <div className="studio-chart-empty"><div className="studio-chart-grid"/><span>Your learning curve starts with the first saved epoch.</span><small>Live measurements will appear here.</small></div>;
  const highest = Math.max(.05, ...points.map(point => point.value)) * 1.12;
  const lastEpoch = Math.max(2, ...points.map(point => point.epoch));
  const members = [...new Set(points.map(point => point.member ?? 0))];
  const x = (epoch: number) => 48 + ((epoch - 1) / (lastEpoch - 1)) * 562;
  const y = (value: number) => 180 - (value / highest) * 153;
  return <div className="studio-chart"><svg viewBox="0 0 640 215" role="img" aria-label={label}><title>{label}. Lower is better. {points.length} saved measurements.</title>{[0, 1, 2, 3].map(tick => { const value = highest * tick / 3; return <g key={tick}><line x1="48" x2="610" y1={y(value)} y2={y(value)} stroke="#e9eee9"/><text x="37" y={y(value) + 4} textAnchor="end">{value.toFixed(2)}</text></g>; })}<text x="48" y="204">Epoch 1</text><text x="610" y="204" textAnchor="end">Epoch {lastEpoch}</text>{members.map(member => { const selected = points.filter(point => (point.member ?? 0) === member); return <g key={member}><polyline points={selected.map(point => `${x(point.epoch)},${y(point.value)}`).join(' ')} fill="none" stroke={COLORS[member % COLORS.length]} strokeWidth="2.5"/>{selected.map(point => <circle key={point.epoch} cx={x(point.epoch)} cy={y(point.value)} r="3.5" fill={COLORS[member % COLORS.length]}><title>Epoch {point.epoch}: {point.value.toFixed(4)}</title></circle>)}</g>; })}</svg><p>{label}<span>Lower is better</span></p>{members.length > 1 && <div className="studio-chart-legend">{members.map(member => <span key={member}><i style={{ background: COLORS[member % COLORS.length] }}/>Member {member + 1}</span>)}</div>}</div>;
}
