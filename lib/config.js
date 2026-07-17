'use strict';

export const SERVICE_UUID = 'fc9d9fe0-4899-11ee-be56-0242ac120002';

export const PACKET_TYPE = {
    COMMAND_NO_ACK: 0x00,
    RESPONSE_NO_ACK: 0x20,
    NOTIFICATION_NO_ACK: 0x40,
    COMMAND_ACK: 0x80,
    RESPONSE_ACK: 0xA0,
    NOTIFICATION_ACK: 0xC0,
};

export const COMMAND_TYPE = PACKET_TYPE.COMMAND_ACK;

export const OP = {
    GET_PROFILE_VERSION: 0x000,
    GET_HARDWARE_INFO: 0x004,
    GET_BATTERY_LEVEL: 0x005,
    BATTERY_LEVEL_CHANGED: 0x009,

    GET_TOGGLE_CONFIGS: 0x100,
    GET_TOGGLE_CONFIG: 0x101,
    SET_TOGGLE_CONFIG: 0x102,
    TOGGLE_CONFIG_CHANGED: 0x105,

    GET_ANC_MODE: 0x200,
    SET_ANC_MODE: 0x201,
    GET_ADAPTATION_STATUS: 0x202,
    SET_ADAPTATION_STATUS: 0x203,
    ANC_MODE_CHANGED: 0x204,
    ADAPTATION_STATUS_CHANGED: 0x205,

    GET_EQ_STATE: 0x300,
    GET_EQ_SET: 0x302,
    SET_EQ_SET: 0x303,
    GET_USER_EQ_CONFIG: 0x305,
    SET_USER_EQ_CONFIG: 0x306,
    EQ_STATE_CHANGED: 0x307,
    EQ_SET_CHANGED: 0x308,
    EQ_USER_BANDS_CHANGED: 0x309,
    GET_SPATIAL_AUDIO: 0x30A,
    SET_SPATIAL_AUDIO: 0x30B,
    SPATIAL_AUDIO_CHANGED: 0x310,
    HI_RES_STATE_CHANGED: 0x311,
    GAME_MODE_STATE_CHANGED: 0x312,
    VOLUME_BOOST_CHANGED: 0x315,
    GET_HI_RES_MODE: 0x30C,
    SET_HI_RES_MODE: 0x30D,
    GET_GAME_MODE: 0x30E,
    SET_GAME_MODE: 0x30F,
    GET_VOLUME_BOOST: 0x313,
    SET_VOLUME_BOOST: 0x314,
    GET_AUTO_VOLUME: 0x316,
    SET_AUTO_VOLUME: 0x317,
    GET_CASE_RECORDING: 0x318,
    SET_CASE_RECORDING: 0x319,
    GET_BASS_ENHANCEMENT: 0x31C,
    SET_BASS_ENHANCEMENT: 0x31D,

    GET_IN_EAR_DETECTION: 0x402,
    SET_IN_EAR_DETECTION: 0x403,
    IN_EAR_DETECTION_NOTIF: 0x40D,
    FIND_MY_DEVICE: 0x405,
    GET_DUAL_CONNECTION: 0x406,
    SET_DUAL_CONNECTION: 0x407,
    DUAL_CONNECTION_CHANGED: 0x40F,
    BASS_ENHANCEMENT_CHANGED: 0x31E,

    SET_CURRENT_TIME: 0x500,
};

export const ANC = {
    OFF: 0,
    TRANSPARENCY: 1,
    ANC: 2,
    ADAPTIVE: 3,
};

export const ANC_MODE_BYTES = {
    [ANC.OFF]: [0x00, 0x00],
    [ANC.TRANSPARENCY]: [0x02, 0x00],
    [ANC.ANC]: [0x01, 0x03],
    [ANC.ADAPTIVE]: [0x01, 0x01],
};

