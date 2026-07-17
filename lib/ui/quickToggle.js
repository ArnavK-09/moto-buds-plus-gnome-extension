'use strict';

import GObject from 'gi://GObject';
import St from 'gi://St';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DevicePopup} from './popup.js';

export function quickMenuToggleAvailable() {
    return QuickSettings.QuickMenuToggle !== undefined;
}

export const QuickSettingsIndicator = GObject.registerClass({
    GTypeName: 'MotoBudsPlus_QuickSettingsIndicator',
}, class QuickSettingsIndicator extends GObject.Object {
    _init(settings, device, gIcon, onOpenPrefs) {
        super._init();
        this._settings = settings;
        this._device = device;
        this._gIcon = gIcon;

        this._toggle = new QuickSettings.QuickMenuToggle({
            title: 'Moto Buds+',
            toggleMode: false,
            gicon: gIcon('bbm-earbuds-symbolic.svg'),
        });
        this._popup = new DevicePopup(this._toggle.menu, device, settings, gIcon, onOpenPrefs, 'quick-settings');
        if (device)
            this._device.connectObject('changed', () => this._update(), this);
        this._update();
    }

    _batteryText(s) {
        const l = s.battery.left?.reported ? s.battery.left.level : null;
        const r = s.battery.right?.reported ? s.battery.right.level : null;
        if (l != null && r != null)
            return `L ${l}% - R ${r}%`;
        if (l != null)
            return `L ${l}%`;
        if (r != null)
            return `R ${r}%`;
        return '';
    }

    _update() {
        const icon = this._gIcon('bbm-earbuds-symbolic.svg');
        if (!this._device) {
            this._toggle.title = 'Moto Buds+';
            this._toggle.subtitle = 'Not connected';
            this._toggle.checked = false;
            this._toggle.menu.setHeader(icon, 'Moto Buds+', 'Not connected');
            return;
        }
        const s = this._device.state;
        this._toggle.title = s.alias || 'Moto Buds+';
        let subtitle;
        if (s.connected) {
            const b = this._batteryText(s);
            subtitle = b || 'Connected';
        } else {
            subtitle = 'Not connected';
        }
        this._toggle.subtitle = subtitle;
        this._toggle.checked = s.connected;
        this._toggle.menu.setHeader(icon, s.alias || 'Moto Buds+', subtitle);
    }

    install() {
        this._container = new St.BoxLayout();
        this._container.quickSettingsItems = [this._toggle];
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._container);
    }

    destroy() {
        this._device?.disconnectObject(this);
        this._popup?.destroy();
        this._popup = null;
        this._toggle?.destroy();
        this._toggle = null;
        this._container?.destroy();
        this._container = null;
    }
});