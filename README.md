# Hagelschutz – einfach automatisch (Homey App)

[![Homey App Store](https://img.shields.io/badge/Homey%20App%20Store-installieren-1b5e8c)](https://homey.app/a/ch.hagelschutz.homey/)
[![Version](https://img.shields.io/badge/version-1.0.12-blue)](https://github.com/andiwirz/ch.hagelschutz.homey/releases)
[![Homey SDK](https://img.shields.io/badge/Homey%20SDK-v3-green)](https://apps.developer.homey.app/)
[![Community](https://img.shields.io/badge/Homey%20Community-Thread-orange)](https://community.homey.app/t/152992)
[![Sprachen](https://img.shields.io/badge/Sprachen-DE%20%7C%20EN%20%7C%20FR%20%7C%20IT-lightgrey)](#)
[![Donate](https://img.shields.io/badge/Donate-PayPal-blue)](https://paypal.me/AndiWirz)

Diese Homey-App bindet den Hagelwarn-Service von [hagelschutz-einfach-automatisch.ch](https://www.hagelschutz-einfach-automatisch.ch) per REST API ein und ermöglicht es, bei einer Hagelwarnung automatisch Flows auszulösen – z. B. alle Storen (Jalousien) zu öffnen, damit sie keinen Hagelschaden nehmen.

Die App ist vollständig auf **Deutsch**, **Englisch**, **Französisch** und **Italienisch** verfügbar – inklusive Flow-Karten, Geräteeinstellungen und Einrichtungsassistent.

---

## Voraussetzungen

1. **Registrierung** auf [hagelschutz-einfach-automatisch.ch](https://www.hagelschutz-einfach-automatisch.ch/eigentuemer-verwaltungen/produkt/ich-habe-interesse.html)
2. **Seriennummer** erhalten (wird nach der Registrierung zugestellt)
3. Homey (Pro) mit Internetzugang

---

## Installation

### Option A – Homey App Store (empfohlen)

Die App ist im Homey App Store veröffentlicht:

**[→ Hagelschutz Schweiz installieren](https://homey.app/a/ch.hagelschutz.homey/)**

Alternativ in der Homey App unter **Mehr → Apps** nach „Hagelschutz Schweiz" suchen.

### Option B – Homey CLI (Entwickler)
```bash
npm install -g homey
homey app install
```

---

## Gerät hinzufügen

1. Homey App öffnen → **Geräte** → **+**
2. Nach „Hagelschutz Schweiz" suchen
3. „Hagelwarn-Sensor" wählen – der Einrichtungsassistent öffnet sich
4. Dort eintragen:
   - **Geräte-ID (deviceId):** 12-stellige Seriennummer / MAC-Adresse der Signalbox
   - **Hardware-Typ-ID (hwtypeId):** Ganzzahliger Wert aus der Registrierungsbestätigung
   - **Abfrageintervall:** 120–3600 Sekunden (Standard: 120 s, Minimum laut API-Spezifikation)
5. **Sensor hinzufügen** – die Angaben werden gegen die API geprüft, bevor das Gerät angelegt wird

Alle drei Werte lassen sich später jederzeit unter **Geräteeinstellungen** ändern. Nach einer Änderung startet die Abfrage automatisch neu.

---

## Flows

### Trigger (auslösende Ereignisse)

| Trigger | Beschreibung | Token(s) |
|---------|-------------|----------|
| **Hagelwarnung ist aktiv** | `currentState` wechselt von 0 auf 1 oder 2 | `signal` (currentState), `description` |
| **Hagelwarnung aufgehoben** | `currentState` kehrt zu 0 zurück | – |
| **Signalwert hat sich geändert** | Bei jeder Änderung von `currentState` | `signal` (neuer currentState) |
| **API-Verbindung fehlgeschlagen** | API gibt kein HTTP 200 zurück oder Timeout | `error` (Fehlermeldung) |
| **API-Verbindung wiederhergestellt** | API antwortet nach einem Fehler wieder erfolgreich | – |
| **Letzte API-Abfrage überfällig** | Keine erfolgreiche API-Abfrage seit mehr als 10 Minuten | – |

### Bedingungen

| Bedingung | Beschreibung |
|-----------|-------------|
| **Hagelwarnung ist [nicht] aktiv** | Prüft ob `currentState != 0` |
| **currentState ist [nicht] X** | Prüft auf einen konkreten Wert (0/1/2) |
| **API-Verbindung [ist fehlgeschlagen / funktioniert]** | Prüft ob der letzte API-Aufruf fehlgeschlagen ist |
| **Letzte API-Abfrage [ist / ist nicht] älter als X Minuten** | Prüft, wie lange die letzte erfolgreiche Abfrage zurückliegt (1–60 Min.) |

### Aktionen

| Aktion | Beschreibung |
|--------|-------------|
| **Hagelstatus jetzt prüfen** | Löst sofort eine API-Abfrage aus, ohne das konfigurierte Intervall abzuwarten |

---

## Empfohlene Flows

### Storen bei Hagel öffnen
```
WENN:   Hagelwarnung ist aktiv
DANN:   Flow starten → "Alle Storen öffnen"
```

### Rückmeldung wenn Gefahr vorbei
```
WENN:   Hagelwarnung aufgehoben
DANN:   Push-Benachrichtigung senden
        [Optional] Flow starten → "Alle Storen schliessen"
```

### Bei API-Problemen benachrichtigen
```
WENN:   Letzte API-Abfrage überfällig
DANN:   Push-Benachrichtigung senden → "Hagelschutz API nicht erreichbar!"
```

---

## API-Werte (currentState)

| Wert | Bedeutung |
|------|-----------|
| `0` | Kein Hagel |
| `1` | Hagelwarnung aktiv |
| `2` | Hagelwarnung aktiv (Testalarm) |

> Per API-Spezifikation soll `0` als „sicher" und alle Nicht-Null-Werte als „Hagel" behandelt werden.

---

## Technische Details

- **API-Dokumentation:** [API-Spezifikation PDF](https://www.hagelschutz-einfach-automatisch.ch/files/media/hagelschutz-einfach-automatisch/hagelschutz-einfach-automatisch-anleitung-schnittstelle-api.pdf)
- **API-Endpunkt:** `GET https://meteo.netitservices.com/api/v1/devices/<deviceId>/poll?hwtypeId=<hwtypeId>`
- **Fehler-Reporting:** `POST https://meteo.netitservices.com/api/v1/devices/<deviceId>/errorLogs`
- **Poll-Intervall:** 120–3600 Sekunden, konfigurierbar in den Geräteeinstellungen (Minimum 120 s, Pflichtanforderung der API-Spezifikation)
- **Responses:** `{ "currentState": 0 | 1 | 2 }`
- Flows werden **nur bei Zustandsänderungen** ausgelöst
- Schlägt eine Abfrage fehl, wird sie **einmalig nach 30 Sekunden** wiederholt; danach gilt wieder das normale Intervall
- Fehler werden per POST an den Server gemeldet – **nur beim ersten Fehlschlag**, nicht bei jedem Wiederholungsversuch
- Ein **Watchdog** erkennt, wenn keine erfolgreiche Abfrage stattgefunden hat, und löst den Trigger „Letzte API-Abfrage überfällig" nach 10 Minuten aus

### Capabilities (Gerätekarten)

| Capability | Typ | Beschreibung |
|-----------|-----|-------------|
| `alarm_generic` | boolean | Hagelwarnung aktiv (true/false) |
| `hail_state` | number | Rohwert des API-Signals (0/1/2) |
| `api_error_state` | boolean | Letzter API-Aufruf fehlgeschlagen |
| `last_poll` | string | Zeitstempel der letzten erfolgreichen API-Abfrage |

---

## Funktionskontrolle (Testalarm)

1. Auf [meteo.netitservices.com](https://meteo.netitservices.com) einloggen
2. **Testalarm** aktivieren → bei der nächsten Abfrage wird `currentState = 2` zurückgegeben
3. Homey löst den Flow aus → Storen fahren hoch ✓
4. Testalarm deaktivieren → `currentState = 0` → Hagelwarnung aufgehoben ✓
5. Danach **Alarmkette** auf der Website aktivieren

> Wer nicht bis zur nächsten planmässigen Abfrage warten möchte, nutzt die Flow-Aktion **„Hagelstatus jetzt prüfen"** für eine sofortige Abfrage.

---

## Hilfe in der App

Die App bringt eine eigene Hilfeseite mit – in der Homey App unter **Mehr → Apps → Hagelschutz Schweiz → Konfigurieren**. Sie ist in fünf Bereiche gegliedert (App, Sensoren, Flows, Einstellungen, FAQ), passt sich automatisch der Homey-Sprache an und unterstützt Hell- und Dunkelmodus.

---

## Links

- 🛒 **Homey App Store:** [Hagelschutz Schweiz](https://homey.app/a/ch.hagelschutz.homey/)
- 📋 **Changelog:** [CHANGELOG.md](CHANGELOG.md)
- 🐛 **Bug melden:** [GitHub Issues](https://github.com/andiwirz/ch.hagelschutz.homey/issues)
- 💬 **Community:** [Homey Community Thread #152992](https://community.homey.app/t/152992)
- ☕ **Spende:** [PayPal](https://paypal.me/AndiWirz)

---

## Lizenz

MIT – Dieses Projekt steht in keiner offiziellen Verbindung zu hagelschutz-einfach-automatisch.ch, NetIT-Services GmbH oder der VKF.
