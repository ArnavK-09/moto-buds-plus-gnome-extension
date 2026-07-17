'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Log from './logger.js';
import {
    SERVICE_UUID, COMMAND_TYPE, PACKET_TYPE, OP, ANC, ANC_MODE_BYTES, ANC_PREF_BYTES,
    TOGGLE_CATEGORY, EQ_RANGE,
} from './config.js';

Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');
Gio._promisify(Gio.OutputStream.prototype, 'write_all_async', 'write_all_finish');

const HEAD = [0x48, 0x45, 0x41, 0x44];
const TAIL = [0x54, 0x41, 0x49, 0x4c];

export const MotoBudsSocket = GObject.registerClass({
    GTypeName: 'MotoBudsPlus_Socket',
    Signals: {
        'connected': {},
        'disconnected': {},
        'connect-failed': {},
        'battery': {param_types: [GObject.TYPE_JSOBJECT]},
        'anc': {param_types: [GObject.TYPE_INT]},
        'dual': {param_types: [GObject.TYPE_BOOLEAN]},
        'eq-enabled': {param_types: [GObject.TYPE_BOOLEAN]},
        'eq-preset': {param_types: [GObject.TYPE_INT]},
        'eq-custom': {param_types: [GObject.TYPE_JSOBJECT]},
        'toggle': {param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN]},
        'firmware': {param_types: [GObject.TYPE_STRING]},
    },
}, class MotoBudsSocket extends GObject.Object {
    _init(devicePath, profileManager) {
        super._init();
        this._devicePath = devicePath;
        this._profileManager = profileManager;
        this.running = false;
        this._cancellable = new Gio.Cancellable();
        this._queue = [];
        this._sending = false;
        this._seq = 1;
        this._reassembly = [];
        this.start();
    }

    async start() {
        const fd = await this._profileManager.acquireFd(SERVICE_UUID, this._devicePath);
        if (fd === -1) {
            this.emit('connect-failed');
            return;
        }
        this._attach(fd);
    }

    _attach(fd) {
        try {
            this._socket = Gio.Socket.new_from_fd(fd);
        } catch (e) {
            Log.error(e, 'Socket.new_from_fd failed');
            return;
        }
        this._connection = this._socket.connection_factory_create_connection();
        this._input = this._connection.get_input_stream();
        this._output = this._connection.get_output_stream();
        this.running = true;
        this._receive();
        this._onConnected();
    }

    async _receive() {
        if (!this.running)
            return;
        try {
            const bytes = await this._input.read_bytes_async(
                1024, GLib.PRIORITY_DEFAULT, this._cancellable);
            if (!bytes || bytes.get_size() === 0) {
                this.destroy();
                return;
            }
            this._process(bytes.toArray());
            this._receive();
        } catch (e) {
            Log.error(e, 'socket receive');
            this.destroy();
        }
    }

    async send(packet) {
        if (!this.running)
            return;
        this._queue.push(packet);
        if (this._sending)
            return;
        this._sending = true;
        while (this._queue.length > 0 && this.running) {
            const buf = this._queue.shift();
            try {
                await this._output.write_all_async(buf, GLib.PRIORITY_DEFAULT, this._cancellable, null);
            } catch (e) {
                Log.error(e, 'socket send');
                this.destroy();
                break;
            }
        }
        this._sending = false;
    }

    _onConnected() {
        this.emit('connected');
        this._query(OP.GET_BATTERY_LEVEL);
        this._query(OP.GET_ANC_MODE);
        this._query(OP.GET_TOGGLE_CONFIGS);
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            if (!this.running)
                return GLib.SOURCE_REMOVE;
            this._query(OP.GET_EQ_STATE);
            this._query(OP.GET_EQ_SET);
            this._query(OP.GET_USER_EQ_CONFIG);
            this._query(OP.GET_IN_EAR_DETECTION);
            this._query(OP.GET_DUAL_CONNECTION);
            this._query(OP.GET_VOLUME_BOOST);
            this._query(OP.GET_HI_RES_MODE);
            this._query(OP.GET_GAME_MODE);
            this._query(OP.GET_SPATIAL_AUDIO);
            this._query(OP.GET_PROFILE_VERSION);
            return GLib.SOURCE_REMOVE;
        });
    }

    _query(opcode, payload = []) {
        this._send(opcode, payload).catch(e => Log.error(e, 'query failed'));
    }

    _command(opcode, payload = []) {
        this._send(opcode, payload).catch(() => {});
    }

    async _send(opcode, payload = []) {
        const seq = this._seq;
        this._seq = (this._seq + 1) & 0xffff;
        if (this._seq === 0)
            this._seq = 1;
        const len = payload.length;
        const inner = new Uint8Array([
            (opcode >> 8) & 0xff, opcode & 0xff,
            COMMAND_TYPE, 0x00,
            len & 0xff, (len >> 8) & 0xff,
            seq & 0xff, (seq >> 8) & 0xff,
            ...payload,
        ]);
        await this.send(this._frame(inner));
    }

    _frame(inner) {
        const outerLen = inner.length;
        const frame = new Uint8Array(4 + 2 + outerLen + 4 + 4);
        let o = 0;
        for (const b of HEAD)
            frame[o++] = b;
        frame[o++] = outerLen & 0xff;
        frame[o++] = (outerLen >> 8) & 0xff;
        frame.set(inner, o);
        o += outerLen;
        const crc = this._crc32(inner);
        frame[o++] = crc & 0xff;
        frame[o++] = (crc >> 8) & 0xff;
        frame[o++] = (crc >> 16) & 0xff;
        frame[o++] = (crc >> 24) & 0xff;
        for (const b of TAIL)
            frame[o++] = b;
        return frame;
    }

    _crc32(data) {
        let crc = 0xffffffff;
        for (const byte of data) {
            crc ^= byte;
            for (let i = 0; i < 8; i++)
                crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    _process(bytes) {
        const framed = this._unframe(bytes);
        const pdus = framed.length > 0 ? framed : [bytes];
        for (const pdu of pdus) {
            const pkt = this._decode(pdu);
            if (pkt)
                this._handle(pkt);
        }
    }

    _unframe(bytes) {
        const out = [];
        let buf = [...this._reassembly, ...Array.from(bytes)];
        this._reassembly = [];
        while (buf.length >= 14) {
            const headIdx = buf.findIndex((_, i) =>
                buf.slice(i, i + 4).every((v, j) => v === HEAD[j]));
            if (headIdx === -1)
                break;
            if (buf.length - headIdx < 14) {
                this._reassembly = buf.slice(headIdx);
                break;
            }
            const outerLen = buf[headIdx + 4] | (buf[headIdx + 5] << 8);
            const end = headIdx + 4 + 2 + outerLen + 4 + 4;
            if (buf.length < end) {
                this._reassembly = buf.slice(headIdx);
                break;
            }
            const tailOk = buf.slice(end - 4, end).every((v, j) => v === TAIL[j]);
            if (!tailOk) {
                buf = buf.slice(headIdx + 1);
                continue;
            }
            out.push(new Uint8Array(buf.slice(headIdx + 6, headIdx + 6 + outerLen)));
            buf = buf.slice(end);
        }
        if (buf.length > 0 && buf.length < 1000)
            this._reassembly = buf;
        else
            this._reassembly = [];
        return out;
    }

    _decode(bytes) {
        if (bytes.length < 8)
            return null;
        const opcode = (bytes[0] << 8) | bytes[1];
        const type = bytes[2];
        const innerLen = bytes[4] | (bytes[5] << 8);
        if (bytes.length < 8 + innerLen)
            return null;
        return {opcode, type, payload: bytes.slice(8, 8 + innerLen)};
    }

    _handle(pkt) {
        const isNotification = (pkt.type & 0xE0) === PACKET_TYPE.NOTIFICATION_ACK ||
            (pkt.type & 0xE0) === PACKET_TYPE.NOTIFICATION_NO_ACK;
        const isResponse = (pkt.type & 0xE0) === PACKET_TYPE.RESPONSE_ACK ||
            (pkt.type & 0xE0) === PACKET_TYPE.RESPONSE_NO_ACK;
        if (!isResponse && !isNotification)
            return;
        const p = Array.from(pkt.payload);
        switch (pkt.opcode) {
        case OP.GET_BATTERY_LEVEL:
        case OP.BATTERY_LEVEL_CHANGED:
            if (p.length >= 3)
                this.emit('battery', {
                    left: this._battery(p[0]),
                    right: this._battery(p[1]),
                    case: this._battery(p[2]),
                });
            break;
        case OP.GET_ANC_MODE:
        case OP.ANC_MODE_CHANGED:
            if (p.length >= 2)
                this.emit('anc', this._decodeAnc(p[0], p[1]));
            break;
        case OP.GET_TOGGLE_CONFIG:
        case OP.TOGGLE_CONFIG_CHANGED:
            if (p.length >= 3) {
                if (p[0] === TOGGLE_CATEGORY.ANC_PREFERENCE)
                    this.emit('anc', this._decodeAnc(p[1], p[2]));
                else if (p[0] === TOGGLE_CATEGORY.DUAL_CONNECTION)
                    this.emit('dual', !!p[1]);
            }
            break;
        case OP.GET_EQ_STATE:
        case OP.EQ_STATE_CHANGED:
            if (p.length >= 1)
                this.emit('eq-enabled', !!p[0]);
            break;
        case OP.GET_EQ_SET:
        case OP.EQ_SET_CHANGED:
            if (p.length >= 1)
                this.emit('eq-preset', p[0]);
            break;
        case OP.GET_USER_EQ_CONFIG:
        case OP.EQ_USER_BANDS_CHANGED:
            if (p.length >= 10) {
                const parse = off => {
                    const bands = [];
                    for (let i = 0; i < 5; i++) {
                        const raw = p[off + i * 2] | (p[off + i * 2 + 1] << 8);
                        bands.push(raw > 0x7fff ? raw - 0x10000 : raw);
                    }
                    return bands;
                };
                const inRange = arr => arr.every(v => v >= -EQ_RANGE && v <= EQ_RANGE);
                const a = parse(0);
                const b = p.length >= 12 ? parse(2) : null;
                let bands = null;
                if (inRange(a))
                    bands = a;
                else if (b && inRange(b))
                    bands = b;
                if (bands)
                    this.emit('eq-custom', bands);
            }
            break;
        case OP.GET_SPATIAL_AUDIO:
        case OP.SPATIAL_AUDIO_CHANGED:
            this.emit('toggle', 'spatial-audio', this._toggleVal(pkt, isResponse, p));
            break;
        case OP.GET_DUAL_CONNECTION:
        case OP.DUAL_CONNECTION_CHANGED:
            this.emit('dual', !!(p.length >= 2 ? p[1] : p[0]));
            break;
        case OP.GET_VOLUME_BOOST:
        case OP.VOLUME_BOOST_CHANGED:
            this.emit('toggle', 'volume-boost', this._toggleVal(pkt, isResponse, p));
            break;
        case OP.GET_HI_RES_MODE:
        case OP.HI_RES_STATE_CHANGED:
            this.emit('toggle', 'hi-res', this._toggleVal(pkt, isResponse, p));
            break;
        case OP.GET_GAME_MODE:
        case OP.GAME_MODE_STATE_CHANGED:
            this.emit('toggle', 'game-mode', this._toggleVal(pkt, isResponse, p));
            break;
        case OP.GET_IN_EAR_DETECTION:
        case OP.IN_EAR_DETECTION_NOTIF:
            this.emit('toggle', 'in-ear', this._toggleVal(pkt, isResponse, p));
            break;
        case OP.GET_PROFILE_VERSION:
            if (p.length >= 1)
                this.emit('firmware', String.fromCharCode(...p).replace(/\x00/g, ''));
            break;
        default:
            if (isNotification)
                Log.info(`unhandled opcode 0x${pkt.opcode.toString(16)} len=${p.length}`);
        }
    }

    _toggleVal(pkt, isResponse, p) {
        if (isResponse)
            return !!(p[0] ?? 0);
        return !!(p[p.length >= 2 ? p.length - 1 : 0] ?? 0);
    }

    _battery(b) {
        if (b === 0xff)
            return {level: 0, charging: false, reported: false};
        return {level: b & 0x7f, charging: (b & 0x80) !== 0, reported: true};
    }

    _decodeAnc(cat, sub) {
        if (cat === 0x00 && sub === 0x00)
            return ANC.OFF;
        if (cat === 0x02 && sub === 0x00)
            return ANC.TRANSPARENCY;
        if (cat === 0x01 && sub === 0x03)
            return ANC.ANC;
        if (cat === 0x01 && sub === 0x01)
            return ANC.ADAPTIVE;
        return ANC.OFF;
    }

    setAncMode(mode) {
        const payload = ANC_MODE_BYTES[mode];
        if (!payload)
            return;
        this._command(OP.SET_ANC_MODE, payload);
        this._command(OP.SET_TOGGLE_CONFIG, ANC_PREF_BYTES[mode]);
        if (mode === ANC.ADAPTIVE)
            this._command(OP.SET_ADAPTATION_STATUS, [0x01]);
    }

    setEqPreset(id) {
        this._command(OP.SET_EQ_SET, [id]);
    }

    setEqCustom(bands) {
        const payload = [];
        for (const band of bands) {
            const v = Math.max(-EQ_RANGE, Math.min(EQ_RANGE, Math.round(band)));
            payload.push(v & 0xff, (v >> 8) & 0xff);
        }
        this._command(OP.SET_USER_EQ_CONFIG, payload);
    }

    setToggle(name, enabled) {
        const on = enabled ? 0x01 : 0x00;
        switch (name) {
        case 'bass-boost': this._command(OP.SET_BASS_ENHANCEMENT, [on]); break;
        case 'volume-boost': this._command(OP.SET_VOLUME_BOOST, [on]); break;
        case 'hi-res': this._command(OP.SET_HI_RES_MODE, [on]); break;
        case 'game-mode': this._command(OP.SET_GAME_MODE, [on]); break;
        case 'adaptive-hearing': this._command(OP.SET_ADAPTATION_STATUS, [on]); break;
        case 'auto-volume': this._command(OP.SET_AUTO_VOLUME, [on]); break;
        case 'case-recording': this._command(OP.SET_CASE_RECORDING, [on]); break;
        case 'in-ear': this._command(OP.SET_IN_EAR_DETECTION, [on]); break;
        case 'spatial-audio': this._command(OP.SET_SPATIAL_AUDIO, [on]); break;
        case 'dual': this._command(OP.SET_DUAL_CONNECTION, [0x01, on]); break;
        }
    }

    destroy() {
        if (!this.running)
            return;
        this.running = false;
        this._cancellable.cancel();
        this._queue = [];
        try {
            this._socket?.shutdown(true, true);
        } catch (e) {
            Log.error(e, 'socket shutdown');
        }
        try {
            this._connection?.close(null);
        } catch (e) {
            Log.error(e, 'connection close');
        }
        try {
            this._socket?.close();
        } catch (e) {
            Log.error(e, 'socket close');
        }
        this._connection = null;
        this._input = null;
        this._output = null;
        this._socket = null;
        this.emit('disconnected');
        this._profileManager.releaseFd(this._devicePath, true);
    }
});