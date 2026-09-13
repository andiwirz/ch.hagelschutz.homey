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

const API_HOST      = 'meteo.netitservices.com';
const API_POLL_PATH = (deviceId, hwtypeId) =>
  `/api/v1/devices/${encodeURIComponent(deviceId)}/poll?hwtypeId=${encodeURIComponent(hwtypeId)}`;
const API_ERROR_PATH = (deviceId) =>
  `/api/v1/devices/${encodeURIComponent(deviceId)}/errorLogs`;

// Required by the API spec: minimum 120 seconds between polls
const MIN_POLL_INTERVAL_MS = 120 * 1000;

// After an API error: retry after this delay before resuming the normal interval
const ERROR_RETRY_DELAY_MS = 30 * 1000;

class HagelschutzDevice extends Homey.Device {

  async onInit() {
    this.log('HagelschutzDevice initialised:', this.getName());

    // Internal state
    this._lastState     = null;
    this._lastApiError  = null;   // null = unknown, true = error, false = ok
    this._lastPollTime  = null;   // timestamp of last successful poll
    this._pollOverdue   = false;  // true once overdue trigger has fired
    this._pollTimer     = null;
    this._watchdogTimer = null;
    this._retryTimer    = null;   // short-retry timer after an API error

    // Migrate: ensure capabilities added in later versions exist on older devices
    if (!this.hasCapability('api_error_state')) {
      await this.addCapability('api_error_state').catch(this.error.bind(this));
    }
    if (!this.hasCapability('hail_state')) {
      await this.addCapability('hail_state').catch(this.error.bind(this));
    }
    if (!this.hasCapability('last_poll')) {
      await this.addCapability('last_poll').catch(this.error.bind(this));
    }

    // Migrate: ensure poll_interval has a valid value on existing devices
    const pollSetting = this.getSetting('poll_interval');
    if (typeof pollSetting !== 'number' || pollSetting < 120) {
      await this.setSettings({ poll_interval: 120 }).catch(this.error.bind(this));
      this.log('poll_interval corrected to 120s');
    }

    await this._startPolling();
  }

  // ─────────────────────────────────────────────────────────────────
  // Polling
  // ─────────────────────────────────────────────────────────────────

  async _startPolling() {
    const raw        = this.getSetting('poll_interval');
    const intervalSec = (typeof raw === 'number' && raw >= 120) ? raw : 120;
    const intervalMs  = intervalSec * 1000;

    // Initial poll right away
    await this.pollApi();

    // Recurring poll
    this._pollTimer = this.homey.setInterval(async () => {
      await this.pollApi();
    }, intervalMs);

    this.log(`Polling started (interval: ${intervalSec}s)`);

    // Watchdog: check every 60 s whether last successful poll is overdue (> 10 min)
    this._watchdogTimer = this.homey.setInterval(() => {
      this._checkPollOverdue();
    }, 60 * 1000);
  }

  _stopPolling() {
    if (this._pollTimer) {
      this.homey.clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._watchdogTimer) {
      this.homey.clearInterval(this._watchdogTimer);
      this._watchdogTimer = null;
    }
    this._clearRetryTimer();
  }

