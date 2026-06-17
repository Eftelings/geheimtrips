import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';

type LegalTab = 'impressum' | 'nutzung' | 'datenschutz' | 'about' | 'notice';

const TABS: { id: LegalTab; label: string }[] = [
  { id: 'impressum',   label: 'Impressum' },
  { id: 'nutzung',     label: 'Nutzungsbedingungen' },
  { id: 'datenschutz', label: 'Datenschutz' },
  { id: 'about',       label: 'Wer sind wir?' },
  { id: 'notice',      label: 'Notice & Takedown' },
];

export function LegalPage() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<LegalTab>((params.get('tab') as LegalTab) ?? 'impressum');

  return (
    <AppShell showBack title="Rechtliches">
      <div className="px-5 pt-4 max-w-2xl mx-auto">
        {/* Tabs */}
        <div className="flex overflow-x-auto gap-2 pb-2 mb-6 scrollbar-none">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-[var(--color-aubergine)] text-white'
                  : 'bg-[var(--color-bg-soft)] text-[var(--color-lavender)]'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="text-[var(--color-body)] pb-16 space-y-4 text-sm leading-relaxed">
          {tab === 'impressum' && <Impressum />}
          {tab === 'nutzung' && <Nutzungsbedingungen />}
          {tab === 'datenschutz' && <Datenschutz />}
          {tab === 'about' && <About />}
          {tab === 'notice' && <NoticeAndTakedown />}
        </div>
      </div>
    </AppShell>
  );
}

// ─── Impressum ───────────────────────────────────────────────────────────────

function Impressum() {
  return (
    <>
      <h2 className="font-display font-bold text-xl text-[var(--color-aubergine)]">Impressum</h2>
      <p className="text-xs text-[var(--color-lavender)] italic">Angaben gemäß § 5 TMG</p>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-1">Betreiber</h3>
        <p>David-Lennart Sturz<br />Danneckerstraße 24<br />10245 Berlin</p>
      </section>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-1">Kontakt</h3>
        <p>Telefon: +49 167 80853745<br />E-Mail: <a href="mailto:david@lennart-sturz.com" className="text-[var(--color-amber)] underline">david@lennart-sturz.com</a></p>
      </section>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-1">Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h3>
        <p>David-Lennart Sturz, Danneckerstraße 24, 10245 Berlin</p>
      </section>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-1">Hinweis Betastatus</h3>
        <p>Geheimtrips.de befindet sich in einer öffentlichen Betaphase. Die Plattform wird als Hobby-Projekt betrieben. Es handelt sich um keine kommerzielle Dienstleistung im Sinne eines gewerblichen Angebots.</p>
      </section>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-1">Haftung für Inhalte</h3>
        <p>Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.</p>
      </section>

      <p className="text-xs text-[var(--color-lavender-lt)] mt-4">
        Meldungen zu rechtswidrigen Inhalten bitte direkt per E-Mail an{' '}
        <a href="mailto:david@lennart-sturz.com" className="underline">david@lennart-sturz.com</a> oder über unsere{' '}
        <button onClick={() => {}} className="text-[var(--color-amber)] underline">Notice-&-Takedown-Seite</button>.
      </p>
    </>
  );
}

// ─── Nutzungsbedingungen ──────────────────────────────────────────────────────

