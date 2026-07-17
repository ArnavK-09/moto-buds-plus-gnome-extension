'use strict';

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Log from './logger.js';
import {MotoBudsSocket} from './socket.js';
import {
    ANC, PRESET, PRESET_BANDS, PRESET_ID_BY_NAME, PRESET_NAME_BY_ID, EQ_RANGE,
    TOGGLES, presetForBands,
} from './config.js';

const TOGGLE_KEYS = TOGGLES.map(t => t.key);

export const MotoBudsDevice = GObject.registerClass({
    GTypeName: 'MotoBudsPlus_Device',
    Signals: {
        'changed': {},
        'connected': {},
        'disconnected': {},
    },
}, class MotoBudsDevice extends GObject.Object {
    _init(settings, devicePath, alias, profileManager) {
        super._init();
        this._settings = settings;
        this._path = devicePath;
        this.path = devicePath;
        this._profileManager = profileManager;
        this._destroyed = false;
        this._reconnectId = 0;
        this._reconnectAttempts = 0;
        this.state = {
            alias,
            connected: false,
            battery: {left: {}, right: {}, case: {}},
            ancMode: ANC.OFF,
            eqPreset: PRESET.DEFAULT,
            eqCustom: [0, 0, 0, 0, 0],
            eqEnabled: false,
            toggles: Object.fromEntries(TOGGLE_KEYS.map(k => [k, false])),
            firmware: '',
        };
        this._loadPersisted();
        this._startSocket();
    }

    _startSocket() {
        this._socket = new MotoBudsSocket(this._path, this._profileManager);
        this._socket.connectObject(
            'connected', () => this._onConnected(),
            'disconnected', () => this._onDisconnected(),
            'connect-failed', () => this._onConnectFailed(),
            'battery', (_o, b) => this._set({battery: b}),
            'anc', (_o, m) => this._set({ancMode: m}),
            'dual', (_o, v) => this._setToggle('dual', v),
            'eq-enabled', (_o, v) => this._set({eqEnabled: v}),
            'eq-preset', (_o, id) => this._set({eqPreset: PRESET_NAME_BY_ID[id] ?? PRESET.CUSTOM}),
            'eq-custom', (_o, bands) => {
                const clamped = bands.map(v =>
                    Math.max(-EQ_RANGE, Math.min(EQ_RANGE, Math.round(v))));
                this._set({eqCustom: clamped, eqPreset: presetForBands(clamped)});
            },
            'toggle', (_o, name, v) => this._setToggle(name, v),
            'firmware', (_o, v) => this._set({firmware: v}),
            this);
    }

    _onConnected() {
        this._reconnectAttempts = 0;
        this._set({connected: true});
        this.emit('connected');
    }

    _onDisconnected() {
        this._set({connected: false});
        this.emit('disconnected');
        this._scheduleReconnect();
    }

    _onConnectFailed() {
        this._scheduleReconnect();
    }

    _scheduleReconnect() {
        if (this._destroyed || this._reconnectId)
            return;
        this._reconnectAttempts++;
        if (this._reconnectAttempts > 15)
            return;
        const delay = Math.min(2 + this._reconnectAttempts, 10);
        this._reconnectId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, () => {
            this._reconnectId = 0;
            this._reconnect();
            return GLib.SOURCE_REMOVE;
        });
    }

    _reconnect() {
        if (this._destroyed)
            return;
        this._socket?.disconnectObject(this);
        this._socket?.destroy();
        this._socket = null;
        this._startSocket();
    }

    _set(patch) {
        Object.assign(this.state, patch);
        this.emit('changed');
    }

    _setToggle(name, value) {
        if (this.state.toggles[name] === value)
            return;
        this.state.toggles = {...this.state.toggles, [name]: value};
        this.emit('changed');
    }

    setAncMode(mode) {
        this._set({ancMode: mode});
        this._socket?.setAncMode(mode);
    }

    setEqPreset(name) {
        const bands = PRESET_BANDS[name] ?? this.state.eqCustom;
        this._set({eqPreset: name, eqCustom: bands});
        this._socket?.setEqPreset(PRESET_ID_BY_NAME[name] ?? 0);
        if (name === PRESET.CUSTOM)
            this._socket?.setEqCustom(bands);
        this._persist();
    }

    setEqCustom(bands) {
        const clamped = bands.map(v => Math.round(v));
        this._set({eqCustom: clamped, eqPreset: presetForBands(clamped)});
        this._socket?.setEqCustom(clamped);
        this._persist();
    }

    setToggle(name, value) {
        this._setToggle(name, value);
        this._socket?.setToggle(name, value);
    }

    _loadPersisted() {
        try {
            const list = this._settings.get_strv('devices').map(JSON.parse);
            const entry = list.find(d => d.path === this._path);
            if (entry) {
                if (entry['eq-preset'])
                    this.state.eqPreset = entry['eq-preset'];
                if (Array.isArray(entry['eq-custom']))
                    this.state.eqCustom = entry['eq-custom'];
                if (entry.alias)
                    this.state.alias = entry.alias;
            }
        } catch (e) {
            Log.error(e, 'load persisted');
        }
    }

    _persist() {
        try {
            const list = this._settings.get_strv('devices').map(JSON.parse);
            const idx = list.findIndex(d => d.path === this._path);
            const entry = {
                path: this._path,
                alias: this.state.alias,
                'eq-preset': this.state.eqPreset,
                'eq-custom': this.state.eqCustom,
            };
            if (idx >= 0)
                list[idx] = entry;
            else
                list.push(entry);
            this._settings.set_strv('devices', list.map(JSON.stringify));
        } catch (e) {
            Log.error(e, 'persist');
        }
    }

    destroy() {
        this._destroyed = true;
        if (this._reconnectId) {
            GLib.source_remove(this._reconnectId);
            this._reconnectId = 0;
        }
        this._socket?.disconnectObject(this);
        this._socket?.destroy();
        this._socket = null;
    }
});