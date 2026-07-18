"use strict";

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";

import * as Log from "./logger.js";

Gio._promisify(Gio.DBusProxy, "new", "new_finish");
Gio._promisify(Gio.DBusProxy, "new_for_bus", "new_for_bus_finish");
Gio._promisify(Gio.DBusProxy.prototype, "call", "call_finish");
Gio._promisify(Gio.DBusConnection.prototype, "call", "call_finish");

const SERVICE_PATH = "/io/github/ArnavK09/MotoBudsPlus/Profile";

const PROFILE_XML = `
<node>
  <interface name="org.bluez.Profile1">
    <method name="Release"/>
    <method name="NewConnection">
      <arg type="o" name="device" direction="in"/>
      <arg type="h" name="fd" direction="in"/>
      <arg type="a{sv}" name="props" direction="in"/>
    </method>
    <method name="RequestDisconnection">
      <arg type="o" name="device" direction="in"/>
    </method>
  </interface>
</node>`;

export const ProfileManager = GObject.registerClass(
  {
    GTypeName: "MotoBudsPlus_ProfileManager",
    Signals: {
      "new-connection": {
        param_types: [GObject.TYPE_STRING, GObject.TYPE_INT],
      },
    },
  },
  class ProfileManager extends GObject.Object {
    _init() {
      super._init();
      this._systemBus = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);
      this._iface = Gio.DBusNodeInfo.new_for_xml(PROFILE_XML).interfaces[0];
      this._profile = null;
      this._fdByDevice = new Map();
    }

    async _registerProfile(uuid) {
      const objectPath = SERVICE_PATH;
      let registrationId;
      try {
        registrationId = this._systemBus.register_object(
          objectPath,
          this._iface,
          this._onMethodCall.bind(this),
          null,
          null,
        );
      } catch (e) {
        Log.error(e, "register_object failed");
        return null;
      }

      let proxy;
      try {
        proxy = await Gio.DBusProxy.new(
          this._systemBus,
          Gio.DBusProxyFlags.NONE,
          null,
          "org.bluez",
          "/org/bluez",
          "org.bluez.ProfileManager1",
          null,
        );
      } catch (e) {
        Log.error(e, "ProfileManager1 proxy failed");
        this._systemBus.unregister_object(registrationId);
        return null;
      }

      const opts = {
        Name: GLib.Variant.new("s", "MotoBudsPlus"),
        Role: GLib.Variant.new("s", "client"),
        AutoConnect: GLib.Variant.new("b", true),
      };

      try {
        await proxy.call(
          "RegisterProfile",
          GLib.Variant.new_tuple([
            GLib.Variant.new("o", objectPath),
            GLib.Variant.new("s", uuid),
            GLib.Variant.new("a{sv}", opts),
          ]),
          Gio.DBusCallFlags.NONE,
          -1,
          null,
        );
      } catch (e) {
        Log.error(e, "RegisterProfile failed");
        this._systemBus.unregister_object(registrationId);
        return null;
      }

      return { proxy, objectPath, registrationId };
    }

    _unregisterProfile() {
      const p = this._profile;
      if (!p) return;
      try {
        p.proxy.call_sync(
          "UnregisterProfile",
          GLib.Variant.new_tuple([GLib.Variant.new("o", p.objectPath)]),
          Gio.DBusCallFlags.NONE,
          -1,
          null,
        );
      } catch (e) {
        Log.error(e, "UnregisterProfile failed");
      }
      try {
        this._systemBus.unregister_object(p.registrationId);
      } catch (e) {
        Log.error(e, "unregister_object failed");
      }
      this._profile = null;
    }

    _onMethodCall(conn, sender, path, iface, method, params, invocation) {
      if (method === "Release") {
        invocation.return_value(null);
        return;
      }
      if (method === "NewConnection") {
        const [devicePath, fdIndex] = params.deep_unpack();
        const fd = invocation.get_message().get_unix_fd_list().get(fdIndex);
        let entry = this._fdByDevice.get(devicePath);
        if (!entry) {
          entry = { fd, timeoutId: null, signalId: null, resolve: null };
          this._fdByDevice.set(devicePath, entry);
        } else {
          entry.fd = fd;
        }
        this.emit("new-connection", devicePath, fd);
        invocation.return_value(null);
        return;
      }
      if (method === "RequestDisconnection") {
        const [devicePath] = params.deep_unpack();
        this.releaseFd(devicePath, false);
        invocation.return_value(null);
      }
    }

    async _deviceProxy(devicePath) {
      try {
        return await Gio.DBusProxy.new(
          this._systemBus,
          Gio.DBusProxyFlags.NONE,
          null,
          "org.bluez",
          devicePath,
          "org.bluez.Device1",
          null,
        );
      } catch (e) {
        Log.error(e, `Device1 proxy failed for ${devicePath}`);
        return null;
      }
    }

    async _connectProfile(devicePath) {
      if (!this._profile) return;
      const proxy = await this._deviceProxy(devicePath);
      if (!proxy) return;
      try {
        await proxy.call(
          "ConnectProfile",
          GLib.Variant.new_tuple([GLib.Variant.new("s", this._profile.uuid)]),
          Gio.DBusCallFlags.NONE,
          -1,
          null,
        );
      } catch (e) {
        Log.error(e, "ConnectProfile failed");
      }
    }

    async _disconnectProfile(devicePath) {
      if (!this._profile) return;
      const proxy = await this._deviceProxy(devicePath);
      if (!proxy) return;
      try {
        await proxy.call(
          "DisconnectProfile",
          GLib.Variant.new_tuple([GLib.Variant.new("s", this._profile.uuid)]),
          Gio.DBusCallFlags.NONE,
          -1,
          null,
        );
      } catch (e) {
        Log.error(e, "DisconnectProfile failed");
      }
    }

    async acquireFd(uuid, devicePath) {
      if (!this._profile) {
        const info = await this._registerProfile(uuid);
        if (!info) return -1;
        this._profile = { uuid, ...info };
      }

      let entry = this._fdByDevice.get(devicePath);
      if (!entry) {
        entry = { fd: null, timeoutId: null, signalId: null, resolve: null };
        this._fdByDevice.set(devicePath, entry);
      } else if (entry.fd !== null) {
        return entry.fd;
      }

      return new Promise((resolve) => {
        entry.resolve = resolve;
        let attempt = 0;
        entry.signalId = this.connect("new-connection", (_o, p, fd) => {
          if (p !== devicePath) return;
          entry.fd = fd;
          if (entry.timeoutId) GLib.source_remove(entry.timeoutId);
          entry.timeoutId = null;
          this.disconnect(entry.signalId);
          entry.signalId = null;
          resolve(fd);
        });
        entry.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
          if (!this._fdByDevice.has(devicePath)) return GLib.SOURCE_REMOVE;
          attempt++;
          if (attempt === 1 || attempt === 2 || attempt === 4 || attempt === 8)
            this._connectProfile(devicePath);
          if (attempt > 8) {
            if (entry.signalId) {
              this.disconnect(entry.signalId);
              entry.signalId = null;
            }
            this._fdByDevice.delete(devicePath);
            entry.timeoutId = null;
            resolve(-1);
            return GLib.SOURCE_REMOVE;
          }
          return GLib.SOURCE_CONTINUE;
        });
        this._connectProfile(devicePath);
      });
    }

    async releaseFd(devicePath, disconnect = true) {
      const entry = this._fdByDevice.get(devicePath);
      if (!entry) return;
      if (entry.signalId) this.disconnect(entry.signalId);
      if (entry.timeoutId) GLib.source_remove(entry.timeoutId);
      if (entry.resolve) {
        entry.resolve(-1);
        entry.resolve = null;
      }
      this._fdByDevice.delete(devicePath);
      if (disconnect) await this._disconnectProfile(devicePath);
      if (this._fdByDevice.size === 0) this._unregisterProfile();
    }

    destroy() {
      for (const entry of this._fdByDevice.values()) {
        if (entry.timeoutId) GLib.source_remove(entry.timeoutId);
        if (entry.signalId) this.disconnect(entry.signalId);
      }
      this._fdByDevice.clear();
      this._unregisterProfile();
    }
  },
);
