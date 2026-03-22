'use strict';

const Homey = require('homey');
const https = require('https');

// ─── API Specification (METEO REST API by NetIT-Services / VKF) ───────────────
//
// POLL:
//   GET https://meteo.netitservices.com/api/v1/devices/<deviceId>/poll?hwtypeId=<hwtypeId>
//   deviceId  : 12-character serial number (MAC address of the Signalbox)
//   hwtypeId  : Integer – device type identifier provided at registration
//   Response  : { "currentState": <VAL> }
//               0 = No hail
//               1 = Hail warning
//               2 = Hail state triggered by test-alarm
//   NOTE: Treat 0 as "safe", any non-zero as "hail".
//   NOTE: The forecast is recalculated every 5 minutes.
//         The REQUIRED poll interval is 120 seconds.
//
// ERROR REPORT:
//   POST https://meteo.netitservices.com/api/v1/devices/<deviceId>/errorLogs
//   Body : { "errlog": "<message>" }
//   Header: Content-Type: application/json
// ─────────────────────────────────────────────────────────────────────────────

const API_HOST = 'meteo.netitservices.com';
const API_POLL_PATH = (deviceId, hwtypeId) =>
  `/api/v1/devices/${encodeURIComponent(deviceId)}/poll?hwtypeId=${encodeURIComponent(hwtypeId)}`;
const API_ERROR_PATH = (deviceId) =>
  `/api/v1/devices/${encodeURIComponent(deviceId)}/errorLogs`;

// Required by the API spec: poll every 120 seconds
const REQUIRED_POLL_INTERVAL_MS = 120 * 1000;

class HagelschutzDevice extends Homey.Device {

  async onInit() {
    this.log('HagelschutzDevice initialised:', this.getName());

    // Internal state
    this._lastState = null;   // last currentState value (0 / 1 / 2)
    this._lastApiError = null; // last API error state (true/false)
    this._pollTimer = null;

    // Migrate: ensure capabilities added in later versions exist on older devices
    if (!this.hasCapability('api_error_state')) {
      await this.addCapability('api_error_state').catch(this.error.bind(this));
    }
    if (!this.hasCapability('hail_state')) {
      await this.addCapability('hail_state').catch(this.error.bind(this));
    }

    // Start polling immediately then every 120 s (required by API spec)
    await this._startPolling();
  }

  // ─────────────────────────────────────────────────────────────────
  // Polling  (REQUIRED interval: 120 seconds per API spec)
  // ─────────────────────────────────────────────────────────────────

  async _startPolling() {
    // Initial poll right away
    await this.pollApi();

    // Recurring poll – fixed at 120 s as mandated by the API specification
    this._pollTimer = this.homey.setInterval(async () => {
      await this.pollApi();
    }, REQUIRED_POLL_INTERVAL_MS);

    this.log(`Polling started (interval: ${REQUIRED_POLL_INTERVAL_MS / 1000}s as required by API)`);
  }