  _clearRetryTimer() {
    if (this._retryTimer) {
      this.homey.clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

  async _checkPollOverdue() {
    const OVERDUE_MS = 10 * 60 * 1000; // 10 minutes
    if (!this._lastPollTime) return;

    const isOverdue = (Date.now() - this._lastPollTime) > OVERDUE_MS;

    if (isOverdue && !this._pollOverdue) {
      this._pollOverdue = true;
      this.log('⚠️ Poll overdue – last successful poll > 10 minutes ago');
      await this.driver._triggerPollOverdue
        .trigger(this)
        .catch(this.error.bind(this));
      await this.homey.notifications.createNotification({
        excerpt: `⚠️ ${this.getName()}: ${this.homey.__('notifications.poll_overdue')}`,
      }).catch(() => {});
    }

    if (!isOverdue && this._pollOverdue) {
      this._pollOverdue = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // API – Poll
  // ─────────────────────────────────────────────────────────────────

  async pollApi() {
    const deviceId = this.getSetting('device_id');
    const hwtypeId = this.getSetting('hwtype_id');

    if (!deviceId || String(deviceId).trim() === '') {
      this.log('No deviceId (serial number) configured – skipping poll');
      return;
    }
    // Fix: use == null to catch both null and undefined; isNaN guards non-numeric values
    if (hwtypeId == null || isNaN(hwtypeId)) {
      this.log('No hwtypeId configured – skipping poll');
      return;
    }

    try {
      const data = await this._httpGet(
        API_HOST,
        API_POLL_PATH(String(deviceId).trim(), hwtypeId),
      );
      this._clearRetryTimer();
      await this._handlePollResponse(data);
    } catch (err) {
      this.error('Error polling API:', err.message);
      await this._reportError(String(deviceId).trim(), err.message).catch(() => {});
      await this._handleApiError(err.message);

      // Retry once after ERROR_RETRY_DELAY_MS; the regular interval continues in parallel
      if (!this._retryTimer) {
        this._retryTimer = this.homey.setTimeout(async () => {
          this._retryTimer = null;
          this.log(`Retrying API poll after ${ERROR_RETRY_DELAY_MS / 1000}s…`);
          await this.pollApi();
        }, ERROR_RETRY_DELAY_MS);
      }
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
          res.resume();
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

    // Record successful poll time
    this._lastPollTime = Date.now();
    this._pollOverdue  = false;

    // Update last poll timestamp using Homey's timezone
    const now = new Date();
    const tz  = this.homey.clock.getTimezone();
    const timestamp = now.toLocaleString('de-CH', {
      timeZone: tz,
      day:    '2-digit',
      month:  '2-digit',
      hour:   '2-digit',
      minute: '2-digit',
    });
    await this.setCapabilityValue('last_poll', timestamp).catch(this.error.bind(this));

    // API returns { currentState: 0 | 1 | 2 }
    // 0 = no hail  |  1 = hail  |  2 = hail (test alarm)
    const currentState  = Number(data.currentState);
    const isHail        = currentState !== 0;
    const previousState = this._lastState;

    this.log(`API currentState: ${currentState} | hail: ${isHail}`);

    // Update capabilities
    await this.setCapabilityValue('hail_state',    currentState).catch(this.error.bind(this));
    await this.setCapabilityValue('alarm_generic',  isHail).catch(this.error.bind(this));

    // ── Fire Flow triggers only on state changes ──────────────────
    if (previousState === currentState) return;
    this._lastState = currentState;

    // Always fire "signal changed"
    await this.driver._triggerSignalChanged
      .trigger(this, { signal: currentState })
      .catch(this.error.bind(this));

    // Hail warning became active (0 → 1 or 0 → 2)
    if (isHail && (previousState === null || previousState === 0)) {
      const description = this._stateDescription(currentState);
      this.log('🌨 Hail warning ACTIVE – triggering Flow');

      await this.driver._triggerHailWarningActive
        .trigger(this, { signal: currentState, description })
        .catch(this.error.bind(this));

      await this.homey.notifications.createNotification({
        excerpt: `⚠️ ${this.getName()}: ${description}`,
      }).catch(() => {});
    }

    // Hail warning cleared (1/2 → 0)
    if (!isHail && previousState !== null && previousState !== 0) {
      this.log('✅ Hail warning CLEARED – triggering Flow');

      await this.driver._triggerHailWarningCleared
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

    // Only trigger Flow on the first error (not on every repeated failure)
    if (this._lastApiError === true) return;
    this._lastApiError = true;

    this.log('🔴 API error – triggering Flow');
    await this.driver._triggerApiError
      .trigger(this, { error: message })
      .catch(this.error.bind(this));

    await this.homey.notifications.createNotification({
      excerpt: `🔴 ${this.getName()}: ${this.homey.__('notifications.api_error')}`,
    }).catch(() => {});
  }

  async _clearApiError() {
    await this.setCapabilityValue('api_error_state', false).catch(this.error.bind(this));

    // Only trigger Flow when recovering from a confirmed error
    if (this._lastApiError !== true) return;
    this._lastApiError = false;

    this.log('🟢 API recovered – triggering Flow');
    await this.driver._triggerApiRecovered
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

  async onSettings({ changedKeys }) {
    this.log('Settings changed:', changedKeys);

    const credentialsChanged = changedKeys.includes('device_id') || changedKeys.includes('hwtype_id');
    const intervalChanged    = changedKeys.includes('poll_interval');

    if (credentialsChanged || intervalChanged) {
      this._stopPolling();

      // Reset known state only when credentials change (new device = fresh start).
      // A poll_interval change keeps the last known state to avoid spurious Flow triggers.
      if (credentialsChanged) {
        this._lastState    = null;
        this._lastApiError = null;
      }

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
