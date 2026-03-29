#include "rtklib.h"

#include <string.h>

typedef struct {
    int ok;
    unsigned char stat;
    unsigned char ns;
    double lat_deg;
    double lon_deg;
    double alt_m;
    double ecef_x_m;
    double ecef_y_m;
    double ecef_z_m;
} clartk_rtklib_nmea_solution_t;

typedef struct {
    int ok;
    int solution_ok;
    unsigned int rover_observation_epochs;
    unsigned int reference_observation_epochs;
    unsigned int rtcm_message_count;
    int reference_station_position_present;
    unsigned char stat;
    unsigned char ns;
    double age_s;
    double ratio;
    double lat_deg;
    double lon_deg;
    double alt_m;
    double ecef_x_m;
    double ecef_y_m;
    double ecef_z_m;
} clartk_rtklib_raw_solution_t;

static void clartk_update_nav_wavelengths(nav_t *nav) {
    int sat, frq;

    for (sat = 0; sat < MAXSAT; ++sat) {
        for (frq = 0; frq < NFREQ; ++frq) {
            nav->lam[sat][frq] = satwavelen(sat + 1, frq, nav);
        }
    }
}

static void clartk_merge_rtcm_nav(nav_t *nav, const rtcm_t *rtcm, int ret) {
    int i, prn, sys, sat, iode;

    if (ret == 2 && rtcm->ephsat > 0) {
        sat = rtcm->ephsat;
        sys = satsys(sat, &prn);
        if (sys == SYS_GLO && prn >= 1 && prn <= MAXPRNGLO) {
            nav->geph[prn - 1] = rtcm->nav.geph[prn - 1];
        } else if (sat >= 1 && sat <= MAXSAT) {
            nav->eph[sat - 1] = rtcm->nav.eph[sat - 1];
        }
        clartk_update_nav_wavelengths(nav);
        return;
    }

    if (ret == 9) {
        for (i = 0; i < 8; ++i) nav->ion_gps[i] = rtcm->nav.ion_gps[i];
        for (i = 0; i < 4; ++i) nav->utc_gps[i] = rtcm->nav.utc_gps[i];
        for (i = 0; i < 4; ++i) nav->ion_gal[i] = rtcm->nav.ion_gal[i];
        for (i = 0; i < 4; ++i) nav->utc_gal[i] = rtcm->nav.utc_gal[i];
        for (i = 0; i < 8; ++i) nav->ion_qzs[i] = rtcm->nav.ion_qzs[i];
        for (i = 0; i < 4; ++i) nav->utc_qzs[i] = rtcm->nav.utc_qzs[i];
        nav->leaps = rtcm->nav.leaps;
        return;
    }

    if (ret == 10) {
        for (i = 0; i < MAXSAT; ++i) {
            if (!rtcm->ssr[i].update) continue;
            if (rtcm->ssr[i].iod[0] != rtcm->ssr[i].iod[1]) continue;
            iode = rtcm->ssr[i].iode;
            sys = satsys(i + 1, &prn);

            if ((sys == SYS_GPS || sys == SYS_GAL || sys == SYS_QZS) &&
                nav->eph[i].iode != iode) {
                continue;
            }
            if (sys == SYS_GLO && nav->geph[prn - 1].iode != iode) {
                continue;
            }
            nav->ssr[i] = rtcm->ssr[i];
        }
    }
}