  _stopPolling() {
    if (this._pollTimer) {
      this.homey.clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // API – Poll
  // ─────────────────────────────────────────────────────────────────

  async pollApi() {
    const deviceId  = this.getSetting('device_id');
    const hwtypeId  = this.getSetting('hwtype_id');

    if (!deviceId || deviceId.trim() === '') {
      this.log('No deviceId (serial number) configured – skipping poll');
      return;
    }
    if (!hwtypeId && hwtypeId !== 0) {
      this.log('No hwtypeId configured – skipping poll');
      return;
    }

    try {
      const data = await this._httpGet(
        API_HOST,
        API_POLL_PATH(deviceId.trim(), hwtypeId),
      );
      await this._handlePollResponse(data);
    } catch (err) {
      this.error('Error polling API:', err.message);
      await this._reportError(deviceId.trim(), err.message).catch(() => {});
      await this._handleApiError(err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // API – Error reporting  (POST /errorLogs)
  // ─────────────────────────────────────────────────────────────────

  _reportError(deviceId, message) {
    const body = JSON.stringify({ errlog: message });
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: API_HOST,
          path: API_ERROR_PATH(deviceId),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 8000,
        },
        (res) => {
          res.resume(); // drain
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Error-report request timed out')));
      req.write(body);
      req.end();
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Generic HTTPS GET helper
  // ─────────────────────────────────────────────────────────────────

  _httpGet(hostname, path) {
    return new Promise((resolve, reject) => {
      this.log(`GET https://${hostname}${path}`);
      https.get(
        { hostname, path, timeout: 10000 },
        (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            if (res.statusCode !== 200) {
              return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
            }
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(new Error(`Invalid JSON response: ${body.slice(0, 200)}`));
            }
          });
        },
      )
        .on('error', reject)
        .on('timeout', () => reject(new Error('Request timed out')));
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Process poll response
  // ─────────────────────────────────────────────────────────────────

  async _handlePollResponse(data) {
    this.setAvailable().catch(() => {});

    // Clear connectivity alarm on successful response
    await this._clearApiError();

    // API returns { currentState: 0 | 1 | 2 }
    // 0 = no hail  |  1 = hail  |  2 = hail (test alarm)
    // Per spec: treat 0 as safe, any non-zero as hail
    const currentState = Number(data.currentState);
    const isHail       = currentState !== 0;
    const isTestAlarm  = currentState === 2;
    const previousState = this._lastState;

    this.log(`API currentState: ${currentState} | hail: ${isHail} | test: ${isTestAlarm}`);

    // Update capabilities
    // ch.hagelschutz.homey:hail_state holds the raw currentState (0/1/2) for display
    // alarm_generic is true whenever currentState != 0
    await this.setCapabilityValue('hail_state', currentState).catch(this.error.bind(this));
    await this.setCapabilityValue('alarm_generic', isHail).catch(this.error.bind(this));

    // ── Fire Flow triggers only on state changes ──────────────────
    if (previousState === currentState) return; // nothing changed
    this._lastState = currentState;

    // Always fire "signal changed"
    await this.homey.app._triggerSignalChanged
      .trigger(this, { signal: currentState })
      .catch(this.error.bind(this));

    // Hail warning became active (0 → 1 or 0 → 2)
    if (isHail && (previousState === null || previousState === 0)) {
      const description = this._stateDescription(currentState);
      this.log('🌨 Hail warning ACTIVE – triggering Flow');

      await this.homey.app._triggerHailWarningActive
        .trigger(this, { signal: currentState, description })
        .catch(this.error.bind(this));

      await this.homey.notifications.createNotification({
        excerpt: `⚠️ ${this.getName()}: ${description}`,
      }).catch(() => {});
    }

    // Hail warning cleared (1/2 → 0)
    if (!isHail && previousState !== null && previousState !== 0) {
      this.log('✅ Hail warning CLEARED – triggering Flow');

      await this.homey.app._triggerHailWarningCleared
        .trigger(this)
        .catch(this.error.bind(this));

      await this.homey.notifications.createNotification({
        excerpt: `✅ ${this.getName()}: ${this.homey.__('notifications.warning_cleared')}`,
      }).catch(() => {});
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // API connectivity alarm
  // ─────────────────────────────────────────────────────────────────

  async _handleApiError(message) {
    this.setUnavailable(this.homey.__('errors.api_unreachable')).catch(() => {});
    await this.setCapabilityValue('api_error_state', true).catch(this.error.bind(this));

    // Only trigger Flow on first error (not on every repeated failure)
    if (this._lastApiError === true) return;
    this._lastApiError = true;

    this.log('🔴 API error – triggering Flow');
    await this.homey.app._triggerApiError
      .trigger(this, { error: message })
      .catch(this.error.bind(this));

    await this.homey.notifications.createNotification({
      excerpt: `🔴 ${this.getName()}: ${this.homey.__('notifications.api_error')}`,
    }).catch(() => {});
  }

  async _clearApiError() {
    await this.setCapabilityValue('api_error_state', false).catch(this.error.bind(this));

    // Only trigger Flow when recovering from an error
    if (this._lastApiError !== true) return;
    this._lastApiError = false;

    this.log('🟢 API recovered – triggering Flow');
    await this.homey.app._triggerApiRecovered
      .trigger(this)
      .catch(this.error.bind(this));

    await this.homey.notifications.createNotification({
      excerpt: `🟢 ${this.getName()}: ${this.homey.__('notifications.api_recovered')}`,
    }).catch(() => {});
  }

  _stateDescription(state) {
    const map = {
      0: this.homey.__('state.0'),
      1: this.homey.__('state.1'),
      2: this.homey.__('state.2'),
    };
    return map[state] ?? `State ${state}`;
  }

  // ─────────────────────────────────────────────────────────────────
  // Settings changed
  // ─────────────────────────────────────────────────────────────────

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Settings changed:', changedKeys);

    if (
      changedKeys.includes('device_id') ||
      changedKeys.includes('hwtype_id')
    ) {
      this._stopPolling();
      this._lastState = null;
      await this._startPolling();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────

  async onAdded() {
    this.log('HagelschutzDevice added:', this.getName());
  }

  async onDeleted() {
    this.log('HagelschutzDevice deleted:', this.getName());
    this._stopPolling();
  }

}

module.exports = HagelschutzDevice;
