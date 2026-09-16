# Changelog

Alle relevanten Änderungen an diesem Projekt werden hier dokumentiert.

---

## [1.0.12] – 2026-09-16

### Verbessert
- **App-Beschreibung gekürzt** auf eine Tagline in allen vier Sprachen (Rückmeldung aus dem Athom-Review): der Zusatz „– automatische Warnung via REST API" ist entfallen
- **Store-Beschreibung in Französisch und Italienisch** ergänzt (`README.fr.txt`, `README.it.txt`) – bisher fielen beide Sprachen auf den englischen Text zurück

### Behoben
- `README.txt` und `README.de.txt` warben weiterhin mit „Deutsch, Englisch und Französisch", obwohl Italienisch seit 1.0.11 dazugehört
- **Watchdog** fehlte in der Funktionsliste der Store-Beschreibung

---

## [1.0.11] – 2026-09-16

### Behoben
- **Einrichtung blockierte dauerhaft**: Antwortete der Dienst nicht, blieb die Schaltfläche „Sensor hinzufügen" für immer deaktiviert. Ursache war ein Promise in der Pairing-Validierung, das nie auflöste – die `timeout`-Option von `https.get` bricht die Anfrage nicht ab. Die Prüfung hat jetzt eine harte Zeitgrenze, die Schaltfläche wird bei jedem Ausgang wieder freigegeben
- **Einrichtungsseite war ohne JavaScript unlesbar**: Info-Box, Beschriftungen und Hinweistexte wurden erst per Skript gefüllt – schlug das fehl, blieb nur ein leerer blauer Balken. Der vollständige Text steht jetzt im Markup
- **Hilfeseite zeigte allen Nutzern Deutsch**: `index.html` war eine Kopie von `index.de.html`, und Homey liefert ausschliesslich `index.html` aus – die Sprachvarianten wurden nie verwendet
- **Fehlendes Logging** im `validate`-Handler des Treibers, wodurch eingereichte Logs keinen Aufschluss über Einrichtungsprobleme gaben

### Neu
- **Italienisch** als vierte Sprache – durchgehend: Flow-Karten, Capabilities, Geräteeinstellungen, Benachrichtigungen, Einrichtungsassistent und Hilfeseite
- **Hilfeseite komplett überarbeitet**: iOS-Design mit gruppierten Listen, Segmented Control, aufklappbaren FAQ-Einträgen und vollständigem Dark Mode; alle vier Sprachen in einer Datei mit automatischer Erkennung und manuellem Umschalter

### Verbessert
- Hilfetexte inhaltlich korrigiert: Abfrageintervall als konfigurierbar (120–3600 s) statt „fixiert", Retry-Verhalten dokumentiert, Fehler-Reporting präzisiert (nur beim ersten Fehlschlag)
- Neuer FAQ-Eintrag zur blockierten Einrichtung

---

## [1.0.10] – 2026-09-15

### Behoben
- **Hotfix Retry-Schleife**: Der 30-s-Retry aus 1.0.9 erzeugte bei anhaltenden API-Ausfällen eine endlose Retry-Schleife (alle 30 s statt 120 s), was das API-Mindestintervall verletzte und den `errorLogs`-Endpunkt mit Fehlerberichten überlastete. Retry ist jetzt wirklich einmalig (`isRetry`-Flag); `_reportError()` wird beim Retry nicht mehr aufgerufen.

---

## [1.0.9] – 2026-09-13

### Behoben
- **Spurious Flow-Trigger** nach Änderung des Abfrageintervalls: `_lastState` wird jetzt nur bei Wechsel der Geräte-ID oder hwtypeId zurückgesetzt
- **hwtypeId-Validierung** korrigiert (`== null || isNaN` statt fragiler `!value && value !== 0`-Prüfung)
- **Timer-Leak** bei Einstellungsänderung oder Gerät löschen: `_clearRetryTimer()` wird jetzt in `_stopPolling()` aufgerufen

### Neu
- **Auto-Retry nach API-Fehler**: 30-Sekunden-Retry vor Wiederaufnahme des normalen Intervalls
- **Mehrsprachige Einrichtungsseite** (Pairing UI): DE/EN/FR automatisch aus Homey-Spracheinstellung
- **Spinner und Statusanzeige** während API-Validierung und Gerät-Erstellung in der Pairing UI
- **Globaler Error-Guard** in `app.js` (unhandledRejection-Logging)

### Verbessert
- Force-Poll-Hinweistext: hardcoded „120 Sekunden" entfernt → „konfiguriertes Intervall" (DE/EN/FR)
- App-Version wird beim Start geloggt

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
