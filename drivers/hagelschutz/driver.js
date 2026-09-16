'use strict';

const Homey = require('homey');
const https = require('https');

// Socket idle timeout for the pairing validation request
const SOCKET_TIMEOUT_MS = 10 * 1000;

// Hard upper bound – the validation promise always settles within this window
const VALIDATE_TIMEOUT_MS = 12 * 1000;

class HagelschutzDriver extends Homey.Driver {

  async onInit() {
    this.log('HagelschutzDriver initialised');

    // Register Device Flow triggers
    this._triggerHailWarningActive  = this.homey.flow.getDeviceTriggerCard('hail_warning_active');
    this._triggerHailWarningCleared = this.homey.flow.getDeviceTriggerCard('hail_warning_cleared');
    this._triggerSignalChanged      = this.homey.flow.getDeviceTriggerCard('signal_changed');
    this._triggerApiError           = this.homey.flow.getDeviceTriggerCard('api_error');
    this._triggerApiRecovered       = this.homey.flow.getDeviceTriggerCard('api_recovered');
    this._triggerPollOverdue        = this.homey.flow.getDeviceTriggerCard('poll_overdue');

    // Register Flow conditions
    this.homey.flow.getConditionCard('is_hail_warning_active')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('alarm_generic') === true;
      });

    this.homey.flow.getConditionCard('signal_level_is')
      .registerRunListener(async (args) => {
        const current = args.device.getCapabilityValue('hail_state');
        return current === args.level;
      });

    this.homey.flow.getConditionCard('is_api_error')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('api_error_state') === true;
      });

    this.homey.flow.getConditionCard('last_poll_older_than')
      .registerRunListener(async (args) => {
        const lastPoll = args.device._lastPollTime;
        if (!lastPoll) return true;
        return (Date.now() - lastPoll) > args.minutes * 60 * 1000;
      });

    // Register Flow actions
    this.homey.flow.getActionCard('force_poll')
      .registerRunListener(async (args) => {
        if (args.device && typeof args.device.pollApi === 'function') {
          await args.device.pollApi();
        }
      });
  }

  async onPair(session) {
    session.setHandler('validate', async ({ device_id, hwtype_id }) => {
      this.log(`Pair: validating credentials (hwtypeId=${hwtype_id})…`);
      const result = await this._validateCredentials(device_id, hwtype_id);
      this.log('Pair: validation result:', JSON.stringify(result));
      return result;
    });
  }

  /**
   * Verifies the given credentials against the poll endpoint.
   *
   * Always resolves – never rejects and never stays pending. A hung socket
   * (DNS stall, TLS handshake stall, black-holed connection) would otherwise
   * leave the pairing page waiting forever with a disabled button.
   */
  _validateCredentials(deviceId, hwtypeId) {
    const host = 'meteo.netitservices.com';
    const path = `/api/v1/devices/${encodeURIComponent(deviceId)}/poll?hwtypeId=${encodeURIComponent(hwtypeId)}`;

    return new Promise((resolve) => {
      let settled = false;
      let guard   = null;

      const done = (value) => {
        if (settled) return;
        settled = true;
        if (guard) this.homey.clearTimeout(guard);
        resolve(value);
      };

      const req = https.get({ hostname: host, path, timeout: SOCKET_TIMEOUT_MS }, (res) => {
        res.resume(); // drain so the socket can be released
        done({ success: res.statusCode === 200, statusCode: res.statusCode });
      });

      req.on('error', (err) => done({ success: false, error: err.message }));
      req.on('timeout', () => {
        req.destroy(); // 'timeout' alone does NOT abort the request
        done({ success: false, error: 'socket timeout' });
      });

      // Hard guard: resolve even if no socket event ever fires
      guard = this.homey.setTimeout(() => {
        req.destroy();
        done({ success: false, error: 'validation timed out' });
      }, VALIDATE_TIMEOUT_MS);
    });
  }

  async onPairListDevices() {
    return [
      {
        name: this.homey.__('pair.device_name'),
        data: {
          id: `hagelschutz-${Date.now()}`,
        },
        settings: {
          device_id: '',
          hwtype_id: 1,
          poll_interval: 120,
        },
      },
    ];
  }

}

module.exports = HagelschutzDriver;
