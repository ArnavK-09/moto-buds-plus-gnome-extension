'use strict';

import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ProfileManager} from './lib/profileManager.js';
import {DeviceScanner} from './lib/scanner.js';
import {MotoBudsDevice} from './lib/device.js';
import {PanelIndicator} from './lib/ui/panelButton.js';
import {QuickSettingsIndicator, quickMenuToggleAvailable} from './lib/ui/quickToggle.js';

export default class MotoBudsPlus extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._gIcon = name => Gio.icon_new_for_string(
            `${this.path}/icons/hicolor/scalable/actions/${name}`);
        this._device = null;
        this._indicator = null;
        this._profileManager = new ProfileManager();
        this._scanner = new DeviceScanner();
        this._scanner.connect('device', (_o, path, alias) => this._onDevice(path, alias));
        this._scanner.connect('device-gone', (_o, path) => this._onDeviceGone(path));
        this._scanner.init();

        this._modeId = this._settings.connect('changed::indicator-mode', () => this._rebuildIndicator());
        this._alwaysId = this._settings.connect('changed::show-when-disconnected', () => this._rebuildIndicator());

        if (this._settings.get_boolean('show-when-disconnected'))
            this._rebuildIndicator();
    }

    _onDevice(path, alias) {
        if (this._device) {
            if (this._device.path === path)
                return;
            this._device.destroy();
        }
        this._device = new MotoBudsDevice(this._settings, path, alias, this._profileManager);
        this._rebuildIndicator();
    }

    _onDeviceGone(path) {
        if (!this._device || this._device.path !== path)
            return;
        this._device.destroy();
        this._device = null;
        this._rebuildIndicator();
    }

    _rebuildIndicator() {
        this._destroyIndicator();
        if (this._device || this._settings.get_boolean('show-when-disconnected'))
            this._indicator = this._createIndicator(this._device);
    }

    _destroyIndicator() {
        this._indicator?.destroy();
        this._indicator = null;
    }

    _createIndicator(device) {
        const mode = this._settings.get_string('indicator-mode');
        const openPrefs = () => this.openPreferences();
        if (mode === 'quick-settings' && quickMenuToggleAvailable()) {
            const ind = new QuickSettingsIndicator(this._settings, device, this._gIcon, openPrefs);
            ind.install();
            return ind;
        }
        const compact = mode === 'tray';
        const ind = new PanelIndicator(this._settings, device, this._gIcon, openPrefs, compact);
        Main.panel.addToStatusArea('moto-buds-plus', ind);
        return ind;
    }

    disable() {
        if (this._modeId) {
            this._settings.disconnect(this._modeId);
            this._modeId = 0;
        }
        if (this._alwaysId) {
            this._settings.disconnect(this._alwaysId);
            this._alwaysId = 0;
        }
        this._destroyIndicator();
        this._device?.destroy();
        this._device = null;
        this._scanner?.destroy();
        this._scanner = null;
        this._profileManager?.destroy();
        this._profileManager = null;
        this._settings = null;
    }
}