function Nutzungsbedingungen() {
  return (
    <>
      <h2 className="font-display font-bold text-xl text-[var(--color-aubergine)]">Nutzungsbedingungen</h2>
      <p className="text-xs text-[var(--color-lavender)] italic">Stand: Juni 2026 · Gilt ab der Registrierung</p>

      {/* § 1 */}
      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">§ 1 · Plattformstatus und „As-Is"-Klausel</h3>
        <p>Geheimtrips.de wird als <strong>privates Hobby-Projekt in der Testphase (Beta)</strong> betrieben. Mit der Registrierung nimmst du zur Kenntnis:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>Keine Verfügbarkeitsgarantie.</strong> Es besteht kein Anspruch auf ständige Erreichbarkeit der Plattform. Wartungen und Ausfälle sind jederzeit möglich.</li>
          <li><strong>Datenverlust möglich.</strong> Da es sich um eine Betaphase handelt, behält sich der Betreiber das Recht vor, die Datenbank jederzeit zurückzusetzen oder Inhalte zu löschen. Es besteht kein Anspruch auf dauerhafte Speicherung von hochgeladenen Inhalten, Tipps oder Bewertungen.</li>
          <li><strong>Kostenloser Dienst.</strong> Die Plattform wird unentgeltlich bereitgestellt. Ein Anspruch auf bestimmte Funktionen oder Leistungen besteht nicht.</li>
          <li><strong>Änderungen.</strong> Diese Nutzungsbedingungen können jederzeit angepasst werden. Nutzer:innen werden über wesentliche Änderungen per E-Mail informiert.</li>
        </ul>
      </section>

      {/* § 2 */}
      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">§ 2 · Urheberrecht und Nutzerinhalte</h3>
        <p>Alle von Nutzer:innen hochgeladenen Inhalte (Fotos, Videos, Texte, Tipps) unterliegen folgenden Regeln:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>Eigene Inhalte.</strong> Du darfst ausschließlich Inhalte hochladen, an denen du alle erforderlichen Rechte besitzt — insbesondere Fotos und Videos, die du selbst aufgenommen hast.</li>
          <li><strong>Keine Rechtsverletzungen.</strong> Das Hochladen von Bildern, die aus dem Internet entnommen, mit entfernten Wasserzeichen versehen oder anderweitig urheberrechtlich geschützt sind, ist ausdrücklich untersagt.</li>
          <li><strong>Creative-Commons-Lizenz.</strong> Mit dem Hochladen räumst du dem Betreiber eine nicht-exklusive, kostenlose, weltweite Lizenz ein, deine Inhalte auf Geheimtrips.de zu speichern, anzuzeigen und im Rahmen der Plattform zu nutzen. Dein Urheberrecht bleibt vollständig erhalten.</li>
          <li><strong>Bestätigung beim Upload.</strong> Beim Hochladen wirst du explizit bestätigen müssen, dass du die erforderlichen Rechte besitzt.</li>
        </ul>
        <div className="bg-[var(--color-bg-soft)] rounded-xl p-3 mt-3 text-xs">
          <strong>Meldung von Rechtsverletzungen:</strong> Wenn du glaubst, dass auf Geheimtrips.de Inhalte deine Urheberrechte verletzen, nutze bitte unser <Link to="/legal?tab=notice" className="text-[var(--color-amber)] underline">Notice-&-Takedown-Verfahren</Link>. Wir werden gemeldete Verstöße schnellstmöglich prüfen und handeln.
        </div>
      </section>

      {/* § 3 */}
      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">§ 3 · Haftungsausschluss für Ausflugsziele</h3>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs">
          <strong>⚠️ Wichtiger Hinweis:</strong> Das Aufsuchen der auf dieser Plattform beschriebenen Orte geschieht vollständig auf eigene Gefahr.
        </div>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Keine Prüfung durch den Betreiber.</strong> Der Betreiber überprüft keine der auf der Plattform veröffentlichten Orte auf Sicherheit, Zugänglichkeit, Aktualität oder Legalität. Alle Inhalte werden von Nutzer:innen erstellt und spiegeln deren persönliche Erfahrungen wider.</li>
          <li><strong>Eigenverantwortung.</strong> Du bist selbst dafür verantwortlich, vor dem Besuch eines Ortes die rechtliche Zugänglichkeit, Sicherheitslage und aktuelle Bedingungen zu prüfen. Dazu gehören insbesondere: Betretungsverbote, Naturschutzgebiete, Privatgelände und temporäre Sperrungen.</li>
          <li><strong>Keine Gewähr für Richtigkeit.</strong> Der Betreiber übernimmt keine Gewähr für die Vollständigkeit, Richtigkeit oder Aktualität der Tipps. Beschreibungen können veraltet oder unvollständig sein.</li>
          <li><strong>Keine Haftung für Schäden.</strong> Der Betreiber haftet nicht für Schäden, die durch das Aufsuchen oder Betreten von auf der Plattform beschriebenen Orten entstehen — weder für Personen- noch für Sachschäden.</li>
          <li><strong>Pflicht der Nutzer:innen.</strong> Es ist untersagt, Orte einzureichen, deren Betreten illegal ist (z.B. eingezäunte Lost Places, gesperrte Naturschutzzonen, Privatgelände ohne Erlaubnis). Entsprechende Einreichungen werden gelöscht und können zur Sperrung des Kontos führen.</li>
        </ul>
      </section>

      {/* § 4 */}
      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">§ 4 · Moderation und Hausrecht</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Löschrecht.</strong> Der Betreiber behält sich das Recht vor, Beiträge, Fotos, Videos oder ganze Ausflugstipps jederzeit und ohne Angabe von Gründen zu löschen, zu bearbeiten oder zu sperren.</li>
          <li><strong>Kontosperrung.</strong> Bei Verstößen gegen diese Nutzungsbedingungen — insbesondere beim Hochladen von geschützten Inhalten ohne Berechtigung, beleidigenden Texten oder der Bewerbung illegaler Aktivitäten — kann das Konto sofort und ohne Vorwarnung gesperrt werden.</li>
          <li><strong>Kein Anspruch auf Fortbestand.</strong> Es besteht kein Anspruch darauf, dass ein gespeicherter Inhalt dauerhaft auf der Plattform verbleibt.</li>
        </ul>
      </section>

      {/* § 5 */}
      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">§ 5 · Datenschutz</h3>
        <p>Informationen darüber, wie wir deine E-Mail-Adresse, Passwörter und andere personenbezogene Daten verarbeiten, findest du in unserer{' '}
          <Link to="/legal?tab=datenschutz" className="text-[var(--color-amber)] underline">Datenschutzerklärung</Link>.
        </p>
      </section>

      {/* § 6 */}
      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">§ 6 · Anwendbares Recht</h3>
        <p>Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Gerichtsstand ist, soweit gesetzlich zulässig, Berlin.</p>
      </section>
    </>
  );
}

