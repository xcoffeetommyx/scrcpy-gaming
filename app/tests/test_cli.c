#include "common.h"

#include <assert.h>
#include <string.h>

#include "cli.h"
#include "options.h"

static void test_flag_version(void) {
    struct scrcpy_cli_args args = {
        .opts = scrcpy_options_default,
        .help = false,
        .version = false,
    };

    char *argv[] = {"scrcpy", "-v"};

    bool ok = scrcpy_parse_args(&args, 2, argv);
    assert(ok);
    assert(!args.help);
    assert(args.version);
}

static void test_flag_help(void) {
    struct scrcpy_cli_args args = {
        .opts = scrcpy_options_default,
        .help = false,
        .version = false,
    };

    char *argv[] = {"scrcpy", "-v"};

    bool ok = scrcpy_parse_args(&args, 2, argv);
    assert(ok);
    assert(!args.help);
    assert(args.version);
}

static void test_options(void) {
    struct scrcpy_cli_args args = {
        .opts = scrcpy_options_default,
        .help = false,
        .version = false,
    };

    char *argv[] = {
        "scrcpy",
        "--always-on-top",
        "--video-bit-rate", "5M",
        "--crop", "100:200:300:400",
        "--fullscreen",
        "--max-fps", "30",
        "--max-size", "1024",
        // "--no-control" is not compatible with "--turn-screen-off"
        // "--no-playback" is not compatible with "--fulscreen"
        "--port", "1234:1236",
        "--push-target", "/sdcard/Movies",
        "--record", "file",
        "--record-format", "mkv",
        "--serial", "0123456789abcdef",
        "--show-touches",
        "--turn-screen-off",
        "--prefer-text",
        "--window-title", "my device",
        "--window-x", "100",
        "--window-y", "-1",
        "--window-width", "600",
        "--window-height", "0",
        "--window-borderless",
    };

    bool ok = scrcpy_parse_args(&args, ARRAY_LEN(argv), argv);
    assert(ok);

    const struct scrcpy_options *opts = &args.opts;
    assert(opts->always_on_top);
    assert(opts->video_bit_rate == 5000000);
    assert(!strcmp(opts->crop, "100:200:300:400"));
    assert(opts->fullscreen);
    assert(!strcmp(opts->max_fps, "30"));
    assert(opts->max_size == 1024);
    assert(opts->port_range.first == 1234);
    assert(opts->port_range.last == 1236);
    assert(!strcmp(opts->push_target, "/sdcard/Movies"));
    assert(!strcmp(opts->record_filename, "file"));
    assert(opts->record_format == SC_RECORD_FORMAT_MKV);
    assert(!strcmp(opts->serial, "0123456789abcdef"));
    assert(opts->show_touches);
    assert(opts->turn_screen_off);
    assert(opts->key_inject_mode == SC_KEY_INJECT_MODE_TEXT);
    assert(!strcmp(opts->window_title, "my device"));
    assert(opts->window_x == 100);
    assert(opts->window_y == -1);
    assert(opts->window_width == 600);
    assert(opts->window_height == 0);
    assert(opts->window_borderless);
}

static void test_options2(void) {
    struct scrcpy_cli_args args = {
        .opts = scrcpy_options_default,
        .help = false,
        .version = false,
    };

    char *argv[] = {
        "scrcpy",
        "--no-control",
        "--no-playback",
        "--record", "file.mp4", // cannot enable --no-playback without recording
    };

    bool ok = scrcpy_parse_args(&args, ARRAY_LEN(argv), argv);
    assert(ok);

    const struct scrcpy_options *opts = &args.opts;
    assert(!opts->control);
    assert(!opts->video_playback);
    assert(!opts->audio_playback);
    assert(!strcmp(opts->record_filename, "file.mp4"));
    assert(opts->record_format == SC_RECORD_FORMAT_MP4);
}

static void test_game_mode(void) {
    struct scrcpy_cli_args args = {
        .opts = scrcpy_options_default,
        .help = false,
        .version = false,
    };

    char *argv[] = {"scrcpy", "--game-mode"};

    bool ok = scrcpy_parse_args(&args, ARRAY_LEN(argv), argv);
    assert(ok);

    const struct scrcpy_options *opts = &args.opts;
    assert(opts->gamepad_input_mode == SC_GAMEPAD_INPUT_MODE_UHID);
    assert(opts->video_codec == SC_CODEC_H264);
    assert(opts->video_buffer == 0);
    assert(opts->audio_buffer == 0);
    assert(!opts->mipmaps);
    assert(!opts->forward_key_repeat);
    assert(!opts->max_fps);
    assert(opts->max_size == 0);
    assert(opts->video_bit_rate == 0);
    assert(opts->audio);
}

static void test_game_mode_overrides(void) {
    struct scrcpy_cli_args args = {
        .opts = scrcpy_options_default,
        .help = false,
        .version = false,
    };

    char *argv[] = {
        "scrcpy",
        "--video-codec=h265",
        "--game-mode",
        "--gamepad=disabled",
        "--video-buffer=10",
        "--audio-buffer=50",
    };

    bool ok = scrcpy_parse_args(&args, ARRAY_LEN(argv), argv);
    assert(ok);

    const struct scrcpy_options *opts = &args.opts;
    assert(opts->gamepad_input_mode == SC_GAMEPAD_INPUT_MODE_DISABLED);
    assert(opts->video_codec == SC_CODEC_H265);
    assert(opts->video_buffer == SC_TICK_FROM_MS(10));
    assert(opts->audio_buffer == SC_TICK_FROM_MS(50));
    assert(!opts->mipmaps);
    assert(!opts->forward_key_repeat);
}

