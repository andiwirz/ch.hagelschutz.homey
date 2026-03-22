'use strict';

const Homey = require('homey');

class HagelschutzDriver extends Homey.Driver {

  async onInit() {
    this.log('HagelschutzDriver initialised');
  }

  // Manual pairing: user enters serial number in settings after adding device
  async onPairListDevices() {
    return [
      {
        name: this.homey.__('pair.device_name'),
        data: {
          id: `hagelschutz-${Date.now()}`,
        },
        settings: {
          serial_number: '',
          poll_interval: 5,
        },
      },
    ];
  }

}

module.exports = HagelschutzDriver;