// ─── Datenschutz ─────────────────────────────────────────────────────────────

function Datenschutz() {
  return (
    <>
      <h2 className="font-display font-bold text-xl text-[var(--color-aubergine)]">Datenschutzerklärung</h2>
      <p className="text-xs text-[var(--color-lavender)] italic">Stand: Juni 2026 · Gemäß DSGVO / GDPR</p>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">Verantwortlicher</h3>
        <p>David-Lennart Sturz, Danneckerstraße 24, 10245 Berlin<br />
        E-Mail: <a href="mailto:david@lennart-sturz.com" className="text-[var(--color-amber)] underline">david@lennart-sturz.com</a></p>
      </section>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">Welche Daten wir erheben</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Pflichtangaben bei Registrierung:</strong> E-Mail-Adresse, Passwort (verschlüsselt gespeichert, nie im Klartext), gewählter Benutzername</li>
          <li><strong>Freiwillige Profilangaben:</strong> Name, Biografie, Instagram/TikTok-Handle, Website</li>
          <li><strong>Aktivitätsdaten:</strong> Gespeicherte Orte, besuchte Orte (mit GPS-Verifikation), Bewertungen, erstellte Trips</li>
          <li><strong>Hochgeladene Medien:</strong> Fotos und Videos, die du bewusst hochlädst</li>
          <li><strong>Technische Daten:</strong> Cookie für die Login-Session (JWT-Token, 30 Tage Laufzeit)</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">Zweck der Verarbeitung</h3>
        <p>Deine Daten werden ausschließlich zur Bereitstellung der Plattformfunktionen genutzt. Eine Weitergabe an Dritte findet nicht statt.</p>
      </section>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">Externe Dienste</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>OpenStreetMap / Nominatim:</strong> GPS-Reverse-Geocoding (keine personenbezogenen Daten übertragen)</li>
          <li><strong>Open-Meteo:</strong> Wetterdaten anhand von Ortskoordinaten (keine personenbezogenen Daten übertragen)</li>
          <li><strong>Unsplash:</strong> Platzhalterbilder werden von unsplash.com geladen</li>
          <li><strong>Google Fonts:</strong> Schriftarten werden von Google-Servern geladen; dabei kann Google deine IP-Adresse erfassen</li>
          <li><strong>Cloudflare CDN / Font Awesome:</strong> Icon-Schrift; IP-basiertes Logging möglich</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">Deine Rechte</h3>
        <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung und Datenübertragbarkeit. Schreib uns dafür an{' '}
          <a href="mailto:david@lennart-sturz.com" className="text-[var(--color-amber)] underline">david@lennart-sturz.com</a>.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">Cookies</h3>
        <p>Wir setzen ausschließlich technisch notwendige Cookies (Login-Session). Optionale Cookies (Funktional, Analyse) werden erst nach deiner Einwilligung über den Cookie-Banner gesetzt.</p>
      </section>
    </>
  );
}

// ─── Wer sind wir ─────────────────────────────────────────────────────────────

function About() {
  return (
    <>
      <h2 className="font-display font-bold text-xl text-[var(--color-aubergine)]">Wer sind wir?</h2>
      <p>Geheimtrips.de wurde von <strong>David-Lennart Sturz</strong> gegründet — mit der Überzeugung, dass die besten Orte tatsächlich in keinem Reiseführer stehen.</p>
      <p>Die Idee: Eine Community von echten Entdecker:innen, die ihre Geheimtipps teilen — und eine App, die dir hilft, deinen nächsten Kurztrip in 10 Fragen zu planen.</p>
      <p>Geheimtrips.de ist ein <strong>privates Hobby-Projekt in der Betaphase</strong>. Feedback und Vorschläge sind herzlich willkommen: <a href="mailto:david@lennart-sturz.com" className="text-[var(--color-amber)] underline">david@lennart-sturz.com</a></p>
    </>
  );
}

