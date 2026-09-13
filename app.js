'use strict';

const Homey = require('homey');

class HagelschutzApp extends Homey.App {

  async onInit() {
    this.log(`Hagelschutz App v${this.homey.manifest.version} started`);

    // Global unhandled-rejection guard – logs errors without crashing the app
    process.on('unhandledRejection', (reason) => {
      this.error('Unhandled promise rejection:', reason);
    });
  }

}

module.exports = HagelschutzApp;
