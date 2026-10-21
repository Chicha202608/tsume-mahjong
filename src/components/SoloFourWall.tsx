import { SEAT_NAMES, soloPerspective, soloWallSeat, type SoloState } from '@/game/soloFour';
import WallModal from '@/components/WallModal';

export default function SoloFourWall({ state, onClose }: { state: SoloState; onClose: () => void }) {
  const perspective = soloPerspective(state);
  const wallIndex = new Map(state.wall.map((tile, index) => [tile.id, index]));
  return <WallModal state={perspective} wall={state.wall} fullWall={state.fullWall}
    wallDrawnCount={perspective.wallDrawnCount} doraCount={state.doraCount} wanpai={state.wanpai}
    phase={perspective.phase} turnCount={perspective.turnCount} onClose={onClose}
    highlightLabel={`黄色：鳴きが入らなければ${SEAT_NAMES[state.view]}家がツモる牌`}
    highlightWallIndex={index => {
      const remainingIndex = wallIndex.get(state.fullWall[index].id);
      return state.phase !== 'end' && remainingIndex !== undefined && soloWallSeat(state, remainingIndex) === state.view;
    }} />;
}