static void clartk_merge_raw_nav(nav_t *nav, const raw_t *raw, int ret) {
    int i, prn, sys, sat;

    if (ret == 2 && raw->ephsat > 0) {
        sat = raw->ephsat;
        sys = satsys(sat, &prn);
        if (sys == SYS_GLO && prn >= 1 && prn <= MAXPRNGLO) {
            nav->geph[prn - 1] = raw->nav.geph[prn - 1];
        } else if (sat >= 1 && sat <= MAXSAT) {
            nav->eph[sat - 1] = raw->nav.eph[sat - 1];
        }
        clartk_update_nav_wavelengths(nav);
        return;
    }

    if (ret == 9) {
        for (i = 0; i < 8; ++i) nav->ion_gps[i] = raw->nav.ion_gps[i];
        for (i = 0; i < 4; ++i) nav->utc_gps[i] = raw->nav.utc_gps[i];
        for (i = 0; i < 4; ++i) nav->ion_gal[i] = raw->nav.ion_gal[i];
        for (i = 0; i < 4; ++i) nav->utc_gal[i] = raw->nav.utc_gal[i];
        for (i = 0; i < 8; ++i) nav->ion_qzs[i] = raw->nav.ion_qzs[i];
        for (i = 0; i < 4; ++i) nav->utc_qzs[i] = raw->nav.utc_qzs[i];
        nav->leaps = raw->nav.leaps;
    }
}

static int clartk_have_station_position(const double *position) {
    return position[0] != 0.0 || position[1] != 0.0 || position[2] != 0.0;
}

static unsigned int clartk_count_rtcm3_frames(const unsigned char *bytes, int len) {
    unsigned int frames = 0;
    int cursor = 0;
    int declared_length;
    int frame_length;

    while (cursor + 6 <= len) {
        if (bytes[cursor] != 0xD3) {
            cursor += 1;
            continue;
        }
        declared_length = ((bytes[cursor + 1] & 0x03) << 8) | bytes[cursor + 2];
        frame_length = declared_length + 6;
        if (cursor + frame_length > len) {
            break;
        }
        frames += 1;
        cursor += frame_length;
    }
    return frames;
}

static void clartk_copy_obs_epoch(obsd_t *dst, int *dst_count, const obs_t *src,
                                  unsigned char receiver_id) {
    int i;

    *dst_count = 0;
    for (i = 0; i < src->n && i < MAXOBS; ++i) {
        dst[i] = src->data[i];
        dst[i].rcv = receiver_id;
        (*dst_count)++;
    }
}

int clartk_rtklib_decode_nmea_gga(const char *sentence,
                                  clartk_rtklib_nmea_solution_t *out) {
    gtime_t time0 = {0};
    solbuf_t solbuf;
    solopt_t opt = solopt_default;
    double pos[3] = {0};
    size_t index;
    sol_t *sol;

    if (!sentence || !out) {
        return 0;
    }

    memset(out, 0, sizeof(*out));
    initsolbuf(&solbuf, 0, 0);
    solbuf.time = utc2gpst(timeget());

    for (index = 0; sentence[index] != '\0'; ++index) {
        inputsol((unsigned char)sentence[index], time0, time0, 0.0, 0, &opt, &solbuf);
    }
    if (index == 0 || sentence[index - 1] != '\n') {
        inputsol((unsigned char)'\n', time0, time0, 0.0, 0, &opt, &solbuf);
    }

    if (solbuf.n <= 0) {
        freesolbuf(&solbuf);
        return 0;
    }

    sol = getsol(&solbuf, solbuf.n - 1);
    if (!sol) {
        freesolbuf(&solbuf);
        return 0;
    }

    ecef2pos(sol->rr, pos);

    out->ok = 1;
    out->stat = sol->stat;
    out->ns = sol->ns;
    out->lat_deg = pos[0] * R2D;
    out->lon_deg = pos[1] * R2D;
    out->alt_m = pos[2];
    out->ecef_x_m = sol->rr[0];
    out->ecef_y_m = sol->rr[1];
    out->ecef_z_m = sol->rr[2];

    freesolbuf(&solbuf);
    return 1;
}

