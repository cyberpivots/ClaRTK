use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let rtklib_dir = manifest_dir.join("../../../third_party/rtklib");
    println!("cargo:rerun-if-changed={}", rtklib_dir.display());

    if rtklib_dir.join("readme.txt").exists() {
        println!("cargo:rustc-env=CLARTK_RTKLIB_PRESENT=1");
    } else {
        println!("cargo:warning=RTKLIB submodule not initialized");
    }
}