// ─── Notice & Takedown ────────────────────────────────────────────────────────

function NoticeAndTakedown() {
  return (
    <>
      <h2 className="font-display font-bold text-xl text-[var(--color-aubergine)]">Notice & Takedown</h2>
      <p className="text-xs text-[var(--color-lavender)] italic">Meldeverfahren für rechtsverletzende Inhalte gemäß § 10 TMG</p>

      <div className="bg-[var(--color-bg-soft)] rounded-2xl p-4 border-l-4 border-[var(--color-amber)]">
        <p className="font-semibold text-[var(--color-aubergine)] mb-1">Schnellmeldung</p>
        <p className="text-xs text-[var(--color-lavender)] mb-2">Für dringende Fälle (z.B. eindeutige Urheberrechtsverletzungen): direkt per E-Mail mit dem Betreff „TAKEDOWN" an:</p>
        <a href="mailto:david@lennart-sturz.com?subject=TAKEDOWN%20-%20Rechtsverletzung%20auf%20Geheimtrips.de"
          className="inline-flex items-center gap-2 bg-[var(--color-amber)] text-white font-bold px-4 py-2 rounded-full text-sm shadow-[var(--shadow-amber)]">
          <i className="fa-solid fa-envelope" />
          TAKEDOWN melden
        </a>
      </div>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">Unser Verfahren</h3>
        <p>Geheimtrips.de nimmt Hinweise auf rechtsverletzende Inhalte ernst. Wir handeln nach dem Notice-&-Takedown-Verfahren gemäß § 10 TMG:</p>
        <ol className="list-decimal pl-5 mt-2 space-y-2">
          <li><strong>Meldung einreichen</strong> — Sende deine Meldung per E-Mail an <a href="mailto:david@lennart-sturz.com" className="text-[var(--color-amber)] underline">david@lennart-sturz.com</a> mit dem Betreff „TAKEDOWN".</li>
          <li><strong>Prüfung</strong> — Wir prüfen deine Meldung in der Regel innerhalb von <strong>2–5 Werktagen</strong>.</li>
          <li><strong>Maßnahme</strong> — Bei bestätigten Rechtsverletzungen wird der Inhalt unverzüglich entfernt. Du erhältst eine Bestätigung per E-Mail.</li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">Was deine Meldung enthalten sollte</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Dein Name und deine Kontaktdaten</li>
          <li>Eine genaue Beschreibung des beanstandeten Inhalts (z.B. Link zur Seite, URL des Bildes)</li>
          <li>Dein Recht an dem Inhalt (z.B. du bist der Urheber des Fotos)</li>
          <li>Eine Erklärung, dass der Inhalt ohne deine Erlaubnis verwendet wird</li>
          <li>Eine eidesstattliche Erklärung, dass deine Angaben wahrheitsgemäß sind</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-[var(--color-aubergine)] mb-2">Arten von Verstößen</h3>
        <div className="grid grid-cols-1 gap-2 mt-2">
          {[
            { icon: 'fa-camera', label: 'Urheberrechtsverletzung', desc: 'Fotos oder Videos, die ohne Erlaubnis hochgeladen wurden' },
            { icon: 'fa-shield-halved', label: 'Persönlichkeitsrechtsverletzung', desc: 'Fotos von Personen ohne deren Einwilligung' },
            { icon: 'fa-triangle-exclamation', label: 'Illegale Inhalte', desc: 'Inhalte, die gegen deutsches Recht verstoßen' },
            { icon: 'fa-location-dot', label: 'Gefährliche Orte', desc: 'Orte, die aktiv Sicherheitsrisiken darstellen' },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3 bg-white p-3 rounded-xl shadow-[var(--shadow-card)]">
              <i className={`fa-solid ${item.icon} text-[var(--color-amber)] mt-0.5 w-4 text-center`} />
              <div>
                <div className="font-semibold text-xs text-[var(--color-aubergine)]">{item.label}</div>
                <div className="text-xs text-[var(--color-lavender)]">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--color-bg-soft)] pt-4">
        <p className="text-xs text-[var(--color-lavender-lt)]">
          Missbrauch des Meldeverfahrens (z.B. ungerechtfertigte Meldungen in Wettbewerbsabsicht) kann rechtliche Konsequenzen haben.
          Bei Fragen: <a href="mailto:david@lennart-sturz.com" className="underline">david@lennart-sturz.com</a>
        </p>
      </section>
    </>
  );
}