int clartk_rtklib_solve_skytraq_rtcm3(
    const unsigned char *rover_bytes,
    int rover_len,
    const unsigned char *correction_bytes,
    int correction_len,
    clartk_rtklib_raw_solution_t *out) {
    raw_t raw;
    rtcm_t rtcm;
    rtk_t rtk;
    prcopt_t opt = prcopt_default;
    obsd_t rover_obs[MAXOBS];
    obsd_t reference_obs[MAXOBS];
    obsd_t combined_obs[MAXOBS * 2];
    obs_t combined = {0};
    double station_position[3] = {0};
    double pos[3] = {0};
    int rover_count = 0;
    int reference_count = 0;
    int combined_count = 0;
    int i;
    int ret;

    if (!rover_bytes || rover_len < 0 || !correction_bytes || correction_len < 0 || !out) {
        return 0;
    }

    memset(out, 0, sizeof(*out));
    memset(&raw, 0, sizeof(raw));
    memset(&rtcm, 0, sizeof(rtcm));
    memset(&rtk, 0, sizeof(rtk));

    if (!init_raw(&raw) || !init_rtcm(&rtcm)) {
        free_raw(&raw);
        free_rtcm(&rtcm);
        return 0;
    }

    out->rtcm_message_count = clartk_count_rtcm3_frames(correction_bytes, correction_len);

    for (i = 0; i < correction_len; ++i) {
        ret = input_rtcm3(&rtcm, correction_bytes[i]);
        if (ret <= 0) continue;
        if (ret == 1) {
            clartk_copy_obs_epoch(reference_obs, &reference_count, &rtcm.obs, 2);
            out->reference_observation_epochs += 1;
        } else if (ret == 5) {
            memcpy(station_position, rtcm.sta.pos, sizeof(station_position));
            out->reference_station_position_present =
                clartk_have_station_position(station_position);
        } else {
            clartk_merge_rtcm_nav(&raw.nav, &rtcm, ret);
        }
    }

    for (i = 0; i < rover_len; ++i) {
        ret = input_raw(&raw, STRFMT_STQ, rover_bytes[i]);
        if (ret == 1) {
            clartk_copy_obs_epoch(rover_obs, &rover_count, &raw.obs, 1);
            out->rover_observation_epochs += 1;
        }
    }

    if (rover_count <= 0 || reference_count <= 0 ||
        !out->reference_station_position_present) {
        out->ok = 1;
        free_raw(&raw);
        free_rtcm(&rtcm);
        return 1;
    }

    opt.mode = PMODE_KINEMA;
    opt.nf = 1;
    opt.navsys = SYS_GPS | SYS_GLO | SYS_GAL | SYS_QZS | SYS_CMP;
    opt.refpos = 4;
    opt.modear = 1;
    opt.glomodear = 0;
    opt.bdsmodear = 0;
    rtkinit(&rtk, &opt);
    for (i = 0; i < 3; ++i) {
        rtk.rb[i] = station_position[i];
    }

    for (i = 0; i < rover_count; ++i) {
        combined_obs[combined_count++] = rover_obs[i];
    }
    for (i = 0; i < reference_count; ++i) {
        combined_obs[combined_count++] = reference_obs[i];
    }
    combined.n = combined.nmax = combined_count;
    combined.data = combined_obs;
    sortobs(&combined);

    if (combined.n > 0 && rtkpos(&rtk, combined.data, combined.n, &raw.nav) &&
        rtk.sol.stat != SOLQ_NONE) {
        ecef2pos(rtk.sol.rr, pos);
        out->solution_ok = 1;
        out->stat = rtk.sol.stat;
        out->ns = rtk.sol.ns;
        out->age_s = rtk.sol.age;
        out->ratio = rtk.sol.ratio;
        out->lat_deg = pos[0] * R2D;
        out->lon_deg = pos[1] * R2D;
        out->alt_m = pos[2];
        out->ecef_x_m = rtk.sol.rr[0];
        out->ecef_y_m = rtk.sol.rr[1];
        out->ecef_z_m = rtk.sol.rr[2];
    }

    out->ok = 1;
    rtkfree(&rtk);
    free_raw(&raw);
    free_rtcm(&rtcm);
    return 1;
}

