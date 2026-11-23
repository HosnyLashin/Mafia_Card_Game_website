export default function GameLayout({ side, children }) {
  return (
    <div className="game-layout">
      <div className="game-main">{children}</div>
      {side && <aside className="game-side">{side}</aside>}
    </div>
  );
}