static void test_game_mode_without_audio(void) {
    struct scrcpy_cli_args args = {
        .opts = scrcpy_options_default,
        .help = false,
        .version = false,
    };

    char *argv[] = {"scrcpy", "--game-mode", "--no-audio"};

    bool ok = scrcpy_parse_args(&args, ARRAY_LEN(argv), argv);
    assert(ok);
    assert(!args.opts.audio);
    assert(args.opts.audio_buffer == -1);
}

static void test_game_mode_profiles(void) {
    struct scrcpy_cli_args competitive = {
        .opts = scrcpy_options_default,
    };
    char *competitive_argv[] = {
        "scrcpy", "--game-mode-profile=competitive",
    };
    bool ok = scrcpy_parse_args(&competitive, ARRAY_LEN(competitive_argv),
                                competitive_argv);
    assert(ok);
    assert(!strcmp(competitive.opts.max_fps, "120"));
    assert(competitive.opts.max_size == 720);
    assert(competitive.opts.video_bit_rate == 2000000);
    assert(!competitive.opts.audio);
    assert(competitive.opts.audio_buffer == -1);
    assert(competitive.opts.gamepad_input_mode == SC_GAMEPAD_INPUT_MODE_UHID);
    assert(competitive.opts.video_codec == SC_CODEC_H264);

    struct scrcpy_cli_args balanced = {
        .opts = scrcpy_options_default,
    };
    char *balanced_argv[] = {
        "scrcpy", "--game-mode-profile=balanced",
    };
    ok = scrcpy_parse_args(&balanced, ARRAY_LEN(balanced_argv),
                           balanced_argv);
    assert(ok);
    assert(!strcmp(balanced.opts.max_fps, "120"));
    assert(balanced.opts.max_size == 720);
    assert(balanced.opts.video_bit_rate == 6000000);
    assert(!balanced.opts.audio);

    struct scrcpy_cli_args quality = {
        .opts = scrcpy_options_default,
    };
    char *quality_argv[] = {
        "scrcpy", "--game-mode-profile=quality",
    };
    ok = scrcpy_parse_args(&quality, ARRAY_LEN(quality_argv), quality_argv);
    assert(ok);
    assert(!strcmp(quality.opts.max_fps, "120"));
    assert(quality.opts.max_size == 1080);
    assert(quality.opts.video_bit_rate == 12000000);
    assert(quality.opts.audio);
    assert(quality.opts.audio_buffer == 0);
}

static void test_game_mode_profile_overrides(void) {
    struct scrcpy_cli_args args = {
        .opts = scrcpy_options_default,
    };
    char *argv[] = {
        "scrcpy",
        "--max-fps=90",
        "--game-mode-profile=quality",
        "--max-size=1440",
        "--video-bit-rate=4M",
        "--no-audio",
    };

    bool ok = scrcpy_parse_args(&args, ARRAY_LEN(argv), argv);
    assert(ok);
    assert(!strcmp(args.opts.max_fps, "90"));
    assert(args.opts.max_size == 1440);
    assert(args.opts.video_bit_rate == 4000000);
    assert(!args.opts.audio);
}

static void test_invalid_game_mode_profile(void) {
    struct scrcpy_cli_args args = {
        .opts = scrcpy_options_default,
    };
    char *argv[] = {
        "scrcpy", "--game-mode-profile=invalid",
    };

    bool ok = scrcpy_parse_args(&args, ARRAY_LEN(argv), argv);
    assert(!ok);
}

static void test_parse_shortcut_mods(void) {
    uint8_t mods;
    bool ok;

    ok = sc_parse_shortcut_mods("lctrl", &mods);
    assert(ok);
    assert(mods == SC_SHORTCUT_MOD_LCTRL);

    ok = sc_parse_shortcut_mods("rctrl,lalt", &mods);
    assert(ok);
    assert(mods == (SC_SHORTCUT_MOD_RCTRL | SC_SHORTCUT_MOD_LALT));

    ok = sc_parse_shortcut_mods("lsuper,rsuper,lctrl", &mods);
    assert(ok);
    assert(mods == (SC_SHORTCUT_MOD_LSUPER
                  | SC_SHORTCUT_MOD_RSUPER
                  | SC_SHORTCUT_MOD_LCTRL));

    ok = sc_parse_shortcut_mods("", &mods);
    assert(!ok);

    ok = sc_parse_shortcut_mods("lctrl+", &mods);
    assert(!ok);

    ok = sc_parse_shortcut_mods("lctrl,", &mods);
    assert(!ok);
}

int main(int argc, char *argv[]) {
    (void) argc;
    (void) argv;

    test_flag_version();
    test_flag_help();
    test_options();
    test_options2();
    test_game_mode();
    test_game_mode_overrides();
    test_game_mode_without_audio();
    test_game_mode_profiles();
    test_game_mode_profile_overrides();
    test_invalid_game_mode_profile();
    test_parse_shortcut_mods();
    return 0;
}
