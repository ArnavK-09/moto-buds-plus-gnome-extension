'use strict';

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

let _tipActor = null;

function _hideTip() {
    if (_tipActor) {
        _tipActor.destroy();
        _tipActor = null;
    }
}

export function attachTooltip(actor, text) {
    actor.connect('enter-event', () => {
        _hideTip();
        const tip = new St.Label({text, style_class: 'mbp-tooltip'});
        Main.uiGroup.add_child(tip);
        const [, , natW, natH] = tip.get_preferred_size();
        const [ax, ay] = actor.get_transformed_position();
        const [aw, ah] = actor.get_transformed_size();
        let x = Math.round(ax + aw / 2 - natW / 2);
        let y = Math.round(ay - natH - 8);
        if (y < 4)
            y = Math.round(ay + ah + 8);
        if (x < 4)
            x = 4;
        tip.set_position(x, y);
        _tipActor = tip;
        return Clutter.EVENT_PROPAGATE;
    });
    actor.connect('leave-event', () => {
        _hideTip();
        return Clutter.EVENT_PROPAGATE;
    });
    actor.connect('destroy', () => _hideTip());
}

export const SectionTitle = GObject.registerClass({
    GTypeName: 'MotoBudsPlus_SectionTitle',
}, class SectionTitle extends St.Label {
    _init(text) {
        super._init({text, style_class: 'mbp-section-title', x_expand: true});
    }
});

export const ToggleButton = GObject.registerClass({
    GTypeName: 'MotoBudsPlus_ToggleButton',
}, class ToggleButton extends St.Button {
    _init(label, value, gIcon, iconName) {
        super._init({
            style_class: 'button mbp-toggle',
            can_focus: true,
            track_hover: true,
            x_expand: true,
        });
        this.value = value;
        if (gIcon && iconName)
            this.set_child(new St.Icon({gicon: gIcon(iconName), icon_size: 26, style_class: 'mbp-toggle-icon'}));
        if (label)
            attachTooltip(this, label);
    }

    setActive(on) {
        if (on)
            this.add_style_pseudo_class('checked');
        else
            this.remove_style_pseudo_class('checked');
    }
});

export const ToggleRow = GObject.registerClass({
    GTypeName: 'MotoBudsPlus_ToggleRow',
}, class ToggleRow extends St.BoxLayout {
    _init(title, items, {columns = 4} = {}) {
        super._init({vertical: true, x_expand: true, style_class: 'mbp-toggle-row'});
        if (title)
            this.add_child(new SectionTitle(title));
        const rows = Math.ceil(items.length / columns);
        for (let r = 0; r < rows; r++) {
            const hbox = new St.BoxLayout({x_expand: true, style_class: 'mbp-toggle-strip'});
            for (let c = 0; c < columns; c++) {
                const item = items[r * columns + c];
                if (item)
                    hbox.add_child(item.button);
                else
                    hbox.add_child(new St.Bin({x_expand: true}));
            }
            this.add_child(hbox);
        }
    }
});

export const TogglePill = GObject.registerClass({
    GTypeName: 'MotoBudsPlus_TogglePill',
}, class TogglePill extends St.Button {
    _init(label, iconName) {
        super._init({
            style_class: 'button mbp-pill',
            can_focus: true,
            track_hover: true,
            x_expand: true,
            button_mask: St.ButtonMask.ONE,
        });
        const box = new St.BoxLayout({vertical: true, x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER});
        box.add_child(new St.Icon({icon_name: iconName, icon_size: 18, style_class: 'mbp-pill-icon'}));
        box.add_child(new St.Label({text: label, x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER, style_class: 'mbp-pill-caption'}));
        this.set_child(box);
    }

    setActive(on) {
        if (on)
            this.add_style_pseudo_class('checked');
        else
            this.remove_style_pseudo_class('checked');
    }
});

export const ToggleGrid = GObject.registerClass({
    GTypeName: 'MotoBudsPlus_ToggleGrid',
}, class ToggleGrid extends St.BoxLayout {
    _init(pills) {
        super._init({vertical: true, x_expand: true, style_class: 'mbp-pill-grid'});
        for (let i = 0; i < pills.length; i += 2) {
            const row = new St.BoxLayout({x_expand: true});
            row.add_child(pills[i]);
            if (pills[i + 1])
                row.add_child(pills[i + 1]);
            else
                row.add_child(new St.Bin({x_expand: true}));
            this.add_child(row);
        }
    }
});

