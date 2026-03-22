'use strict';

const Homey = require('homey');

class HagelschutzApp extends Homey.App {

  async onInit() {
    this.log('Hagelschutz App is starting...');

    // Device Flow triggers
    this._triggerHailWarningActive  = this.homey.flow.getDeviceTriggerCard('hail_warning_active');
    this._triggerHailWarningCleared = this.homey.flow.getDeviceTriggerCard('hail_warning_cleared');
    this._triggerSignalChanged      = this.homey.flow.getDeviceTriggerCard('signal_changed');
    this._triggerApiError           = this.homey.flow.getDeviceTriggerCard('api_error');
    this._triggerApiRecovered       = this.homey.flow.getDeviceTriggerCard('api_recovered');

    // Flow conditions
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

    // Flow actions
    this.homey.flow.getActionCard('force_poll')
      .registerRunListener(async (args) => {
        if (args.device && typeof args.device.pollApi === 'function') {
          await args.device.pollApi();
        }
      });

    this.log('Hagelschutz App started successfully');
  }

}

module.exports = HagelschutzApp;
