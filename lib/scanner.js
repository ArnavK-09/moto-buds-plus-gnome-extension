"use strict";

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";

import * as Log from "./logger.js";
import { SERVICE_UUID } from "./config.js";

Gio._promisify(Gio.DBusConnection.prototype, "call", "call_finish");

const BLUEZ = "org.bluez";
const OBJ_MANAGER = "org.freedesktop.DBus.ObjectManager";
const PROPS = "org.freedesktop.DBus.Properties";
const DEVICE_IFACE = "org.bluez.Device1";

function isMoto(uuids) {
  return Array.isArray(uuids) && uuids.includes(SERVICE_UUID);
}

function readProp(props, name) {
  const v = props?.[name];
  if (!v) return undefined;
  if (typeof v.deep_unpack === "function") return v.deep_unpack();
  return v;
}

export const DeviceScanner = GObject.registerClass(
  {
    GTypeName: "MotoBudsPlus_DeviceScanner",
    Signals: {
      device: { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING] },
      "device-gone": { param_types: [GObject.TYPE_STRING] },
    },
  },
  class DeviceScanner extends GObject.Object {
    _init() {
      super._init();
      this._bus = Gio.DBus.system;
      this._devices = new Map();
      this._emitted = new Set();
    }

    async init() {
      try {
        const raw = await this._bus.call(
          BLUEZ,
          "/",
          OBJ_MANAGER,
          "GetManagedObjects",
          null,
          null,
          Gio.DBusCallFlags.NONE,
          -1,
          null,
        );
        const managed = raw.get_child_value(0).deep_unpack();
        for (const [path, ifaces] of Object.entries(managed)) {
          if (DEVICE_IFACE in ifaces) this._track(path, ifaces[DEVICE_IFACE]);
        }
        this._propId = this._bus.signal_subscribe(
          BLUEZ,
          PROPS,
          "PropertiesChanged",
          null,
          DEVICE_IFACE,
          Gio.DBusSignalFlags.NONE,
          this._onProps.bind(this),
        );
        this._addedId = this._bus.signal_subscribe(
          BLUEZ,
          OBJ_MANAGER,
          "InterfacesAdded",
          null,
          null,
          Gio.DBusSignalFlags.NONE,
          this._onAdded.bind(this),
        );
        this._removedId = this._bus.signal_subscribe(
          BLUEZ,
          OBJ_MANAGER,
          "InterfacesRemoved",
          null,
          null,
          Gio.DBusSignalFlags.NONE,
          this._onRemoved.bind(this),
        );
        this._rescan();
      } catch (e) {
        Log.error(e, "scanner init");
      }
    }

    _track(path, props) {
      const paired = readProp(props, "Paired");
      if (paired === false) return;
      this._devices.set(path, {
        connected: !!readProp(props, "Connected"),
        uuids: readProp(props, "UUIDs") ?? [],
        alias: readProp(props, "Alias") ?? "",
      });
    }

    _onAdded(_c, _s, _p, _i, _sig, params) {
      const [path, ifaces] = params.deep_unpack();
      if (!(DEVICE_IFACE in ifaces)) return;
      this._track(path, ifaces[DEVICE_IFACE]);
      this._rescan();
    }

    _onRemoved(_c, _s, _p, _i, _sig, params) {
      const [path, ifaces] = params.deep_unpack();
      if (!ifaces.includes(DEVICE_IFACE)) return;
      this._devices.delete(path);
      if (this._emitted.has(path)) {
        this._emitted.delete(path);
        this.emit("device-gone", path);
      }
    }

    _onProps(_c, _s, path, _i, _sig, params) {
      const [ifaceName, changed] = params.deep_unpack();
      if (ifaceName !== DEVICE_IFACE) return;
      const dev = this._devices.get(path);
      if (!dev) return;
      if ("Connected" in changed)
        dev.connected = !!changed.Connected.deep_unpack();
      if ("Alias" in changed) dev.alias = changed.Alias.deep_unpack();
      if ("UUIDs" in changed) dev.uuids = changed.UUIDs.deep_unpack();
      if ("Paired" in changed && !changed.Paired.deep_unpack()) {
        this._devices.delete(path);
        if (this._emitted.has(path)) {
          this._emitted.delete(path);
          this.emit("device-gone", path);
        }
        return;
      }
      this._rescan();
    }

    _rescan() {
      for (const [path, dev] of this._devices) {
        if (dev.connected && isMoto(dev.uuids)) {
          if (!this._emitted.has(path)) {
            this._emitted.add(path);
            this.emit("device", path, dev.alias);
          }
        } else if (this._emitted.has(path)) {
          this._emitted.delete(path);
          this.emit("device-gone", path);
        }
      }
    }

    destroy() {
      if (this._propId) this._bus.signal_unsubscribe(this._propId);
      if (this._addedId) this._bus.signal_unsubscribe(this._addedId);
      if (this._removedId) this._bus.signal_unsubscribe(this._removedId);
      this._devices.clear();
      this._emitted.clear();
    }
  },
);
