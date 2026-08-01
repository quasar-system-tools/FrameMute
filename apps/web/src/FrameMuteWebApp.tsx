import { useEffect, useState } from "react";
import { FrameMuteEditor } from "@framemute/editor";
import maskedPreviewUrl from "../../../docs/images/multi-face-masking-result.png";
import "./landing.css";

type View = "landing" | "editor";
const markUrl = `${import.meta.env.BASE_URL}framemute-mark.svg`;

function currentView(): View {
  return window.location.hash === "#editor" ? "editor" : "landing";
}

function FrameMuteWebApp() {
  const [view, setView] = useState<View>(currentView);

  useEffect(() => {
    const onHashChange = () => setView(currentView());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return view === "editor" ? <FrameMuteEditor /> : <LandingPage />;
}

function LandingPage() {
  return (
    <main className="landing-shell">
      <header className="landing-header">
        <a className="landing-brand" href="#top" aria-label="FrameMute home">
          <img src={markUrl} alt="" />
          <span>framemute</span>
        </a>
        <nav className="landing-nav" aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">Privacy</a>
          <a className="github-link" href="https://github.com/quasar-system-tools/FrameMute" target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
        </nav>
        <a className="landing-button primary-button small-button" href="#editor">Mask a photo</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Private by design · Local by default</p>
          <h1>Keep the photo.<br />Protect the faces.</h1>
          <p className="hero-lede">
            Find and mask faces without uploading your photo. Everything happens locally on your device.
          </p>
          <div className="hero-actions">
            <a className="landing-button primary-button" href="#editor">Mask a photo <span aria-hidden="true">→</span></a>
            <a className="landing-button secondary-button" href="#how-it-works">See how it works</a>
          </div>
          <p className="hero-note">No account. No upload. You stay in control.</p>
        </div>

        <div className="product-preview" aria-label="FrameMute masking editor preview">
          <div className="preview-toolbar">
            <span className="preview-brand"><img src={markUrl} alt="" /> framemute</span>
            <span className="local-pill"><i /> Processed on this device</span>
            <span className="preview-step">Local editor preview</span>
          </div>
          <div className="preview-body">
            <div className="preview-photo">
              <img src={maskedPreviewUrl} alt="AI-generated group portrait with faces masked locally" />
              <span className="review-marker marker-one">1</span>
              <span className="review-marker marker-two">4</span>
              <span className="review-marker marker-three">7</span>
            </div>
            <div className="preview-panel">
              <span className="preview-kicker">Detected regions</span>
              <strong>10 mask candidates</strong>
              <div className="preview-progress"><span /></div>
              <div className="preview-control"><span>Selected face</span><b>03</b></div>
              <div className="preview-control preview-control-stack">
                <span>Mosaic strength</span>
                <div className="fake-range"><i /></div>
              </div>
              <button type="button" tabIndex={-1}>Open the editor <span>→</span></button>
              <small>Automatic detection always needs human review.</small>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Privacy highlights">
        <article><span>01</span><div><strong>No photo uploads</strong><p>FrameMute does not upload your selected photo.</p></div></article>
        <article><span>02</span><div><strong>Local face detection</strong><p>The detection model runs inside the app.</p></div></article>
        <article><span>03</span><div><strong>Human review built in</strong><p>Check every mask before you save and share.</p></div></article>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">A safer workflow</p>
          <h2>Private in three clear steps.</h2>
          <p>Automatic detection does the repetitive work. You make the final privacy decision.</p>
        </div>
        <div className="steps">
          <article>
            <span className="step-index">01</span>
            <div className="step-visual file-visual"><i /><i /><i /></div>
            <h3>Choose a photo</h3>
            <p>Open a JPG, PNG, or WebP file directly from your device.</p>
          </article>
          <article>
            <span className="step-index">02</span>
            <div className="step-visual face-visual"><i /><i /><i /><i /></div>
            <h3>Review every face</h3>
            <p>Adjust automatic suggestions or draw a missing region yourself.</p>
          </article>
          <article>
            <span className="step-index">03</span>
            <div className="step-visual export-visual"><i>↓</i></div>
            <h3>Save the masked copy</h3>
            <p>Export a new image while your original stays untouched.</p>
          </article>
        </div>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="privacy-mark" aria-hidden="true"><span /></div>
        <div>
          <p className="eyebrow">Your photo. Your device.</p>
          <h2>Your photo stays local.<br />Your choices stay yours.</h2>
        </div>
        <div className="privacy-copy">
          <p>FrameMute has no application backend for your photos. Face detection, editing, and export happen in the active browser or desktop app process.</p>
          <div className="privacy-links">
            <a href="https://github.com/quasar-system-tools/FrameMute/blob/main/docs/privacy.md" target="_blank" rel="noreferrer">Read the privacy details <span>→</span></a>
            <a href="https://github.com/quasar-system-tools/FrameMute" target="_blank" rel="noreferrer">View source on GitHub <span>↗</span></a>
          </div>
        </div>
      </section>

      <section className="closing-cta">
        <div><p className="eyebrow">Ready when you are</p><h2>Share the moment,<br />not someone’s identity.</h2></div>
        <a className="landing-button light-button" href="#editor">Open the private editor <span>→</span></a>
      </section>

      <footer className="landing-footer">
        <a className="landing-brand" href="#top"><img src={markUrl} alt="" /><span>framemute</span></a>
        <a className="footer-source-link" href="https://github.com/quasar-system-tools/FrameMute" target="_blank" rel="noreferrer">Open-source on GitHub <span aria-hidden="true">↗</span></a>
        <p>Early preview · Always review every mask before sharing.</p>
      </footer>
    </main>
  );
}

export default FrameMuteWebApp;