export const SliderRow = GObject.registerClass({
    GTypeName: 'MotoBudsPlus_SliderRow',
}, class SliderRow extends St.BoxLayout {
    _init(label, value, min, max, onChanged) {
        super._init({x_expand: true, style_class: 'mbp-slider-row'});
        this._min = min;
        this._max = max;
        this._onChanged = onChanged;

        const name = new St.Label({text: label, style_class: 'mbp-slider-name',
            y_align: Clutter.ActorAlign.CENTER});
        this.slider = new Slider.Slider(this._toFrac(value));
        this.slider.x_expand = true;
        this.valueLabel = new St.Label({text: `${value}`, style_class: 'mbp-slider-value',
            y_align: Clutter.ActorAlign.CENTER});

        this.add_child(name);
        this.add_child(this.slider);
        this.add_child(this.valueLabel);

        this._handler = this.slider.connect('notify::value', () => {
            const v = this._fromFrac(this.slider.value);
            this.valueLabel.text = `${v}`;
            onChanged(v);
        });
    }

    _toFrac(v) {
        return (v - this._min) / (this._max - this._min);
    }

    _fromFrac(f) {
        return Math.round(f * (this._max - this._min) + this._min);
    }

    setValue(v) {
        const clamped = Math.max(this._min, Math.min(this._max, v));
        GObject.signal_handler_block(this.slider, this._handler);
        this.slider.value = this._toFrac(clamped);
        GObject.signal_handler_unblock(this.slider, this._handler);
        this.valueLabel.text = `${clamped}`;
    }
});

export const BatteryCircle = GObject.registerClass({
    GTypeName: 'MotoBudsPlus_BatteryCircle',
}, class BatteryCircle extends St.DrawingArea {
    _init() {
        super._init({style_class: 'mbp-batt-circle'});
        this.set_size(32, 32);
        this._level = 0;
        this._charging = false;
        this._reported = false;
    }

    update(info) {
        this._reported = info?.reported === true;
        this._level = info?.level ?? 0;
        this._charging = !!info?.charging;
        this.queue_repaint();
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [w, h] = this.get_surface_size();
        const r = Math.min(w, h) / 2 - 2.5;
        const cx = w / 2;
        const cy = h / 2;

        cr.setSourceRGBA(1, 1, 1, 0.16);
        cr.setLineWidth(2.5);
        cr.arc(cx, cy, r, 0, 2 * Math.PI);
        cr.stroke();

        if (this._reported) {
            const low = this._level <= 15;
            const [rr, gg, bb] = this._charging
                ? [0.21, 0.52, 0.89]
                : (low ? [0.93, 0.20, 0.23] : [0.34, 0.69, 0.95]);
            cr.setSourceRGBA(rr, gg, bb, 1);
            cr.setLineWidth(2.5);
            const theta = (this._level / 100) * 2 * Math.PI;
            cr.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + theta);
            cr.stroke();
        }
        cr.$dispose();
    }
});

export const BatteryRing = GObject.registerClass({
    GTypeName: 'MotoBudsPlus_BatteryRing',
}, class BatteryRing extends St.Widget {
    _init(iconName, gIcon, info) {
        super._init({style_class: 'mbp-batt-ring', x_align: Clutter.ActorAlign.CENTER});
        this.layout_manager = new Clutter.FixedLayout();
        this.set_size(32, 32);
        this._circle = new BatteryCircle();
        this._icon = new St.Icon({gicon: gIcon(iconName), icon_size: 14,
            style_class: 'mbp-batt-inset', x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER});
        this._icon.set_position(9, 9);
        this.add_child(this._circle);
        this.add_child(this._icon);
        if (info)
            this.update(info);
    }

    update(info) {
        this._circle.update(info);
        const low = info?.reported === true && (info?.level ?? 0) <= 15;
        if (low)
            this._icon.add_style_class_name('mbp-batt-inset-low');
        else
            this._icon.remove_style_class_name('mbp-batt-inset-low');
    }
});

export const BatteryCell = GObject.registerClass({
    GTypeName: 'MotoBudsPlus_BatteryCell',
}, class BatteryCell extends St.BoxLayout {
    _init(label, iconName, gIcon, info) {
        super._init({vertical: true, x_expand: true, style_class: 'mbp-battery-card'});
        this._ring = new BatteryRing(iconName, gIcon);
        this._ring.x_align = Clutter.ActorAlign.CENTER;
        this._level = new St.Label({style_class: 'mbp-battery-level',
            x_align: Clutter.ActorAlign.CENTER, x_expand: true});
        this._name = new St.Label({text: label, style_class: 'mbp-battery-name',
            x_align: Clutter.ActorAlign.CENTER, x_expand: true});
        this.add_child(this._ring);
        this.add_child(this._level);
        this.add_child(this._name);
        this.update(info);
    }

    update(info) {
        const reported = info?.reported === true;
        const level = info?.level ?? 0;
        this._level.text = reported ? `${level}%` : '-';
        this._level.remove_style_class_name('mbp-batt-low');
        if (reported && level <= 15)
            this._level.add_style_class_name('mbp-batt-low');
        this._ring.update(info);
    }
});