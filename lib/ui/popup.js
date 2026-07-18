"use strict";

import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import St from "gi://St";

import { TOGGLES, ANC_ITEMS } from "../config.js";
import {
  SectionTitle,
  ToggleButton,
  ToggleRow,
  TogglePill,
  ToggleGrid,
  BatteryCell,
} from "./widgets.js";

const BATTERY_ICONS = {
  left: "bbm-earbuds-stem-left-symbolic.svg",
  right: "bbm-earbuds-stem-right-symbolic.svg",
  case: "bbm-case-normal-symbolic.svg",
};

function separator() {
  return new St.Bin({ x_expand: true, style_class: "mbp-separator" });
}

export const DevicePopup = GObject.registerClass(
  {
    GTypeName: "MotoBudsPlus_DevicePopup",
  },
  class DevicePopup extends GObject.Object {
    _init(menu, device, settings, gIcon, onOpenPrefs, mode = "panel") {
      super._init();
      this._menu = menu;
      this._device = device;
      this._settings = settings;
      this._gIcon = gIcon;
      this._onOpenPrefs = onOpenPrefs;
      this._mode = mode;
      this._scrollVisible = mode === "quick-settings";
      this._wide = mode !== "quick-settings";
      this._ancButtons = [];
      this._pills = [];
      if (device) {
        this._build();
        this._device.connectObject("changed", () => this._update(), this);
        this._update();
      } else {
        this._buildPlaceholder();
      }
    }

    _buildPlaceholder() {
      this._content = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: "mbp-popup",
      });
      const header = new St.BoxLayout({
        x_expand: true,
        style_class: "mbp-header",
      });
      header.add_child(
        new St.Icon({
          gicon: this._gIcon("bbm-earbuds-stem-symbolic.svg"),
          icon_size: 24,
          style_class: "mbp-header-icon",
        }),
      );
      header.add_child(
        new St.Label({
          text: "Not connected",
          style_class: "mbp-header-name",
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      this._content.add_child(header);

      const hint = new St.Label({
        text: "Connect your Moto Buds+ via Bluetooth to control them.",
        style_class: "mbp-placeholder-hint",
      });
      this._content.add_child(hint);

      const settingsBtn = new St.Button({
        label: "Settings",
        style_class: "button mbp-settings-btn",
        x_expand: true,
        can_focus: true,
      });
      settingsBtn.connect("clicked", () => this._onOpenPrefs?.());
      this._content.add_child(settingsBtn);

      this._menu.box.add_child(this._content);
    }

    _build() {
      this._content = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: "mbp-popup",
      });
      if (this._wide) this._content.add_style_class_name("mbp-wide");

      this._header = new St.BoxLayout({
        x_expand: true,
        style_class: "mbp-header",
      });
      this._header.add_child(
        new St.Icon({
          gicon: this._gIcon("bbm-earbuds-stem-symbolic.svg"),
          icon_size: 24,
          style_class: "mbp-header-icon",
        }),
      );
      this._headerName = new St.Label({
        style_class: "mbp-header-name",
        y_align: Clutter.ActorAlign.CENTER,
      });
      this._headerStatus = new St.Label({
        style_class: "mbp-header-status",
        y_align: Clutter.ActorAlign.CENTER,
      });
      this._header.add_child(this._headerName);
      this._header.add_child(new St.Bin({ x_expand: true }));
      this._header.add_child(this._headerStatus);
      this._content.add_child(this._header);

      const battBox = new St.BoxLayout({
        x_expand: true,
        style_class: "mbp-battery-row",
      });
      this._battLeft = new BatteryCell(
        "Left",
        BATTERY_ICONS.left,
        this._gIcon,
        {},
      );
      this._battRight = new BatteryCell(
        "Right",
        BATTERY_ICONS.right,
        this._gIcon,
        {},
      );
      this._battCase = new BatteryCell(
        "Case",
        BATTERY_ICONS.case,
        this._gIcon,
        {},
      );
      battBox.add_child(this._battLeft);
      battBox.add_child(this._battRight);
      battBox.add_child(this._battCase);
      this._content.add_child(battBox);

      this._content.add_child(separator());

      this._ancButtons = ANC_ITEMS.map((item) => {
        const btn = new ToggleButton(
          item.label,
          item.value,
          this._gIcon,
          item.icon,
        );
        btn.connect("clicked", () => this._device.setAncMode(item.value));
        return { button: btn, value: item.value };
      });
      this._content.add_child(
        new ToggleRow("Noise control", this._ancButtons, { columns: 4 }),
      );

      this._content.add_child(separator());

      this._content.add_child(new SectionTitle("Audio"));
      this._pills = TOGGLES.map(({ key, label, icon }) => {
        const pill = new TogglePill(label, icon);
        pill.connect("clicked", () =>
          this._device.setToggle(key, !this._device.state.toggles[key]),
        );
        return { pill, key };
      });
      this._content.add_child(new ToggleGrid(this._pills.map((p) => p.pill)));

      const scroll = new St.ScrollView({
        style_class: this._scrollVisible
          ? "mbp-scroll mbp-scroll-show"
          : "mbp-scroll",
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        overlay_scrollbars: !this._scrollVisible,
        x_expand: true,
      });
      scroll.add_child(this._content);
      this._menu.box.add_child(scroll);
    }

    _update() {
      const s = this._device.state;
      this._headerName.text = s.alias || "Moto Buds+";
      this._headerStatus.text = s.connected ? "Connected" : "Disconnected";
      this._headerStatus.add_style_class_name(
        s.connected ? "mbp-on" : "mbp-off",
      );
      this._headerStatus.remove_style_class_name(
        s.connected ? "mbp-off" : "mbp-on",
      );

      this._battLeft.update(s.battery.left);
      this._battRight.update(s.battery.right);
      this._battCase.update(s.battery.case);

      this._ancButtons.forEach(({ button, value }) =>
        button.setActive(value === s.ancMode),
      );
      this._pills.forEach(({ pill, key }) => pill.setActive(!!s.toggles[key]));
    }

    destroy() {
      this._device?.disconnectObject(this);
      this._menu?.close();
      this._content?.destroy();
      this._content = null;
    }
  },
);
