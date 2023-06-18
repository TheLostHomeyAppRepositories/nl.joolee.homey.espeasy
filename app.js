'use strict';

const Homey = require('homey');
const ESPEasyUnits = require('./lib/ESPEasyUnits.js');
const Telemetry = require('./lib/Telemetry.js');

class ESPEasy extends Homey.App {

	constructor() {
		if (process.env.DEBUG === '1') {
			try {
				require('inspector').waitForDebugger();
			}
			catch(error) {
				require('inspector').open(9222, '0.0.0.0', true);
				process.stdout.write = () => {}
			}
		}

		super(...arguments);
	}

	onInit() {

		this.triggers = {};
		this.actions = {};
		this.units = new ESPEasyUnits(this);
		this.telemetry = new Telemetry({
			app: this,
			host: 'espeasy.homey.joolee.nl',
			siteId: 2
		});

		this.units.on('unit-initialized', this.unitInitialized.bind(this));
		// When, just before time, number of units is still 0, send that telemetry 
		setTimeout(this.unitInitialized.bind(this), this.telemetry.initialTimeout - 1000);
	}

	onUninit() {
		this.telemetry.send('App', 'Uninit', '/app/uninit', {});
	}

	unitInitialized(unit) {
		if (!this.telemetry.appInitialized && this.units.getAll().length >= this.units.getOnline().length) {
			this.updateTelemetry('Initialized', '/app/initialized', false);
			this.telemetry.appInitialized = true;
		}
	}

	get supportedTasks() {
		if (this._supportedTasks)
			return this._supportedTasks;

		this._supportedTasks = Object.values(this.homey.getDrivers()).flatMap(driver => {
			if (driver.taskTypes)
				return driver.taskTypes.map(type => `${type.plugin} - ${type.name}`);
			else
				return [];
		}).sort((a, b) => a.localeCompare(b, undefined, {
			numeric: true
		}));

		this._supportedTasks.unshift('26 - Generic - System Info');

		return this._supportedTasks;
	}

	getI18nString(i18n) {
		const lang = this.homey.i18n.getLanguage();
		if (i18n[lang])
			return i18n[lang];
		else if (i18n['en'])
			return i18n['en'];
		else
			return `Untranslated string: ${i18n}`;
	}

	safeIncrement(i) {
		// I don't want a crash because of an app that runs too long :)
		if (i++ >= Number.MAX_SAFE_INTEGER - 10) {
			return 0;
		}
		return i;
	}

	// This was a re-implementation of Homeylib.getCapability to include custom capabilities
	// I removed Homeylib alltogether to reduce dependencies
	getCapability(capability) {
		return this.getCapabilities()[capability];
	}

	// This was a re-implementation of Homeylib.getCapabilities to include custom capabilities
	// I removed Homeylib alltogether to reduce dependencies
	// The list in assets/json/allCapabilities.json is generated by tools/create-capabilitylist.sh
	// The data source is still HomeyLib
	// Note: Only properties 'title', 'type', 'getable', 'setable', 'min', 'max' and 'uiComponent' are included
	getCapabilities() {
		const defaultCapabilities = require("/assets/json/allCapabilities.json");
		const customCapabilities = this.manifest["capabilities"];

		return {
			...defaultCapabilities,
			...customCapabilities
		};
	}

	updateTelemetry(reason, url, recurse) {
		try {
			const onlineUnits = this.units.getOnline();
			let metrics = {
				"Total tasks": onlineUnits.reduce((numTasks, unit) => numTasks + unit.tasks.length, 0),
				"Total tasks in use": onlineUnits.reduce((numTasks, unit) => {
					numTasks += unit.sensors.length;
					numTasks += unit.getTasksByName(26, 'Generic - System Info', false).length;
					return numTasks;
				}, 0),
				"Total units": this.units.getAll().length,
				"Total GPIO used": onlineUnits.reduce((numTasks, unit) => numTasks + unit.gpios.length, 0),
			}

			this.telemetry.send('App', reason, url, metrics);
		} catch (error) {
			this.error('Error updating app telemetry:', error);
		}

		if (recurse) {
			this.units.getOnline().forEach(unit => {
				try {
					unit.updateTelemetry(reason, recurse)
				} catch (error) {
					this.error('Error updating unit telemetry:', unit.name, error);
				}
			});
		}
	}
}

module.exports = ESPEasy;
