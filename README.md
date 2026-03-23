# Hagelschutz – einfach automatisch (Homey App)

Diese Homey-App bindet den Hagelwarn-Service von [hagelschutz-einfach-automatisch.ch](https://www.hagelschutz-einfach-automatisch.ch) per REST API ein und ermöglicht es, bei einer Hagelwarnung automatisch Flows auszulösen – z. B. alle Storen (Jalousien) zu öffnen, damit sie keinen Hagelschaden nehmen.

---

## Voraussetzungen

1. **Registrierung** auf [hagelschutz-einfach-automatisch.ch](https://www.hagelschutz-einfach-automatisch.ch/eigentuemer-verwaltungen/produkt/ich-habe-interesse.html)
2. **Seriennummer** erhalten (wird nach der Registrierung zugestellt)
3. Homey (Pro) mit Internetzugang

---

## Installation

### Option A – Homey CLI (Entwickler)
```bash
npm install -g homey
homey app install
```

### Option B – Homey App Store
_(Sobald die App veröffentlicht ist, direkt im Homey App Store suchen.)_

---

## Gerät hinzufügen

1. Homey App öffnen → **Geräte** → **+**
2. Nach „Hagelschutz" suchen
3. „Hagelwarn-Sensor" hinzufügen
4. Im Gerät unter **Einstellungen** eintragen:
   - **Geräte-ID (deviceId):** 12-stellige Seriennummer / MAC-Adresse der Signalbox
   - **Hardware-Typ-ID (hwtypeId):** Ganzzahliger Wert aus der Registrierungsbestätigung

---

## Flows

### Trigger (auslösende Ereignisse)
| Trigger | Beschreibung |
|---------|-------------|
| **Hagelwarnung ist aktiv** | Wenn `currentState` von 0 auf 1 oder 2 wechselt. Token: `signal` (currentState), `description` |
| **Hagelwarnung aufgehoben** | Wenn `currentState` wieder auf 0 fällt |
| **Signalwert hat sich geändert** | Bei jeder Änderung von `currentState`. Token: `signal` |

### Bedingungen
| Bedingung | Beschreibung |
|-----------|-------------|
| **Hagelwarnung ist [nicht] aktiv** | Prüft ob `currentState != 0` |
| **currentState ist [nicht] X** | Prüft auf einen konkreten Wert (0/1/2) |

### Aktionen
| Aktion | Beschreibung |
|--------|-------------|
| **Hagelstatus jetzt prüfen** | Löst sofort eine API-Abfrage aus |

---

## Empfohlener Flow: Storen bei Hagel öffnen

```
WENN:   Hagelwarnung ist aktiv
DANN:   Flow starten → "Alle Storen öffnen"
```

Rückmeldung wenn Gefahr vorbei:
```
WENN:   Hagelwarnung aufgehoben
DANN:   Push-Benachrichtigung senden
        [Optional] Flow starten → "Alle Storen schliessen"
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
- **Poll-Intervall:** Fest 120 Sekunden (Pflichtanforderung der API-Spezifikation)
- **Responses:** `{ "currentState": 0 | 1 | 2 }`
- Flows werden **nur bei Zustandsänderungen** ausgelöst
- Fehler werden automatisch per POST an den Server gemeldet

---

## Funktionskontrolle (Testalarm)

1. Auf [meteo.netitservices.com](https://meteo.netitservices.com) einloggen
2. **Testalarm** aktivieren → innerhalb von 2 Minuten wird `currentState = 2` zurückgegeben
3. Homey löst den Flow aus → Storen fahren hoch ✓
4. Testalarm deaktivieren → `currentState = 0` → Hagelwarnung aufgehoben ✓
5. Danach **Alarmkette** auf der Website aktivieren

---

## Lizenz

MIT – Dieses Projekt steht in keiner offiziellen Verbindung zu hagelschutz-einfach-automatisch.ch, NetIT-Services GmbH oder der VKF.
