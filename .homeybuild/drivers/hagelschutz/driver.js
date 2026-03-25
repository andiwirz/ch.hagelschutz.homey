'use strict';

const Homey = require('homey');

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
      const https = require('https');
      const host  = 'meteo.netitservices.com';
      const path  = `/api/v1/devices/${encodeURIComponent(device_id)}/poll?hwtypeId=${encodeURIComponent(hwtype_id)}`;

      return new Promise((resolve) => {
        https.get({ hostname: host, path, timeout: 10000 }, (res) => {
          resolve({ success: res.statusCode === 200 });
          res.resume();
        })
          .on('error', () => resolve({ success: false }))
          .on('timeout', () => resolve({ success: false }));
      });
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
