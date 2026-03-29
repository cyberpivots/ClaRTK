use std::path::{Path, PathBuf};
use std::process::Command;

fn compile_source(source: &Path, include_dir: &Path, output: &Path) {
    let status = Command::new("cc")
        .arg("-c")
        .arg("-fPIC")
        .arg("-O2")
        .arg("-ffunction-sections")
        .arg("-fdata-sections")
        .arg("-DENAGLO")
        .arg("-DENAGAL")
        .arg("-DENAQZS")
        .arg("-DENACMP")
        .arg("-DNFREQ=3")
        .arg(format!("-I{}", include_dir.display()))
        .arg(source)
        .arg("-o")
        .arg(output)
        .status()
        .expect("run cc");

    if !status.success() {
        panic!("failed to compile {}", source.display());
    }
}

fn main() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let rtklib_dir = manifest_dir.join("../../../third_party/rtklib");
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("out dir"));
    println!("cargo:rerun-if-changed={}", rtklib_dir.display());
    println!(
        "cargo:rerun-if-changed={}",
        manifest_dir.join("src/wrapper.c").display()
    );

    if rtklib_dir.join("readme.txt").exists() {
        println!("cargo:rustc-env=CLARTK_RTKLIB_PRESENT=1");
        let include_dir = rtklib_dir.join("src");
        let archive = out_dir.join("libclartk_rtklib_bridge.a");
        let sources = [
            rtklib_dir.join("src/rtkcmn.c"),
            rtklib_dir.join("src/geoid.c"),
            rtklib_dir.join("src/solution.c"),
            rtklib_dir.join("src/lambda.c"),
            rtklib_dir.join("src/sbas.c"),
            rtklib_dir.join("src/rcvraw.c"),
            rtklib_dir.join("src/rtcm.c"),
            rtklib_dir.join("src/rtcm2.c"),
            rtklib_dir.join("src/rtcm3.c"),
            rtklib_dir.join("src/rtcm3e.c"),
            rtklib_dir.join("src/preceph.c"),
            rtklib_dir.join("src/options.c"),
            rtklib_dir.join("src/pntpos.c"),
            rtklib_dir.join("src/ppp.c"),
            rtklib_dir.join("src/ppp_ar.c"),
            rtklib_dir.join("src/ephemeris.c"),
            rtklib_dir.join("src/ionex.c"),
            rtklib_dir.join("src/qzslex.c"),
            rtklib_dir.join("src/rtkpos.c"),
            rtklib_dir.join("src/rcv/novatel.c"),
            rtklib_dir.join("src/rcv/ublox.c"),
            rtklib_dir.join("src/rcv/ss2.c"),
            rtklib_dir.join("src/rcv/crescent.c"),
            rtklib_dir.join("src/rcv/skytraq.c"),
            rtklib_dir.join("src/rcv/gw10.c"),
            rtklib_dir.join("src/rcv/javad.c"),
            rtklib_dir.join("src/rcv/nvs.c"),
            rtklib_dir.join("src/rcv/binex.c"),
            rtklib_dir.join("src/rcv/rt17.c"),
            manifest_dir.join("src/wrapper.c"),
        ];
        let mut objects = Vec::with_capacity(sources.len());

        for source in &sources {
            let stem = source
                .file_stem()
                .and_then(|value| value.to_str())
                .expect("source stem");
            let object = out_dir.join(format!("{stem}.o"));
            compile_source(source, &include_dir, &object);
            objects.push(object);
        }

        let status = Command::new("ar")
            .arg("crus")
            .arg(&archive)
            .args(&objects)
            .status()
            .expect("run ar");

        if !status.success() {
            panic!("failed to archive RTKLIB bridge objects");
        }

        println!("cargo:rustc-link-search=native={}", out_dir.display());
        println!("cargo:rustc-link-lib=static=clartk_rtklib_bridge");
        println!("cargo:rustc-link-lib=m");
    } else {
        println!("cargo:warning=RTKLIB submodule not initialized");
    }
}
