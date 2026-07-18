"use strict";

import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class MotoBudsPlusPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage();
    window.add(page);

    const group = new Adw.PreferencesGroup({ title: "Indicator" });
    page.add(group);

    const modeModel = new Gtk.StringList();
    modeModel.append("Panel (icon + name + battery)");
    modeModel.append("System tray (icon only)");
    modeModel.append("Quick settings");
    const modeRow = new Adw.ComboRow({
      title: "Indicator location",
      subtitle: "Where the Moto Buds+ control appears",
      model: modeModel,
    });
    const modeMap = ["panel", "tray", "quick-settings"];
    modeRow.selected = Math.max(
      0,
      modeMap.indexOf(settings.get_string("indicator-mode")),
    );
    modeRow.connect("notify::selected", () => {
      settings.set_string(
        "indicator-mode",
        modeMap[modeRow.selected] ?? "panel",
      );
    });
    group.add(modeRow);

    group.add(
      this._switch(
        settings,
        "show-battery-text",
        "Show battery percentage",
        "Display the battery level next to the indicator",
      ),
    );
    group.add(
      this._switch(
        settings,
        "show-panel-label",
        "Show device name",
        "Display the device name on the panel button",
      ),
    );
    group.add(
      this._switch(
        settings,
        "show-when-disconnected",
        "Always show indicator",
        "Keep the button visible even when no Moto Buds+ is connected",
      ),
    );

    window.set_default_size(480, 360);
  }

  _switch(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, "active", Gio.SettingsBindFlags.DEFAULT);
    return row;
  }
}
