import { Zap, Code2, BrainCircuit, ArrowRight, ShieldCheck, Puzzle, FileArchive } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Galaxy from "./background";

function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="landing">
      {/* Galaxy background */}
      <div className="galaxy-bg">
        <Galaxy
          speed={0.6}
          density={1.2}
          hueShift={200}
          glowIntensity={0.25}
          saturation={0.4}
          twinkleIntensity={0.4}
          rotationSpeed={0.03}
          transparent={false}
          autoCenterRepulsion={0.6}
          mouseInteraction={true}
          mouseRepulsion={true}
        />
      </div>

      {/* No navbar on landing — standalone hero experience */}

      {/* Hero */}
      <header className="hero">
        <div className="hero-badge">HackSRM 7.0</div>
        <h1 className="hero-title">
          Token<span className="accent">Trim</span>
        </h1>
        <p className="hero-subtitle">
          Compress entire codebases with Huffman coding &amp; intelligent hashing,
          then bundle them alongside your chat context — so LLMs see more while
          you spend less.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => navigate("/chat")}>
            Try It Now <ArrowRight size={16} />
          </button>
          <a href="#features" className="btn btn-outline">Learn More</a>
        </div>

        <div className="hero-stats">
          <div className="stat">
            <span className="stat-value">~60%</span>
            <span className="stat-label">Token Reduction</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-value">Lossless</span>
            <span className="stat-label">Byte-Perfect Recovery</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-value">2 Modes</span>
            <span className="stat-label">LLM-Native &amp; Extension</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-value">Any&nbsp;LLM</span>
            <span className="stat-label">No Lock-In</span>
          </div>
        </div>
      </header>

      {/* Features */}
      <section id="features" className="features">
        <h2 className="section-title">Everything in One Tool</h2>
        <p className="section-desc">
          From raw compression to full lossless recovery — TokenTrim handles
          the entire context-efficiency workflow without leaving your browser.
        </p>
        <div className="feature-grid">
          <FeatureCard
            icon={<Code2 size={28} />}
            title="No-Extension Mode"
            description="Compresses your code with Huffman coding and smart hashing, then wraps it with self-contained LLM decode instructions. Any model can unpack it — no plugin required."
          />
          <FeatureCard
            icon={<Puzzle size={28} />}
            title="With-Extension Mode"
            description="Encodes files into a compact lossless JSON payload embedded in a .txt bundle. Pair it with the TokenTrim browser extension for seamless, automatic decoding."
          />
          <FeatureCard
            icon={<FileArchive size={28} />}
            title="Lossless Archive"
            description="Export a .json lossless bundle that perfectly restores every original file byte-for-byte. No data loss, no approximation — ideal for sharing full codebases."
          />
          <FeatureCard
            icon={<ShieldCheck size={28} />}
            title="In-App Decode"
            description="Upload any .json lossless bundle or .txt with-extension bundle straight into the Decode tab to instantly recover and download all original source files."
          />
          <FeatureCard
            icon={<BrainCircuit size={28} />}
            title="Chat Context Bundling"
            description="Attach code files alongside your conversation history. TokenTrim compresses both together into a single portable bundle ready to drop into any LLM chat."
          />
          <FeatureCard
            icon={<Zap size={28} />}
            title="Drop-In Integration"
            description="Works with ChatGPT, Claude, Gemini, and any other LLM interface. Paste a compressed bundle, prepend the decode preamble, and you're done."
          />
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="how-section">
        <h2 className="section-title">How It Works</h2>
        <div className="steps">
          <Step
            num="01"
            title="Attach Files &amp; Add Context"
            description="Upload .tsx, .py, .js, or any text file. Add your chat conversation — TokenTrim reads and analyses each file individually, estimating token cost before you compress."
          />
          <Step
            num="02"
            title="Choose Your Mode"
            description="No-Extension: generates a self-decoding .txt bundle any LLM can unpack. With-Extension: lossless JSON payload decoded automatically by the browser plugin. Or export a raw lossless .json archive."
          />
          <Step
            num="03"
            title="Download &amp; Send"
            description="Hit Compress &amp; Export — your bundle downloads instantly. Paste the .txt into any LLM chat window. The embedded decode preamble tells the model exactly how to reconstruct your files."
          />
          <Step
            num="04"
            title="Recover Anytime"
            description="Use the built-in Decode tab to upload any bundle and get every original file back — byte-perfect. No external tools, no extra steps."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <p>
          Built at <strong>HackSRM 7.0</strong> &middot; Token Trim &copy;{" "}
          {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}

/* ── Sub‑components ──────────────────────────────── */

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="feature-card">
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function Step({
  num,
  title,
  description,
}: {
  num: string;
  title: string;
  description: string;
}) {
  return (
    <div className="step">
      <span className="step-num">{num}</span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default LandingPage;
