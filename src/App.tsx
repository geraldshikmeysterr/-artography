import { MapCanvas } from './map/MapCanvas';
import { Toolbar } from './ui/Toolbar';
import { TerrainPanel } from './ui/TerrainPanel';
import { StatusBadge } from './ui/StatusBadge';

export function App() {
  return (
    <>
      <MapCanvas />
      <Toolbar />
      <TerrainPanel />
      <StatusBadge />
    </>
  );
}
