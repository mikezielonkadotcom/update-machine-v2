export default function Home() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; }
        .logo { font-size: 3rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 0.5rem; background: linear-gradient(135deg, #f59e0b, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .tagline { font-size: 1.1rem; color: #888; margin-bottom: 2rem; }
        .pizza { font-size: 2rem; margin-bottom: 1.5rem; }
        .footer { position: absolute; bottom: 2rem; font-size: 0.85rem; color: #555; }
      `}} />
      <div className="pizza">&#127829;</div>
      <div className="logo">Update Machine</div>
      <p className="tagline">Powered by pizza. Crafted in Wisconsin.</p>
      <p className="footer">&copy; {new Date().getFullYear()} Mike Zielonka Ventures</p>
    </>
  );
}
