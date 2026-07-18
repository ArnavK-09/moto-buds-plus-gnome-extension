"use strict";

import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import St from "gi://St";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";

import { DevicePopup } from "./popup.js";

export const PanelIndicator = GObject.registerClass(
  {
    GTypeName: "MotoBudsPlus_PanelIndicator",
  },
  class PanelIndicator extends PanelMenu.Button {
    _init(settings, device, gIcon, onOpenPrefs, compact) {
      super._init(0.5, "Moto Buds+");
      this._settings = settings;
      this._device = device;
      this._compact = compact;
      this._gIcon = gIcon;
      this.add_style_class_name("mbp-panel-button");
      if (compact) this.add_style_class_name("mbp-tray");

      const box = new St.BoxLayout({
        style_class: "mbp-panel-box",
        y_align: Clutter.ActorAlign.CENTER,
      });
      this._icon = new St.Icon({
        gicon: gIcon("bbm-earbuds-stem-symbolic.svg"),
        style_class: "system-status-icon",
        y_align: Clutter.ActorAlign.CENTER,
      });
      this._label = new St.Label({
        y_align: Clutter.ActorAlign.CENTER,
        style_class: "mbp-panel-label",
      });
      box.add_child(this._icon);
      box.add_child(this._label);
      this.add_child(box);

      this._popup = new DevicePopup(
        this.menu,
        device,
        settings,
        gIcon,
        onOpenPrefs,
        compact ? "tray" : "panel",
      );
      if (device)
        this._device.connectObject("changed", () => this._update(), this);

      this._settings.connectObject(
        "changed::show-battery-text",
        () => this._update(),
        "changed::show-panel-label",
        () => this._update(),
        this
      );

      this._update();
    }

    _batteryText(s) {
      const l = s.battery.left?.reported ? s.battery.left.level : null;
      const r = s.battery.right?.reported ? s.battery.right.level : null;
      let level;
      if (l != null && r != null) level = Math.round((l + r) / 2);
      else if (l != null) level = l;
      else if (r != null) level = r;
      else level = null;
      return level == null ? "" : `${level}%`;
    }

    _update() {
      if (!this._device || this._compact) {
        this._label.text = "";
        this._label.visible = false;
        this._icon.opacity = this._device
          ? this._device.state.connected
            ? 255
            : 140
          : 120;
        return;
      }
      const s = this._device.state;
      const parts = [];
      if (this._settings.get_boolean("show-battery-text")) {
        const t = this._batteryText(s);
        if (t) parts.push(t);
      }
      if (this._settings.get_boolean("show-panel-label") && s.alias)
        parts.push(s.alias);
      this._label.text = parts.join("  ");
      this._label.visible = parts.length > 0;
      this._icon.opacity = s.connected ? 255 : 140;
    }

    destroy() {
      this._device?.disconnectObject(this);
      this._popup?.destroy();
      this._popup = null;
      super.destroy();
    }
  },
);
