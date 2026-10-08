import { games } from "../games";
import { getMode } from "../modes";
import { useStudio } from "../studio-context";
import type { PanelDef } from "./types";
import "./play.css";

/** Lists the registered games. Starting one switches to the mode it needs;
 * the score and status shown are the running game's own state. */
function Play() {
  const studio = useStudio();
  return (
    <div className="play-panel">
      <h2>
        Play <span className="count">{games.length}</span>
      </h2>
      <p className="play-intro">
        Games are played with your body and scored only from tracked motion.
      </p>
      {games.map((game) => {
        const active = studio.game === game.id,
          needs = getMode(game.requires);
        return (
          <div className="game-row" key={game.id} data-active={active}>
            <span>{game.label}</span>
            <small aria-live="polite">
              {active && studio.gameState
                ? `${studio.gameState.status} · ${studio.gameState.score}`
                : needs.id === studio.mode.id
                  ? ""
                  : `Uses ${needs.short}`}
            </small>
            <button
              className="button compact"
              aria-pressed={active}
              aria-label={`${active ? "Stop" : "Play"} ${game.label}`}
              onClick={() => {
                if (active) return studio.setGame(null);
                if (needs.id !== studio.mode.id) studio.setMode(needs.id);
                studio.setGame(game.id);
              }}
            >
              {active ? "Stop" : "Play"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

const play: PanelDef = {
  id: "play",
  label: "Play",
  order: 20,
  Component: Play,
  // With no game registered there is nothing to play, so no tab.
  visible: () => games.length > 0,
};
export default play;
