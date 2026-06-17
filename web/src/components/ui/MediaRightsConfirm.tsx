/**
 * Rechte-Bestätigung für Bild/Video-Uploads.
 * Muss vor dem tatsächlichen Upload bestätigt werden.
 * Entspricht dem CC BY 4.0 / „eigene Rechte"-Standard wie bei Google Maps / Wikipedia.
 */

interface Props {
  confirmed: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}

export function MediaRightsConfirm({ confirmed, onChange, className = '' }: Props) {
  return (
    <div className={`rounded-2xl border-2 transition-colors p-4 ${confirmed ? 'border-[var(--color-success)] bg-[#f0faf4]' : 'border-[var(--color-bg-soft)] bg-white'} ${className}`}>
      <label className="flex items-start gap-3 cursor-pointer">
        <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${confirmed ? 'bg-[var(--color-success)] border-[var(--color-success)]' : 'border-[var(--color-lavender-lt)]'}`}
          onClick={() => onChange(!confirmed)}>
          {confirmed && <i className="fa-solid fa-check text-white text-[10px]" />}
        </div>
        <div>
          <p className="font-semibold text-sm text-[var(--color-aubergine)] mb-1">
            Ich bestätige meine Rechte an diesen Inhalten
          </p>
          <ul className="text-xs text-[var(--color-lavender)] space-y-1">
            <li className="flex items-start gap-1.5">
              <i className="fa-solid fa-circle-dot text-[var(--color-amber)] text-[9px] mt-1 flex-shrink-0" />
              Ich habe diese Fotos/Videos <strong>selbst aufgenommen</strong> oder besitze alle erforderlichen Rechte.
            </li>
            <li className="flex items-start gap-1.5">
              <i className="fa-solid fa-circle-dot text-[var(--color-amber)] text-[9px] mt-1 flex-shrink-0" />
              Die Inhalte wurden <strong>nicht aus dem Internet kopiert</strong> und enthalten keine entfernten Wasserzeichen.
            </li>
            <li className="flex items-start gap-1.5">
              <i className="fa-solid fa-circle-dot text-[var(--color-amber)] text-[9px] mt-1 flex-shrink-0" />
              Ich räume Geheimtrips.de das <strong>Recht zur Anzeige und Speicherung</strong> ein (mein Urheberrecht bleibt erhalten).
            </li>
            <li className="flex items-start gap-1.5">
              <i className="fa-solid fa-circle-dot text-[var(--color-amber)] text-[9px] mt-1 flex-shrink-0" />
              Auf Fotos <strong>abgebildete Personen</strong> haben ihrer Darstellung zugestimmt.
            </li>
          </ul>
        </div>
      </label>
      {!confirmed && (
        <p className="text-[10px] text-[var(--color-lavender-lt)] mt-2 pl-8">
          Bitte bestätige deine Rechte, um den Upload abzuschließen.
        </p>
      )}
    </div>
  );
}
