# Changelog

Alle relevanten Änderungen an diesem Projekt werden hier dokumentiert.

---

## [1.0.8] – 2026-07-01

### Neu
- **App-Store-Tags** in DE/EN/FR hinzugefügt, damit die App im Homey App Store besser gefunden wird (Schlüsselwörter: Hagel, Storen, Jalousien, Wetter, Schweiz u. a.)

### Verbessert
- **README** vollständig überarbeitet:
  - Badges für Version, SDK, Community-Thread und Spende
  - Alle 6 Flow-Trigger, alle 4 Bedingungen und die Aktion vollständig dokumentiert
  - Abfrageintervall als konfigurierbar (120–3600 s) korrigiert
  - Watchdog-Funktion beschrieben
  - Capabilities-Tabelle ergänzt
  - Links-Sektion (GitHub Issues, Community, PayPal) hinzugefügt
  - Dreisprachigkeit der App erwähnt

---

## [1.0.7] – 2025 (vorheriges Release)

### Neu
- Flow-Trigger: `api_error`, `api_recovered`, `poll_overdue`
- Flow-Bedingungen: `is_api_error`, `last_poll_older_than`
- Capability `api_error_state` und `last_poll`
- Watchdog: Trigger „Letzte API-Abfrage überfällig" nach 10 Minuten ohne erfolgreiche Abfrage
- Konfigurierbare Abfrageintervall (120–3600 s) in den Geräteeinstellungen
- Fehler-Reporting per POST an `errorLogs`-Endpunkt

---

## [1.0.6] – frühere Version

### Neu
- Mehrsprachigkeit: Deutsch, Englisch, Französisch
- Flow-Trigger: `hail_warning_active`, `hail_warning_cleared`, `signal_changed`
- Flow-Bedingungen: `is_hail_warning_active`, `signal_level_is`
- Flow-Aktion: `force_poll`
- Capabilities: `alarm_generic`, `hail_state`
- Poll-Intervall 120 s (fest)