export const ANC_PREF_BYTES = {
    [ANC.OFF]: [0x01, 0x00, 0x00],
    [ANC.TRANSPARENCY]: [0x01, 0x02, 0x00],
    [ANC.ANC]: [0x01, 0x01, 0x03],
    [ANC.ADAPTIVE]: [0x01, 0x01, 0x01],
};

export const TOGGLE_CATEGORY = {
    ANC_PREFERENCE: 0x01,
    FIND_BUDS: 0x07,
    DUAL_CONNECTION: 0x08,
};

export const PRESET = {
    DEFAULT: 'default',
    HEAVY_BASS: 'heavy-bass',
    LIGHT_BASS: 'light-bass',
    BALANCED: 'balanced',
    VOCAL_BOOST: 'vocal-boost',
    CLARITY: 'clarity',
    CUSTOM: 'custom',
};

export const PRESET_ORDER = [
    PRESET.DEFAULT,
    PRESET.HEAVY_BASS,
    PRESET.CUSTOM,
];

export const PRESET_LABEL = {
    [PRESET.DEFAULT]: 'Default',
    [PRESET.HEAVY_BASS]: 'Bass',
    [PRESET.LIGHT_BASS]: 'Light Bass',
    [PRESET.BALANCED]: 'Balanced',
    [PRESET.VOCAL_BOOST]: 'Vocal Boost',
    [PRESET.CLARITY]: 'Clarity',
    [PRESET.CUSTOM]: 'Custom',
};

export const TOGGLES = [
    {key: 'volume-boost', label: 'Volume Boost', icon: 'audio-volume-high-symbolic'},
    {key: 'hi-res', label: 'Hi-Res', icon: 'audio-x-generic-symbolic'},
    {key: 'in-ear', label: 'In-Ear', icon: 'audio-headphones-symbolic'},
    {key: 'game-mode', label: 'Game Mode', icon: 'applications-games-symbolic'},
];

export const ANC_ITEMS = [
    {label: 'Off', value: ANC.OFF, icon: 'bbm-anc-off-symbolic.svg'},
    {label: 'Transparency', value: ANC.TRANSPARENCY, icon: 'bbm-transperancy-symbolic.svg'},
    {label: 'ANC', value: ANC.ANC, icon: 'bbm-anc-on-symbolic.svg'},
    {label: 'Adaptive', value: ANC.ADAPTIVE, icon: 'bbm-adaptive-symbolic.svg'},
];

export const PRESET_BANDS = {
    [PRESET.DEFAULT]: [0, 0, 0, 0, 0],
    [PRESET.HEAVY_BASS]: [5, 3, 0, 0, 0],
    [PRESET.LIGHT_BASS]: [-5, -1, 0, 0, 0],
    [PRESET.BALANCED]: [-3, 1, 1, -1, 3],
    [PRESET.VOCAL_BOOST]: [-1, 0, 4, 2, 0],
    [PRESET.CLARITY]: [-2, 0, 2, 3, 5],
};

export const PRESET_ID_BY_NAME = {
    [PRESET.DEFAULT]: 0,
    [PRESET.BALANCED]: 1,
    [PRESET.CLARITY]: 2,
    [PRESET.HEAVY_BASS]: 3,
    [PRESET.LIGHT_BASS]: 4,
    [PRESET.VOCAL_BOOST]: 5,
};

export const PRESET_NAME_BY_ID = {
    0: PRESET.DEFAULT,
    1: PRESET.BALANCED,
    2: PRESET.CLARITY,
    3: PRESET.HEAVY_BASS,
    4: PRESET.LIGHT_BASS,
    5: PRESET.VOCAL_BOOST,
};

export const BAND_LABELS = ['Low Bass', 'Bass', 'Mid', 'Treble', 'Upper Treble'];
export const EQ_RANGE = 12;

export function presetForBands(bands) {
    const rounded = bands.map(v => Math.round(v));
    for (const [preset, presetBands] of Object.entries(PRESET_BANDS)) {
        if (JSON.stringify(rounded) === JSON.stringify(presetBands))
            return preset;
    }
    return PRESET.CUSTOM;
}