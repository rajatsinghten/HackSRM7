import { Scissors, Zap, Code2, BrainCircuit, ArrowRight, Github } from "lucide-react";
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

      {/* Navbar */}
      <nav className="navbar">
        <div className="nav-brand">
          <Scissors size={22} className="nav-icon" />
          <span className="nav-title">TokenTrim</span>
        </div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a
            href="https://github.com/rajatsinghten/HackSRM7"
            target="_blank"
            rel="noreferrer"
            className="nav-github"
          >
            <Github size={18} />
            GitHub
          </a>
        </div>
      </nav>

      {/* Hero */}
      <header className="hero">
        <div className="hero-badge">HackSRM 7.0</div>
        <h1 className="hero-title">
          Token<span className="accent">Trim</span>
        </h1>
        <p className="hero-subtitle">
          Compress your codebase context with Huffman coding &amp; intelligent
          hashing — so LLMs see more while you pay less.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => navigate("/chat")}>
            Try It Now <ArrowRight size={16} />
          </button>
          <button className="btn btn-outline">Learn More</button>
        </div>

        <div className="hero-stats">
          <div className="stat">
            <span className="stat-value">~60%</span>
            <span className="stat-label">Token Reduction</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-value">Lossless</span>
            <span className="stat-label">Decompression</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-value">Any&nbsp;LLM</span>
            <span className="stat-label">Compatible</span>
          </div>
        </div>
      </header>

      {/* Features */}
      <section id="features" className="features">
        <h2 className="section-title">Why Token Trim?</h2>
        <p className="section-desc">
          LLMs charge per token. Large codebases burn through 150K–1M context
          windows fast. We fix that.
        </p>
        <div className="feature-grid">
          <FeatureCard
            icon={<Scissors size={28} />}
            title="Huffman Compression"
            description="Apply variable‑length encoding to your source files, dramatically shrinking token count while preserving every character."
          />
          <FeatureCard
            icon={<Code2 size={28} />}
            title="Smart Hashing"
            description="Repeated patterns and boilerplate are replaced with compact hash references — the LLM receives a decode map alongside the compressed payload."
          />
          <FeatureCard
            icon={<BrainCircuit size={28} />}
            title="Context‑Aware Chunking"
            description="Intelligent splits at function & class boundaries mean the model never loses semantic coherence."
          />
          <FeatureCard
            icon={<Zap size={28} />}
            title="Drop‑In Integration"
            description="Works with any agent workflow — paste a file and get a compressed version plus a decode prompt you can prepend."
          />
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="how-section">
        <h2 className="section-title">How It Works</h2>
        <div className="steps">
          <Step
            num="01"
            title="Paste or Upload Code"
            description="Drop in any .tsx, .py, .js, or text file. Token Trim reads the raw source."
          />
          <Step
            num="02"
            title="Compress & Hash"
            description="Huffman coding encodes frequent byte patterns. A hash table maps repeated structures to short keys."
          />
          <Step
            num="03"
            title="Send to LLM"
            description="The compressed payload plus a tiny decode preamble is sent to the model — fitting far more context into the same window."
          />
          <Step
            num="04"
            title="Decode on Demand"
            description="Our LLM add-on works as a universal decoder layer — when the model responds, the plugin automatically decompresses the output, giving you clean, readable code without manual intervention."
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
