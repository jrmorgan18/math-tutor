import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { Welcome } from './ui/screens/Welcome';
import { Placement } from './ui/screens/Placement';
import { Home } from './ui/screens/Home';
import { Briefing } from './ui/screens/Briefing';
import { Session } from './ui/screens/Session';
import { Recap } from './ui/screens/Recap';
import { Paddock } from './ui/screens/Paddock';
import { Collection } from './ui/screens/Collection';
import { Parent } from './ui/screens/Parent';
import { Celebration } from './ui/components/Celebration';

export function App() {
  const screen = useStore((s) => s.screen);
  const init = useStore((s) => s.init);
  const placement = useStore((s) => s.placement);
  const beginPlacement = useStore((s) => s.beginPlacement);

  useEffect(() => {
    void init();
  }, [init]);

  // Resuming a half-finished placement after a reload: rebuild the staircase
  // rather than dropping him into an empty screen.
  useEffect(() => {
    if (screen === 'placement' && !placement) beginPlacement();
  }, [screen, placement, beginPlacement]);

  return (
    <>
      {screen === 'loading' ? (
        <div className="app">
          <div className="spacer" />
          <div className="center dim">Opening the lab…</div>
          <div className="spacer" />
        </div>
      ) : null}
      {screen === 'welcome' ? <Welcome /> : null}
      {screen === 'placement' ? <Placement /> : null}
      {screen === 'home' ? <Home /> : null}
      {screen === 'briefing' ? <Briefing /> : null}
      {screen === 'session' ? <Session /> : null}
      {screen === 'recap' ? <Recap /> : null}
      {screen === 'paddock' ? <Paddock /> : null}
      {screen === 'collection' ? <Collection /> : null}
      {screen === 'parent' ? <Parent /> : null}
      <Celebration />
    </>
  );
}