int clartk_rtklib_solve_skytraq_pair(
    const unsigned char *rover_bytes,
    int rover_len,
    const unsigned char *base_bytes,
    int base_len,
    double base_lat_deg,
    double base_lon_deg,
    double base_alt_m,
    int has_base_position,
    clartk_rtklib_raw_solution_t *out) {
    raw_t rover_raw;
    raw_t base_raw;
    rtk_t rtk;
    prcopt_t opt = prcopt_default;
    obsd_t rover_obs[MAXOBS];
    obsd_t reference_obs[MAXOBS];
    obsd_t combined_obs[MAXOBS * 2];
    obs_t combined = {0};
    double station_position[3] = {0};
    double base_position[3] = {0};
    double pos[3] = {0};
    int rover_count = 0;
    int reference_count = 0;
    int combined_count = 0;
    int i;
    int ret;
    int rtk_initialized = 0;

    if (!rover_bytes || rover_len < 0 || !base_bytes || base_len < 0 || !out) {
        return 0;
    }

    memset(out, 0, sizeof(*out));
    memset(&rover_raw, 0, sizeof(rover_raw));
    memset(&base_raw, 0, sizeof(base_raw));
    memset(&rtk, 0, sizeof(rtk));

    if (!init_raw(&rover_raw) || !init_raw(&base_raw)) {
        free_raw(&rover_raw);
        free_raw(&base_raw);
        return 0;
    }

    for (i = 0; i < rover_len; ++i) {
        ret = input_raw(&rover_raw, STRFMT_STQ, rover_bytes[i]);
        if (ret == 1) {
            clartk_copy_obs_epoch(rover_obs, &rover_count, &rover_raw.obs, 1);
            out->rover_observation_epochs += 1;
        }
    }

    for (i = 0; i < base_len; ++i) {
        ret = input_raw(&base_raw, STRFMT_STQ, base_bytes[i]);
        if (ret == 1) {
            clartk_copy_obs_epoch(reference_obs, &reference_count, &base_raw.obs, 2);
            out->reference_observation_epochs += 1;
        } else if (ret > 1) {
            clartk_merge_raw_nav(&rover_raw.nav, &base_raw, ret);
        }
    }

    if (!has_base_position || rover_count <= 0 || reference_count <= 0) {
        out->reference_station_position_present = has_base_position ? 1 : 0;
        out->ok = 1;
        free_raw(&rover_raw);
        free_raw(&base_raw);
        return 1;
    }

    base_position[0] = base_lat_deg * D2R;
    base_position[1] = base_lon_deg * D2R;
    base_position[2] = base_alt_m;
    pos2ecef(base_position, station_position);

    opt.mode = PMODE_KINEMA;
    opt.nf = 1;
    opt.navsys = SYS_GPS | SYS_GLO | SYS_GAL | SYS_QZS | SYS_CMP;
    opt.refpos = 4;
    opt.modear = 1;
    opt.glomodear = 0;
    opt.bdsmodear = 0;
    rtkinit(&rtk, &opt);
    rtk_initialized = 1;
    for (i = 0; i < 3; ++i) {
        rtk.rb[i] = station_position[i];
    }

    for (i = 0; i < rover_count; ++i) {
        combined_obs[combined_count++] = rover_obs[i];
    }
    for (i = 0; i < reference_count; ++i) {
        combined_obs[combined_count++] = reference_obs[i];
    }
    combined.n = combined.nmax = combined_count;
    combined.data = combined_obs;
    sortobs(&combined);

    out->reference_station_position_present = 1;
    if (combined.n > 0 && rtkpos(&rtk, combined.data, combined.n, &rover_raw.nav) &&
        rtk.sol.stat != SOLQ_NONE) {
        ecef2pos(rtk.sol.rr, pos);
        out->solution_ok = 1;
        out->stat = rtk.sol.stat;
        out->ns = rtk.sol.ns;
        out->age_s = rtk.sol.age;
        out->ratio = rtk.sol.ratio;
        out->lat_deg = pos[0] * R2D;
        out->lon_deg = pos[1] * R2D;
        out->alt_m = pos[2];
        out->ecef_x_m = rtk.sol.rr[0];
        out->ecef_y_m = rtk.sol.rr[1];
        out->ecef_z_m = rtk.sol.rr[2];
    }

    out->ok = 1;
    if (rtk_initialized) {
        rtkfree(&rtk);
    }
    free_raw(&rover_raw);
    free_raw(&base_raw);
    return 1;
}
