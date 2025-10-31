import { usePiStore } from '../store/piStore';

const baselineSnapshot = JSON.parse(
  JSON.stringify(usePiStore.getState().getPlannerSnapshot()),
);

export const resetPiStore = (): void => {
  const snapshotClone = JSON.parse(JSON.stringify(baselineSnapshot));
  usePiStore.getState().replaceState(snapshotClone);
  usePiStore.setState({
    showDependencies: true,
    keyboardMove: null,
    liveAnnouncement: null,
    notices: [],
  });
};

export const getStoreState = () => usePiStore.getState();
